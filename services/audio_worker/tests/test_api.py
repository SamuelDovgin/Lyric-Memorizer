from __future__ import annotations

import io
import json
import wave

from fastapi.testclient import TestClient

from services.audio_worker import database
from services.audio_worker.app import app


def wav_bytes(duration: float = 1.0) -> bytes:
    output = io.BytesIO()
    with wave.open(output, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(8000)
        wav.writeframes(b"\x00\x00" * int(8000 * duration))
    return output.getvalue()


def test_import_prepared_stems_and_persist_feedback(tmp_path, monkeypatch):
    monkeypatch.setattr(database, "DATA_DIR", tmp_path)
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "test.sqlite3")
    monkeypatch.setattr(database, "SONG_DIR", tmp_path / "songs")
    # app imports SONG_DIR by value, so point that binding at the same isolated fixture.
    monkeypatch.setattr("services.audio_worker.app.SONG_DIR", tmp_path / "songs")
    database.init_db()

    with TestClient(app) as client:
        response = client.post(
            "/api/songs/import",
            data={"title": "Fixture song", "artist": "Test", "lyrics": "[Verse]\nFirst line\nSecond line"},
            files={
                "vocals": ("vocals.wav", wav_bytes(), "audio/wav"),
                "instrumental": ("instrumental.wav", wav_bytes(), "audio/wav"),
            },
        )
        assert response.status_code == 201, response.text
        song = response.json()
        assert song["status"] == "READY_NEEDS_REVIEW"
        assert len(song["lines"]) == 2
        assert client.get(song["vocalsUrl"]).status_code == 200

        event = {
            "id": "event_test", "songId": song["id"], "sessionId": "session_test", "sequence": 1,
            "passId": "pass_1", "lineId": song["lines"][0]["id"], "judgment": "again",
            "sourceTime": .5, "createdAt": "2026-09-05T12:00:00Z",
        }
        assert client.post("/api/practice-events/batch", json={"events": [event]}).status_code == 200
        assert client.post("/api/practice-events/batch", json={"events": [event]}).status_code == 200
        stored = client.get(f"/api/songs/{song['id']}/practice-state").json()
        assert stored["events"] == [event]
        assert client.get(f"/api/songs/{song['id']}/cards").status_code == 404



def test_sync_preview_can_fetch_lyrics_before_the_user_pastes_any(monkeypatch):
    monkeypatch.setattr(
        "services.audio_worker.app.fetch_synced_lyrics",
        lambda *_: {
            "trackName": "Fixture song",
            "artistName": "Test",
            "duration": 10,
            "plainLyrics": "First line\nSecond line",
            "syncedLyrics": "[00:01.00]First line\n[00:04.00]Second line\n[00:07.00]",
        },
    )
    with TestClient(app) as client:
        response = client.post(
            "/api/lyrics/sync-preview",
            json={"title": "Fixture song", "artist": "Test", "duration": 10, "lyrics": ""},
        )
    assert response.status_code == 200
    assert response.json()["found"] is True
    assert response.json()["lyrics"] == "First line\nSecond line"


def test_song_readiness_survives_updates_and_deletion(tmp_path, monkeypatch):
    monkeypatch.setattr(database, "DATA_DIR", tmp_path)
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "test.sqlite3")
    monkeypatch.setattr(database, "SONG_DIR", tmp_path / "songs")
    monkeypatch.setattr("services.audio_worker.app.SONG_DIR", tmp_path / "songs")
    with TestClient(app) as client:
        response = client.post("/api/songs/import",
            data={"title": "Readiness fixture", "artist": "Test", "lyrics": "One invented line"},
            files={"original": ("song.wav", wav_bytes(), "audio/wav")})
        assert response.status_code == 201, response.text
        song = response.json()
        song_id = song["id"]
        stale, paths = database.get_song(song_id)
        endpoint = f"/api/songs/{song_id}/readiness"
        for invalid in (0, 6, 2.5, True):
            assert client.put(endpoint, json={"readiness": invalid}).status_code == 422
        for rating in (1, 5, 3):
            assert client.put(endpoint, json={"readiness": rating}).json() == {"readiness": rating}
            assert client.get(f"/api/songs/{song_id}").json()["readiness"] == rating
        database.save_song(stale, paths, "2026-09-06T12:00:00Z")
        assert client.get("/api/songs").json()[0]["readiness"] == 3
        assert client.delete(f"/api/songs/{song_id}").status_code == 204
        assert client.get(f"/api/songs/{song_id}").status_code == 404
        assert client.put(endpoint, json={"readiness": 5}).status_code == 404
        assert not (tmp_path / "songs" / song_id).exists()


