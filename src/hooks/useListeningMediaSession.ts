import { useEffect, useRef } from 'react';
import type { Song } from '../types';
import type { ListeningTransport } from '../audio/listeningTransport';

export function useListeningMediaSession(song: Song, transport: ListeningTransport, next: () => void, previous: () => void) {
  const actions = useRef({next, previous}); actions.current = {next, previous};
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const session = navigator.mediaSession;
    session.metadata = new MediaMetadata({title: song.title, artist: song.artist || 'Lyric Memorizer'});
    const handlers: Partial<Record<MediaSessionAction, MediaSessionActionHandler>> = {
      play: () => { void transport.play(); }, pause: () => transport.pause(),
      nexttrack: () => actions.current.next(), previoustrack: () => actions.current.previous(),
      seekto: event => { if (event.seekTime !== undefined) transport.seek(event.seekTime); },
      seekbackward: event => transport.seekBy(-(event.seekOffset ?? 10)),
      seekforward: event => transport.seekBy(event.seekOffset ?? 10),
    };
    for (const [action, handler] of Object.entries(handlers)) try { session.setActionHandler(action as MediaSessionAction, handler!); } catch { /* optional browser action */ }
    const update = () => {
      const state = transport.getSnapshot();
      session.playbackState = state.status === 'playing' ? 'playing' : 'paused';
      if (state.duration > 0 && session.setPositionState) try {
        session.setPositionState({duration: state.duration, playbackRate: 1, position: Math.max(0, Math.min(state.duration, state.position))});
      } catch { /* position reporting is optional */ }
    };
    update(); const unsubscribe = transport.subscribe(update);
    return () => {
      unsubscribe();
      for (const action of Object.keys(handlers)) try { session.setActionHandler(action as MediaSessionAction, null); } catch { /* optional browser action */ }
      session.metadata = null; session.playbackState = 'none';
    };
  }, [song.id, song.title, song.artist, transport]);
}
