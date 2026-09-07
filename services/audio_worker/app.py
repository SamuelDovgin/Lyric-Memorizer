from __future__ import annotations

import os
import math
import shutil
import subprocess
import sys
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from .alignment import (
    align_anchored_hypothesis,
    align_hypothesis,
    transcribe_anchored_vocals,
    transcribe_vocals,
)
from .database import (
    SONG_DIR,
    delete_youtube_download,
    delete_song,
    set_song_readiness,
    set_song_emoji_pins,
    get_job,
    get_song,
    get_youtube_download,
    init_db,
    list_songs,
    purge_youtube_downloads_before,
    save_job,
    save_song,
    save_youtube_download,
)
from .listening import router as listening_router, init_listening
from .genius_source import router as genius_router
from .lyrics import build_draft_alignment, redistribute_tokens
from .rehearsal import router as rehearsal_router, migrate, public_song
from .lrclib import apply_synced_lyrics, fetch_synced_lyrics, parse_synced_lyrics


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
BUNDLED_YT_DLP = REPOSITORY_ROOT / "tools" / "yt-dlp" / "yt-dlp.exe"
YOUTUBE_HOSTS = {"youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be"}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    migrate()
    init_listening()
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    for download_id in purge_youtube_downloads_before(cutoff):
        directory = SONG_DIR.parent / "youtube-downloads" / download_id
        if directory.is_dir():
            shutil.rmtree(directory)
    yield


app = FastAPI(title="Lyric Memorizer Local Worker", version="0.2.0", lifespan=lifespan)
app.include_router(listening_router)
app.include_router(genius_router)
app.include_router(rehearsal_router)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def audio_duration(path: Path) -> float:
    try:
        completed = subprocess.run(
            [
                "ffprobe", "-v", "error", "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1", str(path),
            ],
            check=True,
            capture_output=True,
            text=True,
            timeout=30,
        )
        duration = float(completed.stdout.strip())
        if duration <= 0 or not math.isfinite(duration):
            raise ValueError("Invalid duration")
        return duration
    except (FileNotFoundError, subprocess.SubprocessError, ValueError):
        raise ValueError("Could not read audio duration. Check that FFmpeg is installed and the file is valid.")


def safe_suffix(upload: UploadFile) -> str:
    suffix = Path(upload.filename or "audio.wav").suffix.lower()
    return suffix if suffix in {".wav", ".mp3", ".m4a", ".aac", ".flac", ".ogg"} else ".bin"


def validate_youtube_url(value: str) -> str:
    candidate = value.strip()
    if len(candidate) > 2048:
        raise ValueError("The YouTube link is too long")
    parsed = urlparse(candidate)
    host = (parsed.hostname or "").casefold()
    if parsed.scheme not in {"http", "https"} or host not in YOUTUBE_HOSTS:
        raise ValueError("Paste a valid youtube.com or youtu.be video link")
    if host == "youtu.be" and not parsed.path.strip("/"):
        raise ValueError("The YouTube link is missing a video ID")
    if host != "youtu.be" and parsed.path == "/watch" and not parse_qs(parsed.query).get("v"):
        raise ValueError("The YouTube link is missing a video ID")
    if host != "youtu.be" and parsed.path not in {"/watch", "/shorts", "/live", "/embed"} and not parsed.path.startswith(("/shorts/", "/live/", "/embed/")):
        raise ValueError("Paste a direct YouTube video link, not a channel or search page")
    if parsed.path in {"/shorts", "/live", "/embed"}:
        raise ValueError("The YouTube link is missing a video ID")
    return candidate


def yt_dlp_command() -> list[str]:
    executable = shutil.which("yt-dlp")
    if executable:
        return [executable]
    try:
        import yt_dlp  # type: ignore  # noqa: F401
        return [sys.executable, "-m", "yt_dlp"]
    except ImportError:
        if os.name == "nt" and BUNDLED_YT_DLP.is_file():
            return [str(BUNDLED_YT_DLP)]
        raise RuntimeError("yt-dlp is not installed. Run the base worker requirements installation.")


