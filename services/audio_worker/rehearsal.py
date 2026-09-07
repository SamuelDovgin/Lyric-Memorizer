"""Playback-first persistence. Old cards/reviews remain archival only."""
from __future__ import annotations

import json
import math
from collections import Counter
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from . import database as db
from .lyrics import parse_lyrics

router = APIRouter(prefix="/api")


def migrate() -> None:
    with db.connect() as connection:
        version = connection.execute("PRAGMA user_version").fetchone()[0]
        if version < 2:
            backup = db.DB_PATH.with_suffix(".v1-backup.sqlite3")
            if not backup.exists():
                import sqlite3
                with sqlite3.connect(backup) as destination:
                    connection.backup(destination)
        connection.executescript("""
            CREATE TABLE IF NOT EXISTS practice_events (
                id TEXT PRIMARY KEY, song_id TEXT NOT NULL, session_id TEXT NOT NULL,
                sequence INTEGER NOT NULL, document TEXT NOT NULL,
                UNIQUE(session_id, sequence)
            );
            CREATE INDEX IF NOT EXISTS idx_practice_song ON practice_events(song_id);
            CREATE TABLE IF NOT EXISTS practice_sessions (
                id TEXT PRIMARY KEY, song_id TEXT NOT NULL, document TEXT NOT NULL, updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS beat_maps (song_id TEXT PRIMARY KEY, document TEXT NOT NULL);
        """)
        for row in connection.execute("SELECT id, document FROM songs").fetchall():
            song = json.loads(row["document"])
            if song.get("schemaVersion", 0) >= 2:
                continue
            parsed = parse_lyrics(song.get("lyrics", ""))
            occurrence = 0
            previous = None
            for index, line in enumerate(song.get("lines", [])):
                if len(parsed) == len(song["lines"]):
                    occurrence = parsed[index].occurrence
                elif previous != line.get("section"):
                    occurrence += 1
                previous = line.get("section")
                line.setdefault("sectionId", f"{song['id']}_section_{occurrence}")
            song.update(schemaVersion=2, alignmentRevision=song.get("alignmentRevision", 0))
            connection.execute("UPDATE songs SET document=? WHERE id=?", (json.dumps(song), row["id"]))
        connection.execute("PRAGMA user_version=2")


def require_song(song_id: str) -> tuple[dict, dict]:
    found = db.get_song(song_id)
    if not found:
        raise HTTPException(404, "Song not found")
    return found


def sections(song: dict) -> list[dict]:
    result = []
    for line in song.get("lines", []):
        identity = line.get("sectionId", f"section_{line['id']}")
        if not result or result[-1]["id"] != identity:
            name = line.get("section", "Song")
            kind = "chorus" if "chorus" in name.lower() and "pre" not in name.lower() else "verse" if "verse" in name.lower() else "other"
            result.append(dict(id=identity, name=name, kind=kind, lineIds=[], start=line["start"], end=line["end"]))
        result[-1]["lineIds"].append(line["id"])
        result[-1]["end"] = max(result[-1]["end"], line["end"])
    counts = Counter(item["name"] for item in result)
    seen: Counter = Counter()
    for item in result:
        name = item["name"]
        seen[name] += 1
        if counts[name] > 1:
            item["name"] = f"{name} {seen[name]}"
    return result


def public_song(song: dict) -> dict:
    return {**song, "capabilities": {
        "playable": bool(song.get("originalUrl") or (song.get("vocalsUrl") and song.get("instrumentalUrl"))),
        "stems": bool(song.get("vocalsUrl") and song.get("instrumentalUrl")),
        "lineTiming": any(line.get("verified") or line.get("confidence", 0) >= .55 for line in song.get("lines", [])),
    }}


@router.get("/songs/{song_id}/structure")
def get_structure(song_id: str) -> list[dict]:
    return sections(require_song(song_id)[0])


class StructureChange(BaseModel):
    sectionId: str
    name: str = Field(min_length=1, max_length=100)
    revision: int
    splitAt: str | None = None


@router.put("/songs/{song_id}/structure")
def change_structure(song_id: str, change: StructureChange) -> dict:
    song, paths = require_song(song_id)
    if song.get("alignmentRevision", 0) != change.revision:
        raise HTTPException(409, "Song changed. Reload before editing.")
    group = [line for line in song["lines"] if line.get("sectionId") == change.sectionId]
    if not group or (change.splitAt and change.splitAt not in {line["id"] for line in group}):
        raise HTTPException(422, "Unknown section or split line")
    active = not change.splitAt
    for line in group:
        active = active or line["id"] == change.splitAt
        if active:
            line["section"] = change.name.strip()
            if change.splitAt:
                line["sectionId"] = f"section_{change.splitAt}"
    song["alignmentRevision"] = change.revision + 1
    db.save_song(song, paths, datetime.now(timezone.utc).isoformat(), expected_revision=change.revision)
    return public_song(song)


class PracticeEvent(BaseModel):
    id: str = Field(max_length=100)
    songId: str
    sessionId: str = Field(max_length=100)
    sequence: int = Field(ge=0)
    passId: str = Field(max_length=100)
    lineId: str
    judgment: Literal["again", "got-it", "undo"]
    sourceTime: float = Field(ge=0, allow_inf_nan=False)
    createdAt: str
    supersedes: str | None = None


class EventBatch(BaseModel):
    events: list[PracticeEvent] = Field(max_length=200)


