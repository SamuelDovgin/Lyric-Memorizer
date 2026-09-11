from copy import deepcopy
from pathlib import Path
import json

import pytest

from services.audio_worker.alignment_windows import alignment_text, plan_passages, reference_kind
from services.audio_worker.forced_alignment import evaluate_segments, run_alignment, validate_result
from services.audio_worker.lyrics import build_draft_alignment


def song_fixture():
    lines = build_draft_alignment('[Verse]\nOpening words\nRepeated phrase\nRepeated phrase\n[Chorus]\nNext main phrase (backing voice)', 30, 'forced')
    for i, line in enumerate(lines):
        line.update(start=i * 6 + 1, end=i * 6 + 5, confidence=.95, timingSource='lrclib_synced_lyrics')
    return dict(id='forced', lines=lines, lyrics='example', duration=30, alignmentRevision=3)


def segment(text, start, end, probability=.9):
    words = text.split()
    return dict(text=text, start=start, end=end, words=[dict(word=w, start=start + i*(end-start)/len(words),
                end=start + (i+1)*(end-start)/len(words), probability=probability) for i,w in enumerate(words)])


class Adapter:
    def __init__(self, song):
        self.times = {alignment_text(l): (l['start'] + .2, l['end'] - .2) for l in song['lines']}
        self.calls = 0
    def align(self, path, text, lo, hi):
        self.calls += 1
        # Map repeated occurrences in the same order; not via a text dictionary.
        occurrences = {}
        result = []
        for textline in text.splitlines():
            a,b = self.times[textline]
            if textline == 'Repeated phrase':
                n = occurrences.get(textline, 0)
                a,b = 7.2 + n*6, 10.8 + n*6
                occurrences[textline] = n+1
            result.append(segment(textline,a-lo,b-lo))
        return result


def test_window_ownership_context_and_draft_exclusion():
    song = song_fixture()
    lines = song['lines']
    windows = plan_passages(lines, 30)
    assert [i for w in windows for i in w.owner_indices] == list(range(4))
    assert set(windows[0].context_indices) & set(windows[1].context_indices)
    for line in lines:
        line.pop('timingSource')
    assert reference_kind(lines[0]) == 'draft'
    assert plan_passages(lines, 30) == []
    lines[2]['verified'] = True
    assert reference_kind(lines[2]) == 'locked'
    assert plan_passages(lines, 30)[0].start == 0


def test_exact_line_identity_and_absolute_clip_offset():
    lines = song_fixture()['lines']
    evidence = evaluate_segments(lines, [0], [segment('Opening words', 1, 3)], 10, 20, 30)
    assert evidence[0]['start'] == 11
    assert evidence[0]['end'] == 13
    wrong = evaluate_segments(lines, [0,1], [segment('Repeated phrase',1,3)],0,20,30)
    assert all(e['reasons'] == ['segment_identity_mismatch'] for e in wrong.values())


@pytest.mark.parametrize('start,end,probability,reason', [(1,1,.9,'invalid_bounds'),(0,2,.9,'crop_edge'),(1,3,.01,'weak_audio_evidence'),(1,20,.9,'implausible_duration')])
def test_bad_output_is_not_accepted(start,end,probability,reason):
    evidence = evaluate_segments(song_fixture()['lines'], [0], [segment('Opening words', start,end,probability)],10,29,30)
    assert reason in evidence[0]['reasons']


def test_run_preserves_locked_lines_ids_and_line_only_tokens(tmp_path):
    song = song_fixture()
    song['lines'][0]['verified'] = True
    audio = tmp_path/'audio'; audio.write_bytes(b'recording')
    adapter = Adapter(song)
    result = run_alignment(song, {'original':str(audio)}, {'language':'en','model':'fake'},tmp_path/'cache',adapter)
    assert result['lines'][0] == song['lines'][0]
    assert result['lines'][1]['start'] == 7.2
    assert result['lines'][2]['start'] == 13.2
    assert result['lines'][3]['text'] == song['lines'][3]['text']
    assert all(t['confidence'] < .65 for t in result['lines'][1]['tokens'])
    assert result['lines'][1]['wordTimingSource'] == 'line_only'
    assert result['alignmentRun']['accuracyValidated'] is False
    assert result['alignmentRun']['outcome'] == 'applied'
    count = adapter.calls
    run_alignment(song, {'original':str(audio)}, {'language':'en','model':'fake'},tmp_path/'cache',adapter)
    assert adapter.calls == count
    audio.write_bytes(b'different recording')
    run_alignment(song, {'original':str(audio)}, {'language':'en','model':'fake'},tmp_path/'cache',adapter)
    assert adapter.calls > count


