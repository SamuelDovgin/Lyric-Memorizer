import { useEffect, useRef, useState } from 'react';
import type { Song } from '../types';
import type { ListeningTransport } from '../audio/listeningTransport';
import { activeLine, usable } from '../lib/rehearsal';

const VIDEO_WIDTH = 960;
const VIDEO_HEIGHT = 540;
const CAPTURE_RATE = 4;

type SafariVideo = HTMLVideoElement & {
  webkitSupportsPresentationMode?: (mode: string) => boolean;
  webkitSetPresentationMode?: (mode: string) => void;
  webkitPresentationMode?: string;
};

type CaptureSurface = {
  canvas: HTMLCanvasElement;
  present: () => void;
  dispose: () => void;
};

function hasWebkitPictureInPicture(video: SafariVideo) {
  // Do not call webkitSupportsPresentationMode() yet. On regular iOS Safari
  // some versions report false until the video has a MediaStream source.
  return typeof video.webkitSetPresentationMode === 'function';
}

/**
 * iOS WebKit has historically been unreliable when a video plays directly
 * from a 2D canvas capture. Paint the lyrics in 2D, then present that bitmap
 * through a WebGL canvas so the captured surface stays in the compositor.
 */
function createWebglSurface(source: HTMLCanvasElement): CaptureSurface | null {
  const canvas = document.createElement('canvas');
  canvas.width = VIDEO_WIDTH;
  canvas.height = VIDEO_HEIGHT;
  let gl: WebGLRenderingContext | null = null;
  try {
    gl = (canvas.getContext('webgl2', {preserveDrawingBuffer: true})
      || canvas.getContext('webgl', {preserveDrawingBuffer: true})) as WebGLRenderingContext | null;
  } catch {
    return null;
  }
  if (!gl) return null;

  const vertexSource = `
    attribute vec2 position;
    attribute vec2 texCoord;
    varying vec2 uv;
    void main() {
      gl_Position = vec4(position, 0.0, 1.0);
      uv = texCoord;
    }
  `;
  const fragmentSource = `
    precision mediump float;
    uniform sampler2D frame;
    varying vec2 uv;
    void main() {
      gl_FragColor = texture2D(frame, uv);
    }
  `;
  const compile = (type: number, code: string) => {
    const shader = gl!.createShader(type);
    if (!shader) return null;
    gl!.shaderSource(shader, code);
    gl!.compileShader(shader);
    if (!gl!.getShaderParameter(shader, gl!.COMPILE_STATUS)) {
      gl!.deleteShader(shader);
      return null;
    }
    return shader;
  };
  const vertex = compile(gl.VERTEX_SHADER, vertexSource);
  const fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
  if (!vertex || !fragment) return null;
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;

  const position = gl.getAttribLocation(program, 'position');
  const texCoord = gl.getAttribLocation(program, 'texCoord');
  const frame = gl.getUniformLocation(program, 'frame');
  const buffer = gl.createBuffer();
  const texture = gl.createTexture();
  if (position < 0 || texCoord < 0 || !frame || !buffer || !texture) return null;

  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1, 0, 0,
     1, -1, 1, 0,
    -1,  1, 0, 1,
     1,  1, 1, 1,
  ]), gl.STATIC_DRAW);
  gl.useProgram(program);
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 16, 0);
  gl.enableVertexAttribArray(texCoord);
  gl.vertexAttribPointer(texCoord, 2, gl.FLOAT, false, 16, 8);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.uniform1i(frame, 0);

  return {
    canvas,
    present: () => {
      gl!.viewport(0, 0, VIDEO_WIDTH, VIDEO_HEIGHT);
      gl!.activeTexture(gl!.TEXTURE0);
      gl!.bindTexture(gl!.TEXTURE_2D, texture);
      gl!.pixelStorei(gl!.UNPACK_FLIP_Y_WEBGL, true);
      gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA, gl!.RGBA, gl!.UNSIGNED_BYTE, source);
      gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4);
      gl!.flush();
    },
    dispose: () => {
      gl!.deleteTexture(texture);
      gl!.deleteBuffer(buffer);
      gl!.deleteProgram(program);
      gl!.deleteShader(vertex);
      gl!.deleteShader(fragment);
    },
  };
}

