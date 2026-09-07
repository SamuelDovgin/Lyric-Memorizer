import { zip, unzip, strToU8, strFromU8 } from 'fflate';
import type { Song } from '../types';
import { mediaFields, saveBundle, type StoredSong } from './browserLibrary';
const MAX_BYTES = 512 * 1024 * 1024;
interface Entry { song: Song; media: Record<string, {path: string; type: string}> }
export async function exportBundle(songs: Song[], progress: (text: string) => void): Promise<Blob> {
  const files: Record<string, Uint8Array> = {};
  const entries: Entry[] = [];
  let total = 0;
  for (const [index, source] of songs.entries()) {
    progress(`Packing ${index + 1} of ${songs.length}: ${source.title}`);
    const song = {...source, jobId: undefined, sourceUrl: undefined};
    const media: Entry['media'] = {};
    for (const field of mediaFields) {
      const url = source[field]; song[field] = null;
      if (!url) continue;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Could not read audio for ${source.title}.`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      total += bytes.length;
      if (total > MAX_BYTES) throw new Error('Bundle is too large. Export fewer songs (maximum 512 MB).');
      const path = `audio/${index}/${field}`;
      files[path] = bytes;
      media[field] = {path, type: response.headers.get('Content-Type') || 'application/octet-stream'};
    }
    if (!Object.keys(media).length) throw new Error(`${source.title} has no audio to export.`);
    song.status = 'READY'; song.statusMessage = 'Saved for offline playback';
    entries.push({song, media});
  }
  files['manifest.json'] = strToU8(JSON.stringify({format: 'lyric-memorizer-bundle', version: 1, songs: entries}));
  return new Promise((resolve, reject) => zip(files, {level: 0}, (error, data) => error ? reject(error) : resolve(new Blob([data as Uint8Array<ArrayBuffer>], {type: 'application/zip'}))));
}
export async function decodeBundle(file: Blob): Promise<StoredSong[]> {
  if (file.size > MAX_BYTES + 10 * 1024 * 1024) throw new Error('Bundle is too large. Export fewer songs on your Mac.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  let size = 0;
  let oversized = false;
  const files = await new Promise<Record<string, Uint8Array>>((resolve, reject) => unzip(bytes, {filter(entry) { size += entry.originalSize; if (size > MAX_BYTES + 10 * 1024 * 1024) oversized = true; return !oversized; }}, (error, data) => error ? reject(new Error('This is not a valid song ZIP.')) : resolve(data)));
  if (oversized) throw new Error('Unpacked bundle exceeds the 512 MB limit.');
  if (!files['manifest.json']) throw new Error('This ZIP is missing its song manifest. Export it from Lyric Memorizer.');
  const manifest = JSON.parse(strFromU8(files['manifest.json']));
  if (!manifest || manifest.format !== 'lyric-memorizer-bundle' || manifest.version !== 1 || !Array.isArray(manifest.songs) || !manifest.songs.length || manifest.songs.length > 500) throw new Error('Unsupported song bundle. Export it again from the Mac app.');
  const ids = new Set<string>();
  return manifest.songs.map((entry: Entry) => {
    const song = entry?.song;
    if (!song || typeof song.id !== 'string' || !song.id || ids.has(song.id) || typeof song.title !== 'string' || typeof song.artist !== 'string' || typeof song.lyrics !== 'string' || !Number.isFinite(song.duration) || song.duration < 0 || !Array.isArray(song.lines) || !entry.media) throw new Error('Invalid song metadata. Nothing was imported.');
    ids.add(song.id);
    for (const line of song.lines) if (!line || typeof line.id !== 'string' || typeof line.text !== 'string' || typeof line.section !== 'string' || !Number.isFinite(line.start) || !Number.isFinite(line.end) || !Array.isArray(line.tokens)) throw new Error('Invalid lyric timing. Nothing was imported.');
    for (const line of song.lines) for (const token of line.tokens) if (!token || typeof token.text !== 'string' || !Number.isFinite(token.start) || !Number.isFinite(token.end)) throw new Error('Invalid word timing. Nothing was imported.');
    if (song.emojiPins !== undefined && (!Array.isArray(song.emojiPins) || song.emojiPins.some(pin => !pin || typeof pin.lineId !== 'string' || typeof pin.lineText !== 'string' || typeof pin.anchor !== 'string' || typeof pin.emoji !== 'string' || !Number.isInteger(pin.wordIndex)))) throw new Error('Invalid emoji pins. Nothing was imported.');
    const clean: Song = {...song, originalUrl: null, vocalsUrl: null, instrumentalUrl: null, jobId: undefined, status: 'READY'};
    const audio: StoredSong['audio'] = {};
    for (const field of mediaFields) {
      const item = entry.media[field];
      if (!item) continue;
      if (typeof item.path !== 'string' || !item.path.startsWith('audio/') || !Object.hasOwn(files, item.path) || !files[item.path].length) throw new Error(`Missing audio for ${song.title}. Nothing was imported.`);
      audio[field] = new Blob([files[item.path] as Uint8Array<ArrayBuffer>], {type: typeof item.type === 'string' ? item.type : 'application/octet-stream'});
    }
    if (!audio.originalUrl && !audio.vocalsUrl && !audio.instrumentalUrl) throw new Error(`No audio for ${song.title}.`);
    return {song: clean, audio};
  });
}
export async function importBundle(file: Blob) {
  const records = await decodeBundle(file);
  const estimate = await navigator.storage?.estimate?.();
  const required = records.reduce((sum, r) => sum + Object.values(r.audio).reduce((n, blob) => n + blob.size, 0), 0);
  if (estimate?.quota && required > estimate.quota - (estimate.usage ?? 0)) throw new Error('Not enough browser storage. Remove some songs or free device space.');
  const added = await saveBundle(records);
  let persistent = false;
  try { persistent = await navigator.storage?.persist?.() ?? false; } catch { /* Import remains saved if persistence is denied. */ }
  return {added, skipped: records.length - added, persistent};
}
