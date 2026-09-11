import subprocess

import pytest
from fastapi.testclient import TestClient

from services.audio_worker import database
from services.audio_worker import app as worker_app
from services.audio_worker.app import download_youtube_song, validate_youtube_url, yt_dlp_command


@pytest.mark.parametrize(
    "url",
    [
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        "https://youtu.be/dQw4w9WgXcQ",
        "https://music.youtube.com/watch?v=dQw4w9WgXcQ",
        "https://www.youtube.com/shorts/dQw4w9WgXcQ",
    ],
)
def test_accepts_direct_youtube_video_urls(url):
    assert validate_youtube_url(url) == url


@pytest.mark.parametrize(
    "url",
    [
        "https://example.com/watch?v=dQw4w9WgXcQ",
        "file:///etc/passwd",
        "https://www.youtube.com/results?search_query=song",
        "https://www.youtube.com/watch",
        "https://youtu.be/",
    ],
)
def test_rejects_non_video_or_non_youtube_urls(url):
    with pytest.raises(ValueError):
        validate_youtube_url(url)


def test_finds_a_local_downloader_runtime():
    assert yt_dlp_command()


def test_download_job_makes_original_playable_without_demucs(tmp_path, monkeypatch):
    monkeypatch.setattr(database, "DATA_DIR", tmp_path)
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "test.sqlite3")
    monkeypatch.setattr(database, "SONG_DIR", tmp_path / "songs")
    monkeypatch.setattr(worker_app, "SONG_DIR", tmp_path / "songs")
    database.init_db()
    song_id = "song_youtube_test"
    document = {
        "id": song_id, "title": "Test title", "artist": "", "lyrics": "First line\nSecond line",
        "duration": 180, "status": "PROCESSING", "statusMessage": "Downloading", "createdAt": "now",
        "lines": [], "originalUrl": None, "vocalsUrl": None, "instrumentalUrl": None,
    }
    database.save_song(document, {}, "now")
    seen = {}

    def fake_run(command, **_):
        seen["command"] = command
        output_template = command[command.index("--output") + 1]
        output = output_template.replace("%(ext)s", "wav")
        output_path = worker_app.Path(output)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_bytes(b"fixture")
        return subprocess.CompletedProcess(command, 0, stdout="title:Test title\nuploader:Test channel\n", stderr="")

    monkeypatch.setattr(worker_app, "yt_dlp_command", lambda: ["yt-dlp"])
    monkeypatch.setattr(worker_app.subprocess, "run", fake_run)
    monkeypatch.setattr(worker_app, "audio_duration", lambda _: 12.0)
    def fake_schedule_alignment(song_id, *args, **kwargs):
        seen["alignment_job"] = "job_alignment"
        aligned, aligned_paths = database.get_song(song_id)
        aligned["status"] = "READY_NEEDS_REVIEW"
        aligned["statusMessage"] = "Forced alignment finished"
        aligned["alignmentRun"] = {"engine": "forced", "outcome": "partial"}
        aligned["jobId"] = "job_alignment"
        database.save_song(aligned, aligned_paths, "later")
        return "job_alignment"
    monkeypatch.setattr(worker_app, "schedule_alignment", fake_schedule_alignment)
    monkeypatch.setattr(worker_app, "separate_song", lambda received_song, received_job: seen.update(song=received_song, job=received_job))

    download_youtube_song(song_id, "job_test", "https://youtu.be/dQw4w9WgXcQ")

    assert "--no-playlist" in seen["command"]
    assert "--no-simulate" in seen["command"]
    assert seen["command"][seen["command"].index("--js-runtimes") + 1] == "node"
    assert "--extract-audio" in seen["command"]
    assert "song" not in seen
    saved, paths = database.get_song(song_id)
    assert saved["duration"] == 12.0
    assert saved["status"] == "READY_NEEDS_REVIEW"
    assert saved["jobId"] == "job_alignment"
    assert saved["alignmentRun"]["engine"] == "forced"
    assert saved["originalUrl"]
    assert saved["artist"] == "Test channel"
    assert paths["original"].endswith("original.wav")


def test_import_reuses_completed_staged_download(tmp_path, monkeypatch):
    monkeypatch.setattr(database, "DATA_DIR", tmp_path)
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "test.sqlite3")
    monkeypatch.setattr(database, "SONG_DIR", tmp_path / "songs")
    monkeypatch.setattr(worker_app, "SONG_DIR", tmp_path / "songs")
    database.init_db()
    staged_file = tmp_path / "youtube-downloads" / "download_ready" / "original.wav"
    staged_file.parent.mkdir(parents=True, exist_ok=True)
    from services.audio_worker.tests.test_api import wav_bytes
    staged_file.write_bytes(wav_bytes(12))
    database.save_youtube_download(
        {
            "id": "download_ready", "url": "https://youtu.be/dQw4w9WgXcQ", "status": "COMPLETE",
            "progress": 1, "message": "Ready", "title": "Downloaded title", "artist": "Channel",
            "duration": 12, "createdAt": "now",
        },
        {"original": str(staged_file)},
        "now",
    )
    separated = {}
    monkeypatch.setattr(worker_app, "separate_song", lambda song_id, job_id: separated.update(song=song_id, job=job_id))
    monkeypatch.setattr(worker_app, "queue_initial_alignment", lambda *args, **kwargs: None)

    with TestClient(worker_app.app) as client:
        response = client.post(
            "/api/songs/import",
            data={
                "title": "Downloaded title",
                "artist": "Channel",
                "lyrics": "[Verse]\\\n[First line](https://genius.com/example/First-line)\\",
                "youtube_url": "https://youtu.be/dQw4w9WgXcQ",
                "youtube_download_id": "download_ready",
            },
        )
    assert response.status_code == 201, response.text
    imported = response.json()
    assert imported["sourceUrl"] == "https://youtu.be/dQw4w9WgXcQ"
    assert imported["lines"][0]["text"] == "First line"
    assert separated == {}
    assert imported["originalUrl"]
    _, paths = database.get_song(imported["id"])
    assert paths["original"] != str(staged_file)
    assert database.get_youtube_download("download_ready") is None
    assert not staged_file.exists()