def test_run_reports_passage_progress_for_the_ui(tmp_path):
    song = song_fixture()
    audio = tmp_path / 'audio'
    audio.write_bytes(b'recording')
    events = []
    run_alignment(song, {'original': str(audio)}, {'language': 'en', 'model': 'fake'}, tmp_path / 'cache', Adapter(song),
                  progress=lambda *event: events.append(event))
    assert events
    assert all(len(event) == 2 and 0 <= event[0] <= .98 for event in events)
    assert any('Aligning passage' in event[1] for event in events)


def test_low_evidence_retries_and_keeps_old_timing(tmp_path):
    song = song_fixture()
    audio = tmp_path/'audio';audio.write_bytes(b'a')
    class BadAdapter:
        calls=0
        def align(self,path,text,lo,hi):
            self.calls+=1
            return []
    adapter=BadAdapter()
    result=run_alignment(song,{'original':str(audio)},{},tmp_path/'cache',adapter)
    assert adapter.calls > len(result['alignmentRun']['windowPlan'])
    assert result['alignmentRun']['outcome']=='unchanged'
    assert result['alignmentRun']['reviewCount']==4
    for old,new in zip(song['lines'], result['lines']):
        assert (old['start'],old['end'])==(new['start'],new['end'])
        assert new['timingQuality']=='needs_review'


def test_no_reference_uses_ordered_coarse_pass(tmp_path):
    song=song_fixture()
    adapter=Adapter(song)
    for l in song['lines']:l.pop('timingSource')
    audio=tmp_path/'audio';audio.write_bytes(b'a')
    result=run_alignment(song,{'original':str(audio)},{},tmp_path/'cache',adapter)
    assert adapter.calls >= 2
    assert result['alignmentRun']['windowPlan']


def test_validation_rejects_identity_and_locked_boundary_changes():
    song=song_fixture();lines=deepcopy(song['lines']);lines[0]['id']='different'
    with pytest.raises(ValueError,match='canonical'):validate_result(song,lines)
    song['lines'][0]['verified']=True;lines=deepcopy(song['lines']);lines[0]['start']=4
    with pytest.raises(ValueError,match='locked'):validate_result(song,lines)


def test_main_vocal_representation_keeps_standalone_parentheticals():
    assert alignment_text({'text':'Main phrase (backing vocals)'})=='Main phrase'
    assert alignment_text({'text':'(Look at me)'})=='(Look at me)'


def test_cache_ignores_run_id_and_invalidates_lyric_edits(tmp_path):
    song=song_fixture();audio=tmp_path/'audio';audio.write_bytes(b'a');adapter=Adapter(song)
    run_alignment(song,{'original':str(audio)},{'runId':'first'},tmp_path/'cache',adapter)
    calls=adapter.calls
    run_alignment(song,{'original':str(audio)},{'runId':'second'},tmp_path/'cache',adapter)
    assert adapter.calls==calls
    song['lines'][0]['text']='Changed words';adapter.times['Changed words']=(1.2,4.8)
    run_alignment(song,{'original':str(audio)},{'runId':'third'},tmp_path/'cache',adapter)
    assert adapter.calls>calls


def test_nonmonotonic_model_starts_are_reviewed():
    lines=song_fixture()['lines']
    e=evaluate_segments(lines,[1,2],[segment('Repeated phrase',7,9),segment('Repeated phrase',6,8)],0,30,30)
    assert 'nonmonotonic_start' in e[2]['reasons']


def test_locked_reference_disagreement_is_detected():
    song=song_fixture();song['lines'][0]['verified']=True
    e=evaluate_segments(song['lines'],[0],[segment('Opening words',4,6)],0,30,30)
    assert 'locked_reference_disagreement' in e[0]['reasons']


def test_singing_adapter_disables_speech_word_duration_realignments(monkeypatch):
    import sys
    from types import SimpleNamespace
    from services.audio_worker.forced_alignment import StableAdapter
    calls=[]
    class Model:
        def align(self,*args,**kwargs):
            calls.append(kwargs)
            return SimpleNamespace(to_dict=lambda:{'segments':[]})
    monkeypatch.setitem(sys.modules,'stable_whisper',SimpleNamespace(load_model=lambda *a,**k:Model()))
    monkeypatch.setitem(sys.modules,'whisper',SimpleNamespace(load_audio=lambda p:[0]*48000))
    StableAdapter().align('recording','Sustained singing',0,3)
    assert calls[0]['max_word_dur'] is None
    assert calls[0]['word_dur_factor'] is None
    assert calls[0]['suppress_silence'] is False
