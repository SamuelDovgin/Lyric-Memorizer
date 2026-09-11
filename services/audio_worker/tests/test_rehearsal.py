import json
import sqlite3
import pytest
from fastapi.testclient import TestClient
from services.audio_worker import database as db
from services.audio_worker import app as worker
from services.audio_worker.rehearsal import migrate
from services.audio_worker.tests.test_api import wav_bytes


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(db, 'DATA_DIR', tmp_path)
    monkeypatch.setattr(db, 'DB_PATH', tmp_path / 'test.sqlite3')
    monkeypatch.setattr(db, 'SONG_DIR', tmp_path / 'songs')
    monkeypatch.setattr(worker, 'SONG_DIR', tmp_path / 'songs')
    monkeypatch.setattr(worker, 'queue_initial_alignment', lambda *args, **kwargs: None)
    with TestClient(worker.app) as client:
        yield client


def import_song(client):
    result = client.post('/api/songs/import', data={'title':'Practice', 'lyrics':'[Chorus]\nSame words\n[Verse]\nNew words\n[Chorus]\nSame words'}, files={'original':('original.wav', wav_bytes(12), 'audio/wav')})
    assert result.status_code == 201, result.text
    return result.json()


def event(song, sequence=1):
    return dict(id=f'e{sequence}', songId=song['id'], sessionId='session', sequence=sequence, passId='pass1', lineId=song['lines'][0]['id'], judgment='again', sourceTime=1, createdAt='2026-09-05T00:00:00Z')


def test_original_import_requires_no_separator(client, monkeypatch):
    monkeypatch.setattr(worker, 'separate_song', lambda *_: pytest.fail('Original import must not separate'))
    song = import_song(client)
    assert song['originalUrl'] and song['vocalsUrl'] is None
    fetched = client.get(f"/api/songs/{song['id']}").json()
    assert fetched['capabilities']['playable']
    assert not fetched['capabilities']['stems']
    assert max(l['end'] for l in song['lines']) <= song['duration']


def test_invalid_audio_fails_honestly(client):
    result = client.post('/api/songs/import', data={'title':'Bad', 'lyrics':'Some words'}, files={'original':('bad.wav', b'not audio', 'audio/wav')})
    assert result.status_code == 422


def test_occurrences_and_revision_conflicts(client):
    song = import_song(client)
    structure = client.get(f"/api/songs/{song['id']}/structure").json()
    assert [s['name'] for s in structure] == ['Chorus 1','Verse','Chorus 2']
    assert structure[0]['id'] != structure[2]['id']
    change = dict(sectionId=structure[2]['id'], name='Final chorus', revision=0)
    result = client.put(f"/api/songs/{song['id']}/structure", json=change)
    assert result.status_code == 200
    assert result.json()['lines'][0]['section'] == 'Chorus'
    assert result.json()['lines'][2]['section'] == 'Final chorus'
    assert client.put(f"/api/songs/{song['id']}/structure", json=change).status_code == 409


def test_feedback_batch_rolls_back_on_bad_ownership_and_retries_once(client):
    song = import_song(client)
    first, bad = event(song), {**event(song, 2), 'lineId':'someone-elses-line'}
    assert client.post('/api/practice-events/batch', json={'events':[first,bad]}).status_code == 422
    assert client.get(f"/api/songs/{song['id']}/practice-state").json()['events'] == []
    for _ in range(2):
        assert client.post('/api/practice-events/batch', json={'events':[first]}).status_code == 200
    assert len(client.get(f"/api/songs/{song['id']}/practice-state").json()['events']) == 1
    assert client.post('/api/practice-events/batch', json={'events':[{**first, 'judgment':'got-it'}]}).status_code == 409
    undo = {**event(song,2), 'judgment':'undo','supersedes':first['id']}
    assert client.post('/api/practice-events/batch', json={'events':[undo]}).status_code == 200


def test_timing_edit_keeps_token_identity_and_does_not_raise_word_confidence(client):
    song = import_song(client)
    line = song['lines'][0]
    line.update(start=1, end=3, verified=True)
    for index, token in enumerate(line['tokens']):
        token.update(start=1 + index, end=2 + index)
    result = client.put(f"/api/songs/{song['id']}/alignment", json={'lines':[line], 'revision':0})
    assert result.status_code == 200, result.text
    assert result.json()['alignmentRevision'] == 1
    assert result.json()['lines'][0]['tokens'][0]['confidence'] == .18
    assert client.put(f"/api/songs/{song['id']}/alignment", json={'lines':[line], 'revision':0}).status_code == 409
    line['end'] = 99
    assert client.put(f"/api/songs/{song['id']}/alignment", json={'lines':[line], 'revision':1}).status_code == 422


def test_legacy_migration_is_idempotent_and_preserves_history(client):
    song = import_song(client)
    document, paths = db.get_song(song['id'])
    document.pop('schemaVersion', None)
    for line in document['lines']:
        line.pop('sectionId', None)
    db.save_song(document, paths, 'now')
    with db.connect() as connection:
        connection.execute('INSERT INTO cards VALUES (?, ?, ?, ?, ?)', ('old-card', song['id'], song['lines'][0]['id'], '{}', 'then'))
        connection.execute('PRAGMA user_version=1')
    migrate()
    first = db.get_song(song['id'])[0]
    migrate()
    assert db.get_song(song['id'])[0] == first
    assert first['lines'][0]['id'] == song['lines'][0]['id']
    with db.connect() as connection:
        assert connection.execute('SELECT COUNT(*) FROM cards').fetchone()[0] == 1
    assert db.DB_PATH.with_suffix('.v1-backup.sqlite3').exists()


def test_stale_processing_cannot_replace_manual_timing(client):
    song = import_song(client)
    old, paths = db.get_song(song['id'])
    changed = json.loads(json.dumps(old))
    changed['alignmentRevision'] = 1
    changed['lines'][0]['start'] = .2
    db.save_song(changed, paths, 'now', expected_revision=0)
    old['statusMessage'] = 'Stems ready'
    db.save_song(old, paths, 'later')
    assert db.get_song(song['id'])[0]['lines'][0]['start'] == .2


def test_manual_beats_and_session_survive_reload(client):
    song = import_song(client)
    path = f"/api/songs/{song['id']}/beat-map"
    result = client.put(path, json={'bpm':120,'anchor':.5})
    assert result.status_code == 200
    assert result.json()['beats'][:3] == [0,.5,1]
    assert client.get(path).json()['verified']
    session = dict(id='session', songId=song['id'], position=5, mode='focus', scope='', settings={}, loop=[0,1], elapsed=10, plan={song['lines'][0]['id']: {'step': 'connect', 'due': 100, 'visits': 0}}, updatedAt='2026-09-05T00:00:00Z')
    session['rehearsal'] = {'sectionId': song['lines'][0]['sectionId'], 'ratings': {song['lines'][0]['sectionId']: {'rating': 'getting-there', 'updatedAt': '2026-09-05T00:00:00Z'}}}
    assert client.put('/api/practice-sessions/session', json=session).status_code == 200
    assert client.get(f"/api/songs/{song['id']}/session").json() == session
    assert client.delete(f"/api/songs/{song['id']}").status_code == 204
    with db.connect() as connection:
        assert connection.execute('SELECT COUNT(*) FROM practice_sessions').fetchone()[0] == 0
        assert connection.execute('SELECT COUNT(*) FROM beat_maps').fetchone()[0] == 0
