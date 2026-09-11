"""Background analysis must not depend on an attached terminal."""
import sys
from types import SimpleNamespace

from services.audio_worker.alignment import transcribe_vocals, transcribe_anchored_vocals


def test_transcription_does_not_write_progress_to_a_closed_console(monkeypatch):
    def transcribe(model, audio, **options):
        # Whisper's False default still creates tqdm and flushes stdout/stderr.
        if options.get('verbose', False) is not None:
            raise BrokenPipeError(32, 'Broken pipe')
        return {'segments': [{'words': [{'text': 'hello', 'start': .1, 'end': .3, 'confidence': .9}]}]}
    monkeypatch.setitem(sys.modules, 'whisper_timestamped', SimpleNamespace(
        load_model=lambda name: object(), load_audio=lambda path: [0] * 16000,
        transcribe=transcribe))
    assert transcribe_vocals('recording.wav')[0]['text'] == 'hello'
    progress = []
    assert transcribe_anchored_vocals('recording.wav', [{'start': 0, 'end': .5, 'text': 'hello'}],
                                      on_progress=lambda *args: progress.append(args))[0]['text'] == 'hello'
    assert progress  # UI progress is independent of console output.
