import { useEffect, useRef, useState } from 'react';
import type { Song } from '../types';
import type { ListeningTransport } from '../audio/listeningTransport';
import { activeLine, usable } from '../lib/rehearsal';

type SafariVideo = HTMLVideoElement & {
  webkitSupportsPresentationMode?: (mode: string) => boolean;
  webkitSetPresentationMode?: (mode: string) => void;
  webkitPresentationMode?: string;
};

export function useFloatingLyrics(song: Song, transport: ListeningTransport, practice: string | undefined) {
  const [floating, setFloating] = useState(false);
  const [busy, setBusy] = useState(false);
  const latest = useRef({song, practice}); latest.current = {song, practice};
  const cleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => { cleanup.current?.(); cleanup.current = null; }, [transport]);
  const open = async () => {
    if (cleanup.current) { cleanup.current(); cleanup.current = null; return; }
    const canvas = document.createElement('canvas');
    const video = document.createElement('video') as SafariVideo;
    if (!canvas.captureStream || (!video.requestPictureInPicture && !video.webkitSetPresentationMode)) {
      throw new Error('Floating lyrics are unavailable in this browser. Try Safari on iPhone or Chrome on Android.');
    }
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser cannot create the lyrics video.');
    setBusy(true);
    canvas.width = 960; canvas.height = 540;
    const draw = () => {
      const {song, practice} = latest.current;
      const state = transport.getSnapshot();
      let index = activeLine(song.lines, state.position);
      if (index < 0) index = Math.max(0, song.lines.reduce((last, line, i) => usable(line) && line.start <= state.position ? i : last, -1));
      context.fillStyle = '#10151d'; context.fillRect(0, 0, 960, 540);
      context.textAlign = 'left'; context.fillStyle = '#a5b7cc'; context.font = '24px system-ui';
      context.fillText(song.title, 44, 48, 872);
      context.fillStyle = '#9fe2cb'; context.font = '22px system-ui';
      context.fillText(practice ? `PRACTICE · ${practice}` : song.lines[index]?.section || 'LYRICS', 44, 92, 872);
      const text = song.lines[index]?.text || 'Add lyrics to this song to follow along.';
      let lines: string[] = [];
      let size = 50;
      do {
        context.font = `600 ${size}px system-ui`; lines = [''];
        for (const word of text.split(/\s+/)) {
          const last = lines.length - 1;
          if (lines[last] && context.measureText(`${lines[last]} ${word}`).width > 872) lines.push(word);
          else lines[last] += `${lines[last] ? ' ' : ''}${word}`;
        }
        if (lines.length * size * 1.25 <= 300 || size <= 18) break;
        size -= 2;
      } while (true);
      context.fillStyle = '#ffffff';
      lines.forEach((line, i) => context.fillText(line, 44, 155 + i * size * 1.25, 872));
      context.font = '24px system-ui'; context.fillStyle = '#a5b7cc';
      context.fillText(`Next: ${song.lines[index + 1]?.text ?? 'End of lyrics'}`, 44, 490, 872);
      context.fillStyle = '#9fe2cb';
      context.fillRect(0, 530, 960 * Math.min(1, state.position / (state.duration || 1)), 10);
    };
    draw();
    const stream = canvas.captureStream(4);
    video.srcObject = stream;
    video.muted = true; video.playsInline = true;
    video.setAttribute('aria-hidden', 'true');
    video.style.cssText = 'position:fixed;width:1px;height:1px;bottom:0;left:0;opacity:0;pointer-events:none';
    document.body.append(video);
    const unsubscribe = transport.subscribe(draw);
    const timer = setInterval(draw, 250);
    let closed = false;
    let entered = false;
    video.addEventListener('pause', () => {
      if (entered && !closed) transport.pause();
    });
    video.addEventListener('play', () => {
      if (entered && !closed && !['playing', 'loading'].includes(transport.getSnapshot().status)) void transport.play();
    });
    const close = () => {
      if (closed) return; closed = true;
      unsubscribe(); clearInterval(timer);
      if (document.pictureInPictureElement === video) void document.exitPictureInPicture().catch(() => {});
      if (video.webkitPresentationMode === 'picture-in-picture') video.webkitSetPresentationMode?.('inline');
      video.pause(); video.srcObject = null; stream.getTracks().forEach(track => track.stop()); video.remove();
      cleanup.current = null; setFloating(false); setBusy(false);
    };
    cleanup.current = close;
    video.addEventListener('leavepictureinpicture', close);
    video.addEventListener('webkitpresentationmodechanged', () => {
      if (video.webkitPresentationMode === 'inline') close();
    });
    try {
      await video.play();
      if (closed) return;
      if (video.requestPictureInPicture && document.pictureInPictureEnabled) await video.requestPictureInPicture();
      else if (video.webkitSupportsPresentationMode?.('picture-in-picture')) video.webkitSetPresentationMode?.('picture-in-picture');
      else throw new Error('unavailable');
      if (!closed) { entered = true; setFloating(true); }
    } catch {
      close();
      throw new Error('This browser could not open floating lyrics. On iPhone, open the site in Safari rather than the Home Screen app. Audio can still play in the background.');
    } finally { setBusy(false); }
  };
  return {floating, busy, open};
}