def run_youtube_download(directory: Path, youtube_url: str) -> tuple[Path, str, str]:
    directory.mkdir(parents=True, exist_ok=True)
    command = [
        *yt_dlp_command(),
        "--no-config",
        "--no-playlist",
        "--no-simulate",
        "--js-runtimes", "node",
        "--match-filter", "duration <= 1800",
        "--max-filesize", "250M",
        "--socket-timeout", "30",
        "--no-progress",
        "--format", "bestaudio/best",
        "--extract-audio",
        "--audio-format", "wav",
        "--audio-quality", "0",
        "--output", str(directory / "original.%(ext)s"),
        "--print", "title:%(title)s",
        "--print", "uploader:%(uploader)s",
        youtube_url,
    ]
    completed = subprocess.run(command, check=True, capture_output=True, text=True, timeout=60 * 12)
    candidates = sorted(directory.glob("original.*"))
    source = next(
        (path for path in candidates if path.suffix.casefold() in {".wav", ".mp3", ".m4a", ".aac", ".flac", ".ogg"}),
        None,
    )
    if source is None:
        raise RuntimeError("yt-dlp completed without producing an audio file")
    title = ""
    uploader = ""
    for output_line in completed.stdout.splitlines():
        if output_line.startswith("title:"):
            title = output_line.removeprefix("title:").strip()
        elif output_line.startswith("uploader:"):
            uploader = output_line.removeprefix("uploader:").strip()
    return source, title, uploader


