"""Exercise the same background job used by Save & redo timings."""
import importlib
import json
from copy import deepcopy

import pytest
from fastapi.testclient import TestClient
from services.audio_worker import database
from services.audio_worker.lyrics import build_draft_alignment

worker = importlib.import_module('services.audio_worker.app')


@pytest.fixture
def saved_song(tmp_path, monkeypatch):
    monkeypatch.setattr(database, 'DATA_DIR', tmp_path)
    monkeypatch.setattr(database, 'DB_PATH', tmp_path / 'songs.sqlite3')
    monkeypatch.setattr(database, 'SONG_DIR', tmp_path / 'songs')
    monkeypatch.setattr(worker, 'SONG_DIR', tmp_path / 'songs')
    database.init_db()
    lines = build_draft_alignment('Opening words\nTrusted anchor', 10, 'fallback')
    lines[1].update(start=6, end=9, confidence=.95, verified=True)
    song = dict(id='fallback', title='Fallback', artist='Test', lyrics='Opening words\nTrusted anchor',
                lines=lines, duration=10, alignmentRevision=0, createdAt=worker.now_iso(), status='READY_NEEDS_REVIEW')
    database.save_song(song, {'original': 'original.wav'}, worker.now_iso())
    monkeypatch.setattr(worker, 'fetch_synced_candidates', lambda *a: [])
    monkeypatch.setattr('subprocess.run', lambda *a, **k: None)
    monkeypatch.setattr('services.audio_worker.alignment.transcribe_vocals', lambda *a, **k: [
        dict(text='Opening', start=1, end=2, confidence=.95),
        dict(text='words', start=2, end=3, confidence=.95)])
    return deepcopy(song)


def run_job(engine='legacy'):
    with TestClient(worker.app) as client:
        response = client.post(f'/api/songs/fallback/align?engine={engine}')
        assert response.status_code == 202
        return database.get_job(response.json()['jobId'])


def test_no_catalog_runs_real_audio_gap_matching_and_saves(saved_song):
    job = run_job()
    assert job['status'] == 'COMPLETE'
    assert 'no synchronized timing files' in job['message']
    assert 'Recovered 1' in job['message']
    updated, _ = database.get_song('fallback')
    assert updated['lines'][0]['start'] == 1
    assert updated['lines'][0]['timingSource'] == 'audio_gap_match'
    assert updated['lines'][1] == saved_song['lines'][1]
    assert updated['alignmentRevision'] == 1


@pytest.mark.parametrize('reason', ['Catalog request timed out', 'No candidate passed the recording checks'])
def test_catalog_exception_rolls_back_partial_changes_before_recovery(saved_song, monkeypatch, reason):
    def fail(document, *a, **k):
        document['lines'][1]['start'] = 99
        raise RuntimeError(reason)
    monkeypatch.setattr(worker, 'apply_catalog_timing', fail)
    job = run_job()
    assert job['status'] == 'COMPLETE'
    assert reason in job['message']
    updated, _ = database.get_song('fallback')
    assert updated['lines'][1] == saved_song['lines'][1]


def test_inconclusive_audio_keeps_song_and_reports_missing_count(saved_song, monkeypatch):
    monkeypatch.setattr('services.audio_worker.alignment.transcribe_vocals', lambda *a, **k: [])
    job = run_job()
    assert job['status'] == 'COMPLETE'
    assert 'No additional reliable' in job['message']
    assert '1 line(s) still need timing' in job['message']
    assert database.get_song('fallback')[0]['lines'] == saved_song['lines']
    assert database.get_song('fallback')[0]['alignmentRevision'] == 1


def test_no_existing_anchors_can_recover_directly_from_audio(saved_song):
    song, paths = database.get_song('fallback')
    song['lines'][1]['verified'] = False
    song['lines'][1]['confidence'] = .18
    database.save_song(song, paths, worker.now_iso())
    job = run_job()
    assert job['status'] == 'COMPLETE'
    assert 'Recovered 1' in job['message']
    assert '1 line(s) still need timing' in job['message']


def test_audio_failure_keeps_saved_timing_and_explains_both_failures(saved_song, monkeypatch):
    def fail(*a, **k):
        raise RuntimeError('Model unavailable')
    monkeypatch.setattr(worker, 'fill_audio_gaps', fail)
    job = run_job()
    assert job['status'] == 'FAILED'
    assert 'no synchronized timing files' in job['message']
    assert 'Model unavailable' in job['message']
    assert database.get_song('fallback')[0]['lines'] == saved_song['lines']


