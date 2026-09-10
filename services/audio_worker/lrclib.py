from __future__ import annotations

import re
import math
from dataclasses import dataclass
from difflib import SequenceMatcher
from statistics import median
from typing import Any

import httpx

from .alignment import normalize, sequence_match
from .lyrics import build_draft_alignment, parse_lyrics


LRCLIB_BASE_URL = "https://lrclib.net/api"
USER_AGENT = "LyricMemorizer/0.1.0 (local-first lyric study app)"
TIMESTAMP_RE = re.compile(r"\[(\d{1,3}):(\d{2}(?:\.\d+)?)\]")
WORD_RE = re.compile(r"[\w’']+", re.UNICODE)
TITLE_NOISE_RE = re.compile(
    r"\s*[\[(](?:official\s+)?(?:audio|video|music video|lyric video|lyrics|visuali[sz]er)[^\])]*[\])]\s*",
    re.IGNORECASE,
)
LYRIC_TOKEN_RE = re.compile(r"[\w’']+", re.UNICODE)
ALTERNATE_VERSION_RE = re.compile(
    r"\b(?:acoustic|a\s*capella|demo|dolby\s+atmos|instrumental|karaoke|live|nightcore|radio\s+edit|remix|re[- ]?recorded|slowed|sped[- ]?up)\b",
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


def synced_candidate_key(candidate: dict[str, Any]) -> str:
    if candidate.get("id") is not None:
        return str(candidate["id"])
    return "|".join(
        str(candidate.get(field, ""))
        for field in ("trackName", "artistName", "albumName", "duration", "syncedLyrics")
    )


def select_best_synced_candidate(
    candidates: list[dict[str, Any]],
    title: str,
    artist: str,
    duration: float | None = None,
    lyrics: str | None = None,
    timing_scores: dict[str, float] | None = None,
) -> dict[str, Any] | None:
    """Choose the synced record that best fits this specific song and lyric text."""
    track_name = clean_track_title(title, artist)
    has_lyrics = bool((lyrics or "").strip())

    def metadata_score(item: dict[str, Any]) -> float:
        title_score = _similarity(track_name, str(item.get("trackName", "")))
        artist_score = 1.0 if not artist.strip() else _similarity(artist, str(item.get("artistName", "")))
        duration_score = _duration_similarity(item, duration)
        version_penalty = _alternate_version_penalty(item, track_name)
        if has_lyrics:
            lyric_score = _lyric_similarity(lyrics or "", _candidate_lyric_text(item, duration))
            score = (
                title_score * 0.24
                + artist_score * 0.14
                + duration_score * 0.24
                + lyric_score * 0.38
            )
        else:
            score = title_score * 0.45 + artist_score * 0.30 + duration_score * 0.25
        return score - version_penalty

    def candidate_score(item: dict[str, Any]) -> float:
        metadata = metadata_score(item)
        timing = timing_scores.get(synced_candidate_key(item)) if timing_scores else None
        return metadata if not timing_scores else (-1.0 if timing is None else timing)

    if not candidates:
        return None
    eligible = [item for item in candidates if metadata_score(item) >= 0.62]
    if not eligible:
        return None
    best = max(
        eligible,
        key=lambda item: (
            candidate_score(item),
            _lyric_similarity(lyrics or "", _candidate_lyric_text(item, duration)) if has_lyrics else 0.0,
            _duration_similarity(item, duration),
            _synced_entry_count(item, duration),
            timing_scores.get(synced_candidate_key(item), -1.0) if timing_scores else -1.0,
        ),
    )
    return best if candidate_score(best) >= 0.72 and metadata_score(best) >= 0.62 else None


def _dedupe_synced_candidates(candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
    unique: list[dict[str, Any]] = []
    seen: set[str] = set()
    for candidate in candidates:
        key = synced_candidate_key(candidate)
        if key in seen:
            continue
        seen.add(key)
        unique.append(candidate)
    return unique


def fetch_synced_candidates(title: str, artist: str, duration: float | None = None) -> list[dict[str, Any]]:
    track_name = clean_track_title(title, artist)
    headers = {"User-Agent": USER_AGENT}
    params: dict[str, Any] = {"track_name": track_name, "artist_name": artist}
    if duration and duration > 0:
        params["duration"] = round(duration)
    with httpx.Client(timeout=10, headers=headers, follow_redirects=True) as client:
        candidates: list[dict[str, Any]] = []
        response = client.get(f"{LRCLIB_BASE_URL}/get", params=params)
        if response.status_code == 200:
            candidate = response.json()
            if candidate.get("syncedLyrics"):
                candidates.append(candidate)
        elif response.status_code == 429:
            raise RuntimeError("The free synced-lyrics service is temporarily rate limited; try again shortly")

        try:
            search_response = client.get(
                f"{LRCLIB_BASE_URL}/search",
                params={"track_name": track_name, "artist_name": artist},
            )
        except httpx.HTTPError:
            if candidates:
                return _dedupe_synced_candidates(candidates)
            raise
        if search_response.status_code == 429:
            if candidates:
                return _dedupe_synced_candidates(candidates)
            raise RuntimeError("The free synced-lyrics service is temporarily rate limited; try again shortly")
        try:
            search_response.raise_for_status()
        except httpx.HTTPError:
            if candidates:
                return _dedupe_synced_candidates(candidates)
            raise
        candidates.extend(item for item in search_response.json() if item.get("syncedLyrics"))

    return _dedupe_synced_candidates(candidates)


def fetch_synced_lyrics(
    title: str,
    artist: str,
    duration: float | None = None,
    lyrics: str | None = None,
    timing_scores: dict[str, float] | None = None,
) -> dict[str, Any] | None:
    candidates = fetch_synced_candidates(title, artist, duration)
    return select_best_synced_candidate(candidates, title, artist, duration, lyrics, timing_scores)


def apply_synced_lyrics(lines: list[dict], synced: str, duration: float) -> tuple[list[dict], float]:
    """Map LRC fragments to canonical pasted lyrics without losing repeated verses/choruses."""
    entries = parse_synced_lyrics(synced, duration)
    source_words: list[dict[str, Any]] = []
    for entry_index, entry in enumerate(entries):
        # Canonical tokens are whitespace-delimited too; keep hyphenated refrains intact.
        words = entry.text.split()
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

    # Whole-line matches disambiguate adjacent repetitions when backing vocals
    # appear before the main phrase in LRC but after it in the canonical text.
    main_text = lambda text: normalize(re.sub(r"\([^)]*\)", "", text))
    line_mapping = sequence_match([main_text(line["text"]) for line in lines],
                                  [main_text(entry.text) for entry in entries])
    for index, entry_index in line_mapping.items():
        entry = entries[entry_index]
        if not main_text(lines[index]["text"]) or main_text(lines[index]["text"]) != main_text(entry.text):
            continue
        line = result[index]
        width = (entry.end - entry.start) / max(1, len(line["tokens"]))
        result[index] = {**line, "start": entry.start, "end": entry.end,
                         "confidence": .95, "timingSource": "lrclib_synced_lyrics",
                         "tokens": [{**token, "start": round(entry.start + i * width, 4),
                                     "end": round(entry.start + (i + 1) * width, 4),
                                     "confidence": .6, "source": "lrclib_word_estimate"}
                                    for i, token in enumerate(line["tokens"])]}

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


def score_synced_timing(
    synced: str,
    lyrics: str,
    duration: float,
    hypothesis: list[dict[str, Any]],
) -> dict[str, float]:
    """Measure how well an LRC candidate's line starts fit local ASR word times."""
    if not synced.strip() or not lyrics.strip() or not hypothesis:
        return {"score": 0.0, "lineCoverage": 0.0, "tokenCoverage": 0.0}

    # Use the human's actual boundaries, never interpolated canonical line starts.
    entries = parse_synced_lyrics(synced, max(0.1, duration))
    tokens = [(i, j, token) for i, entry in enumerate(entries)
              for j, token in enumerate(WORD_RE.findall(entry.text))]
    words = []
    for word in hypothesis:
        try:
            start = float(word["start"])
            confidence = float(word.get("confidence", 0.75))
        except (KeyError, TypeError, ValueError):
            continue
        if str(word.get("text", "")).strip() and math.isfinite(start) and 0 <= start <= duration and confidence >= 0.5:
            words.append(word)
    mapping = sequence_match([t[2] for t in tokens], [str(w["text"]) for w in words])
    reliable = {i: j for i, j in mapping.items()
                if _similarity(tokens[i][2], str(words[j]["text"])) >= 0.8}
    errors = []
    positions = []
    for i, (entry_index, token_index, _) in enumerate(tokens):
        if token_index != 0 or i not in reliable:
            continue
        # Require a second nearby lexical match to disambiguate repeated openings.
        neighbors = [k for k in range(i + 1, min(i + 4, len(tokens)))
                     if tokens[k][0] == entry_index and k in reliable]
        if not neighbors:
            continue
        next_word = reliable[neighbors[0]]
        first_word = reliable[i]
        if not 0 <= float(words[next_word]["start"]) - float(words[first_word]["start"]) <= 4:
            continue
        errors.append(float(words[first_word]["start"]) - entries[entry_index].start)
        positions.append(entry_index / max(1, len(entries) - 1))
    if not errors:
        return {"score": 0.0, "lineCoverage": 0.0, "tokenCoverage": 0.0, "reliable": False}
    absolute = sorted(abs(error) for error in errors)
    mae = float(median(absolute))
    p90 = absolute[max(0, math.ceil(len(absolute) * 0.9) - 1)]
    within = sum(error <= 0.35 for error in absolute) / len(absolute)
    line_coverage = len(errors) / max(1, len(entries))
    token_coverage = len(reliable) / max(1, len(tokens))
    regions = len({min(2, int(position * 3)) for position in positions})
    # Absolute errors retain global offset and drift: do not fit either away.
    score = 0.55 * math.exp(-mae / 0.5) + 0.30 * math.exp(-p90 / 1.0) + 0.15 * within
    return {
        "score": round(score, 4),
        "lineCoverage": round(line_coverage, 4),
        "tokenCoverage": round(token_coverage, 4),
        "medianOffset": round(float(median(errors)), 4),
        "medianAbsoluteError": round(mae, 4),
        "p90AbsoluteError": round(p90, 4),
        "within350ms": round(within, 4),
        "matchedStarts": len(errors),
        "regionsCovered": regions,
        "reliable": len(errors) >= min(6, len(entries)) and line_coverage >= 0.5
                    and token_coverage >= 0.5 and regions == 3,
    }


def _similarity(left: str, right: str) -> float:
    a, b = normalize(left), normalize(right)
    return SequenceMatcher(a=a, b=b).ratio() if a and b else 0.0


def _duration_similarity(item: dict[str, Any], duration: float | None) -> float:
    if not duration or duration <= 0:
        return 1.0
    try:
        candidate_duration = float(item.get("duration") or 0)
    except (TypeError, ValueError):
        return 0.0
    if candidate_duration <= 0:
        return 0.0
    return max(0.0, 1 - abs(candidate_duration - duration) / 12)


def _alternate_version_penalty(item: dict[str, Any], requested_title: str = "") -> float:
    if ALTERNATE_VERSION_RE.search(requested_title):
        return 0.0
    # Album/edition names are not reliable version markers: the same recording
    # can be reissued on a standard, deluxe, physical, or Atmos album. Prefer
    # the candidate's actual track title when filtering explicit alternates.
    label = str(item.get("trackName", ""))
    return min(0.06, 0.02 * len(ALTERNATE_VERSION_RE.findall(label)))


def _synced_entry_count(item: dict[str, Any], duration: float | None = None) -> int:
    synced = str(item.get("syncedLyrics") or "").strip()
    if not synced:
        return 0
    try:
        synced_duration = float(item.get("duration") or duration or 180)
    except (TypeError, ValueError):
        synced_duration = duration or 180
    return len(parse_synced_lyrics(synced, synced_duration))


def _candidate_lyric_text(item: dict[str, Any], duration: float | None) -> str:
    plain = str(item.get("plainLyrics") or "").strip()
    if plain:
        return plain
    synced = str(item.get("syncedLyrics") or "").strip()
    if not synced:
        return ""
    try:
        synced_duration = float(item.get("duration") or duration or 180)
    except (TypeError, ValueError):
        synced_duration = duration or 180
    return "\n".join(entry.text for entry in parse_synced_lyrics(synced, synced_duration))


def _lyric_tokens(text: str) -> list[str]:
    tokens: list[str] = []
    for token in LYRIC_TOKEN_RE.findall(text):
        normalized = normalize(token)
        if normalized:
            tokens.append(normalized)
    return tokens


def _lyric_lines(text: str) -> list[str]:
    parsed = parse_lyrics(text)
    lines: list[str] = []
    for line in parsed:
        tokens = _lyric_tokens(line.text)
        if tokens:
            lines.append(" ".join(tokens))
    return lines


def _lyric_similarity(left: str, right: str) -> float:
    left_tokens, right_tokens = _lyric_tokens(left), _lyric_tokens(right)
    if not left_tokens or not right_tokens:
        return 0.0
    token_score = SequenceMatcher(None, left_tokens, right_tokens, autojunk=False).ratio()
    left_lines, right_lines = _lyric_lines(left), _lyric_lines(right)
    line_score = SequenceMatcher(None, left_lines, right_lines, autojunk=False).ratio() if left_lines and right_lines else token_score
    return token_score * 0.75 + line_score * 0.25
