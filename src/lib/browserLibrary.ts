import { openDB } from 'idb';
import type { Song } from '../types';
export const browserMode = import.meta.env.VITE_BROWSER_ONLY === 'true';
export const mediaFields = ['originalUrl', 'vocalsUrl', 'instrumentalUrl'] as const;
export type MediaField = typeof mediaFields[number];
export interface StoredSong { song: Song; audio: Partial<Record<MediaField, Blob>> }
interface BrowserRecord { song: Song; audio: Partial<Record<MediaField, {data: ArrayBuffer; type: string}>> }
const database = () => openDB('lyric-memorizer-library', 1, { upgrade(db) { db.createObjectStore('songs', {keyPath: 'song.id'}); db.createObjectStore('counts'); } });
const urls = new Map<string, string>();
function hydrate(record: BrowserRecord): Song {
  const song = {...record.song};
  for (const field of mediaFields) {
    const media = record.audio[field];
    const key = `${song.id}:${field}`;
    if (media && !urls.has(key)) urls.set(key, URL.createObjectURL(new Blob([media.data], {type: media.type})));
    song[field] = media ? urls.get(key)! : null;
  }
  return song;
}
function revoke(id: string) { for (const field of mediaFields) { const key = `${id}:${field}`; const url = urls.get(key); if (url) URL.revokeObjectURL(url); urls.delete(key); } }
export async function storedSongs(): Promise<BrowserRecord[]> { return (await database()).getAll('songs'); }
export async function saveBundle(records: StoredSong[]): Promise<number> {
  // Convert before opening a transaction: Safari can reject Blob writes, and
  // asynchronous file reads inside a transaction can cause it to auto-close.
  const prepared: BrowserRecord[] = await Promise.all(records.map(async record => {
    const audio: BrowserRecord['audio'] = {};
    for (const field of mediaFields) { const blob = record.audio[field]; if (blob) audio[field] = {data: await blob.arrayBuffer(), type: blob.type}; }
    return {song: record.song, audio};
  }));
  const db = await database();
  const tx = db.transaction('songs', 'readwrite');
  void tx.done.catch(() => {});
  // Existing songs are left intact: importing a bundle twice must not erase phone edits.
  let added = 0;
  for (const record of prepared) if (!await tx.store.get(record.song.id)) { await tx.store.put(record); added++; }
  await tx.done;
  return added;
}
export async function browserRequest(path: string, init?: RequestInit): Promise<unknown> {
  const db = await database();
  if (path === '/api/songs') return (await storedSongs()).map(hydrate);
  const match = path.match(/^\/api\/songs\/([^/]+)(?:\/(.*))?$/);
  if (!match) throw new Error('Prepare this song in the Mac app, then export a song bundle.');
  const [, id, action] = match;
  const body = init?.body ? JSON.parse(String(init.body)) : {};
  if (action === 'listens') {
    const tx = db.transaction('counts', 'readwrite');
    const state = await tx.store.get(id) ?? {counts: {}, seen: {}};
    for (const event of body.events ?? []) if (!state.seen[event.id]) { state.seen[event.id] = true; state.counts[event.lineId] = (state.counts[event.lineId] ?? 0) + 1; }
    await tx.store.put(state, id); await tx.done; return state.counts;
  }
  const record = await db.get('songs', id) as BrowserRecord | undefined;
  if (!record) throw new Error('Song not found on this device. Import its bundle again.');
  if (!action && init?.method === 'DELETE') {
    const tx = db.transaction(['songs', 'counts'], 'readwrite');
    await tx.objectStore('songs').delete(id); await tx.objectStore('counts').delete(id); await tx.done; revoke(id);
    for (const key of [`listening.practice.${id}`, `listening.position.${id}`, `listening.${id}.pending`, `listening.${id}.counts`, `listening.reviewedEmojiDensity.${id}`]) localStorage.removeItem(key);
    return;
  }
  if (!action) return hydrate(record);
  if (action === 'readiness') record.song.readiness = body.readiness;
  else if (action === 'alignment') {
    if (body.revision !== (record.song.alignmentRevision ?? 0)) throw new Error('Song timing changed. Reopen the song before saving.');
    record.song.lines = body.lines; record.song.alignmentRevision = (record.song.alignmentRevision ?? 0) + 1;
  } else throw new Error('This preparation tool is available in the Mac app.');
  await db.put('songs', record);
  return action === 'readiness' ? {readiness: record.song.readiness} : hydrate(record);
}