def test_emoji_pins_validate_anchors_and_preserve_song(tmp_path, monkeypatch):
    monkeypatch.setattr(database, "DATA_DIR", tmp_path)
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "test.sqlite3")
    monkeypatch.setattr(database, "SONG_DIR", tmp_path / "songs")
    monkeypatch.setattr("services.audio_worker.app.SONG_DIR", tmp_path / "songs")
    with TestClient(app) as client:
        response = client.post("/api/songs/import", data={"title": "Pins", "lyrics": "Open the door"},
            files={"original": ("song.wav", wav_bytes(), "audio/wav")})
        song = response.json()
        line = song["lines"][0]
        stale, paths = database.get_song(song["id"])
        endpoint = f"/api/songs/{song['id']}/emoji-pins"
        pin = dict(lineId=line["id"], lineText=line["text"], wordIndex=2, anchor="door", emoji="🚪", meaning="Door", confidence=97)
        result = client.put(endpoint, json={"pins": [pin]})
        assert result.status_code == 200
        assert client.put(endpoint, json={"pins": [{**pin, "confidence": 101}]}).status_code == 422
        assert result.json()["lines"] == song["lines"]
        database.save_song(stale, paths, "2026-09-06T12:00:00Z")
        assert client.get(f"/api/songs/{song['id']}").json()["emojiPins"] == [pin]
        assert client.put(endpoint, json={"pins": [{**pin, "lineText": "Changed"}]}).status_code == 409
        assert client.put(endpoint, json={"pins": [{**pin, "wordIndex": 9}]}).status_code == 422
        assert client.put(endpoint, json={"pins": [pin, pin]}).status_code == 422
        assert client.put(endpoint, json={"pins": []}).json()["emojiPins"] == []


def test_song_edit_preserves_source_and_rejects_stale_edits(tmp_path, monkeypatch):
    monkeypatch.setattr(database, 'DATA_DIR', tmp_path)
    monkeypatch.setattr(database, 'DB_PATH', tmp_path / 'test.sqlite3')
    monkeypatch.setattr(database, 'SONG_DIR', tmp_path / 'songs')
    with TestClient(app) as client:
        original = dict(id='edit-test', title='Old', artist='Artist', lyrics='Old words',
                        duration=30, lines=[], alignmentRevision=0,
                        sourceUrl='https://www.youtube.com/watch?v=test',
                        alignmentSource={'catalogId': 1}, status='READY_NEEDS_REVIEW')
        database.save_song(original, {'original': '/unchanged.wav'}, 'now')
        payload = dict(title='New', artist='Artist', lyrics='New words', revision=0)
        result = client.put('/api/songs/edit-test/edit', json=payload)
        assert result.status_code == 200, result.text
        edited = result.json()
        assert edited['sourceUrl'] == original['sourceUrl']
        assert edited['lines'] and 'alignmentSource' not in edited
        assert edited['alignmentRevision'] == 1
        assert database.get_song('edit-test')[1]['original'] == '/unchanged.wav'
        assert client.put('/api/songs/edit-test/edit', json=payload).status_code == 409
        assert client.put('/api/songs/edit-test/edit', json={**payload, 'revision': 1, 'lyrics': ' '}).status_code == 422
        assert database.get_song('edit-test')[0]['lyrics'] == 'New words'


def test_refresh_preview_uses_youtube_metadata_without_saving(tmp_path, monkeypatch):
    from types import SimpleNamespace
    import importlib
    worker = importlib.import_module('services.audio_worker.app')
    monkeypatch.setattr(database, 'DATA_DIR', tmp_path)
    monkeypatch.setattr(database, 'DB_PATH', tmp_path / 'test.sqlite3')
    monkeypatch.setattr(database, 'SONG_DIR', tmp_path / 'songs')
    monkeypatch.setattr(worker, 'yt_dlp_command', lambda: ['yt-dlp'])
    monkeypatch.setattr(worker.subprocess, 'run', lambda *a, **kw: SimpleNamespace(
        stdout=json.dumps({'title': 'Doja Cat - Cards (Audio)', 'artist': 'Doja Cat'})))
    def catalog(title, artist, duration, lyrics):
        assert title == 'Cards' and artist == 'Doja Cat'
        return {'syncedLyrics': '[00:01]Fresh words', 'plainLyrics': 'Fresh words'}
    monkeypatch.setattr(worker, 'fetch_synced_lyrics', catalog)
    with TestClient(app) as client:
        original = dict(id='preview', title='Wrong title', artist='Wrong artist', lyrics='Keep these',
                        duration=224, lines=[], sourceUrl='https://www.youtube.com/watch?v=test')
        database.save_song(original, {}, 'now')
        result = client.post('/api/songs/preview/refresh-preview')
        assert result.status_code == 200, result.text
        assert result.json() == {'title': 'Cards', 'artist': 'Doja Cat', 'lyrics': 'Fresh words'}
        assert database.get_song('preview')[0]['lyrics'] == 'Keep these'
