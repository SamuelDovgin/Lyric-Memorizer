import { useState } from 'react';
import type { Song } from '../types';
import { browserMode } from '../lib/browserLibrary';
import { exportBundle, importBundle } from '../lib/songBundle';
import { playable } from '../lib/rehearsal';

export function SongBundles({songs, onImported}: {songs: Song[]; onImported: () => void}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const candidates = songs.filter(playable);
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError(''); setMessage('');
    try { await action(); } catch (e) { setMessage(''); setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  return <details className="bundle-panel" open={(browserMode && songs.length === 0) || undefined}>
    <summary>{browserMode ? 'Your offline song library' : 'Take songs to your phone'}</summary>
    <p>{browserMode ? 'Import one ZIP exported from the Mac app to add all its songs. Songs stay on this device between visits. Keep the ZIP as a backup; clearing website data removes your library.' : 'Select recordings and export one ZIP with their lyrics, timing, sections, and emoji pins. Transfer it to your phone using AirDrop or Files, then import it in the phone player.'}</p>
    {browserMode && <label className="button primary bundle-import">{busy ? 'Importing…' : 'Import song bundle (.zip)'}<input aria-label="Import song bundle" type="file" accept=".zip,application/zip" disabled={busy} onChange={e => {
      const file = e.target.files?.[0]; e.target.value = '';
      if (file) void run(async () => { setMessage('Checking and saving songs…'); const result = await importBundle(file); onImported(); setMessage(`${result.added} songs imported. ${result.skipped ? `${result.skipped} already in your library; kept your existing copies. ` : ''}${result.persistent ? 'Persistent storage granted.' : 'Saved on this device. Keep your ZIP backup because the browser may reclaim storage.'}`); });
    }}/></label>}
    {candidates.length > 0 && <>
      <p>{browserMode ? 'Export songs again as a backup or to move them to another device.' : 'Choose songs to include (up to 512 MB per bundle).'}</p>
      <div className="bundle-selection-actions"><button disabled={busy} onClick={() => setSelected(candidates.map(s => s.id))}>Select all</button><button disabled={busy} onClick={() => setSelected([])}>Clear selection</button></div>
      <div className="bundle-songs">{candidates.map(song => <label key={song.id}><input type="checkbox" disabled={busy} checked={selected.includes(song.id)} onChange={e => setSelected(old => e.target.checked ? [...old, song.id] : old.filter(id => id !== song.id))}/><span>{song.title}<small>{song.artist}</small></span></label>)}</div>
      <button className="button secondary" disabled={busy || !selected.some(id => candidates.some(s => s.id === id))} onClick={() => void run(async () => {
        const chosen = candidates.filter(s => selected.includes(s.id));
        const blob = await exportBundle(chosen, setMessage);
        const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `lyric-memorizer-${chosen.length}-songs.zip`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 60000);
        setMessage(`Exported ${chosen.length} songs. Transfer the ZIP to your phone and import it once.`);
      })}>{busy ? 'Working…' : `Export selected songs (${selected.filter(id => candidates.some(s => s.id === id)).length})`}</button>
    </>}
    {message && <p role="status">{message}</p>}{error && <p role="alert" className="song-error">{error}</p>}
  </details>;
}
