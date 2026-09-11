import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { ImportPage } from '../pages/ImportPage';
import { api } from '../lib/api';
import type { Song } from '../types';
vi.mock('../lib/api', () => ({api: {importSong: vi.fn(), refreshSongPreview: vi.fn(), editSong: vi.fn(), startAlignment: vi.fn(), job: vi.fn(), song: vi.fn()}}));
vi.mock('../lib/browserLibrary', () => ({browserMode: false}));
const song = {id: 'cards', title: 'Cards', artist: 'Doja Cat', lyrics: 'Old words', sourceUrl: 'https://www.youtube.com/watch?v=test', originalUrl: '/audio', alignmentRevision: 3} as Song;
beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  HTMLDialogElement.prototype.showModal = vi.fn();
  HTMLDialogElement.prototype.close = vi.fn();
});
it('previews refreshed lyrics without saving and then starts timing after saving', async () => {
  vi.mocked(api.refreshSongPreview).mockResolvedValue({title: 'Cards', artist: 'Doja Cat', lyrics: 'Fresh words'});
  const updated = {...song, lyrics: 'Fresh words', alignmentRevision: 4};
  vi.mocked(api.editSong).mockResolvedValue(updated);
  vi.mocked(api.startAlignment).mockResolvedValue({jobId: 'job'});
  vi.mocked(api.job).mockResolvedValue({status: 'COMPLETE', progress: 1, message: 'Timing complete'});
  vi.mocked(api.song).mockResolvedValue(updated);
  const onUpdate = vi.fn();
  render(<ImportPage song={song} onCancel={vi.fn()} onImported={vi.fn()} onUpdate={onUpdate} />);
  expect(screen.getByLabelText('YouTube source')).toHaveAttribute('readonly');
  fireEvent.click(screen.getByText('Pull lyrics from YouTube source'));
  await screen.findByDisplayValue('Fresh words');
  expect(api.editSong).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('Save & redo timings'));
  await waitFor(() => expect(api.startAlignment).toHaveBeenCalledWith('cards', false));
  expect(api.editSong).toHaveBeenCalledWith('cards', {title: 'Cards', artist: 'Doja Cat', lyrics: 'Fresh words', revision: 3});
  await screen.findByText('Timing complete');
  expect(onUpdate).toHaveBeenCalledWith(updated);
});


it('uses the same form for a new audio import', async () => {
  vi.mocked(api.importSong).mockResolvedValue(song);
  const onImported = vi.fn();
  render(<ImportPage onCancel={vi.fn()} onImported={onImported} />);
  expect(screen.getByRole('button', {name: 'Import song'})).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Song title'), {target: {value: 'Cards'}});
  fireEvent.change(screen.getByLabelText('Exact lyrics'), {target: {value: 'New words'}});
  const original = new File(['audio'], 'song.wav', {type: 'audio/wav'});
  fireEvent.change(screen.getByLabelText('Original audio'), {target: {files: [original]}});
  fireEvent.click(screen.getByRole('button', {name: 'Import song'}));
  await waitFor(() => expect(onImported).toHaveBeenCalledWith(song));
  expect(api.importSong).toHaveBeenCalledWith(expect.objectContaining({title: 'Cards', lyrics: 'New words', original}));
  expect(api.editSong).not.toHaveBeenCalled();
});

it('keeps the import form open for another song while timing runs in the background', async () => {
  vi.mocked(api.importSong).mockResolvedValue(song);
  const onImported = vi.fn();
  render(<ImportPage onCancel={vi.fn()} onImported={onImported} />);
  fireEvent.change(screen.getByLabelText('Song title'), {target: {value: 'Cards'}});
  fireEvent.change(screen.getByLabelText('Exact lyrics'), {target: {value: 'New words'}});
  fireEvent.change(screen.getByLabelText('Original audio'), {target: {files: [new File(['audio'], 'song.wav', {type: 'audio/wav'})]}});
  fireEvent.click(screen.getByRole('button', {name: 'Import & add another'}));
  await waitFor(() => expect(onImported).toHaveBeenCalledWith(song, true));
  expect(screen.getByLabelText('Song title')).toHaveValue('');
  expect(screen.getByLabelText('Exact lyrics')).toHaveValue('');
  expect(screen.getByText(/Whisper alignment is running in the background/)).toBeInTheDocument();
});

it('imports multiple local recordings with per-file lyrics', async () => {
  vi.mocked(api.importSong).mockResolvedValue(song);
  const onImported = vi.fn();
  render(<ImportPage onCancel={vi.fn()} onImported={onImported} />);
  const first = new File(['audio one'], 'first-song.wav', {type: 'audio/wav'});
  const second = new File(['audio two'], 'second_song.mp3', {type: 'audio/mpeg'});
  fireEvent.change(screen.getByLabelText('Original audio'), {target: {files: [first, second]}});
  expect(screen.getByRole('region', {name: 'Batch import'})).toBeInTheDocument();
  const lyrics = screen.getAllByLabelText('Exact lyrics');
  fireEvent.change(lyrics[0], {target: {value: 'First lyrics'}});
  fireEvent.change(lyrics[1], {target: {value: 'Second lyrics'}});
  fireEvent.click(screen.getByRole('button', {name: 'Import all songs'}));
  await waitFor(() => expect(onImported).toHaveBeenCalledTimes(2));
  expect(onImported).toHaveBeenNthCalledWith(1, song, true);
  expect(onImported).toHaveBeenNthCalledWith(2, song, true);
  expect(screen.getByText(/Imported 2 songs/)).toBeInTheDocument();
  expect(api.importSong).toHaveBeenNthCalledWith(1, expect.objectContaining({title: 'first song', lyrics: 'First lyrics', original: first}));
  expect(api.importSong).toHaveBeenNthCalledWith(2, expect.objectContaining({title: 'second song', lyrics: 'Second lyrics', original: second}));
});
