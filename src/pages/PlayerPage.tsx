import { AlignmentOptions } from "../components/AlignmentOptions";
import { useFloatingLyrics } from "../hooks/useFloatingLyrics";
import { useListeningMediaSession } from "../hooks/useListeningMediaSession";
import { browserMode } from "../lib/browserLibrary";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ArrowLeft, ArrowRight, Clock3, Headphones, Maximize, Pause, Play, RotateCcw, Settings2, SkipBack, SkipForward, Shuffle, Repeat, Repeat1 } from "lucide-react";
import type { SectionOccurrence, Song } from "../types";
import { useListeningPlayer } from "../hooks/useListeningPlayer";
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
  const player = useListeningPlayer(song.originalUrl ? [song.originalUrl] : [song.vocalsUrl, song.instrumentalUrl].filter(Boolean) as string[]);
  const {transport} = player;
  const playing = player.status === "playing";
  const sections = useMemo(() => getSections(song), [song]);
  const timingReview = song.lines.filter(line => !line.verified && line.timingQuality === "needs_review").length;
  const missingTiming = song.lines.filter(line => !usable(line)).length;
  const processingPercent = Math.round(Math.max(0, Math.min(1, song.processingProgress ?? 0)) * 100);
  const processingMessage = song.processingMessage || song.statusMessage || "Waiting to start";
  const eligible = useMemo(() => sections.filter(s => s.lineIds.every(id => {const line = song.lines.find(l => l.id === id); return line && usable(line); })), [sections, song]);
  const [loopId, setLoopId] = useState<string | null>(null);
  const [practiceRange, setPracticeRange] = useState<[number, number] | null>(null);
  const [chunkSize, setChunkSize] = useState(2);
  const loopParent = eligible.find(s => s.id === loopId);
  const loopSection = useMemo(() => {
    if (!loopParent || !practiceRange) return loopParent;
    const lineIds = loopParent.lineIds.slice(practiceRange[0], practiceRange[1] + 1);
    const first = song.lines.find(l => l.id === lineIds[0]);
    const last = song.lines.find(l => l.id === lineIds.at(-1));
    return first && last ? {...loopParent, lineIds, start: first.start, end: last.end,
      name: `${loopParent.name} · lines ${practiceRange[0] + 1}–${practiceRange[1] + 1}`} : loopParent;
  }, [loopParent, practiceRange, song.lines]);
  const floatingLyrics = useFloatingLyrics(song, transport, loopSection?.name);
  useListeningMediaSession(song, transport, onNextSong, onPreviousSong);
  const saveProgress = useRef(() => {});
  saveProgress.current = () => {
    const position = transport.getSnapshot().position;
    writeLocal(`listening.position.${song.id}`, position);
    if (loopParent) savePractice(song, loopParent, position, practiceRange, chunkSize);
  };
  const tracker = useRef(new ListenTracker());
  const listens = useListenCounts(song.id);
  const countRef = useRef(listens.record); countRef.current = listens.record;
  const [drawer, setDrawer] = useState<"settings" | "timing" | "practice" | null>(null);
  const [browsing, setBrowsing] = useState(false);
  const [fontSize, setFontSize] = useState(readLocal("listening.fontSize", 48));
  const [showEmojis, setShowEmojis] = useState(() => readLocal("listening.showEmojis", false));
  const [emojiDensity, setEmojiDensity] = useState(() => Math.max(0, Math.min(100, readLocal<number>(`listening.reviewedEmojiDensity.${song.id}`, 50))));
  const emojiCandidates = useMemo(() => densityCandidates(song), [song.lines, song.emojiPins]);
  const visiblePins = useMemo(() => showEmojis ? pinsAtDensity(emojiCandidates, emojiDensity) : [], [emojiCandidates, emojiDensity, showEmojis]);
  const [notice, setNotice] = useState("");
  const [geniusUrl, setGeniusUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const sectionMap = useRef<HTMLElement>(null);
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
      setPracticeRange(saved.range);
      setChunkSize(saved.chunkSize);
      void transport.play(saved.position);
    } else if (autoPlay) {
      setLoopId(null); setPracticeRange(null);
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
      setLoopId(null); setPracticeRange(null);
    }
  }, [song.id, song.alignmentRevision]);
  useEffect(() => {
    transport.setTransition(loopSection ? {id: loopSection.id, start: loopSection.start, exit: loopSection.end, gap: 0, clicks: []} : null);
  }, [transport, loopSection]);
  useEffect(() => { transport.setRepeat(repeat === "one"); }, [transport, repeat]);
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
  }, [displayed, browsing, minimized, fontSize, emojiDensity, showEmojis]);
  useEffect(() => {
    const currentId = currentSection?.id;
    const map = sectionMap.current;
    if (!currentId || !map) return;
    const button = Array.from(map.querySelectorAll<HTMLButtonElement>(".map-section > button:first-child"))
      .find(candidate => candidate.dataset.sectionId === currentId);
    if (!button || typeof button.scrollIntoView !== "function") return;
    button.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
      block: "center",
      inline: "center",
    });
  }, [currentSection?.id, minimized, sections.length, song.id]);
  const jump = (position: number) => { if (loopSection && (position < loopSection.start || position >= loopSection.end)) { setLoopId(null); setPracticeRange(null); } tracker.current.reset(); transport.seek(position); setBrowsing(false); setNotice(""); };
  const toggleSectionLoop = (section: SectionOccurrence) => {
    setPracticeRange(null);
    if (loopId !== section.id) savePractice(song, section, section.start);
    setLoopId(loopId === section.id ? null : section.id);
    tracker.current.reset();
    transport.seek(section.start);
    setBrowsing(false);
    setNotice("");
  };
  const practiceSection = loopParent ?? currentSection;
  const startPractice = (from: number, to: number, size = chunkSize) => {
    if (!practiceSection || !eligible.some(s => s.id === practiceSection.id)) return;
    const range: [number, number] = [from, Math.min(to, practiceSection.lineIds.length - 1)];
    const first = song.lines.find(l => l.id === practiceSection.lineIds[from]);
    if (!first) return;
    transport.setTransition(null);
    setLoopId(practiceSection.id);
    setPracticeRange(range);
    savePractice(song, practiceSection, first.start, range, size);
    tracker.current.reset();
    transport.seek(first.start);
    setBrowsing(false);
    setNotice("");
    setDrawer(null);
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
  const floatingButton = <button className="subtle-button floating-lyrics-button" disabled={floatingLyrics.busy} aria-pressed={floatingLyrics.floating}
    onClick={() => { void floatingLyrics.open().catch(error => setNotice(error.message)); }}>{floatingLyrics.busy ? "Opening lyrics…" : floatingLyrics.floating ? "Close floating lyrics" : "Floating lyrics"}</button>;
  const map = <aside className="listening-map" aria-label="Song map" ref={sectionMap}>
    <div className="map-title"><Headphones size={18}/><div><b>{song.title}</b><small>{song.artist}</small></div></div>
    <div className="map-caption"><span>SONG SECTIONS</span><span>PLAYS</span></div>
    <nav aria-label="Song sections">{sections.map((section, i) => <div className="map-section" key={section.id}><button data-section-id={section.id} onClick={() => goLine(song.lines.findIndex(l => l.id === section.lineIds[0]))}
      className={section.id === currentSection?.id ? "active" : ""} aria-current={section.id === currentSection?.id ? "true" : undefined}>
      <span className="map-index">{String(i + 1).padStart(2, "0")}</span><span className="map-name">{section.name}<small>{formatTime(section.start)}</small></span>
      <span className="play-count" aria-label={`${listens.counts[section.lineIds[0]] ?? 0} plays`}>{listens.counts[section.lineIds[0]] ?? 0}</span>
    </button>{loopButton(section)}</div>)}</nav>
    <p className="map-note">Lifetime completed listens. Listen through at least 90% of a section to add a play. Skipping ahead doesn’t count.</p>
  </aside>;
  if (minimized) return <div className="mini-player">{floatingButton}<button className="mini-title" onClick={onExpand}><Headphones/><span><b>{song.title}</b><small>{formatTime(player.position)} · Open lyrics</small></span></button><button className="icon-button" aria-label={playing ? "Pause" : "Play"} onClick={toggle}>{playing ? <Pause/> : <Play/>}</button>{notice && <p className="mini-notice" role="status">{notice}</p>}</div>;
  return <div className="listening-room" ref={root}>
    <header className="listening-header"><button className="icon-button" onClick={() => {saveProgress.current(); onLibrary();}} aria-label="Back to library"><ArrowLeft size={20}/></button>
      <div className="player-title"><b>{song.title}</b><span>{song.artist || "Your recording"}</span></div><span className="listening-badge">JUST LISTEN</span>
      <button className="icon-button" aria-label="Settings" onClick={() => setDrawer("settings")}><Settings2 size={20}/></button>
      <button className="icon-button" aria-label="Fullscreen" onClick={() => void (document.fullscreenElement ? document.exitFullscreen() : root.current?.requestFullscreen())?.catch(() => setNotice("Fullscreen unavailable."))}><Maximize size={19}/></button>
    </header>
    {song.status === "PROCESSING" && <div className="player-processing" role="status">
      <div><strong>Preparing synchronized lyrics · {processingPercent}%</strong><span>{processingMessage}</span></div>
      <i><b style={{width: `${Math.max(3, processingPercent)}%`}} /></i>
      <small>You can listen now. Timing updates here as the local Whisper job progresses.</small>
    </div>}
    <div className="listening-content">{map}<main className="listening-center">
      <div className="stage-heading">{floatingButton}<span>{currentSection?.name ?? "YOUR LYRICS"}</span><button className="subtle-button" onClick={() => setDrawer("timing")}><Clock3 size={14}/> Timing</button></div>
      {timingReview > 0 && <p className="timing-coverage" role="status">{timingReview} lines need a listening check. Previous timing may still be used. <button className="subtle-button" onClick={() => setDrawer("timing")}>Review flagged lines</button></p>}
      {missingTiming > 0 && <div className="timing-coverage" role="status">{missingTiming} of {song.lines.length} lines need timing. <button className="subtle-button" onClick={() => setDrawer("timing")}>Review timing</button>{!browserMode && <button className="subtle-button" onClick={() => setDrawer("settings")}>Find missing timings</button>}</div>}
      <div className="listening-lyrics" ref={stage} onWheel={() => setBrowsing(true)} onTouchMove={() => setBrowsing(true)} style={{"--lyric-size": `${fontSize}px`} as CSSProperties}>
        {song.lines.map((line, i) => <div data-line={i} key={line.id} className={`listening-line ${i === displayed ? "is-current" : ""} ${i < displayed ? "is-past" : ""}`}>
          {sections.filter(s => s.lineIds[0] === line.id).map(s => <div className="verse-heading" key={s.id}><span className="verse-label">{s.name}</span>{loopButton(s)}</div>)}
          <button onClick={() => goLine(i)} aria-label={`Go to line ${i + 1}: ${line.text}`}><PinnedLyrics line={line} pins={visiblePins}/>{!usable(line) ? <small className="line-timing-needed">Timing needed</small> : !line.verified && line.timingQuality === "needs_review" ? <small className="line-timing-needed">Check timing</small> : null}</button>
        </div>)}
        {!song.lines.length && <p>Lyrics will appear here when your recording is ready.</p>}
      </div>
      {browsing && <button className="follow-button" onClick={() => setBrowsing(false)}>Follow lyrics <ArrowRight size={15}/></button>}
      <div className="stage-status" role="status">{player.error || queueError || notice || listens.error || (loopSection ? `Looping ${loopSection.name}. Click its loop button to turn it off.` : "") || (!song.lines.some(usable) ? "Lyrics are readable. Add line timing for synchronized scrolling." : "Click a timed section or lyric to jump. Your music keeps flowing.")}</div>
    </main></div>
    <footer className="listening-footer">
      {loopSection && practiceRange && <div className="practice-navigation">
        <button className="subtle-button" aria-label="Previous practice chunk" disabled={practiceRange[0] === 0} onClick={() => {startPractice(Math.max(0, practiceRange[0] - chunkSize), practiceRange[0] - 1);}}><ArrowLeft size={16}/> Previous</button>
        <span>{loopSection.name}</span>
        <button className="subtle-button" aria-label="Next practice chunk" disabled={practiceRange[1] >= loopParent!.lineIds.length - 1} onClick={() => startPractice(practiceRange[1] + 1, practiceRange[1] + chunkSize)}>Next <ArrowRight size={16}/></button>
      </div>}
      <div className="scrubber"><span>{formatTime(player.position)}</span><input type="range" aria-label="Song position" min={0} max={player.duration || song.duration || 1} step=".01" value={player.position} onChange={e => jump(Number(e.target.value))}/><span>{formatTime(player.duration || song.duration)}</span></div>
      <div className="listening-controls">
        <button className="icon-button" aria-label={shuffle ? "Shuffle on" : "Shuffle off"} aria-pressed={shuffle} title="Shuffle library songs" onClick={onShuffle}><Shuffle size={20}/></button>
        <button className="icon-button" aria-label="Previous song" title="Previous song" disabled={queueBusy} onClick={onPreviousSong}><SkipBack size={22}/></button>
        <button className="play-button" aria-label={playing ? "Pause" : "Play"} onClick={toggle}>{playing ? <Pause fill="currentColor"/> : <Play fill="currentColor"/>}</button>
        <button className="icon-button" aria-label="Next song" title="Next song" disabled={queueBusy} onClick={onNextSong}><SkipForward size={22}/></button>
        <button className="icon-button" aria-label={`Repeat ${repeat}`} aria-pressed={repeat !== "off"} title={repeat === "off" ? "Repeat off — click to repeat library" : repeat === "all" ? "Repeat library — click to loop this song" : "Loop this song — click to turn repeat off"} onClick={onRepeat}>{repeat === "one" ? <Repeat1 size={20}/> : <Repeat size={20}/>}</button>
        <button className="subtle-button practice-button" aria-pressed={!!loopSection} onClick={() => setDrawer("practice")}>Practice</button>
        <button className="subtle-button restart-song" onClick={() => jump(0)}><RotateCcw size={16}/> From beginning</button>
      </div>
    </footer>
    {drawer && <Drawer title={drawer === "timing" ? "Timing & sections" : drawer === "practice" ? "Practice a few lines" : "Listening settings"} onClose={() => setDrawer(null)}>
      {drawer === "practice" ? <div className="settings-form">
        <p>{practiceSection?.name ?? "Choose a section"} · {practiceSection?.lineIds.length ?? 0} lines. Pick a smaller part to repeat. Press Play when you’re ready.</p>
        <div className="practice-options">
          {[{label: "Whole verse", from: 0, size: practiceSection?.lineIds.length ?? 0},
            {label: "First half", from: 0, size: Math.ceil((practiceSection?.lineIds.length ?? 0) / 2)},
            {label: "Second half", from: Math.ceil((practiceSection?.lineIds.length ?? 0) / 2), size: Math.ceil((practiceSection?.lineIds.length ?? 0) / 2)},
            {label: "2 lines at a time", from: 0, size: 2}, {label: "4 lines at a time", from: 0, size: 4}].map(option => <button key={option.label} className="button secondary"
              disabled={!practiceSection || !eligible.some(s => s.id === practiceSection.id) || option.from >= practiceSection.lineIds.length}
              onClick={() => {setChunkSize(option.size); startPractice(option.from, option.from + option.size - 1, option.size);}}>{option.label}</button>)}
        </div>
        {practiceSection && !eligible.some(s => s.id === practiceSection.id) && <p>Add line timing to this section to practice smaller parts.</p>}
        {loopSection && <button className="button secondary" onClick={() => {setLoopId(null); setPracticeRange(null); transport.setTransition(null); setDrawer(null);}}>Stop practicing</button>}
      </div> : drawer === "timing" ? <><button className="button secondary" onClick={toggle}>{playing ? "Pause" : "Play"}</button><TimingEditor key={song.alignmentRevision} song={song} position={player.position} onSeek={jump} onSave={onUpdate}/></> : <div className="settings-form">
        <p>Audio and your selected practice passage keep playing when you switch apps. Tap Floating lyrics before minimizing to follow along in a small window. Floating lyrics need browser support and may stop updating if your phone suspends this page.</p>
        <label>Lyric size<input type="range" min={28} max={72} value={fontSize} onChange={e => {setFontSize(Number(e.target.value)); writeLocal("listening.fontSize", Number(e.target.value));}}/></label>
        <div className="desktop-emoji-settings"><label><input type="checkbox" checked={showEmojis} onChange={event => {setShowEmojis(event.target.checked); writeLocal("listening.showEmojis", event.target.checked);}}/> Show lyric emojis</label>
        {showEmojis && <>
          <label>Emoji density <span>{visiblePins.length}/{emojiCandidates.length}</span>
            <input aria-label="Emoji density" type="range" min="0" max="100" step="1" value={emojiDensity} disabled={!emojiCandidates.length}
              aria-valuetext={`${visiblePins.length} of ${emojiCandidates.length} reviewed pins`}
              onChange={event => {const value = Number(event.target.value); setEmojiDensity(value); writeLocal(`listening.reviewedEmojiDensity.${song.id}`, value);}}/>
          </label>
          {!emojiCandidates.length && <p>No emoji cues are available for this song yet.</p>}
        </>}
        </div>
        {!browserMode && <><h3>Section headings from Genius</h3><p>Match human-written verse and chorus headings to your existing lyrics. Your words and timing stay intact.</p>
        <label>Genius song URL<input type="url" placeholder="https://genius.com/…-lyrics" value={geniusUrl} onChange={e => setGeniusUrl(e.target.value)}/></label>
        <button className="button secondary" disabled={busy} onClick={async () => {setBusy(true); try {onUpdate(await api.geniusSections(song.id, {url: geniusUrl, title: song.title, artist: song.artist, revision: song.alignmentRevision ?? 0})); setNotice("Genius section headings applied.");} catch(e) {setNotice(String(e));} finally {setBusy(false);}}}>{busy ? "Matching sections…" : "Get Genius sections"}</button>
        <small>Paste a song link, or leave it blank to search Genius by title and artist. No API token is required.</small>
        <p role="status">{notice}</p>
        <AlignmentOptions/><button className="button secondary" disabled={busy} onClick={async () => {setBusy(true); try {const {jobId} = await api.startAlignment(song.id, false); let job; do {await new Promise(r => setTimeout(r, 1000)); job = await api.job(jobId); setNotice(job.status === "COMPLETE" ? job.message : `${Math.round(Math.max(0, Math.min(1, job.progress)) * 100)}% · ${job.message}`);} while (job.status !== "COMPLETE" && job.status !== "FAILED"); if(job.status === "FAILED") throw new Error(job.message); const updated = await api.song(song.id); onUpdate(updated); setNotice(job.message || updated.statusMessage);} catch(e) {setNotice(String(e));} finally {setBusy(false);}}}>Redo line timing</button></>}
        <button className="danger-link" onClick={async () => {if (!confirm(`Remove “${song.title}” from this device?`)) return; try {await api.deleteSong(song.id); transport.pause(); onDelete();} catch(e) {setNotice(String(e));}}}>Remove song</button>
      </div>}
    </Drawer>}
  </div>;
}
