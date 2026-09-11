from __future__ import annotations

import difflib
import re
from typing import Any, Callable


NORMALIZE_RE = re.compile(r"[^\w']+", re.UNICODE)


def normalize(text: str) -> str:
    return NORMALIZE_RE.sub("", text.casefold())


def _score(left: str, right: str) -> float:
    a, b = normalize(left), normalize(right)
    if not a or not b:
        return 0.0
    if a == b:
        return 1.0
    return difflib.SequenceMatcher(a=a, b=b).ratio()


def sequence_match(left: list[str], right: list[str]) -> dict[int, int]:
    """Globally align two token sequences, preserving repeated choruses and skipped words."""
    rows, columns = len(left), len(right)
    gap_left, gap_right = -0.48, -0.34
    dp = [[0.0] * (columns + 1) for _ in range(rows + 1)]
    move = [[""] * (columns + 1) for _ in range(rows + 1)]
    for row in range(1, rows + 1):
        dp[row][0] = row * gap_left
        move[row][0] = "up"
    for column in range(1, columns + 1):
        dp[0][column] = column * gap_right
        move[0][column] = "left"

    for row in range(1, rows + 1):
        for column in range(1, columns + 1):
            similarity = _score(left[row - 1], right[column - 1])
            lexical = 1.6 * similarity if similarity >= 0.52 else -0.85
            options = (
                (dp[row - 1][column - 1] + lexical, "diag"),
                (dp[row - 1][column] + gap_left, "up"),
                (dp[row][column - 1] + gap_right, "left"),
            )
            dp[row][column], move[row][column] = max(options, key=lambda item: item[0])

    mapping: dict[int, int] = {}
    row, column = rows, columns
    while row or column:
        direction = move[row][column]
        if direction == "diag":
            if _score(left[row - 1], right[column - 1]) >= 0.52:
                mapping[row - 1] = column - 1
            row -= 1
            column -= 1
        elif direction == "up":
            row -= 1
        else:
            column -= 1
    return mapping


def align_hypothesis(lines: list[dict], hypothesis: list[dict[str, Any]]) -> list[dict]:
    """Globally match canonical tokens to ASR words, respecting synced line anchors."""
    canonical = [(line_index, token_index, token) for line_index, line in enumerate(lines) for token_index, token in enumerate(line["tokens"])]
    mapping = sequence_match(
        [token[2]["text"] for token in canonical],
        [word["text"] for word in hypothesis],
    )
    matched: dict[tuple[int, int], dict] = {}
    for canonical_index, hypothesis_index in mapping.items():
        line_index, token_index, token = canonical[canonical_index]
        line = lines[line_index]
        word = hypothesis[hypothesis_index]
        anchored = line.get("timingSource") == "lrclib_synced_lyrics"
        midpoint = (float(word["start"]) + float(word["end"])) / 2
        if anchored and not (float(line["start"]) - 1.2 <= midpoint <= float(line["end"]) + 1.2):
            continue
        lexical = _score(token["text"], word["text"])
        if lexical >= 0.52:
            matched[(line_index, token_index)] = {
                "start": float(word["start"]),
                "end": float(word["end"]),
                "confidence": round(min(0.98, max(0.35, lexical) * float(word.get("confidence", 0.8))), 3),
                "source": "whisper_global_match",
            }

    result = []
    for line_index, line in enumerate(lines):
        direct_indices = [index for index in range(len(line["tokens"])) if (line_index, index) in matched]
        anchored = line.get("timingSource") == "lrclib_synced_lyrics"
        if anchored:
            start, end = float(line["start"]), float(line["end"])
        elif direct_indices:
            start = min(matched[(line_index, index)]["start"] for index in direct_indices)
            end = max(matched[(line_index, index)]["end"] for index in direct_indices)
        else:
            start, end = float(line["start"]), float(line["end"])

        updated_tokens = []
        proportional_width = max(0.04, (end - start) / max(1, len(line["tokens"])))
        for token_index, token in enumerate(line["tokens"]):
            direct = matched.get((line_index, token_index))
            if direct:
                direct_start = max(start, min(end - 0.02, direct["start"])) if anchored else direct["start"]
                direct_end = max(direct_start + 0.02, min(end, direct["end"])) if anchored else direct["end"]
                updated_tokens.append({**token, **direct, "start": round(direct_start, 4), "end": round(direct_end, 4)})
                continue
            estimated_start = start + token_index * proportional_width
            updated_tokens.append(
                {
                    **token,
                    "start": round(estimated_start, 4),
                    "end": round(min(end, estimated_start + proportional_width), 4),
                    "confidence": max(float(token.get("confidence", 0.18)), 0.3 if direct_indices else 0.18),
                    "source": "interpolated_within_line_anchor" if anchored else "interpolated_between_asr_anchors",
                }
            )

        if anchored:
            asr_coverage = len(direct_indices) / max(1, len(line["tokens"]))
            confidence = min(0.98, max(float(line.get("confidence", 0)), 0.58 + asr_coverage * 0.4))
        elif direct_indices:
            coverage = len(direct_indices) / max(1, len(line["tokens"]))
            mean_direct = sum(matched[(line_index, index)]["confidence"] for index in direct_indices) / len(direct_indices)
            confidence = mean_direct * (0.45 + 0.55 * coverage)
        else:
            confidence = float(line.get("confidence", 0.18))
        result.append(
            {
                **line,
                "start": round(start, 4),
                "end": round(end, 4),
                "confidence": round(confidence, 3),
                "tokens": updated_tokens,
            }
        )
    return result