@router.post("/practice-events/batch")
def save_events(batch: EventBatch) -> dict:
    # Validation and insert share the same transaction; event IDs make retries safe.
    with db.connect() as connection:
        for event in batch.events:
            row = connection.execute("SELECT document FROM songs WHERE id=?", (event.songId,)).fetchone()
            if not row or event.lineId not in {line["id"] for line in json.loads(row[0])["lines"]}:
                raise HTTPException(422, "Feedback line does not belong to this song")
            existing = connection.execute("SELECT document FROM practice_events WHERE id=?", (event.id,)).fetchone()
            payload = event.model_dump(exclude_none=True)
            if existing:
                if json.loads(existing[0]) != payload:
                    raise HTTPException(409, "Event ID already used for different feedback")
                continue
            owner = connection.execute("SELECT song_id FROM practice_events WHERE session_id=? LIMIT 1", (event.sessionId,)).fetchone()
            if owner and owner[0] != event.songId:
                raise HTTPException(422, "Session belongs to another song")
            if event.judgment == "undo":
                target = connection.execute("SELECT document FROM practice_events WHERE id=?", (event.supersedes,)).fetchone()
                if not target:
                    raise HTTPException(422, "Undo target not found")
                original = json.loads(target[0])
                if original["songId"] != event.songId or original["lineId"] != event.lineId or original["judgment"] == "undo":
                    raise HTTPException(422, "Invalid undo target")
            conflict = connection.execute("SELECT id FROM practice_events WHERE session_id=? AND sequence=?", (event.sessionId, event.sequence)).fetchone()
            if conflict:
                raise HTTPException(409, "Session sequence already used")
            connection.execute("INSERT INTO practice_events VALUES (?, ?, ?, ?, ?)", (event.id, event.songId, event.sessionId, event.sequence, json.dumps(payload)))
    return {"acknowledged": [event.id for event in batch.events]}


@router.get("/songs/{song_id}/practice-state")
def practice_state(song_id: str) -> dict:
    require_song(song_id)
    with db.connect() as connection:
        rows = connection.execute("SELECT document FROM practice_events WHERE song_id=? ORDER BY rowid", (song_id,)).fetchall()
    events = [json.loads(row[0]) for row in rows]
    return {"events": events}


class SessionPayload(BaseModel):
    id: str
    songId: str
    position: float = Field(ge=0, allow_inf_nan=False)
    mode: Literal["full", "focus"]
    scope: str = ""
    settings: dict = Field(default_factory=dict)
    loop: tuple[int, int] | None = None
    elapsed: float = Field(default=0, ge=0, allow_inf_nan=False)
    updatedAt: str
    plan: dict = Field(default_factory=dict)
    rehearsal: dict = Field(default_factory=dict)


@router.put("/practice-sessions/{session_id}")
def save_session(session_id: str, session: SessionPayload) -> dict:
    require_song(session.songId)
    if session_id != session.id:
        raise HTTPException(422, "Session ID mismatch")
    with db.connect() as connection:
        owner = connection.execute("SELECT song_id FROM practice_sessions WHERE id=?", (session_id,)).fetchone()
        if owner and owner[0] != session.songId:
            raise HTTPException(422, "Session belongs to another song")
        connection.execute("""INSERT INTO practice_sessions VALUES (?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET document=excluded.document, updated_at=excluded.updated_at
            WHERE excluded.updated_at >= practice_sessions.updated_at""",
            (session_id, session.songId, session.model_dump_json(), session.updatedAt))
    return session.model_dump()


@router.get("/songs/{song_id}/session")
def latest_session(song_id: str) -> dict | None:
    require_song(song_id)
    with db.connect() as connection:
        row = connection.execute("SELECT document FROM practice_sessions WHERE song_id=? ORDER BY updated_at DESC LIMIT 1", (song_id,)).fetchone()
    return json.loads(row[0]) if row else None


class BeatSettings(BaseModel):
    bpm: float = Field(gt=20, le=300, allow_inf_nan=False)
    anchor: float = Field(ge=0, allow_inf_nan=False)
    verified: bool = True


@router.get("/songs/{song_id}/beat-map")
def get_beats(song_id: str) -> dict | None:
    require_song(song_id)
    with db.connect() as connection:
        row = connection.execute("SELECT document FROM beat_maps WHERE song_id=?", (song_id,)).fetchone()
    return json.loads(row[0]) if row else None


def store_beats(song_id: str, result: dict) -> dict:
    with db.connect() as connection:
        connection.execute("INSERT INTO beat_maps VALUES (?, ?) ON CONFLICT(song_id) DO UPDATE SET document=excluded.document", (song_id, json.dumps(result)))
    return result


@router.put("/songs/{song_id}/beat-map")
def set_beats(song_id: str, values: BeatSettings) -> dict:
    song, _ = require_song(song_id)
    if values.anchor >= song["duration"]:
        raise HTTPException(422, "Beat anchor must fall within the recording")
    step = 60 / values.bpm
    start = values.anchor - math.floor(values.anchor / step) * step
    beats = [round(start + i * step, 5) for i in range(math.ceil((song["duration"] - start) / step))]
    return store_beats(song_id, dict(bpm=values.bpm, anchor=values.anchor, beats=beats, confidence=1 if values.verified else .5, verified=values.verified, source="manual"))


@router.post("/songs/{song_id}/analyze-beats")
def analyze_beats(song_id: str) -> dict:
    song, paths = require_song(song_id)
    source = paths.get("original") or paths.get("instrumental")
    if not source:
        raise HTTPException(409, "Audio is not ready")
    try:
        from .rhythm import analyze
        result = analyze(source)
    except Exception as exc:
        raise HTTPException(422, f"Beat analysis unavailable: {exc}. Set tempo and a beat anchor manually.") from exc
    return store_beats(song_id, result)


@router.post("/songs/{song_id}/beat-map/confirm")
def confirm_beats(song_id: str) -> dict:
    result = get_beats(song_id)
    if not result:
        raise HTTPException(404, "Analyze beats first")
    return store_beats(song_id, {**result, "verified": True})
