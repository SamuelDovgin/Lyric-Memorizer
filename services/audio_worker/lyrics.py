from __future__ import annotations

import re
import uuid
from dataclasses import dataclass
from html import unescape


SECTION_RE = re.compile(r"^\s*\[([^\]]+)\]\s*$")
PLAIN_SECTION_RE = re.compile(r"^(?:#{1,6}\s*)?((?:verse|chorus|pre[- ]chorus|post[- ]chorus|bridge|intro|outro|refrain|hook|interlude)(?:\s+\d+)?)(?:\s*:)??$", re.IGNORECASE)
MARKDOWN_LINK_RE = re.compile(r"^\[([^\]]+)\]\((https?://[^)]+)\)$", re.IGNORECASE)
TRAILING_BREAK_RE = re.compile(r"\\+$")
TOKEN_RE = re.compile(r"\S+")
GENIUS_RECOMMENDATION_HEADERS = {"you might also like", "you may also like"}


@dataclass(frozen=True)
class ParsedLine:
    section: str
    text: str
    occurrence: int = 0


def parse_lyrics(raw: str) -> list[ParsedLine]:
    section = "Song"
    occurrence = 0
    parsed: list[ParsedLine] = []
    skipping_recommendations = False
    for raw_line in raw.replace("\r\n", "\n").split("\n"):
        line = unescape(TRAILING_BREAK_RE.sub("", raw_line.strip())).strip()
        if not line:
            continue
        heading = SECTION_RE.match(line) or PLAIN_SECTION_RE.match(line)
        if heading:
            section = heading.group(1).strip() or "Song"
            occurrence += 1
            skipping_recommendations = False
            continue
        if line.casefold() in GENIUS_RECOMMENDATION_HEADERS:
            skipping_recommendations = True
            continue
        linked = MARKDOWN_LINK_RE.match(line)
        if skipping_recommendations:
            continue
        if linked:
            line = linked.group(1).strip()
        if not line:
            continue
        parsed.append(ParsedLine(section=section, text=line, occurrence=occurrence))
    return parsed


def _weights(lines: list[ParsedLine]) -> list[float]:
    return [max(2.0, len(TOKEN_RE.findall(line.text)) * 0.62) for line in lines]


def build_draft_alignment(raw: str, duration: float, song_id: str) -> list[dict]:
    """Create an honest, low-confidence timing draft that is immediately editable."""
    parsed = parse_lyrics(raw)
    if not parsed:
        return []

    safe_duration = max(0.1, duration)
    usable_start = min(1.0, safe_duration * 0.03)
    usable_end = max(usable_start + 0.01, safe_duration - min(1.0, safe_duration * 0.03))
    weights = _weights(parsed)
    total_weight = sum(weights)
    cursor = usable_start
    lines: list[dict] = []

    for index, (line, weight) in enumerate(zip(parsed, weights)):
        line_duration = (usable_end - usable_start) * weight / total_weight
        start = cursor
        end = usable_end if index == len(parsed) - 1 else cursor + line_duration
        words = TOKEN_RE.findall(line.text)
        token_duration = (end - start) / max(len(words), 1)
        tokens = []
        for token_index, word in enumerate(words):
            token_start = start + token_index * token_duration
            token_end = start + (token_index + 1) * token_duration
            tokens.append(
                {
                    "id": f"tok_{uuid.uuid4().hex}",
                    "index": token_index,
                    "text": word,
                    "start": round(token_start, 4),
                    "end": round(token_end, 4),
                    "confidence": 0.18,
                    "source": "draft_distribution",
                }
            )
        lines.append(
            {
                "id": f"line_{uuid.uuid4().hex}",
                "songId": song_id,
                "index": index,
                "section": line.section,
                "sectionId": f"{song_id}_section_{line.occurrence}",
                "text": line.text,
                "start": round(start, 4),
                "end": round(end, 4),
                "confidence": 0.18,
                "verified": False,
                "tokens": tokens,
            }
        )
        cursor = end
    return lines


def redistribute_tokens(line: dict) -> dict:
    tokens = line.get("tokens", [])
    if not tokens:
        return line
    start = float(line["start"])
    end = max(float(line["end"]), start + 0.1)
    weights = [max(1, len(re.sub(r"\W", "", token["text"]))) for token in tokens]
    weight_total = sum(weights)
    cursor = start
    updated = []
    for index, (token, weight) in enumerate(zip(tokens, weights)):
        token_end = end if index == len(tokens) - 1 else cursor + (end - start) * weight / weight_total
        updated.append(
            {
                **token,
                "start": round(cursor, 4),
                "end": round(token_end, 4),
                "confidence": min(float(token.get("confidence", 0)), 0.34),
                "source": "manual_line_boundary",
            }
        )
        cursor = token_end
    return {**line, "tokens": updated}
