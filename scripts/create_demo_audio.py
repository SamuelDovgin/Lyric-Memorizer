"""Create two tiny, original WAV stems for exercising the MVP without copyrighted audio."""
from __future__ import annotations

import math
import struct
import wave
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "fixtures" / "demo"
SAMPLE_RATE = 44_100
DURATION = 18


def write_stereo(path: Path, sample) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as output:
        output.setnchannels(2)
        output.setsampwidth(2)
        output.setframerate(SAMPLE_RATE)
        frames = bytearray()
        for index in range(SAMPLE_RATE * DURATION):
            value = max(-1, min(1, sample(index / SAMPLE_RATE)))
            packed = struct.pack("<h", int(value * 32767))
            frames.extend(packed + packed)
        output.writeframes(frames)


def envelope(t: float, start: float, end: float) -> float:
    if not start <= t <= end:
        return 0
    return min(1, (t - start) / .08, (end - t) / .12)


def vocals(t: float) -> float:
    notes = [(1.5, 3.2, 329.6), (3.3, 5.1, 392), (6.0, 8.2, 440), (8.3, 10.5, 392), (11.4, 13.6, 349.2), (13.7, 16.2, 329.6)]
    return sum(.20 * envelope(t, start, end) * math.sin(2 * math.pi * hz * t) for start, end, hz in notes)


def instrumental(t: float) -> float:
    beat = .08 * math.sin(2 * math.pi * 110 * t)
    shimmer = .035 * math.sin(2 * math.pi * 220 * t)
    pulse = .55 + .45 * max(0, math.sin(2 * math.pi * 1.5 * t))
    return (beat + shimmer) * pulse


write_stereo(OUT / "vocals.wav", vocals)
write_stereo(OUT / "instrumental.wav", instrumental)
write_stereo(OUT / "original.wav", lambda t: vocals(t) + instrumental(t))
(OUT / "lyrics.txt").write_text(
    "[Verse]\nCarry the light with me\nEvery word arrives in time\n\n[Chorus]\nI know the line before it comes\n",
    encoding="utf-8",
)
print(f"Demo stems and lyrics written to {OUT}")
