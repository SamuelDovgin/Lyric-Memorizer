"""Durable, idempotent section listens; independent of old rehearsal ratings."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from . import database as db

router = APIRouter(prefix="/api")


def init_listening():
    with db.connect() as connection:
        connection.execute("CREATE TABLE IF NOT EXISTS section_listens (id TEXT PRIMARY KEY, song_id TEXT NOT NULL, line_id TEXT NOT NULL)")


class Listen(BaseModel):
    id: str = Field(min_length=1, max_length=100)
    lineId: str = Field(min_length=1, max_length=200)


class Batch(BaseModel):
    events: list[Listen] = Field(max_length=200)


@router.get('/songs/{song_id}/listens')
def counts(song_id: str):
    if not db.get_song(song_id):
        raise HTTPException(404, 'Song not found')
    with db.connect() as connection:
        return {row['line_id']: row['n'] for row in connection.execute('SELECT line_id, COUNT(*) AS n FROM section_listens WHERE song_id=? GROUP BY line_id', (song_id,))}


@router.post('/songs/{song_id}/listens')
def record(song_id: str, batch: Batch):
    found = db.get_song(song_id)
    if not found:
        raise HTTPException(404, 'Song not found')
    ids = {line['id'] for line in found[0]['lines']}
    if any(event.lineId not in ids for event in batch.events):
        raise HTTPException(422, 'Unknown lyric line')
    with db.connect() as connection:
        for event in batch.events:
            old = connection.execute('SELECT song_id, line_id FROM section_listens WHERE id=?', (event.id,)).fetchone()
            if old and (old['song_id'] != song_id or old['line_id'] != event.lineId):
                raise HTTPException(409, 'Listen identity conflict')
            connection.execute('INSERT OR IGNORE INTO section_listens VALUES (?, ?, ?)', (event.id, song_id, event.lineId))
    return counts(song_id)
