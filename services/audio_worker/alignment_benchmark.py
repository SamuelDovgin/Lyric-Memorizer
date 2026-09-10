"""Human labels are independent of model output; null labels never count as truth."""
from __future__ import annotations
import math
from statistics import median


def metrics(lines: list[dict], labels: list[dict], recording_hash: str) -> dict:
    by_id = {line['id']: line for line in lines}
    errors, accepted_errors = [], []
    labelled = 0
    for label in labels:
        if label.get('startMin') is None or label.get('startMax') is None:
            continue
        if label.get('recordingHash') != recording_hash or not label.get('humanReviewed'):
            raise ValueError('Benchmark labels must be human-reviewed on the exact recording.')
        lo, hi = float(label['startMin']), float(label['startMax'])
        if not math.isfinite(lo + hi) or not 0 <= lo <= hi:
            raise ValueError('Invalid onset uncertainty interval.')
        labelled += 1
        line = by_id.get(label['lineId'])
        if not line:
            raise ValueError('Label line ID is not in this lyric revision.')
        start = line.get('start')
        if start is None or not math.isfinite(start) or line.get('confidence',0) < .55 and not line.get('verified'):
            continue
        error = max(lo - start, 0, start - hi)
        errors.append(error)
        if line.get('timingQuality') == 'supported':
            accepted_errors.append(error)
    def summarize(values):
        ordered = sorted(values)
        return {'count':len(values),'medianErrorSeconds':median(values) if values else None,
                'p90ErrorSeconds':ordered[max(0, math.ceil(.9*len(values))-1)] if values else None,
                'withinHalfSecond':sum(v <= .5 for v in values)/len(values) if values else None,
                'overOneSecond':sum(v > 1 for v in values)}
    return {'validationStatus':'measured' if errors else 'pending_human_review',
            'labelCount':labelled,'allUsable':summarize(errors),'automaticallyAccepted':summarize(accepted_errors),
            'unresolvedLabelRate':1-len(errors)/labelled if labelled else None,
            'acceptanceRate':sum(l.get('timingQuality')=='supported' for l in lines)/max(1,len(lines)),
            'wrongOccurrenceCount':None, 'wrongOccurrenceNote':'Requires listening review; not inferred from coverage.'}


def held_out_song(song: dict, labels: list[dict]) -> dict:
    from copy import deepcopy
    result = deepcopy(song)
    held = {label['lineId'] for label in labels if label.get('humanReviewed') and label.get('startMin') is not None}
    for line in result['lines']:
        if line['id'] in held:
            line.update(verified=False, confidence=.18, timingSource='draft')
            line.pop('planningReference', None)
    return result
