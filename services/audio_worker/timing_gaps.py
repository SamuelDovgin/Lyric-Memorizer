"""Conservative gap filling: preserve anchors and never promote guessed timings."""
from __future__ import annotations

from .alignment import align_hypothesis
from .lrclib import apply_synced_lyrics


def usable(line: dict) -> bool:
    import math
    return (line.get("verified") or line.get("confidence", 0) >= .55) and (
        math.isfinite(line["start"] + line["end"]) and 0 <= line["start"] < line["end"])


def gaps(lines: list[dict], duration: float):
    index = 0
    while index < len(lines):
        if usable(lines[index]):
            index += 1
            continue
        first = index
        while index < len(lines) and not usable(lines[index]):
            index += 1
        yield first, index, lines[first - 1]["end"] if first else 0, lines[index]["start"] if index < len(lines) else duration


def merge_catalog_gaps(lines: list[dict], synced: str, duration: float, catalog_id) -> list[dict]:
    # Reset provenance before mapping: an unmatched line must not masquerade as
    # a match inherited from the selected catalog.
    draft = [{**line, "confidence": .18, "verified": False, "timingSource": "draft"} for line in lines]
    mapped, _ = apply_synced_lyrics(draft, synced, duration)
    shared = [i for i in range(len(lines)) if usable(lines[i]) and usable(mapped[i])]
    # Require distributed agreement, retaining absolute offsets (no shifting).
    if len(shared) < 3 or lines[shared[-1]]["start"] - lines[shared[0]]["start"] < min(30, duration * .3):
        return lines
    if sum(abs(lines[i]["start"] - mapped[i]["start"]) <= .75 for i in shared) / len(shared) < .9:
        return lines
    result = list(lines)
    for first, last, lower, upper in gaps(lines, duration):
        cursor = lower
        for i in range(first, last):
            candidate = mapped[i]
            if candidate.get("confidence", 0) < .85 or not usable(candidate):
                continue
            if cursor <= candidate["start"] < candidate["end"] <= upper:
                result[i] = {**candidate, "timingCatalogId": catalog_id}
                cursor = candidate["end"]
    return result


def merge_audio_gaps(lines: list[dict], words: list[dict], duration: float) -> list[dict]:
    result = list(lines)
    for first, last, lower, upper in gaps(lines, duration):
        heard = [w for w in words if lower <= w["start"] < w["end"] <= upper and w.get("confidence", 0) >= .5]
        mapped = align_hypothesis(lines[first:last], heard)
        cursor = lower
        for i, candidate in enumerate(mapped, first):
            direct = [t for t in candidate["tokens"] if t.get("source") == "whisper_global_match"]
            if (not usable(candidate) or len(direct) / max(1, len(candidate["tokens"])) < .75
                    or not candidate["tokens"] or candidate["tokens"][0].get("source") != "whisper_global_match"):
                continue
            if cursor <= candidate["start"] < candidate["end"] <= upper:
                result[i] = {**candidate, "timingSource": "audio_gap_match"}
                cursor = candidate["end"]
    return result


def fill_audio_gaps(lines: list[dict], audio_path: str, duration: float, model: str = "small", on_progress=None) -> list[dict]:
    import subprocess
    import tempfile
    from pathlib import Path
    from .alignment import transcribe_vocals

    result = list(lines)
    # A successful pass creates tighter windows for repeated phrases still missing.
    for _ in range(2):
        before = sum(map(usable, result))
        for first, last, lower, upper in list(gaps(result, duration)):
            if upper <= lower:
                continue
            if on_progress:
                on_progress(f"Checking missing lyric timing: lines {first + 1}–{last}…")
            with tempfile.TemporaryDirectory(prefix="lyric-timing-gap-") as directory:
                clip = str(Path(directory) / "gap.wav")
                subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", str(lower), "-i", audio_path,
                                "-t", str(upper - lower), "-ar", "16000", "-ac", "1", clip], check=True, capture_output=True)
                words = transcribe_vocals(clip, model, prompt=". ".join(line["text"].rstrip(".?!") for line in result[first:last]) + ".")
                absolute = [{**w, "start": w["start"] + lower, "end": w["end"] + lower} for w in words]
                result = merge_audio_gaps(result, absolute, duration)
        if sum(map(usable, result)) == before:
            break
    return result
