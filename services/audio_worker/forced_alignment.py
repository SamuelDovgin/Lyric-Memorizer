"""Known-text alignment, evidence evaluation and deterministic reconciliation.

The Stable-ts adapter is imported only in the isolated model process.
"""
from __future__ import annotations

import hashlib
import json
import math
import re
import time
import uuid
from copy import deepcopy
from pathlib import Path
from statistics import mean, median

from .alignment_windows import alignment_text, plan_passages, reference_kind, valid_bounds

ENGINE_VERSION = 'forced-v4'
# Prefer the full model for alignment quality. Set LYRIC_FORCED_MODEL to
# large-v3-turbo when a faster, lower-memory run is more important.
DEFAULT_MODEL = 'large-v3'
DEFAULT_DEVICE = 'auto'


def resolve_device(requested: str | None = DEFAULT_DEVICE) -> str:
    """Choose a local accelerator when available, with a portable CPU fallback."""
    requested = (requested or DEFAULT_DEVICE).strip().lower()
    if requested != DEFAULT_DEVICE:
        return requested
    try:
        import torch
        if torch.cuda.is_available():
            return 'cuda'
        if torch.backends.mps.is_available():
            return 'mps'
    except Exception:
        pass
    return 'cpu'


def digest(value) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def file_hash(path: str) -> str:
    h = hashlib.sha256()
    with open(path, 'rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def normalized(text: str) -> str:
    return re.sub(r'[^\w]+', '', text.lower().replace('’', "'"))


def evaluate_segments(lines: list[dict], indices: list[int], segments: list[dict], lower: float, upper: float, duration: float) -> dict:
    """Strict sequence identity prevents a dropped segment shifting every line ID."""
    if len(indices) != len(segments) or any(normalized(alignment_text(lines[i])) != normalized(seg.get('text', '')) for i, seg in zip(indices, segments)):
        return {i: {'reasons': ['segment_identity_mismatch']} for i in indices}
    output = {}
    last_start = -1
    for i, seg in zip(indices, segments):
        start, end = float(seg['start']) + lower, float(seg['end']) + lower
        words = seg.get('words') or []
        reasons = []
        if not math.isfinite(start + end) or not 0 <= start < end <= min(duration, upper) + .02:
            reasons.append('invalid_bounds')
        if start <= last_start:
            reasons.append('nonmonotonic_start')
        last_start = start
        zero = sum(w.get('end', 0) <= w.get('start', 0) for w in words) / max(1, len(words))
        probability = mean(float(w.get('probability') or 0) for w in words) if words else 0
        if not words or zero > .2:
            reasons.append('collapsed_words')
        if probability < .2:
            reasons.append('weak_audio_evidence')
        if end - start > max(8, len(words) * 1.5) or end - start < .15:
            reasons.append('implausible_duration')
        if (lower > 0 and start - lower < .12) or (upper < duration and upper - end < .12):
            reasons.append('crop_edge')
        old = lines[i]
        if reference_kind(old) == 'locked' and abs(start - old['start']) > .75:
            reasons.append('locked_reference_disagreement')
        output[i] = {'start': round(start, 4), 'end': round(end, 4), 'reasons': reasons,
                     'meanWordProbability': round(probability, 4), 'zeroDurationFraction': zero,
                     'referenceKind': reference_kind(old),
                     'referenceDeviationSeconds': round(start - old['start'], 4) if reference_kind(old) != 'draft' else None}
    return output


class StableAdapter:
    def __init__(self, model_name=DEFAULT_MODEL, language='en', device=DEFAULT_DEVICE):
        import stable_whisper
        import whisper
        self.device = resolve_device(device)
        if self.device.startswith('mps'):
            # Whisper's DTW helper calls .double() before moving the tensor to
            # CPU. MPS does not implement float64, while the DTW itself is
            # inexpensive and does not benefit materially from GPU execution.
            # Keep model inference on MPS and move only this calculation to CPU.
            try:
                from stable_whisper import timing as stable_timing
                from whisper.timing import dtw as whisper_dtw

                def cpu_dtw(matrix):
                    return whisper_dtw(matrix.detach().float().cpu())

                stable_timing.dtw = cpu_dtw
            except ImportError:
                # Lightweight adapter doubles used by tests do not expose the
                # Stable-ts module tree; they do not execute this DTW path.
                pass
        self.model = stable_whisper.load_model(model_name, device=self.device)
        self.whisper = whisper
        self.language = language
        self.audio = {}

    def align(self, path: str, text: str, lower: float, upper: float) -> list[dict]:
        if path not in self.audio:
            self.audio[path] = self.whisper.load_audio(path)
        audio = self.audio[path]
        if upper > len(audio) / 16000 + .25:
            raise ValueError('Recording duration does not match the alignment window.')
        result = self.model.align(audio[int(lower * 16000):int(upper * 16000)], text,
                                  language=self.language, original_split=True, regroup=False,
                                  suppress_silence=False, nonspeech_skip=None, verbose=None,
                                  max_word_dur=None, word_dur_factor=None)
        return result.to_dict()['segments'] if result else []


def _report_progress(progress, fraction: float, message: str) -> None:
    """Report numeric progress while keeping older one-argument test hooks valid."""
    try:
        progress(max(0.0, min(0.98, fraction)), message)
    except TypeError:
        progress(message)


def run_alignment(song: dict, paths: dict, config: dict, cache_dir: Path, adapter, progress=lambda message: None) -> dict:
    started = time.monotonic()
    lines = song['lines']
    duration = float(song['duration'])
    if not lines or duration <= 0:
        raise ValueError('Lyrics and a recording with positive duration are required.')
    original = paths.get('original') or paths.get('vocals')
    if not original:
        raise ValueError('No local recording is available.')
    hashes = {original: file_hash(original)}
    cache_dir.mkdir(parents=True, exist_ok=True)
    settings = {**{k: v for k, v in config.items() if k != 'runId'}, 'engineVersion': ENGINE_VERSION, 'stableTsVersion': '2.19.1',
                'suppressSilence': False, 'nonspeechSkip': None, 'originalSplit': True,
                'maxWordDuration': None, 'wordDurationFactor': None}
    larger_adapter = None
    def infer(indices, lo, hi, path, model=adapter, model_name=None):
        text = '\n'.join(alignment_text(lines[i]) for i in indices)
        if path not in hashes:
            hashes[path] = file_hash(path)
        key = digest([hashes[path], text, lo, hi, settings, model_name or config.get('model', DEFAULT_MODEL)])
        target = cache_dir / f'{key}.json'
        if target.exists():
            segments = json.loads(target.read_text())
        else:
            segments = model.align(path, text, lo, hi)
            temporary = target.with_suffix('.' + uuid.uuid4().hex + '.tmp')
            temporary.write_text(json.dumps(segments))
            temporary.replace(target)
        return evaluate_segments(lines, indices, segments, lo, hi, duration)

    planning_lines = deepcopy(lines)
    for line in planning_lines:
        if line.get('planningReference') and not line.get('verified'):
            line.update(line['planningReference'])
    windows = plan_passages(planning_lines, duration)
    if not windows:
        _report_progress(progress, .14, 'No reference timestamps: finding ordered passages from the known lyrics…')
        coarse = infer(list(range(len(lines))), 0, duration, original)
        for i, estimate in coarse.items():
            if not estimate['reasons']:
                planning_lines[i].update(start=estimate['start'], end=estimate['end'], timingSource='forced_alignment')
        windows = plan_passages(planning_lines, duration)
        if not windows:
            raise ValueError('The coarse audio alignment found no supported passage boundaries. Add a few recording-verified reference starts.')
        _report_progress(progress, .24, f'Found {len(windows)} lyric passage(s) to align.')
    observations = {i: [] for i in range(len(lines))}
    owned = {}
    for number, window in enumerate(windows):
        passage_fraction = .24 + .64 * (number + 1) / max(1, len(windows))
        _report_progress(progress, passage_fraction, f'Aligning passage {number + 1} of {len(windows)}…')
        estimates = infer(window.context_indices, window.start, window.end, original)
        for i, e in estimates.items():
            if not e['reasons']:
                observations[i].append(e['start'])
        if any(estimates[i]['reasons'] for i in window.owner_indices if not lines[i].get('verified')):
            _report_progress(progress, min(.9, passage_fraction + .025), f'Rechecking uncertain lines in passage {number + 1} of {len(windows)}…')
            # Two bounded alternatives: wider original context, then an existing stem.
            first, last = window.owner_indices[0], window.owner_indices[-1]
            # Isolate the owning section too: neighboring repetitions can steal
            # alignment attention when the padded passage includes another chorus.
            tight_lo = 0 if first == 0 else max(window.start, planning_lines[first]['start'] - 1)
            tight_hi = duration if last + 1 == len(lines) else planning_lines[last + 1]['start']
            if tight_hi > tight_lo:
                tight = infer(window.owner_indices, tight_lo, tight_hi, original)
                for i in window.owner_indices:
                    if estimates[i]['reasons'] and not tight[i]['reasons']:
                        estimates[i] = tight[i]
            attempts = [(original, max(0, window.start - 3), min(duration, window.end + 3))]
            if paths.get('vocals') and paths['vocals'] != original:
                attempts.append((paths['vocals'], window.start, window.end))
            for path, lo, hi in attempts:
                retry = infer(window.context_indices, lo, hi, path)
                for i in window.owner_indices:
                    if estimates[i]['reasons'] and not retry[i]['reasons']:
                        estimates[i] = retry[i]
                if all(not estimates[i]['reasons'] for i in window.owner_indices):
                    break
        if config.get('retryModel') and any(estimates[i]['reasons'] for i in window.owner_indices if not lines[i].get('verified')):
            if larger_adapter is None:
                _report_progress(progress, .9, 'Loading optional larger model for uncertain passages…')
                larger_adapter = StableAdapter(config['retryModel'], config['language'], config.get('device', DEFAULT_DEVICE))
            retry = infer(window.context_indices, window.start, window.end, original, larger_adapter, config['retryModel'])
            for i in window.owner_indices:
                if estimates[i]['reasons'] and not retry[i]['reasons']:
                    estimates[i] = {**retry[i], 'retryModel': config['retryModel']}
        for i in window.owner_indices:
            owned[i] = {**estimates[i], 'passageId': window.id}
    _report_progress(progress, .94, 'Checking accepted lyric boundaries and review flags…')
    result = deepcopy(lines)
    supported, revised, recovered = 0, 0, 0
    for i, old in enumerate(lines):
        if old.get('verified'):
            continue
        evidence = owned[i]
        if observations[i] and max(observations[i]) - min(observations[i]) > .75:
            evidence['reasons'].append('context_disagreement')
        if not evidence['reasons']:
            start, end = evidence['start'], evidence['end']
            tokens = [{**t, 'start': round(start + (end - start) * j / max(1, len(old['tokens'])), 4),
                       'end': round(start + (end - start) * (j + 1) / max(1, len(old['tokens'])), 4),
                       'confidence': .3, 'source': 'forced_line_interpolation'} for j, t in enumerate(old['tokens'])]
            result[i]['planningReference'] = old.get('planningReference') or {
                'start': old['start'], 'end': old['end'], 'timingSource': old.get('timingSource', 'draft')}
            result[i].update(start=start, end=end, confidence=.75, timingQuality='supported', timingSource='forced_alignment',
                             tokens=tokens, wordTimingCoverage=0, wordTimingConfidence=0, wordTimingSource='line_only')
            supported += 1
        else:
            result[i]['timingQuality'] = 'needs_review'
        result[i]['timingEvidence'] = {**evidence, 'engine': ENGINE_VERSION, 'model': evidence.get('retryModel', config.get('model', DEFAULT_MODEL)),
                                        'engineVersion': '2.19.1', 'runId': config.get('runId'),
                                        'backingPhrasesExcluded': alignment_text(old) != ' '.join(old['text'].replace('’', "'").split())}
    # A rejected old timestamp must not force a newly accepted line into a false order.
    # Roll back any conflicting proposed boundaries and mark affected lines for review.
    for _ in range(len(lines)):
        valid = [i for i, line in enumerate(result) if valid_bounds(line, duration) and (line.get('verified') or line.get('confidence', 0) >= .55)]
        changed = False
        for left, right in zip(valid, valid[1:]):
            if result[left]['start'] >= result[right]['start']:
                for i in (left, right):
                    if not result[i].get('verified') and result[i].get('timingQuality') == 'supported':
                        evidence = result[i]['timingEvidence']
                        evidence['reasons'].append('timeline_conflict')
                        result[i] = {**deepcopy(lines[i]), 'timingQuality': 'needs_review', 'timingEvidence': evidence}
                        changed = True
        if not changed:
            break
    for old, new in zip(lines, result):
        if new.get('timingQuality') == 'supported' and not old.get('verified'):
            if (old['start'], old['end']) != (new['start'], new['end']):
                revised += 1
                recovered += int(old.get('confidence', 0) < .55)
    review = sum(not line.get('verified') and line.get('timingQuality') != 'supported' for line in result)
    outcome = 'unchanged' if not revised else 'partial' if review else 'applied'
    deviations = [e['referenceDeviationSeconds'] for e in owned.values()
                  if not e['reasons'] and e.get('referenceDeviationSeconds') is not None]
    run = {'engine': 'forced', 'engineVersion': ENGINE_VERSION, 'engineConfiguration': settings,
           'recordingHash': hashes[original], 'lyricsHash': digest([line['text'] for line in lines]),
           'inputRevision': song.get('alignmentRevision', 0), 'windowPlan': [w.to_dict() for w in windows],
           'outcome': outcome, 'revisedCount': revised, 'recoveredCount': recovered, 'reviewCount': review,
           'elapsedSeconds': round(time.monotonic() - started, 2),
           'medianReferenceOffset': median(deviations) if deviations else None,
           'referenceOffsetSpread': max(deviations) - min(deviations) if deviations else None,
           'referenceWarnings': ['Possible edit, drift, or incorrect reference times; inspect passage offsets.'] if deviations and max(deviations) - min(deviations) > 4 else [],
           'accuracyValidated': False}
    if file_hash(original) != hashes[original]:
        raise ValueError('The recording changed during alignment; result was not applied.')
    validate_result(song, result)
    return {'lines': result, 'alignmentRun': run}


def validate_result(song: dict, lines: list[dict]):
    if len(lines) != len(song['lines']):
        raise ValueError('Alignment changed line count.')
    for old, new in zip(song['lines'], lines):
        for key in ('id', 'text', 'sectionId', 'section'):
            if old.get(key) != new.get(key):
                raise ValueError(f'Alignment changed canonical {key}.')
        if [t['id'] for t in old['tokens']] != [t['id'] for t in new['tokens']]:
            raise ValueError('Alignment changed token identity.')
        if old.get('verified') and old != new:
            raise ValueError('Alignment changed a locked line.')
        if new.get('timingQuality') == 'supported' and not valid_bounds(new, song['duration']):
            raise ValueError('Alignment produced out-of-range timing.')
