import { afterEach, describe, expect, it, vi } from 'vitest';
import { ListeningTransport } from './listeningTransport';
import { practiceWav } from './practiceAudio';

class Media extends EventTarget {
  src = ''; volume = 1; preload = ''; loop = false; currentTime = 0; duration = 10; ended = false;
  play = vi.fn(async () => { this.dispatchEvent(new Event('playing')); });
  pause = vi.fn(() => { this.dispatchEvent(new Event('pause')); });
  load = vi.fn(); removeAttribute = vi.fn();
}
const buffer = {sampleRate: 10, length: 100, duration: 10, numberOfChannels: 1, getChannelData: () => new Float32Array(100).fill(.5)} as unknown as AudioBuffer;
function setup() {
  const audio = new Media();
  vi.stubGlobal('fetch', vi.fn(async () => ({ok: true, arrayBuffer: async () => new ArrayBuffer(1)})));
  vi.stubGlobal('AudioContext', class { decodeAudioData = async () => buffer; close = vi.fn(async () => {}); });
  vi.stubGlobal('URL', {createObjectURL: vi.fn(() => 'blob:passage'), revokeObjectURL: vi.fn()});
  const transport = new ListeningTransport(['/song.wav'], () => audio as unknown as HTMLAudioElement);
  return {audio, transport};
}
afterEach(() => vi.unstubAllGlobals());
describe('native background listening', () => {
  it('uses a bounded audio file and native repeat without scheduling timers', async () => {
    const {audio, transport} = setup();
    const interval = vi.spyOn(globalThis, 'setInterval');
    transport.setTransition({id: 'verse', start: 2, exit: 4, gap: 0, clicks: []});
    await transport.play(3);
    expect(audio.src).toBe('blob:passage');
    expect(audio.loop).toBe(true);
    expect(audio.currentTime).toBe(1);
    expect(interval).not.toHaveBeenCalled();
    audio.currentTime = 1.8; audio.dispatchEvent(new Event('timeupdate'));
    expect(transport.getSnapshot().position).toBe(3.8);
    audio.currentTime = .2; audio.dispatchEvent(new Event('timeupdate'));
    expect(transport.getSnapshot()).toMatchObject({position: 2.2, pass: 2, status: 'playing'});
    transport.pause();
    await transport.play();
    expect(audio.currentTime).toBeCloseTo(.2);
    transport.pause();
    transport.setTransition(null);
    await transport.play(5);
    expect(audio.src).toBe('/song.wav');
    expect(audio.loop).toBe(false);
    expect(audio.currentTime).toBe(5);
    transport.dispose(); interval.mockRestore();
  });
  it('honors lock-screen pause and whole-song repeat', async () => {
    const {audio, transport} = setup();
    transport.setRepeat(true);
    await transport.play(1);
    expect(audio.loop).toBe(true);
    audio.currentTime = 3; audio.pause();
    expect(transport.getSnapshot()).toMatchObject({status: 'paused', position: 3});
    transport.setRepeat(false);
    expect(audio.loop).toBe(false);
    transport.dispose();
  });
  it('does not start a passage after preparation is canceled', async () => {
    const {audio, transport} = setup();
    let resolve!: (value: unknown) => void;
    vi.stubGlobal('fetch', () => new Promise(r => { resolve = r; }));
    transport.setTransition({id: 'verse', start: 2, exit: 4, gap: 0, clicks: []});
    const pending = transport.play(2);
    transport.pause();
    resolve({ok: true, arrayBuffer: async () => new ArrayBuffer(1)});
    await pending;
    expect(audio.play).not.toHaveBeenCalled();
    expect(transport.getSnapshot().status).toBe('paused');
    transport.dispose();
  });
  it('encodes precisely the selected passage as playable PCM WAV', async () => {
    const blob = practiceWav([buffer], 2, 4);
    const bytes = await new Promise<ArrayBuffer>(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result as ArrayBuffer); reader.readAsArrayBuffer(blob); });
    const view = new DataView(bytes);
    expect(bytes.byteLength).toBe(44 + 20 * 2);
    expect(view.getUint32(24, true)).toBe(10);
    expect(view.getUint32(40, true)).toBe(40);
    expect(view.getInt16(44, true)).toBe(Math.round(.4 * 32767));
  });
});
