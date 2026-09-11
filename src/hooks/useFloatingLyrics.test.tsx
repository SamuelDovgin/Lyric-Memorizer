import {afterEach, describe, expect, test, vi} from 'vitest';
import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {useFloatingLyrics} from './useFloatingLyrics';
import type {ListeningTransport} from '../audio/listeningTransport';
import type {Song} from '../types';

const song: Song = {
  id: 'pip-test', title: 'PiP test', artist: 'Test', lyrics: '', duration: 20,
  status: 'READY', statusMessage: '', createdAt: '', originalUrl: '/test.wav', vocalsUrl: null, instrumentalUrl: null,
  lines: [{id: 'line', songId: 'pip-test', index: 0, section: 'Verse', text: 'Follow this line', start: 0, end: 10, verified: true, confidence: 1, tokens: []}],
};

function Harness({transport}: {transport: ListeningTransport}) {
  const {floating, busy, open} = useFloatingLyrics(song, transport, undefined);
  return <button onClick={() => void open()}>{busy ? 'Opening' : floating ? 'Close' : 'Open'}</button>;
}

describe('useFloatingLyrics', () => {
  const originalCaptureStream = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'captureStream');
  const originalModeSupport = Object.getOwnPropertyDescriptor(HTMLVideoElement.prototype, 'webkitSupportsPresentationMode');
  const originalSetMode = Object.getOwnPropertyDescriptor(HTMLVideoElement.prototype, 'webkitSetPresentationMode');
  const originalMode = Object.getOwnPropertyDescriptor(HTMLVideoElement.prototype, 'webkitPresentationMode');
  const originalRequestPictureInPicture = Object.getOwnPropertyDescriptor(HTMLVideoElement.prototype, 'requestPictureInPicture');
  const originalGetContext = HTMLCanvasElement.prototype.getContext;
  const originalPlay = HTMLMediaElement.prototype.play;

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    if (originalCaptureStream) Object.defineProperty(HTMLCanvasElement.prototype, 'captureStream', originalCaptureStream);
    else Reflect.deleteProperty(HTMLCanvasElement.prototype, 'captureStream');
    if (originalModeSupport) Object.defineProperty(HTMLVideoElement.prototype, 'webkitSupportsPresentationMode', originalModeSupport);
    else Reflect.deleteProperty(HTMLVideoElement.prototype, 'webkitSupportsPresentationMode');
    if (originalSetMode) Object.defineProperty(HTMLVideoElement.prototype, 'webkitSetPresentationMode', originalSetMode);
    else Reflect.deleteProperty(HTMLVideoElement.prototype, 'webkitSetPresentationMode');
    if (originalMode) Object.defineProperty(HTMLVideoElement.prototype, 'webkitPresentationMode', originalMode);
    else Reflect.deleteProperty(HTMLVideoElement.prototype, 'webkitPresentationMode');
    if (originalRequestPictureInPicture) Object.defineProperty(HTMLVideoElement.prototype, 'requestPictureInPicture', originalRequestPictureInPicture);
    else Reflect.deleteProperty(HTMLVideoElement.prototype, 'requestPictureInPicture');
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {value: originalGetContext, configurable: true, writable: true});
    Object.defineProperty(HTMLMediaElement.prototype, 'play', {value: originalPlay, configurable: true, writable: true});
  });

  test('recovers from iOS Safari standard PiP rejection with the prefixed presentation mode', async () => {
    const context = {
      fillStyle: '', textAlign: '', font: '', fillRect: vi.fn(), fillText: vi.fn(), measureText: vi.fn(() => ({width: 0})),
    } as unknown as CanvasRenderingContext2D;
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      value: (kind: string) => kind === '2d' ? context : null,
    });
    const track = {stop: vi.fn()};
    const stream = {getTracks: () => [track], getVideoTracks: () => [track]} as unknown as MediaStream;
    Object.defineProperty(HTMLCanvasElement.prototype, 'captureStream', {configurable: true, value: vi.fn(() => stream)});

    let resolvePlay!: () => void;
    const play = vi.fn(() => new Promise<void>(resolve => {resolvePlay = resolve;}));
    Object.defineProperty(HTMLMediaElement.prototype, 'play', {configurable: true, value: play});
    let requests = 0;
    const setMode = vi.fn(function(this: SafariVideoTest, mode: string) {
      requests++;
      if (requests === 1) return;
      Object.defineProperty(this, 'webkitPresentationMode', {configurable: true, value: mode});
      this.dispatchEvent(new Event('webkitpresentationmodechanged'));
    });
    const standardRequest = vi.fn(() => Promise.reject(new Error('not ready')));
    Object.defineProperty(HTMLVideoElement.prototype, 'requestPictureInPicture', {configurable: true, value: standardRequest});
    Object.defineProperty(HTMLVideoElement.prototype, 'webkitSupportsPresentationMode', {configurable: true, value: () => false});
    Object.defineProperty(HTMLVideoElement.prototype, 'webkitSetPresentationMode', {configurable: true, value: setMode});
    Object.defineProperty(HTMLVideoElement.prototype, 'webkitPresentationMode', {configurable: true, value: 'inline'});

    const transport = {
      getSnapshot: () => ({position: 1, duration: 20}),
      subscribe: () => () => {},
      pause: vi.fn(), play: vi.fn(),
    } as unknown as ListeningTransport;
    render(<Harness transport={transport}/>);

    fireEvent.click(screen.getByRole('button', {name: 'Open'}));
    await waitFor(() => expect(setMode).toHaveBeenCalledWith('picture-in-picture'));
    expect(standardRequest).toHaveBeenCalled();
    expect(setMode.mock.calls.length).toBeGreaterThan(0);
    expect(play).toHaveBeenCalled();
    expect(screen.getByRole('button', {name: 'Opening'})).toBeInTheDocument();

    resolvePlay();
    await waitFor(() => expect(screen.getByRole('button', {name: 'Close'})).toBeInTheDocument());
    expect(setMode).toHaveBeenCalledWith('picture-in-picture');
  });
});

type SafariVideoTest = HTMLVideoElement & {
  webkitSupportsPresentationMode?: (mode: string) => boolean;
  webkitSetPresentationMode?: (mode: string) => void;
  webkitPresentationMode?: string;
};
