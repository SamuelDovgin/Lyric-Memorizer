from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

import httpx

from .alignment import normalize, sequence_match


LRCLIB_BASE_URL = "https://lrclib.net/api"
USER_AGENT = "LyricMemorizer/0.1.0 (local-first lyric study app)"
TIMESTAMP_RE = re.compile(r"\[(\d{1,3}):(\d{2}(?:\.\d+)?)\]")
WORD_RE = re.compile(r"[\w’']+", re.UNICODE)
TITLE_NOISE_RE = re.compile(
    r"\s*[\[(](?:official\s+)?(?:audio|video|music video|lyric video|lyrics|visuali[sz]er)[^\])]*[\])]\s*",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class SyncedEntry:
    text: str
    start: float
    end: float


def clean_track_title(title: str, artist: str = "") -> str:
    cleaned = TITLE_NOISE_RE.sub(" ", title).strip()
    if artist:
        cleaned = re.sub(
            rf"^\s*{re.escape(artist)}\s*[-–—:|]\s*",
            "",
            cleaned,
            flags=re.IGNORECASE,
        )
    return re.sub(r"\s+", " ", cleaned).strip(" -–—:|") or title.strip()


def parse_synced_lyrics(synced: str, duration: float) -> list[SyncedEntry]:
    raw: list[tuple[float, str]] = []
    boundaries: list[float] = []
    for row in synced.splitlines():
        tags = list(TIMESTAMP_RE.finditer(row))
        if not tags:
            continue
        text = TIMESTAMP_RE.sub("", row).strip()
        for tag in tags:
            timestamp = int(tag.group(1)) * 60 + float(tag.group(2))
            boundaries.append(timestamp)
            if text:
                raw.append((timestamp, text))

    raw.sort(key=lambda item: item[0])
    boundaries.sort()
    entries: list[SyncedEntry] = []
    for start, text in raw:
        next_start = next((candidate for candidate in boundaries if candidate > start), duration)
        end = min(duration, max(start + 0.12, next_start))
        entries.append(SyncedEntry(text=text, start=start, end=end))
    return entries


def fetch_synced_lyrics(title: str, artist: str, duration: float | None = None) -> dict[str, Any] | None:
    track_name = clean_track_title(title, artist)
    headers = {"User-Agent": USER_AGENT}
    params: dict[str, Any] = {"track_name": track_name, "artist_name": artist}
    if duration and duration > 0:
        params["duration"] = round(duration)
    with httpx.Client(timeout=10, headers=headers, follow_redirects=True) as client:
        response = client.get(f"{LRCLIB_BASE_URL}/get", params=params)
        if response.status_code == 200:
            candidate = response.json()
            if candidate.get("syncedLyrics"):
                return candidate
        elif response.status_code == 429:
            raise RuntimeError("The free synced-lyrics service is temporarily rate limited; try again shortly")

        response = client.get(
            f"{LRCLIB_BASE_URL}/search",
            params={"track_name": track_name, "artist_name": artist},
        )
        response.raise_for_status()
        candidates = [item for item in response.json() if item.get("syncedLyrics")]

    def candidate_score(item: dict[str, Any]) -> float:
        title_score = _similarity(track_name, str(item.get("trackName", "")))
        artist_score = _similarity(artist, str(item.get("artistName", "")))
        if duration and duration > 0:
            duration_delta = abs(float(item.get("duration") or 0) - duration)
            duration_score = max(0.0, 1 - duration_delta / 12)
            return title_score * 0.5 + artist_score * 0.3 + duration_score * 0.2
        return title_score * 0.62 + artist_score * 0.38

    if not candidates:
        return None
    best = max(candidates, key=candidate_score)
    return best if candidate_score(best) >= 0.72 else None


def apply_synced_lyrics(lines: list[dict], synced: str, duration: float) -> tuple[list[dict], float]:
    """Map LRC fragments to canonical pasted lyrics without losing repeated verses/choruses."""
    entries = parse_synced_lyrics(synced, duration)
    source_words: list[dict[str, Any]] = []
    for entry_index, entry in enumerate(entries):
        words = WORD_RE.findall(entry.text)
        width = (entry.end - entry.start) / max(1, len(words))
        for word_index, word in enumerate(words):
            source_words.append(
                {
                    "text": word,
                    "start": entry.start + word_index * width,
                    "end": entry.start + (word_index + 1) * width,
                    "entryStart": entry.start,
                    "entryEnd": entry.end,
                    "entryIndex": entry_index,
                }
            )

    canonical = [
        (line_index, token_index, token)
        for line_index, line in enumerate(lines)
        for token_index, token in enumerate(line["tokens"])
    ]
    mapping = sequence_match(
        [token[2]["text"] for token in canonical],
        [word["text"] for word in source_words],
    )
    matches: dict[tuple[int, int], dict[str, Any]] = {}
    for canonical_index, source_index in mapping.items():
        line_index, token_index, _ = canonical[canonical_index]
        matches[(line_index, token_index)] = source_words[source_index]

    result: list[dict] = []
    matched_total = 0
    for line_index, line in enumerate(lines):
        line_matches = [
            (token_index, matches[(line_index, token_index)])
            for token_index in range(len(line["tokens"]))
            if (line_index, token_index) in matches
        ]
        matched_total += len(line_matches)
        if not line_matches:
            result.append(line)
            continue

        start = min(word["entryStart"] for _, word in line_matches)
        end = max(word["entryEnd"] for _, word in line_matches)
        token_count = max(1, len(line["tokens"]))
        width = max(0.04, (end - start) / token_count)
        tokens = []
        for token_index, token in enumerate(line["tokens"]):
            direct = matches.get((line_index, token_index))
            tokens.append(
                {
                    **token,
                    "start": round(start + token_index * width, 4),
                    "end": round(min(end, start + (token_index + 1) * width), 4),
                    "confidence": 0.6 if direct else 0.42,
                    "source": "lrclib_word_estimate" if direct else "lrclib_line_interpolation",
                }
            )
        coverage = len(line_matches) / token_count
        confidence = min(0.95, 0.55 + 0.4 * coverage)
        result.append(
            {
                **line,
                "start": round(start, 4),
                "end": round(end, 4),
                "confidence": round(confidence, 3),
                "timingSource": "lrclib_synced_lyrics",
                "tokens": tokens,
            }
        )

    # Some community LRC files place an empty marker immediately after a short
    # lead phrase, while the pasted line also includes the following ad-libs.
    # Extend only implausibly short lines into that gap, and resolve malformed
    # duplicate timestamps without allowing canonical lines to run backwards.
    for index, line in enumerate(result):
        if line.get("timingSource") != "lrclib_synced_lyrics":
            continue
        start, end = float(line["start"]), float(line["end"])
        if index and result[index - 1].get("timingSource") == "lrclib_synced_lyrics":
            previous_end = float(result[index - 1]["end"])
            if start < previous_end and end <= previous_end + 0.2:
                start = previous_end
        token_count = max(1, len(line["tokens"]))
        next_start = (
            float(result[index + 1]["start"])
            if index + 1 < len(result) and result[index + 1].get("timingSource") == "lrclib_synced_lyrics"
            else end
        )
        if (end - start) / token_count < 0.18 and next_start > end:
            end = next_start
        if end <= start:
            continue
        if start != line["start"] or end != line["end"]:
            width = (end - start) / token_count
            line["start"], line["end"] = round(start, 4), round(end, 4)
            line["tokens"] = [
                {
                    **token,
                    "start": round(start + token_index * width, 4),
                    "end": round(start + (token_index + 1) * width, 4),
                }
                for token_index, token in enumerate(line["tokens"])
            ]

    overall_coverage = matched_total / max(1, len(canonical))
    return result, overall_coverage


def _similarity(left: str, right: str) -> float:
    import difflib

    a, b = normalize(left), normalize(right)
    return difflib.SequenceMatcher(a=a, b=b).ratio() if a and b else 0.0