def align_anchored_hypothesis(lines: list[dict], hypothesis: list[dict[str, Any]]) -> list[dict]:
    """Align every canonical line inside its known time window for word-level practice."""
    result: list[dict] = []
    for line in lines:
        anchor_start, anchor_end = float(line["start"]), float(line["end"])
        candidates = [
            word for word in hypothesis
            if anchor_start - 0.45 <= (float(word["start"]) + float(word["end"])) / 2 <= anchor_end + 0.45
        ]
        token_text = [token["text"] for token in line["tokens"]]
        mapping = sequence_match(token_text, [word["text"] for word in candidates])
        # When the canonical line repeats a word ("happy, happy") but ASR
        # hears it once, the generic global backtrace can attach it to the last
        # occurrence. Prefer the earliest still-unmatched identical token so
        # later ad-libs can be interpolated after the observed word.
        occupied = set(mapping)
        for token_index in sorted(list(mapping)):
            target = token_index
            while (
                target > 0
                and target - 1 not in occupied
                and normalize(token_text[target - 1]) == normalize(token_text[token_index])
            ):
                target -= 1
            if target != token_index:
                mapping[target] = mapping.pop(token_index)
                occupied.remove(token_index)
                occupied.add(target)
        direct: dict[int, dict[str, Any]] = {}
        for token_index, candidate_index in mapping.items():
            word = candidates[candidate_index]
            lexical = _score(token_text[token_index], word["text"])
            if lexical < 0.52:
                continue
            word_start = max(0.0, float(word["start"]))
            word_end = max(word_start + 0.02, float(word["end"]))
            direct[token_index] = {
                "start": word_start,
                "end": word_end,
                "confidence": round(min(0.98, lexical * float(word.get("confidence", 0.75))), 3),
                "source": "whisper_anchored_word",
            }

        minimum_direct = min(2, len(line["tokens"]))
        if len(direct) < minimum_direct or len(direct) / max(1, len(line["tokens"])) < 0.3:
            direct = {}

        # LRC timestamps are excellent start anchors, but their end is usually
        # just the next line's timestamp and can include a long instrumental
        # gap. When ASR hears the edge words, use those acoustic boundaries
        # (plus a tiny consonant/sustain guard) for the actual line window.
        start, end = anchor_start, anchor_end
        if 0 in direct:
            start = max(0.0, direct[0]["start"] - 0.035)
        final_index = len(line["tokens"]) - 1
        if final_index in direct:
            end = direct[final_index]["end"] + 0.055
        end = max(start + 0.08, end)

        tokens: list[dict[str, Any]] = []
        direct_indices = sorted(direct)
        for token_index, token in enumerate(line["tokens"]):
            if token_index in direct:
                tokens.append({**token, **direct[token_index]})
                continue
            before = max((index for index in direct_indices if index < token_index), default=None)
            after = min((index for index in direct_indices if index > token_index), default=None)
            left = direct[before]["end"] if before is not None else start
            right = direct[after]["start"] if after is not None else end
            first_missing = (before + 1) if before is not None else 0
            last_missing = after if after is not None else len(line["tokens"])
            missing_count = max(1, last_missing - first_missing)
            width = max(0.02, (right - left) / missing_count)
            position = token_index - first_missing
            estimated_start = left + position * width
            tokens.append({
                **token,
                "start": round(max(start, estimated_start), 4),
                "end": round(min(end, max(start, estimated_start) + width), 4),
                "confidence": 0.34 if direct_indices else float(token.get("confidence", 0.18)),
                "source": "interpolated_between_word_anchors" if direct_indices else token.get("source", "line_estimate"),
            })

        # Keep the token timeline valid even when singing ASR returns slightly
        # overlapping words or a timestamp just outside the catalog line.
        stabilized: list[dict[str, Any]] = []
        previous_end = start
        for token in tokens:
            token_start = max(start, min(end - 0.02, float(token["start"])))
            if token_start < previous_end:
                token_start = previous_end
            token_end = max(token_start + 0.02, min(end, float(token["end"])))
            if token_end > end:
                token_end = end
                token_start = min(token_start, end - 0.02)
            stabilized.append({**token, "start": round(token_start, 4), "end": round(token_end, 4)})
            previous_end = token_end

        coverage = len(direct_indices) / max(1, len(line["tokens"]))
        mean_confidence = (
            sum(float(direct[index]["confidence"]) for index in direct_indices) / len(direct_indices)
            if direct_indices else 0.0
        )
        result.append({
            **line,
            "start": round(start, 4),
            "end": round(end, 4),
            "tokens": stabilized,
            "wordTimingCoverage": round(coverage, 3),
            "wordTimingConfidence": round(mean_confidence, 3),
            "wordTimingSource": "whisper_anchored" if direct_indices else "line_estimate",
        })
    return result