function waitForWebkitPictureInPicture(video: SafariVideo, retryAfterPlayback: Promise<unknown>) {
  if (video.webkitPresentationMode === 'picture-in-picture') return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    let timer = 0;
    const changed = () => {
      if (video.webkitPresentationMode === 'picture-in-picture') finish();
    };
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      if (timer) window.clearTimeout(timer);
      video.removeEventListener('webkitpresentationmodechanged', changed);
      if (error) reject(error);
      else resolve();
    };
    const request = (checkSupport: boolean) => {
      if (settled || video.webkitPresentationMode === 'picture-in-picture') { finish(); return; }
      if (checkSupport && video.webkitSupportsPresentationMode?.('picture-in-picture') === false) {
        finish(new Error('unavailable'));
        return;
      }
      try {
        video.webkitSetPresentationMode?.('picture-in-picture');
        changed();
      } catch (error) {
        finish(error instanceof Error ? error : new Error('unavailable'));
      }
    };
    video.addEventListener('webkitpresentationmodechanged', changed);
    timer = window.setTimeout(() => finish(video.webkitPresentationMode === 'picture-in-picture' ? undefined : new Error('unavailable')), 1500);
    // Request in the original tap turn, then retry once the MediaStream video
    // has a playable frame. iOS Safari may ignore the first call at readyState
    // 0, but accepts the retry from the same play operation.
    request(false);
    void retryAfterPlayback.then(() => request(true), error => finish(error instanceof Error ? error : new Error('unavailable')));
  });
}

