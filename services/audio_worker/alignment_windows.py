"""Passage planning. Draft distributions never act as audio reference points."""
from __future__ import annotations

import math
import re
from dataclasses import asdict, dataclass


def alignment_text(line: dict) -> str:
    # Keep main vocals in canonical order; standalone parenthetical lines remain.
    text = re.sub(r"\([^)]*\)", "", line['text']).strip() or line['text']
    return ' '.join(text.replace('’', "'").split())


def reference_kind(line: dict) -> str:
    if line.get('verified'):
        return 'locked'
    if line.get('timingSource') == 'lrclib_synced_lyrics':
        return 'catalog'
    if line.get('timingSource') in ('audio_gap_match', 'forced_alignment'):
        return 'model'
    return 'draft'


def valid_bounds(line: dict, duration: float) -> bool:
    a, b = line.get('start', -1), line.get('end', -1)
    return math.isfinite(a + b) and 0 <= a < b <= duration


@dataclass
class Passage:
    id: str
    owner_indices: list[int]
    context_indices: list[int]
    start: float
    end: float

    def to_dict(self):
        return asdict(self)


def plan_passages(lines: list[dict], duration: float, max_seconds: float = 24) -> list[Passage]:
    """Use ordered soft references; return [] to request a coarse pass if absent."""
    refs = {}
    last = -1.0
    for i, line in enumerate(lines):
        if reference_kind(line) != 'draft' and valid_bounds(line, duration) and line['start'] > last:
            refs[i] = float(line['start'])
            last = line['start']
    if not refs:
        return []
    # Interpolation only proposes windows; its times are never accepted as output.
    positions = {}
    for i in range(len(lines)):
        if i in refs:
            positions[i] = refs[i]
            continue
        left = max((j for j in refs if j < i), default=-1)
        right = min((j for j in refs if j > i), default=len(lines))
        a, b = refs.get(left, 0.0), refs.get(right, duration)
        positions[i] = a + (b - a) * (i - left) / (right - left)
    groups = []
    for i, line in enumerate(lines):
        if (not groups or line.get('sectionId', line.get('section')) != lines[groups[-1][0]].get('sectionId', lines[groups[-1][0]].get('section'))
                or positions[i] - positions[groups[-1][0]] > max_seconds):
            groups.append([i])
        else:
            groups[-1].append(i)
    result = []
    for number, owners in enumerate(groups):
        first, last = owners[0], owners[-1]
        context = list(range(max(0, first - 1), min(len(lines), last + 2)))
        start = max(0, positions[context[0]] - 2) if context[0] else 0
        next_index = context[-1] + 1
        end = min(duration, positions.get(next_index, duration) + 2)
        result.append(Passage(f'passage-{number + 1}', owners, context, start, end))
    return result