def transcribe_anchored_vocals(
    path: str,
    lines: list[dict],
    model_name: str = "small",
    on_progress: Callable[[float, str], None] | None = None,
) -> list[dict[str, Any]]:
    """Transcribe <=25-second lyric-anchored chunks and return absolute word times."""
    try:
        import whisper_timestamped as whisper  # type: ignore
    except ImportError as exc:
        raise RuntimeError(
            "Local alignment is not installed. Run: pip install -r services/audio_worker/requirements-ml.txt"
        ) from exc

    if on_progress:
        on_progress(0.44, f"Loading the {model_name} word-timing model")
    model = whisper.load_model(model_name)
    audio = whisper.load_audio(path)
    sample_rate = 16000

    groups: list[list[dict]] = []
    for line in lines:
        if not groups or float(line["end"]) - float(groups[-1][0]["start"]) > 24:
            groups.append([line])
        else:
            groups[-1].append(line)

    words: list[dict[str, Any]] = []
    for group_index, group in enumerate(groups):
        chunk_start = max(0.0, float(group[0]["start"]) - 0.7)
        chunk_end = min(len(audio) / sample_rate, float(group[-1]["end"]) + 0.7)
        clip = audio[int(chunk_start * sample_rate):int(chunk_end * sample_rate)]
        prompt = "\n".join(line["text"] for line in group)
        if on_progress:
            fraction = 0.48 + 0.42 * group_index / max(1, len(groups))
            on_progress(fraction, f"Timing words in lyric chunk {group_index + 1} of {len(groups)}")
        transcript = whisper.transcribe(
            model,
            clip,
            # False still enables Whisper's terminal progress bar; a detached
            # worker can have closed console pipes. UI progress is reported above.
            verbose=None,
            detect_disfluencies=False,
            initial_prompt=prompt[:1800],
            condition_on_previous_text=False,
            beam_size=5,
            temperature=0,
        )
        for segment in transcript.get("segments", []):
            for word in segment.get("words", []):
                text = word.get("text", "").strip()
                if not text:
                    continue
                words.append({
                    "text": text,
                    "start": chunk_start + float(word["start"]),
                    "end": chunk_start + float(word["end"]),
                    "confidence": float(word.get("confidence", 0.75)),
                })
    return words


def transcribe_vocals(path: str, model_name: str = "small", prompt: str = "") -> list[dict]:
    try:
        import whisper_timestamped as whisper  # type: ignore
    except ImportError as exc:
        raise RuntimeError(
            "Local alignment is not installed. Run: pip install -r services/audio_worker/requirements-ml.txt"
        ) from exc

    model = whisper.load_model(model_name)
    audio = whisper.load_audio(path)
    result = whisper.transcribe(
        model,
        audio,
        # whisper_timestamped forwards False to Whisper's progress renderer;
        # None disables tqdm entirely. This worker may outlive its terminal.
        verbose=None,
        detect_disfluencies=False,
        initial_prompt=prompt[:4000] or None,
        condition_on_previous_text=False,
    )
    words = []
    for segment in result.get("segments", []):
        for word in segment.get("words", []):
            words.append(
                {
                    "text": word.get("text", "").strip(),
                    "start": float(word["start"]),
                    "end": float(word["end"]),
                    "confidence": float(word.get("confidence", 0.75)),
                }
            )
    return words