def test_rejected_audio_validation_can_repair_mapping_from_same_saved_catalog(saved_song, monkeypatch):
    from services.audio_worker.tests.test_timing_gaps import fixture
    song, paths = database.get_song('fallback')
    song.update(lines=fixture(), duration=45, alignmentSource={'kind': 'lrclib', 'catalogId': 123})
    database.save_song(song, paths, worker.now_iso())
    candidate = {'id': 123, 'syncedLyrics': '[00:02] Missing opening phrase\n[00:05]\n[00:10] First known anchor\n[00:20] Second known anchor\n[00:35] Last known anchor'}
    def reject(*a, **k):
        raise worker.CatalogTimingUnavailable('Catalog audio comparison inconclusive.', [candidate])
    monkeypatch.setattr(worker, 'apply_catalog_timing', reject)
    monkeypatch.setattr('services.audio_worker.alignment.transcribe_vocals', lambda *a, **k: [])
    job = run_job()
    assert job['status'] == 'COMPLETE'
    assert '1 from the saved catalog' in job['message']
    updated, _ = database.get_song('fallback')
    assert updated['lines'][0]['start'] == 2
    assert updated['alignmentSource']['missingLineCount'] == 0


def test_forced_job_routes_explicit_engine_and_persists_evidence(saved_song, monkeypatch):
    def forced(song, paths, run_id, data_dir, progress, language):
        progress('Aligning passage 1 of 1…')
        assert language == 'es'
        return {'lines': song['lines'], 'alignmentRun': {'engine': 'forced', 'outcome':'partial', 'reviewCount':1, 'revisedCount':1}}
    monkeypatch.setattr(worker,'execute_forced_alignment',forced)
    with TestClient(worker.app) as client:
        response=client.post('/api/songs/fallback/align?engine=forced&language=es')
        job=database.get_job(response.json()['jobId'])
    assert job['status']=='COMPLETE'
    assert 'listening check' in job['message']
    assert database.get_song('fallback')[0]['alignmentRun']['engine']=='forced'


def test_forced_job_rejects_stale_result(saved_song, monkeypatch):
    def forced(song, paths, *args):
        newer=deepcopy(song);newer['alignmentRevision']+=1;newer['lines'][0]['text']='User edit'
        database.save_song(newer,paths,worker.now_iso())
        return {'lines':song['lines'], 'alignmentRun':{'outcome':'applied','reviewCount':0,'revisedCount':2}}
    monkeypatch.setattr(worker,'execute_forced_alignment',forced)
    with TestClient(worker.app) as client:
        response=client.post('/api/songs/fallback/align?engine=forced')
        job=database.get_job(response.json()['jobId'])
    assert job['status']=='FAILED'
    assert 'Timing changed' in job['message']
    assert database.get_song('fallback')[0]['lines'][0]['text']=='User edit'


def test_forced_dependency_failure_does_not_run_legacy(saved_song, monkeypatch):
    def fail(*args):raise RuntimeError('Forced alignment is not installed')
    monkeypatch.setattr(worker,'execute_forced_alignment',fail)
    def legacy(*args,**kwargs):raise AssertionError('Must not fall back silently')
    monkeypatch.setattr(worker,'apply_catalog_timing',legacy)
    with TestClient(worker.app) as client:
        response=client.post('/api/songs/fallback/align?engine=forced')
        job=database.get_job(response.json()['jobId'])
    assert job['status']=='FAILED'
    assert 'not installed' in job['message']
    assert database.get_song('fallback')[0]['alignmentRevision']==0


def test_undo_restores_snapshot_and_preserves_independent_annotations(saved_song):
    run_id='job_aabbcc'
    directory=database.DATA_DIR/'alignment-runs'/run_id
    directory.mkdir(parents=True)
    (directory/'before.json').write_text(json.dumps(saved_song))
    song,paths=database.get_song('fallback')
    song.update(alignmentRevision=1,alignmentRun={'runId':run_id,'inputRevision':0},readiness=3)
    song['lines'][0]['start']=2
    database.save_song(song,paths,worker.now_iso())
    with TestClient(worker.app) as client:
        response=client.post('/api/songs/fallback/alignment/restore?revision=1')
        assert response.status_code==200
        assert response.json()['lines']==saved_song['lines']
        assert response.json()['readiness']==3
        assert client.post('/api/songs/fallback/alignment/restore?revision=1').status_code==409


def test_undo_does_not_overwrite_newer_manual_edits(saved_song):
    song,paths=database.get_song('fallback')
    song.update(alignmentRevision=2,alignmentRun={'runId':'job_aabbcc','inputRevision':0})
    database.save_song(song,paths,worker.now_iso())
    with TestClient(worker.app) as client:
        assert client.post('/api/songs/fallback/alignment/restore?revision=2').status_code==409


def test_closed_console_has_actionable_error_and_preserves_saved_song(saved_song, monkeypatch):
    def fail(*args, **kwargs):
        raise BrokenPipeError(32, 'Broken pipe')
    monkeypatch.setattr(worker, 'fill_audio_gaps', fail)
    job = run_job()
    assert job['status'] == 'FAILED'
    assert 'lost its console connection' in job['message']
    assert 'Restart the local audio worker' in job['message']
    updated, _ = database.get_song('fallback')
    updated.pop('schemaVersion', None)
    assert updated == saved_song