export function useFloatingLyrics(song: Song, transport: ListeningTransport, practice: string | undefined) {
  const [floating, setFloating] = useState(false);
  const [busy, setBusy] = useState(false);
  const latest = useRef({song, practice}); latest.current = {song, practice};
  const cleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => { cleanup.current?.(); cleanup.current = null; }, [transport]);

  const open = async () => {
    if (cleanup.current) { cleanup.current(); cleanup.current = null; return; }

    const source = document.createElement('canvas');
    source.width = VIDEO_WIDTH;
    source.height = VIDEO_HEIGHT;
    const context = source.getContext('2d');
    const video = document.createElement('video') as SafariVideo;
    const webkitPip = hasWebkitPictureInPicture(video);
    const standardPip = typeof video.requestPictureInPicture === 'function'
      && document.pictureInPictureEnabled !== false
      // Prefer WebKit's presentation-mode path whenever it exists. It is the
      // reliable iOS path and lets the ready-state probe reject PWAs below.
      && !webkitPip;
    if (!HTMLCanvasElement.prototype.captureStream || (!webkitPip && !standardPip)) {
      throw new Error('Floating lyrics are unavailable in this browser. Try Safari on iPhone or Chrome on Android.');
    }
    if (!context) throw new Error('This browser cannot create the lyrics video.');

    setBusy(true);
    // WebKit needs the media element and capture surface to remain rendered;
    // display:none, opacity:0, or an offscreen element can make PiP reject it.
    const webglSurface = webkitPip ? createWebglSurface(source) : null;
    const captureCanvas = webglSurface?.canvas ?? source;
    captureCanvas.setAttribute('aria-hidden', 'true');
    captureCanvas.style.cssText = 'position:fixed;width:2px;height:2px;top:0;left:0;opacity:0.01;pointer-events:none;z-index:2147483647';
    document.body.append(captureCanvas);

    const draw = () => {
      const {song, practice} = latest.current;
      const state = transport.getSnapshot();
      let index = activeLine(song.lines, state.position);
      if (index < 0) index = Math.max(0, song.lines.reduce((last, line, i) => usable(line) && line.start <= state.position ? i : last, -1));
      context.fillStyle = '#10151d'; context.fillRect(0, 0, VIDEO_WIDTH, VIDEO_HEIGHT);
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
      context.fillRect(0, 530, VIDEO_WIDTH * Math.min(1, state.position / (state.duration || 1)), 10);
      webglSurface?.present();
    };
    draw();

    let stream: MediaStream;
    try {
      stream = captureCanvas.captureStream(CAPTURE_RATE);
    } catch {
      webglSurface?.dispose();
      captureCanvas.remove();
      setBusy(false);
      throw new Error('This browser could not create the lyrics video. On iPhone, open the site in Safari rather than the Home Screen app.');
    }
    // The first draw above happened before the stream existed. Draw once
    // after captureStream() too so WebKit has a frame before PiP is requested.
    draw();
    if (!stream.getVideoTracks().length) {
      stream.getTracks().forEach(track => track.stop());
      webglSurface?.dispose();
      captureCanvas.remove();
      setBusy(false);
      throw new Error('This browser could not create the lyrics video. On iPhone, open the site in Safari rather than the Home Screen app.');
    }

    video.srcObject = stream;
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;
    video.setAttribute('autoplay', '');
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.setAttribute('aria-hidden', 'true');
    video.width = VIDEO_WIDTH;
    video.height = VIDEO_HEIGHT;
    video.disablePictureInPicture = false;
    video.style.cssText = 'position:fixed;width:2px;height:2px;top:0;left:0;opacity:0.01;pointer-events:none;z-index:2147483647';
    document.body.append(video);

    const unsubscribe = transport.subscribe(draw);
    const timer = window.setInterval(draw, 250);
    let closed = false;
    let entered = false;
    const onPause = () => {
      if (entered && !closed) transport.pause();
    };
    const onPlay = () => {
      if (entered && !closed && !['playing', 'loading'].includes(transport.getSnapshot().status)) void transport.play();
    };
    const close = () => {
      if (closed) return;
      closed = true;
      unsubscribe();
      window.clearInterval(timer);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('leavepictureinpicture', close);
      video.removeEventListener('webkitpresentationmodechanged', onPresentationModeChanged);
      if (document.pictureInPictureElement === video) void document.exitPictureInPicture?.().catch(() => {});
      if (video.webkitPresentationMode === 'picture-in-picture') video.webkitSetPresentationMode?.('inline');
      video.pause();
      video.srcObject = null;
      stream.getTracks().forEach(track => track.stop());
      video.remove();
      if (captureCanvas !== source) source.remove();
      captureCanvas.remove();
      webglSurface?.dispose();
      cleanup.current = null;
      setFloating(false);
      setBusy(false);
    };
    const onPresentationModeChanged = () => {
      if (entered && video.webkitPresentationMode === 'inline') close();
    };
    cleanup.current = close;
    video.addEventListener('pause', onPause);
    video.addEventListener('play', onPlay);
    video.addEventListener('leavepictureinpicture', close);
    video.addEventListener('webkitpresentationmodechanged', onPresentationModeChanged);

    try {
      // Keep both calls in the click handler's activation turn. Waiting for
      // video.play() first loses transient user activation on iOS Safari.
      const playPromise = Promise.resolve(video.play());
      const pictureInPicturePromise = webkitPip
        ? waitForWebkitPictureInPicture(video, playPromise)
        // Chromium requires the stream to be playing before its standard
        // request resolves. Safari iOS takes the prefixed branch above, where
        // the presentation-mode call remains in the user-gesture turn.
        : playPromise.then(() => video.requestPictureInPicture!());
      await Promise.all([playPromise, pictureInPicturePromise]);
      if (closed) return;
      entered = true;
      setFloating(true);
    } catch {
      close();
      throw new Error('This browser could not open floating lyrics. On iPhone, open the site in Safari rather than the Home Screen app. Audio can still play in the background.');
    } finally {
      setBusy(false);
    }
  };
  return {floating, busy, open};
}
