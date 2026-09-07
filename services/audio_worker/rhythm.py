"""Optional beat estimation. User audition/confirmation enables counted transitions."""
from __future__ import annotations


def analyze(path: str) -> dict:
    import librosa
    import numpy as np

    audio, sr = librosa.load(path, sr=22050, mono=True)
    tempo, beats = librosa.beat.beat_track(y=audio, sr=sr, units="time", trim=False)
    bpm = float(np.asarray(tempo).reshape(-1)[0])
    if len(beats) < 4 or not np.isfinite(bpm) or bpm <= 20:
        raise ValueError("No reliable pulse was detected")
    intervals = np.diff(beats)
    regularity = max(0., 1 - float(np.std(intervals) / max(.01, np.mean(intervals))))
    return dict(bpm=round(bpm, 2), anchor=float(beats[0]), beats=[float(x) for x in beats], confidence=round(regularity * .8, 3), verified=False, source="librosa_estimate")