def save_upload(upload: UploadFile, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    with destination.open("wb") as output:
        shutil.copyfileobj(upload.file, output)


def media_urls(song_id: str, paths: dict) -> dict:
    return {
        "originalUrl": f"/media/{song_id}/original" if paths.get("original") else None,
        "vocalsUrl": f"/media/{song_id}/vocals" if paths.get("vocals") else None,
        "instrumentalUrl": f"/media/{song_id}/instrumental" if paths.get("instrumental") else None,
    }


def update_status(song_id: str, status: str, *, message: str | None = None) -> None:
    found = get_song(song_id)
    if not found:
        return
    document, paths = found
    document["status"] = status
    if message is not None:
        document["statusMessage"] = message
    document.update(media_urls(song_id, paths))
    save_song(document, paths, now_iso())


def apply_catalog_timing(document: dict) -> bool:
    """Apply LRCLIB timing to canonical lyrics without replacing their text."""
    catalog = fetch_synced_lyrics(document["title"], document.get("artist", ""), document.get("duration"))
    if not catalog or not catalog.get("syncedLyrics"):
        return False
    document["lines"], coverage = apply_synced_lyrics(
        document["lines"], catalog["syncedLyrics"], document["duration"]
    )
    document["alignmentSource"] = {
        "kind": "lrclib",
        "trackName": catalog.get("trackName"),
        "artistName": catalog.get("artistName"),
        "coverage": round(coverage, 3),
    }
    return coverage >= 0.55


def separate_song(song_id: str, job_id: str) -> None:
    found = get_song(song_id)
    if not found:
        return
    document, paths = found
    job = {
        "id": job_id, "songId": song_id, "kind": "separation", "status": "RUNNING",
        "progress": 0.15, "message": "Loading Demucs and separating vocals", "updatedAt": now_iso(),
    }
    save_job(job)
    source = Path(paths["original"])
    working = source.parent / "demucs-output"
    model = os.environ.get("LYRIC_DEMUCS_MODEL", "htdemucs")
    try:
        subprocess.run(
            [sys.executable, "-m", "demucs.separate", "--two-stems", "vocals", "-n", model, "-o", str(working), str(source)],
            check=True,
            capture_output=True,
            text=True,
            timeout=60 * 45,
        )
        candidates = list(working.glob(f"{model}/*/vocals.wav"))
        if not candidates:
            candidates = list(working.glob("**/vocals.wav"))
        if not candidates:
            raise RuntimeError("Demucs finished without creating vocals.wav")
        vocals_source = candidates[0]
        instrumental_source = vocals_source.with_name("no_vocals.wav")
        if not instrumental_source.exists():
            raise RuntimeError("Demucs finished without creating no_vocals.wav")
        vocals_path = source.parent / "vocals.wav"
        instrumental_path = source.parent / "instrumental.wav"
        shutil.copy2(vocals_source, vocals_path)
        shutil.copy2(instrumental_source, instrumental_path)
        paths.update({"vocals": str(vocals_path), "instrumental": str(instrumental_path)})
        document.update(media_urls(song_id, paths))
        low_count = sum(1 for line in document["lines"] if line["confidence"] < 0.55)
        document["status"] = "READY" if low_count == 0 else "READY_NEEDS_REVIEW"
        document["statusMessage"] = (
            "Stems ready and free line timing synced"
            if low_count == 0 and document.get("alignmentSource", {}).get("kind") == "lrclib"
            else "Stems ready. Review draft timings or run local alignment."
        )
        save_song(document, paths, now_iso())
        job.update(status="COMPLETE", progress=1, message="Vocal and instrumental stems are ready", updatedAt=now_iso())
        save_job(job)
    except Exception as exc:  # background job must surface useful recovery state
        message = str(exc)
        if "No module named" in message or "demucs" in message.casefold():
            message = "Demucs is not installed. Install requirements-ml.txt or upload vocal and instrumental stems."
        update_status(song_id, "NEEDS_STEMS", message=message)
        job.update(status="FAILED", progress=0, message=message, updatedAt=now_iso())
        save_job(job)


def download_youtube_song(song_id: str, job_id: str, youtube_url: str) -> None:
    found = get_song(song_id)
    if not found:
        return
    document, paths = found
    directory = SONG_DIR / song_id
    directory.mkdir(parents=True, exist_ok=True)
    job = {
        "id": job_id, "songId": song_id, "kind": "youtube_import", "status": "RUNNING",
        "progress": 0.05, "message": "Downloading authorized YouTube audio locally", "updatedAt": now_iso(),
    }
    save_job(job)
    try:
        source, downloaded_title, downloaded_artist = run_youtube_download(directory, youtube_url)
        paths["original"] = str(source)
        document["duration"] = audio_duration(source)
        document["lines"] = build_draft_alignment(document["lyrics"], document["duration"], song_id)
        if downloaded_title and document["title"] in {"", "YouTube song"}:
            document["title"] = downloaded_title
        if downloaded_artist and not document["artist"]:
            document["artist"] = downloaded_artist
        if document.get("autoSyncLyrics"):
            try:
                apply_catalog_timing(document)
            except Exception:
                pass
        document["status"] = "PROCESSING"
        document["statusMessage"] = "Download complete. Audio ready."
        document.update(media_urls(song_id, paths))
        save_song(document, paths, now_iso())
        job.update(progress=0.25, message=document["statusMessage"], updatedAt=now_iso())
        save_job(job)
        document["status"] = "READY_NEEDS_REVIEW"
        document["statusMessage"] = "Audio ready. Separation is optional."
        save_song(document, paths, now_iso())
        job.update(status="COMPLETE", progress=1, message=document["statusMessage"], updatedAt=now_iso())
        save_job(job)
    except Exception as exc:
        message = str(exc)
        if isinstance(exc, subprocess.CalledProcessError) and exc.stderr:
            message = exc.stderr.strip().splitlines()[-1]
        update_status(song_id, "NEEDS_STEMS", message=f"YouTube download failed: {message}")
        job.update(status="FAILED", progress=0, message=f"YouTube download failed: {message}", updatedAt=now_iso())
        save_job(job)


def stage_youtube_download(download_id: str, youtube_url: str) -> None:
    directory = SONG_DIR.parent / "youtube-downloads" / download_id
    document = {
        "id": download_id,
        "url": youtube_url,
        "status": "DOWNLOADING",
        "progress": 0.15,
        "message": "Downloading the best available audio",
        "title": "",
        "artist": "",
        "duration": None,
        "createdAt": now_iso(),
    }
    save_youtube_download(document, {}, now_iso())
    try:
        source, title, artist = run_youtube_download(directory, youtube_url)
        document.update(
            status="COMPLETE",
            progress=1,
            message="Audio downloaded and ready for import",
            title=title,
            artist=artist,
            duration=audio_duration(source),
        )
        save_youtube_download(document, {"original": str(source)}, now_iso())
    except Exception as exc:
        message = str(exc)
        if isinstance(exc, subprocess.CalledProcessError) and exc.stderr:
            message = exc.stderr.strip().splitlines()[-1]
        document.update(status="FAILED", progress=0, message=message)
        save_youtube_download(document, {}, now_iso())
def align_song(song_id: str, job_id: str, refine_words: bool = False) -> None:
    found = get_song(song_id)
    if not found:
        return
    document, paths = found
    revision = document.get("alignmentRevision", 0)
    job = dict(id=job_id, songId=song_id, kind="alignment", status="RUNNING", progress=.1,
               message="Checking synchronized lyrics", updatedAt=now_iso())
    save_job(job)
    try:
        if not refine_words:
            if not apply_catalog_timing(document):
                raise RuntimeError("No reliable line sync found. Mark line starts manually, or create stems and refine words.")
        else:
            vocals = paths.get("vocals")
            if not vocals:
                raise RuntimeError("Create vocal stems before refining words")
            anchored = any(line.get("timingSource") == "lrclib_synced_lyrics" or line.get("verified") for line in document["lines"])
            model = os.environ.get("LYRIC_WHISPER_MODEL", "small")
            job.update(progress=.3, message="Refining words locally; first use downloads the model")
            save_job(job)
            hypothesis = transcribe_anchored_vocals(vocals, document["lines"], model) if anchored else transcribe_vocals(vocals, model, prompt=document["lyrics"])
            if not hypothesis:
                raise RuntimeError("No sung words detected")
            document["lines"] = align_anchored_hypothesis(document["lines"], hypothesis) if anchored else align_hypothesis(document["lines"], hypothesis)
        document["alignmentRevision"] = revision + 1
        document["status"] = "READY_NEEDS_REVIEW"
        document["statusMessage"] = "Timing updated. Check your important passages."
        save_song(document, paths, now_iso(), expected_revision=revision)
        job.update(status="COMPLETE", progress=1, message=document["statusMessage"])
    except Exception as exc:
        job.update(status="FAILED", message=str(getattr(exc, "detail", exc)))
    job["updatedAt"] = now_iso()
    save_job(job)


@app.post("/api/songs/{song_id}/separate", status_code=202)
def start_separation(song_id: str, background_tasks: BackgroundTasks) -> dict:
    found = get_song(song_id)
    if not found or not found[1].get("original"):
        raise HTTPException(409, "An original recording is required")
    job_id = f"job_{uuid.uuid4().hex}"
    background_tasks.add_task(separate_song, song_id, job_id)
    return {"jobId": job_id}


class TimingToken(BaseModel):
    id: str
    index: int
    text: str
    start: float = Field(ge=0, allow_inf_nan=False)
    end: float = Field(gt=0, allow_inf_nan=False)
    confidence: float = Field(ge=0, le=1, allow_inf_nan=False)
    source: str


class TimingLine(BaseModel):
    id: str
    section: str | None = Field(default=None, min_length=1, max_length=100)
    sectionId: str | None = Field(default=None, min_length=1, max_length=200)
    start: float = Field(ge=0, allow_inf_nan=False)
    end: float = Field(gt=0, allow_inf_nan=False)
    verified: bool = False
    tokens: list[TimingToken]


class AlignmentUpdate(BaseModel):
    lines: list[TimingLine]
    revision: int = 0


class YoutubeDownloadRequest(BaseModel):
    url: str


class LyricSyncPreviewRequest(BaseModel):
    title: str
    artist: str = ""
    duration: float | None = Field(default=None, ge=0)
    lyrics: str = ""


@app.get("/api/health")
def health() -> dict:
    try:
        yt_dlp_ready = bool(yt_dlp_command())
    except RuntimeError:
        yt_dlp_ready = False
    return {
        "ok": True,
        "service": "lyric-memorizer-worker",
        "demucs": bool(shutil.which("demucs")),
        "ytDlp": yt_dlp_ready,
    }


@app.post("/api/lyrics/sync-preview")
def lyric_sync_preview(request: LyricSyncPreviewRequest) -> dict:
    if not request.title.strip():
        raise HTTPException(422, "Enter the song title first")
    catalog = fetch_synced_lyrics(request.title, request.artist, request.duration)
    if not catalog or not catalog.get("syncedLyrics"):
        return {"found": False, "message": "No reliable synchronized entry found"}
    catalog_lyrics = str(catalog.get("plainLyrics") or "").strip()
    if not catalog_lyrics:
        catalog_lyrics = "\n".join(
            entry.text for entry in parse_synced_lyrics(
                catalog["syncedLyrics"], request.duration or float(catalog.get("duration") or 180)
            )
        )
    if not request.lyrics.strip():
        lyric_lines = [line for line in catalog_lyrics.splitlines() if line.strip()]
        return {
            "found": True,
            "trackName": catalog.get("trackName"),
            "artistName": catalog.get("artistName"),
            "matchedLines": len(lyric_lines),
            "totalLines": len(lyric_lines),
            "coverage": 1,
            "lyrics": catalog_lyrics,
            "message": f"Lyrics and synchronized timing found ({len(lyric_lines)} lyric lines)",
        }
    duration = request.duration or float(catalog.get("duration") or 180)
    lines = build_draft_alignment(request.lyrics, duration, "preview")
    aligned, coverage = apply_synced_lyrics(lines, catalog["syncedLyrics"], duration)
    matched = sum(1 for line in aligned if line.get("timingSource") == "lrclib_synced_lyrics")
    return {
        "found": coverage >= 0.55,
        "trackName": catalog.get("trackName"),
        "artistName": catalog.get("artistName"),
        "matchedLines": matched,
        "totalLines": len(aligned),
        "coverage": round(coverage, 3),
        "lyrics": catalog_lyrics,
        "message": f"Synchronized timing found for {matched} of {len(aligned)} lines",
    }


@app.post("/api/youtube/download", status_code=202)
def start_youtube_download(request: YoutubeDownloadRequest, background_tasks: BackgroundTasks) -> dict:
    try:
        youtube_url = validate_youtube_url(request.url)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    download_id = f"download_{uuid.uuid4().hex}"
    document = {
        "id": download_id,
        "url": youtube_url,
        "status": "QUEUED",
        "progress": 0,
        "message": "Waiting to download",
        "title": "",
        "artist": "",
        "duration": None,
        "createdAt": now_iso(),
    }
    save_youtube_download(document, {}, now_iso())
    background_tasks.add_task(stage_youtube_download, download_id, youtube_url)
    return document


@app.get("/api/youtube/downloads/{download_id}")
def youtube_download(download_id: str) -> dict:
    found = get_youtube_download(download_id)
    if not found:
        raise HTTPException(404, "YouTube download not found")
    return found[0]


@app.get("/api/songs")
def songs() -> list[dict]:
    return [public_song(item) for item in list_songs()]


@app.get("/api/songs/{song_id}")
def song(song_id: str) -> dict:
    found = get_song(song_id)
    if not found:
        raise HTTPException(404, "Song not found")
    return public_song(found[0])


@app.post("/api/songs/import", status_code=201)
def import_song(
    background_tasks: BackgroundTasks,
    title: str = Form(...),
    artist: str = Form(""),
    lyrics: str = Form(...),
    youtube_url: str = Form(""),
    youtube_download_id: str = Form(""),
    sync_lyrics: bool = Form(False),
    original: UploadFile | None = File(None),
    vocals: UploadFile | None = File(None),
    instrumental: UploadFile | None = File(None),
) -> dict:
    if not lyrics.strip():
        raise HTTPException(422, "Paste the canonical lyrics before importing")
    youtube_url = youtube_url.strip()
    youtube_download_id = youtube_download_id.strip()
    staged_download: tuple[dict, dict] | None = None
    if youtube_download_id:
        staged_download = get_youtube_download(youtube_download_id)
        if not staged_download or staged_download[0].get("status") != "COMPLETE" or not staged_download[1].get("original"):
            raise HTTPException(409, "The YouTube download is not ready")
        youtube_url = staged_download[0]["url"]
    if youtube_url:
        try:
            youtube_url = validate_youtube_url(youtube_url)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
    if not original and not youtube_url and not (vocals and instrumental):
        raise HTTPException(422, "Upload an original recording, paste a YouTube link, or provide both stems")
    if sum([bool(original), bool(youtube_url and not staged_download), bool(staged_download), bool(vocals and instrumental)]) > 1:
        raise HTTPException(422, "Choose one source: an audio file, a YouTube link, or prepared stems")
    if bool(vocals) != bool(instrumental):
        raise HTTPException(422, "Upload both vocal and instrumental stems together")

    song_id = f"song_{uuid.uuid4().hex}"
    directory = SONG_DIR / song_id
    paths: dict[str, str] = {}
    if original:
        path = directory / f"original{safe_suffix(original)}"
        save_upload(original, path)
        paths["original"] = str(path)
    if staged_download:
        staged_document, staged_paths = staged_download
        staged_source = Path(staged_paths["original"])
        path = directory / f"original{staged_source.suffix.casefold()}"
        path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(staged_source, path)
        paths["original"] = str(path)
        if not title.strip() and staged_document.get("title"):
            title = staged_document["title"]
        if not artist.strip() and staged_document.get("artist"):
            artist = staged_document["artist"]
    if vocals and instrumental:
        vocal_path = directory / f"vocals{safe_suffix(vocals)}"
        instrumental_path = directory / f"instrumental{safe_suffix(instrumental)}"
        save_upload(vocals, vocal_path)
        save_upload(instrumental, instrumental_path)
        paths.update({"vocals": str(vocal_path), "instrumental": str(instrumental_path)})

    duration_source = Path(paths.get("vocals") or paths.get("original", ""))
    try:
        duration = audio_duration(duration_source) if paths else 0
    except ValueError as exc:
        shutil.rmtree(directory, ignore_errors=True)
        raise HTTPException(422, str(exc)) from exc
    status = "READY_NEEDS_REVIEW" if paths else "PROCESSING"
    document = {
        "id": song_id,
        "title": title.strip() or "Untitled song",
        "artist": artist.strip(),
        "lyrics": lyrics,
        "duration": duration,
        "status": status,
        "statusMessage": "Review the draft timing" if paths.get("vocals") else (
            "Download ready. Preparing playback" if staged_download
            else "Downloading authorized YouTube audio" if youtube_url
            else "Preparing playback"
        ),
        "createdAt": now_iso(),
        "sourceUrl": youtube_url or None,
        "autoSyncLyrics": sync_lyrics,
        "lines": build_draft_alignment(lyrics, duration, song_id) if duration else [],
        "schemaVersion": 2,
        "alignmentRevision": 0,
        **media_urls(song_id, paths),
    }
    if sync_lyrics:
        try:
            apply_catalog_timing(document)
            if paths.get("vocals"):
                low_count = sum(1 for line in document["lines"] if line["confidence"] < 0.55)
                document["status"] = "READY" if low_count == 0 else "READY_NEEDS_REVIEW"
                document["statusMessage"] = (
                    f"Free synchronized timing matched {len(document['lines']) - low_count} of {len(document['lines'])} lines"
                )
        except Exception:
            pass
    save_song(document, paths, now_iso())
    if staged_download:
        staged_directory = SONG_DIR.parent / "youtube-downloads" / youtube_download_id
        delete_youtube_download(youtube_download_id)
        if staged_directory.is_dir():
            shutil.rmtree(staged_directory)
    if youtube_url and not staged_download and not original:
        job_id = f"job_{uuid.uuid4().hex}"
        document["jobId"] = job_id
        save_song(document, paths, now_iso())
        background_tasks.add_task(download_youtube_song, song_id, job_id, youtube_url)
    elif paths:
        document["statusMessage"] = "Audio ready. Play now or improve lyric timing."
        save_song(document, paths, now_iso())
    return document


@app.post("/api/songs/{song_id}/stems")
def upload_stems(song_id: str, vocals: UploadFile = File(...), instrumental: UploadFile = File(...)) -> dict:
    found = get_song(song_id)
    if not found:
        raise HTTPException(404, "Song not found")
    document, paths = found
    directory = SONG_DIR / song_id
    vocal_path = directory / f"vocals{safe_suffix(vocals)}"
    instrumental_path = directory / f"instrumental{safe_suffix(instrumental)}"
    save_upload(vocals, vocal_path)
    save_upload(instrumental, instrumental_path)
    paths.update({"vocals": str(vocal_path), "instrumental": str(instrumental_path)})
    document.update(media_urls(song_id, paths))
    document["duration"] = audio_duration(vocal_path)
    document["status"] = "READY_NEEDS_REVIEW"
    document["statusMessage"] = "Stems ready. Review draft timings or run local alignment."
    save_song(document, paths, now_iso())
    return document


@app.post("/api/songs/{song_id}/align", status_code=202)
def start_alignment(song_id: str, background_tasks: BackgroundTasks, refine_words: bool = False) -> dict:
    found = get_song(song_id)
    if not found:
        raise HTTPException(404, "Song not found")
    if refine_words and not found[1].get("vocals"):
        raise HTTPException(409, "Create vocal stems before refining words")
    job_id = f"job_{uuid.uuid4().hex}"
    save_job({
        "id": job_id, "songId": song_id, "kind": "alignment", "status": "QUEUED",
        "progress": 0, "message": "Waiting to start", "updatedAt": now_iso(),
    })
    background_tasks.add_task(align_song, song_id, job_id, refine_words)
    return {"jobId": job_id}


@app.get("/api/jobs/{job_id}")
def job(job_id: str) -> dict:
    result = get_job(job_id)
    if not result:
        raise HTTPException(404, "Job not found")
    return result


@app.put("/api/songs/{song_id}/alignment")
def update_alignment(song_id: str, update: AlignmentUpdate) -> dict:
    found = get_song(song_id)
    if not found:
        raise HTTPException(404, "Song not found")
    document, paths = found
    if document.get("alignmentRevision", 0) != update.revision:
        raise HTTPException(409, "Timing changed. Reload before saving.")
    existing = {line["id"]: line for line in document["lines"]}
    for supplied in update.lines:
        if supplied.id not in existing:
            raise HTTPException(422, f"Unknown line: {supplied.id}")
        if supplied.end > document["duration"] or supplied.start >= document["duration"]:
            raise HTTPException(422, "Timing must fall within the recording")
        if supplied.end <= supplied.start:
            raise HTTPException(422, "Line end must be after its start")
        if any(token.end <= token.start or token.start < supplied.start or token.end > supplied.end for token in supplied.tokens):
            raise HTTPException(422, "Token end must be after its start")
        current = existing[supplied.id]
        if supplied.tokens and {t.id for t in supplied.tokens} != {t["id"] for t in current["tokens"]}:
            raise HTTPException(422, "Token identity must be preserved")
        changed_bounds = current["start"] != supplied.start or current["end"] != supplied.end
        current.update(
            start=supplied.start,
            end=supplied.end,
            verified=supplied.verified,
            confidence=1.0 if supplied.verified else .18 if changed_bounds else current.get("confidence", 0.18),
            tokens=[token.model_dump() for token in supplied.tokens],
        )
        if supplied.section is not None:
            if not supplied.section.strip():
                raise HTTPException(422, "Section name cannot be blank")
            current["section"] = supplied.section.strip()
        if supplied.sectionId is not None:
            current["sectionId"] = supplied.sectionId
        current = redistribute_tokens(current) if not supplied.tokens else current
        existing[supplied.id] = current
    document["lines"] = [existing[line["id"]] for line in document["lines"]]
    unresolved = sum(1 for line in document["lines"] if not line.get("verified") and line.get("confidence", 0) < 0.55)
    document["status"] = "READY" if unresolved == 0 else "READY_NEEDS_REVIEW"
    document["statusMessage"] = "Timing verified" if unresolved == 0 else f"{unresolved} line(s) still need timing review"
    document["alignmentRevision"] = update.revision + 1
    save_song(document, paths, now_iso(), expected_revision=update.revision)
    return document


@app.get("/media/{song_id}/{asset}")
def media(song_id: str, asset: str) -> FileResponse:
    if asset not in {"original", "vocals", "instrumental"}:
        raise HTTPException(404, "Unknown media asset")
    found = get_song(song_id)
    if not found:
        raise HTTPException(404, "Song not found")
    path_value = found[1].get(asset)
    if not path_value or not Path(path_value).is_file():
        raise HTTPException(404, "Media asset not available")
    return FileResponse(path_value)


@app.delete("/api/songs/{song_id}", status_code=204)
def remove_song(song_id: str) -> None:
    found = get_song(song_id)
    if not found:
        raise HTTPException(404, "Song not found")
    directory = SONG_DIR / song_id
    delete_song(song_id)
    if directory.is_dir():
        shutil.rmtree(directory)


class ReadinessUpdate(BaseModel):
    readiness: int = Field(ge=1, le=5, strict=True)


@app.put("/api/songs/{song_id}/readiness")
def update_readiness(song_id: str, update: ReadinessUpdate) -> dict:
    document = set_song_readiness(song_id, update.readiness)
    if document is None:
        raise HTTPException(404, "Song not found")
    return {"readiness": document["readiness"]}


class EmojiPin(BaseModel):
    confidence: int | None = Field(default=None, ge=0, le=100, strict=True)
    lineId: str
    lineText: str
    wordIndex: int = Field(ge=0, strict=True)
    anchor: str = Field(min_length=1)
    emoji: str = Field(min_length=1, max_length=16)
    meaning: str = Field(min_length=1, max_length=160)


class EmojiPinsUpdate(BaseModel):
    pins: list[EmojiPin] = Field(max_length=2000)


@app.put("/api/songs/{song_id}/emoji-pins")
def update_emoji_pins(song_id: str, update: EmojiPinsUpdate) -> dict:
    return public_song(set_song_emoji_pins(song_id, [pin.model_dump(exclude_none=True) for pin in update.pins]))
