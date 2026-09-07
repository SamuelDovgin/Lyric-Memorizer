import math
import struct
import wave
import pytest


def test_detected_clicks_are_unverified_and_preserve_beat_times(tmp_path):
    pytest.importorskip('librosa')
    from services.audio_worker.rhythm import analyze
    path = tmp_path / 'pulse.wav'
    sample_rate = 8000
    data = bytearray()
    for i in range(sample_rate * 16):
        time = i / sample_rate
        phase = time % .5
        value = .6 * math.exp(-phase * 75) * math.sin(2 * math.pi * 880 * time)
        data.extend(struct.pack('<h', int(value * 32767)))
    with wave.open(str(path), 'wb') as wav:
        wav.setnchannels(1); wav.setsampwidth(2); wav.setframerate(sample_rate); wav.writeframes(data)
    result = analyze(str(path))
    assert result['verified'] is False
    assert 110 <= result['bpm'] <= 130
    assert len(result['beats']) > 20
    assert result['beats'] == sorted(result['beats'])
