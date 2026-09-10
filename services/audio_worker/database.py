from __future__ import annotations

import json
import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator


BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = Path(os.environ.get("LYRIC_MEMORIZER_DATA_DIR", BASE_DIR / "data")).resolve()
DB_PATH = DATA_DIR / "lyric_memorizer.sqlite3"
SONG_DIR = DATA_DIR / "songs"


def ensure_data_dirs() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    SONG_DIR.mkdir(parents=True, exist_ok=True)


@contextmanager
def connect() -> Iterator[sqlite3.Connection]:
    ensure_data_dirs()
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    try:
        yield connection
        connection.commit()
    finally:
        connection.close()


def init_db() -> None:
    with connect() as db:
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS songs (
                id TEXT PRIMARY KEY,
                document TEXT NOT NULL,
                paths TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS jobs (
                id TEXT PRIMARY KEY,
                song_id TEXT NOT NULL,
                kind TEXT NOT NULL,
                status TEXT NOT NULL,
                progress REAL NOT NULL DEFAULT 0,
                message TEXT NOT NULL DEFAULT '',
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS cards (
                id TEXT PRIMARY KEY,
                song_id TEXT NOT NULL,
                line_id TEXT NOT NULL,
                document TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS reviews (
                id TEXT PRIMARY KEY,
                card_id TEXT NOT NULL,
                song_id TEXT NOT NULL,
                line_id TEXT NOT NULL,
                rating INTEGER NOT NULL,
                reviewed_at TEXT NOT NULL,
                due_at TEXT NOT NULL,
                hinted INTEGER NOT NULL,
                replayed INTEGER NOT NULL,
                cue_stage INTEGER NOT NULL,
                document TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS youtube_downloads (
                id TEXT PRIMARY KEY,
                document TEXT NOT NULL,
                paths TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_cards_song ON cards(song_id);
            CREATE INDEX IF NOT EXISTS idx_reviews_song ON reviews(song_id, reviewed_at);
            """
        )
        if 'metadata' not in {row['name'] for row in db.execute('PRAGMA table_info(jobs)')}:
            db.execute("ALTER TABLE jobs ADD COLUMN metadata TEXT NOT NULL DEFAULT '{}'")


def save_song(document: dict, paths: dict, now: str, expected_revision: int | None = None) -> None:
    with connect() as db:
        db.execute("BEGIN IMMEDIATE")
        old = db.execute("SELECT document FROM songs WHERE id=?", (document["id"],)).fetchone()
        if old:
            current = json.loads(old[0])
            # Readiness is edited independently of background audio/timing updates.
            for annotation_key in ("readiness", "emojiPins"):
                if annotation_key in current:
                    document[annotation_key] = current[annotation_key]
            revision = current.get("alignmentRevision", 0)
            if expected_revision is not None and revision != expected_revision:
                from fastapi import HTTPException
                raise HTTPException(409, "Timing changed during processing. Reload and retry.")
            if expected_revision is None and revision > document.get("alignmentRevision", 0):
                for key in ("lines", "alignmentRevision", "schemaVersion"):
                    if key in current:
                        document[key] = current[key]
        db.execute(
            """
            INSERT INTO songs(id, document, paths, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                document=excluded.document,
                paths=excluded.paths,
                updated_at=excluded.updated_at
            """,
            (document["id"], json.dumps(document), json.dumps(paths), now, now),
        )


def list_songs() -> list[dict]:
    with connect() as db:
        rows = db.execute("SELECT document FROM songs ORDER BY created_at DESC").fetchall()
    return [json.loads(row["document"]) for row in rows]


def get_song(song_id: str) -> tuple[dict, dict] | None:
    with connect() as db:
        row = db.execute("SELECT document, paths FROM songs WHERE id = ?", (song_id,)).fetchone()
    if not row:
        return None
    return json.loads(row["document"]), json.loads(row["paths"])


def delete_song(song_id: str) -> None:
    with connect() as db:
        db.execute("DELETE FROM reviews WHERE song_id = ?", (song_id,))
        db.execute("DELETE FROM cards WHERE song_id = ?", (song_id,))
        db.execute("DELETE FROM jobs WHERE song_id = ?", (song_id,))
        db.execute("DELETE FROM songs WHERE id = ?", (song_id,))
        for table in ("practice_events", "practice_sessions", "beat_maps", "section_listens"):
            if db.execute("SELECT name FROM sqlite_master WHERE name=?", (table,)).fetchone():
                db.execute(f"DELETE FROM {table} WHERE song_id=?", (song_id,))


def save_job(job: dict) -> None:
    with connect() as db:
        db.execute(
            """
            INSERT INTO jobs(id, song_id, kind, status, progress, message, updated_at, metadata)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                status=excluded.status,
                progress=excluded.progress,
                message=excluded.message,
                metadata=excluded.metadata,
                updated_at=excluded.updated_at
            """,
            (
                job["id"], job["songId"], job["kind"], job["status"],
                job.get("progress", 0), job.get("message", ""), job["updatedAt"],
                json.dumps({key: job[key] for key in ("engine", "outcome") if key in job}),
            ),
        )


def get_job(job_id: str) -> dict | None:
    with connect() as db:
        row = db.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
    if not row:
        return None
    return {
        "id": row["id"], "songId": row["song_id"], "kind": row["kind"],
        "status": row["status"], "progress": row["progress"],
        "message": row["message"], "updatedAt": row["updated_at"],
        **json.loads(row["metadata"]),
    }


def list_cards(song_id: str) -> list[dict]:
    with connect() as db:
        rows = db.execute("SELECT document FROM cards WHERE song_id = ?", (song_id,)).fetchall()
    return [json.loads(row["document"]) for row in rows]


def save_card(card: dict, now: str) -> None:
    with connect() as db:
        db.execute(
            """
            INSERT INTO cards(id, song_id, line_id, document, updated_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET document=excluded.document, updated_at=excluded.updated_at
            """,
            (card["id"], card["songId"], card["lineId"], json.dumps(card), now),
        )


def save_review(review: dict) -> None:
    with connect() as db:
        db.execute(
            """
            INSERT INTO reviews(
                id, card_id, song_id, line_id, rating, reviewed_at, due_at,
                hinted, replayed, cue_stage, document
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                review["id"], review["cardId"], review["songId"], review["lineId"],
                review["rating"], review["reviewedAt"], review["dueAt"],
                int(review["hinted"]), int(review["replayed"]), review["cueStage"],
                json.dumps(review),
            ),
        )


def list_reviews(song_id: str) -> list[dict]:
    with connect() as db:
        rows = db.execute(
            "SELECT document FROM reviews WHERE song_id = ? ORDER BY reviewed_at DESC", (song_id,)
        ).fetchall()
    return [json.loads(row["document"]) for row in rows]


def save_youtube_download(document: dict, paths: dict, now: str) -> None:
    with connect() as db:
        db.execute(
            """
            INSERT INTO youtube_downloads(id, document, paths, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                document=excluded.document,
                paths=excluded.paths,
                updated_at=excluded.updated_at
            """,
            (document["id"], json.dumps(document), json.dumps(paths), now, now),
        )


def get_youtube_download(download_id: str) -> tuple[dict, dict] | None:
    with connect() as db:
        row = db.execute(
            "SELECT document, paths FROM youtube_downloads WHERE id = ?", (download_id,)
        ).fetchone()
    if not row:
        return None
    return json.loads(row["document"]), json.loads(row["paths"])


def delete_youtube_download(download_id: str) -> None:
    with connect() as db:
        db.execute("DELETE FROM youtube_downloads WHERE id = ?", (download_id,))


def purge_youtube_downloads_before(cutoff: str) -> list[str]:
    with connect() as db:
        rows = db.execute(
            "SELECT id FROM youtube_downloads WHERE created_at < ?", (cutoff,)
        ).fetchall()
        download_ids = [row["id"] for row in rows]
        if download_ids:
            db.executemany("DELETE FROM youtube_downloads WHERE id = ?", [(item,) for item in download_ids])
    return download_ids


def set_song_readiness(song_id: str, readiness: int) -> dict | None:
    with connect() as db:
        db.execute("BEGIN IMMEDIATE")
        row = db.execute("SELECT document FROM songs WHERE id=?", (song_id,)).fetchone()
        if row is None:
            return None
        document = json.loads(row[0])
        document["readiness"] = readiness
        db.execute("UPDATE songs SET document=? WHERE id=?", (json.dumps(document), song_id))
    return document


def set_song_emoji_pins(song_id: str, pins: list[dict]) -> dict:
    from fastapi import HTTPException
    with connect() as db:
        db.execute("BEGIN IMMEDIATE")
        row = db.execute("SELECT document FROM songs WHERE id=?", (song_id,)).fetchone()
        if row is None:
            raise HTTPException(404, "Song not found")
        document = json.loads(row[0])
        lines = {line["id"]: line for line in document["lines"]}
        seen = set()
        for pin in pins:
            line = lines.get(pin["lineId"])
            if not line or line["text"] != pin["lineText"]:
                raise HTTPException(409, "Lyrics changed. Reload before applying emoji pins.")
            words = line["text"].split()
            index = pin["wordIndex"]
            if index >= len(words) or words[index] != pin["anchor"]:
                raise HTTPException(422, "Emoji anchor does not match its lyric word.")
            identity = (pin["lineId"], index)
            if identity in seen:
                raise HTTPException(422, "Only one pin is allowed per word.")
            seen.add(identity)
        document["emojiPins"] = pins
        db.execute("UPDATE songs SET document=? WHERE id=?", (json.dumps(document), song_id))
    return document
