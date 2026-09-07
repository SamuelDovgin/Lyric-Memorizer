import { browserMode } from "../lib/browserLibrary";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ArrowLeft, ArrowRight, Clock3, Headphones, Maximize, Pause, Play, RotateCcw, Settings2, SkipBack, SkipForward, Shuffle, Repeat, Repeat1 } from "lucide-react";
import type { SectionOccurrence, Song } from "../types";
import { useRehearsalPlayer } from "../hooks/useRehearsalPlayer";
import { useListenCounts } from "../hooks/useListenCounts";
import { readLocal, writeLocal } from "../hooks/usePracticeStore";
import { ListenTracker } from "../lib/listenTracker";
import { activeLine, formatTime, getSections, usable } from "../lib/rehearsal";
import { api } from "../lib/api";
import { Drawer } from "../components/Drawer";
import { TimingEditor } from "../components/TimingEditor";
import { densityCandidates, pinsAtDensity } from "../lib/emojiDensity";
import { PinnedLyrics } from "../components/PinnedLyrics";
import type { RepeatMode } from "../lib/libraryQueue";
import { savedPractice, savePractice } from "../lib/savedPractice";
interface Props {
  autoPlay: boolean; shuffle: boolean; repeat: RepeatMode; queueBusy: boolean; queueError: string;
  onShuffle: () => void; onRepeat: () => void; onNextSong: () => void; onPreviousSong: () => void; onEnded: () => void;
  song: Song; minimized: boolean; resumeFocus: boolean; openRequest: number;
  onLibrary: () => void; onExpand: () => void; onUpdate: (song: Song) => void; onDelete: () => void;
}
export function PlayerPage({song, minimized, onLibrary, onExpand, onUpdate, onDelete, autoPlay, resumeFocus, openRequest, shuffle, repeat, queueBusy, queueError, onShuffle, onRepeat, onNextSong, onPreviousSong, onEnded}: Props) {
  const player = useRehearsalPlayer(song.originalUrl ? [song.originalUrl] : [song.vocalsUrl, song.instrumentalUrl].filter(Boolean) as string[], !song.originalUrl);
  const {transport} = player;
  const playing = player.status === "playing";
  const sections = useMemo(() => getSections(song), [song]);
  const eligible = useMemo(() => sections.filter(s => s.lineIds.every(id => {const line = song.lines.find(l => l.id === id); return line && usable(line); })), [sections, song]);
  const [loopId, setLoopId] = useState<string | null>(null);
  const loopSection = eligible.find(s => s.id === loopId);
  const saveProgress = useRef(() => {});
  saveProgress.current = () => {
    const position = transport.getSnapshot().position;
    writeLocal(`listening.position.${song.id}`, position);
    if (loopSection) savePractice(song, loopSection, position);
  };
  const tracker = useRef(new ListenTracker());
  const listens = useListenCounts(song.id);
  const countRef = useRef(listens.record); countRef.current = listens.record;
  const [drawer, setDrawer] = useState<"settings" | "timing" | null>(null);
  const [browsing, setBrowsing] = useState(false);
  const [fontSize, setFontSize] = useState(readLocal("listening.fontSize", 48));
  const [emojiDensity, setEmojiDensity] = useState(() => Math.max(0, Math.min(100, readLocal<number>(`listening.reviewedEmojiDensity.${song.id}`, 50))));
  const emojiCandidates = useMemo(() => densityCandidates(song), [song.lines, song.emojiPins]);
  const visiblePins = useMemo(() => pinsAtDensity(emojiCandidates, emojiDensity), [emojiCandidates, emojiDensity]);
  const [notice, setNotice] = useState("");
  const [geniusUrl, setGeniusUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const active = activeLine(song.lines, player.position);
  // Hold the preceding line through instrumental gaps rather than highlighting unsung lyrics early.
  const displayed = active >= 0 ? active : Math.max(0, song.lines.reduce((last, l, i) => usable(l) && l.start <= player.position ? i : last, -1));
  const currentSection = sections.find(s => s.lineIds.includes(song.lines[displayed]?.id));
  const positionKey = `listening.position.${song.id}`;
  const opened = useRef<{transport: typeof transport; request: number} | null>(null);
  useEffect(() => {
    if (opened.current?.transport === transport && opened.current.request === openRequest) return;
    opened.current = {transport, request: openRequest};
    tracker.current.reset();
    setBrowsing(false);
    const saved = resumeFocus && !autoPlay ? savedPractice(song) : null;
    if (saved) {
      setLoopId(saved.section.id);
      void transport.play(saved.position);
    } else if (autoPlay) {
      setLoopId(null);
      void transport.play(0);
    } else transport.seek(readLocal(positionKey, 0));
  }, [transport, openRequest, resumeFocus, autoPlay, song, positionKey]);
  const handledEnd = useRef(false);
  useEffect(() => {
    if (player.status !== "ended") { handledEnd.current = false; return; }
    if (handledEnd.current) return;
    handledEnd.current = true;
    if (loopSection) { tracker.current.reset(); setBrowsing(false); void transport.play(loopSection.start); }
    else if (repeat === "one") { tracker.current.reset(); setBrowsing(false); void transport.play(0); }
    else onEnded();
  }, [player.status, repeat, onEnded, transport, loopSection]);
  const loopRevision = useRef({songId: song.id, revision: song.alignmentRevision});
  useEffect(() => {
    if (loopRevision.current.songId !== song.id || loopRevision.current.revision !== song.alignmentRevision) {
      loopRevision.current = {songId: song.id, revision: song.alignmentRevision};
      setLoopId(null);
    }
  }, [song.id, song.alignmentRevision]);
  useEffect(() => {
    if (player.status !== "playing") return;
    if (!loopSection) { transport.setTransition(null); return; }
    // Schedule on the audio clock; recover if a suspended tab missed the boundary.
    if (player.position >= loopSection.end) {
      tracker.current.reset();
      transport.seek(loopSection.start);
      return;
    }
    transport.setTransition({id: loopSection.id, start: loopSection.start, exit: loopSection.end, gap: 0, clicks: []});
  }, [transport, loopSection, player.status, player.pass, player.position]);
  useEffect(() => { tracker.current.reset(); }, [song.alignmentRevision]);
  useEffect(() => {
    const unsubscribe = transport.subscribe(() => {
      const state = transport.getSnapshot();
      for (const id of tracker.current.sample(state.position, state.status === "playing" || state.status === "ended", eligible)) countRef.current(id);
    });
    return unsubscribe;
  }, [transport, eligible]);
  useEffect(() => {
    const save = () => saveProgress.current();
    const timer = setInterval(save, 1000);
    window.addEventListener("pagehide", save);
    return () => { save(); clearInterval(timer); window.removeEventListener("pagehide", save); };
  }, [transport, positionKey]);
  useEffect(() => {
    if (browsing || minimized) return;
    const container = stage.current;
    const line = container?.querySelector<HTMLElement>(`[data-line="${displayed}"]`);
    if (container && line) container.scrollTo({top: line.offsetTop - container.offsetTop - container.clientHeight * .38 + line.clientHeight / 2,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth"});
  }, [displayed, browsing, minimized, fontSize, emojiDensity]);
  const jump = (position: number) => { if (loopSection && (position < loopSection.start || position >= loopSection.end)) setLoopId(null); tracker.current.reset(); transport.seek(position); setBrowsing(false); setNotice(""); };
  const toggleSectionLoop = (section: SectionOccurrence) => {
    if (loopId !== section.id) savePractice(song, section, section.start);
    setLoopId(loopId === section.id ? null : section.id);
    tracker.current.reset();
    transport.seek(section.start);
    setBrowsing(false);
    setNotice("");
  };
  const loopButton = (section: SectionOccurrence) => <button className="section-loop" aria-label={`Loop ${section.name}`} aria-pressed={loopId === section.id}
    disabled={!eligible.some(s => s.id === section.id)} title={loopId === section.id ? "Turn loop off and jump to section" : "Loop and jump to section"}
    onClick={() => toggleSectionLoop(section)}><Repeat size={15}/><span>Loop</span></button>;
  const goLine = (index: number) => {
    const line = song.lines[index];
    if (!line || !usable(line)) { setNotice("This lyric needs timing before it can be used to jump. Open Timing to adjust it."); return; }
    jump(line.start);
  };
  const toggle = () => {
    if (playing || player.status === "loading") transport.pause();
    else { if (player.status === "ended") tracker.current.reset(); void transport.play(player.status === "ended" ? 0 : player.position); }
  };
  const actions = useRef({toggle, goLine}); actions.current = {toggle, goLine};
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey || (event.target as HTMLElement).closest('input, textarea, select, button, dialog')) return;
      if (event.key === " ") { event.preventDefault(); actions.current.toggle(); }
      if (event.key === "ArrowLeft") {event.preventDefault(); actions.current.goLine(Math.max(0, displayed - 1));}
      if (event.key === "ArrowRight") {event.preventDefault(); actions.current.goLine(Math.min(song.lines.length - 1, displayed + 1));}
    };
    window.addEventListener("keydown", keydown); return () => window.removeEventListener("keydown", keydown);
  }, [displayed, song.lines.length]);
  const map = <aside className="listening-map" aria-label="Song map">
    <div className="map-title"><Headphones size={18}/><div><b>{song.title}</b><small>{song.artist}</small></div></div>
    <div className="map-caption"><span>SONG SECTIONS</span><span>PLAYS</span></div>
    <nav aria-label="Song sections">{sections.map((section, i) => <div className="map-section" key={section.id}><button onClick={() => goLine(song.lines.findIndex(l => l.id === section.lineIds[0]))}
      className={section.id === currentSection?.id ? "active" : ""} aria-current={section.id === currentSection?.id ? "true" : undefined}>
      <span className="map-index">{String(i + 1).padStart(2, "0")}</span><span className="map-name">{section.name}<small>{formatTime(section.start)}</small></span>
      <span className="play-count" aria-label={`${listens.counts[section.lineIds[0]] ?? 0} plays`}>{listens.counts[section.lineIds[0]] ?? 0}</span>
    </button>{loopButton(section)}</div>)}</nav>
    <p className="map-note">Lifetime completed listens. Listen through at least 90% of a section to add a play. Skipping ahead doesn’t count.</p>
  </aside>;
  if (minimized) return <div className="mini-player"><button className="mini-title" onClick={onExpand}><Headphones/><span><b>{song.title}</b><small>{formatTime(player.position)} · Open lyrics</small></span></button><button className="icon-button" aria-label={playing ? "Pause" : "Play"} onClick={toggle}>{playing ? <Pause/> : <Play/>}</button></div>;
  return <div className="listening-room" ref={root}>
    <header className="listening-header"><button className="icon-button" onClick={() => {saveProgress.current(); onLibrary();}} aria-label="Back to library"><ArrowLeft size={20}/></button>
      <div className="player-title"><b>{song.title}</b><span>{song.artist || "Your recording"}</span></div><span className="listening-badge">JUST LISTEN</span>
      <button className="icon-button" aria-label="Settings" onClick={() => setDrawer("settings")}><Settings2 size={20}/></button>
      <button className="icon-button" aria-label="Fullscreen" onClick={() => void (document.fullscreenElement ? document.exitFullscreen() : root.current?.requestFullscreen())?.catch(() => setNotice("Fullscreen unavailable."))}><Maximize size={19}/></button>
    </header>
    <div className="listening-content">{map}<main className="listening-center">
      <div className="stage-heading"><span>{currentSection?.name ?? "YOUR LYRICS"}</span><button className="subtle-button" onClick={() => setDrawer("timing")}><Clock3 size={14}/> Timing</button></div>
      <div className="listening-lyrics" ref={stage} onWheel={() => setBrowsing(true)} onTouchMove={() => setBrowsing(true)} style={{"--lyric-size": `${fontSize}px`} as CSSProperties}>
        {song.lines.map((line, i) => <div data-line={i} key={line.id} className={`listening-line ${i === displayed ? "is-current" : ""} ${i < displayed ? "is-past" : ""}`}>
          {sections.filter(s => s.lineIds[0] === line.id).map(s => <div className="verse-heading" key={s.id}><span className="verse-label">{s.name}</span>{loopButton(s)}</div>)}
          <button onClick={() => goLine(i)} aria-label={`Go to line ${i + 1}: ${line.text}`}><PinnedLyrics line={line} pins={visiblePins}/></button>
        </div>)}
        {!song.lines.length && <p>Lyrics will appear here when your recording is ready.</p>}
      </div>
      {browsing && <button className="follow-button" onClick={() => setBrowsing(false)}>Follow lyrics <ArrowRight size={15}/></button>}
      <div className="stage-status" role="status">{player.error || queueError || notice || listens.error || (loopSection ? `Looping ${loopSection.name}. Click its loop button to turn it off.` : "") || (!song.lines.some(usable) ? "Lyrics are readable. Add line timing for synchronized scrolling." : "Click any section or lyric to jump. Your music keeps flowing.")}</div>
    </main></div>
    <footer className="listening-footer"><div className="scrubber"><span>{formatTime(player.position)}</span><input type="range" aria-label="Song position" min={0} max={player.duration || song.duration || 1} step=".01" value={player.position} onChange={e => jump(Number(e.target.value))}/><span>{formatTime(player.duration || song.duration)}</span></div>
      <div className="listening-controls">
        <button className="icon-button" aria-label={shuffle ? "Shuffle on" : "Shuffle off"} aria-pressed={shuffle} title="Shuffle library songs" onClick={onShuffle}><Shuffle size={20}/></button>
        <button className="icon-button" aria-label="Previous song" title="Previous song" disabled={queueBusy} onClick={onPreviousSong}><SkipBack size={22}/></button>
        <button className="play-button" aria-label={playing ? "Pause" : "Play"} onClick={toggle}>{playing ? <Pause fill="currentColor"/> : <Play fill="currentColor"/>}</button>
        <div className="emoji-density-control" title={emojiCandidates.length ? `Confidence cutoff: ${visiblePins.length ? (visiblePins.at(-1) as {confidence?: number})?.confidence ?? "unscored" : "none"}/100. Slide right to include weaker reviewed cues.` : "No reviewed pins yet. Run the lyric-emoji-pins skill for this song."}>
          <label htmlFor={`emoji-density-${song.id}`}>Emojis <span>{visiblePins.length}/{emojiCandidates.length}</span></label>
          <input id={`emoji-density-${song.id}`} aria-label="Emoji density" type="range" min="0" max="100" step="1" value={emojiDensity} disabled={!emojiCandidates.length}
            aria-valuetext={`${visiblePins.length} of ${emojiCandidates.length} reviewed pins`}
            onChange={event => {const value = Number(event.target.value); setEmojiDensity(value); writeLocal(`listening.reviewedEmojiDensity.${song.id}`, value);}}/>
        </div>
        <button className="icon-button" aria-label="Next song" title="Next song" disabled={queueBusy} onClick={onNextSong}><SkipForward size={22}/></button>
        <button className="icon-button" aria-label={`Repeat ${repeat}`} aria-pressed={repeat !== "off"} title={repeat === "off" ? "Repeat off — click to repeat library" : repeat === "all" ? "Repeat library — click to loop this song" : "Loop this song — click to turn repeat off"} onClick={onRepeat}>{repeat === "one" ? <Repeat1 size={20}/> : <Repeat size={20}/>}</button>
        <button className="subtle-button restart-song" onClick={() => jump(0)}><RotateCcw size={16}/> From beginning</button>
      </div>
    </footer>
    {drawer && <Drawer title={drawer === "timing" ? "Timing & sections" : "Listening settings"} onClose={() => setDrawer(null)}>
      {drawer === "timing" ? <><button className="button secondary" onClick={toggle}>{playing ? "Pause" : "Play"}</button><TimingEditor key={song.alignmentRevision} song={song} position={player.position} onSeek={jump} onSave={onUpdate}/></> : <div className="settings-form">
        <label>Lyric size<input type="range" min={28} max={72} value={fontSize} onChange={e => {setFontSize(Number(e.target.value)); writeLocal("listening.fontSize", Number(e.target.value));}}/></label>
        {!browserMode && <><h3>Section headings from Genius</h3><p>Match human-written verse and chorus headings to your existing lyrics. Your words and timing stay intact.</p>
        <label>Genius song URL<input type="url" placeholder="https://genius.com/…-lyrics" value={geniusUrl} onChange={e => setGeniusUrl(e.target.value)}/></label>
        <button className="button secondary" disabled={busy} onClick={async () => {setBusy(true); try {onUpdate(await api.geniusSections(song.id, {url: geniusUrl, title: song.title, artist: song.artist, revision: song.alignmentRevision ?? 0})); setNotice("Genius section headings applied.");} catch(e) {setNotice(String(e));} finally {setBusy(false);}}}>{busy ? "Matching sections…" : "Get Genius sections"}</button>
        <small>Paste a song link, or leave it blank to search Genius by title and artist. No API token is required.</small>
        <p role="status">{notice}</p>
        <button className="button secondary" disabled={busy} onClick={async () => {setBusy(true); try {const {jobId} = await api.startAlignment(song.id); let job; do {await new Promise(r => setTimeout(r, 1000)); job = await api.job(jobId);} while (job.status !== "COMPLETE" && job.status !== "FAILED"); if(job.status === "FAILED") throw new Error(job.message); onUpdate(await api.song(song.id)); setNotice("Line timing updated.");} catch(e) {setNotice(String(e));} finally {setBusy(false);}}}>Find line sync</button></>}
        <button className="danger-link" onClick={async () => {if (!confirm(`Remove “${song.title}” from this device?`)) return; try {await api.deleteSong(song.id); transport.pause(); onDelete();} catch(e) {setNotice(String(e));}}}>Remove song</button>
      </div>}
    </Drawer>}
  </div>;
}
