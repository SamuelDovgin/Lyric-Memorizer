import { sectionRange, ratingLabel, type SectionRating, type SectionPractice } from "../lib/sectionPractice";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clock3,
  Headphones,
  ListMusic,
  LoaderCircle,
  Maximize,
  Music2,
  Pause,
  Play,
  Repeat2,
  RotateCcw,
  Search,
  Settings2,
  SkipBack,
  SkipForward,
  Sparkles,
  Volume2,
  X,
} from "lucide-react";
import { api } from "../lib/api";
import {
  activeLine,
  countPlan,
  defaultSettings,
  feedbackLine,
  formatTime,
  getSections,
  makePassage,
  phrase,
  usable,
} from "../lib/rehearsal";
import { useRehearsalPlayer } from "../hooks/useRehearsalPlayer";
import {
  localSession,
  usePracticeStore,
  writeLocal,
} from "../hooks/usePracticeStore";
import { Drawer } from "../components/Drawer";
import { UserGuide } from "../components/UserGuide";
import { TimingEditor } from "../components/TimingEditor";
import type {
  BeatMap,
  Passage,
  PlayerSettings,
  SavedSession,
  Song,
} from "../types";

type Pending = {
  passage: Passage;
  exit: number;
  reason: string;
  kind: "auto" | "retry" | "replay" | "loop" | "section";
  sectionId?: string;
  target: number;
};
interface Props {
  song: Song;
  minimized: boolean;
  resumeFocus: boolean;
  openRequest: number;
  onLibrary: () => void;
  onExpand: () => void;
  onUpdate: (song: Song) => void;
  onDelete: () => void;
}
export function PlayerPage({
  song,
  minimized,
  resumeFocus,
  openRequest,
  onLibrary,
  onExpand,
  onUpdate,
  onDelete,
}: Props) {
  const saved = useMemo(() => localSession(song.id), [song.id]);
  const [mode, setMode] = useState<"full" | "focus">(
    resumeFocus ? "focus" : (saved?.mode ?? "focus"),
  );
  const [scope, setScope] = useState(resumeFocus ? (saved?.scope ?? "") : "");
  const [settings, setSettings] = useState<PlayerSettings>({
    ...defaultSettings,
    ...saved?.settings,
  });
  const [loop, setLoop] = useState<[number, number] | null>(
    resumeFocus ? (saved?.loop ?? null) : null,
  );
  const [rehearsal, setRehearsal] = useState<SectionPractice>(saved?.rehearsal?.ratings ? saved.rehearsal : {sectionId: null, ratings: {}});
  const [choosingSection, setChoosingSection] = useState(true);
  const [sectionPasses, setSectionPasses] = useState(0);
  const [selection, setSelection] = useState<[number, number] | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selectionStart, setSelectionStart] = useState<number | null>(null);
  const [drawer, setDrawer] = useState<
    "help" | "settings" | "timing" | "lyrics" | null
  >(null);
  const [search, setSearch] = useState("");
  const [browsing, setBrowsing] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  const [currentPassage, setCurrentPassage] = useState<Passage | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [beatMap, setBeatMap] = useState<BeatMap | null>(null);
  const [bpm, setBpm] = useState(120);
  const [anchor, setAnchor] = useState(0);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [elapsed, setElapsed] = useState(saved?.elapsed ?? 0);
  const [selectedLine, setSelectedLine] = useState(0);
  const stage = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const songRef = useRef(song);
  songRef.current = song;
  const store = usePracticeStore(song.id);
  const canMix = Boolean(song.vocalsUrl && song.instrumentalUrl);
  const mix = canMix && (settings.mix || !song.originalUrl);
  const urls = mix
    ? [song.vocalsUrl!, song.instrumentalUrl!]
    : song.originalUrl
      ? [song.originalUrl]
      : [];
  const player = useRehearsalPlayer(urls, mix);
  const { transport } = player;
  const sections = useMemo(() => getSections(song), [song]);
  const rehearsingSection = sections.find(s => s.id === rehearsal.sectionId);
  const playing = player.status === "playing" || player.status === "counting";
  const position = Math.max(0, player.position + settings.syncOffset / 1000);
  const active = activeLine(song.lines, position);
  const upcoming = song.lines.findIndex(
    (line) => usable(line) && line.start >= position,
  );
  const displayIndex =
    active >= 0 ? active : upcoming >= 0 ? upcoming : selectedLine;
  const activeSection = sections.find((s) =>
    s.lineIds.includes(song.lines[displayIndex]?.id),
  );
  const leadIn = currentPassage && position < currentPassage.targetStart;
  const feedback =
    playing && player.status !== "counting" && !leadIn
      ? feedbackLine(song.lines, position, transport.getPassStart())
      : -1;
  const feedbackIndex =
    feedback >= 0 ? feedback : active >= 0 ? active : selectedLine;
  const passId = useRef(crypto.randomUUID());
  const previousPass = useRef(0);
  const suppressAuto = useRef(false);
  const restore = useRef<{ position: number; play: boolean } | null>({
    position: saved?.position ?? 0,
    play: false,
  });
  const sessionRef = useRef<SavedSession | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    void Promise.all([api.beats(song.id), api.session(song.id)])
      .then(([beats, serverSession]) => {
        if (!mounted.current) return;
        if (beats) {
          setBeatMap(beats);
          setBpm(beats.bpm);
          setAnchor(beats.anchor);
        }
        if (
          !saved &&
          serverSession &&
          transport.getSnapshot().status === "paused"
        ) {
          transport.seek(serverSession.position);
          setElapsed(serverSession.elapsed ?? 0);
          if (serverSession.rehearsal?.ratings) setRehearsal(serverSession.rehearsal);
          setMode(resumeFocus ? "focus" : serverSession.mode);
          setSettings({ ...defaultSettings, ...serverSession.settings });
          if (resumeFocus) {
            setScope(serverSession.scope);
            setLoop(serverSession.loop);
          }
        }
      })
      .catch(() => {
        /* Local session and original playback still work. */
      });
    return () => {
      mounted.current = false;
    };
    // Initial song state only; transport replacement is handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [song.id]);

  useEffect(() => {
    const target = restore.current;
    if (target) {
      if (target.play) void transport.play(target.position);
      else transport.seek(target.position);
      restore.current = null;
    }
    previousPass.current = transport.getSnapshot().pass;
    passId.current = crypto.randomUUID();
  }, [transport]);
  useEffect(() => {
    if (resumeFocus) {
      setMode("focus");
      suppressAuto.current = false;
      setSessionComplete(false);
    }
  }, [resumeFocus, openRequest]);
  useEffect(() => {
    transport.setSinger(settings.singer);
  }, [transport, settings.singer]);
  useEffect(() => {
    const timer = setInterval(() => {
      if (["playing", "counting"].includes(transport.getSnapshot().status))
        setElapsed((value) => value + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [transport]);
  useEffect(() => {
    sessionRef.current = {
      id: store.sessionId,
      songId: song.id,
      position: player.position,
      mode,
      scope,
      settings,
      loop,
      elapsed,
      plan: saved?.plan ?? {},
      rehearsal,
      updatedAt: new Date().toISOString(),
    };
  }, [
    player.position,
    mode,
    scope,
    settings,
    loop,
    elapsed,
    song.id,
    store.sessionId,
    rehearsal,
  ]);
  useEffect(() => {
    let saving = false;
    const save = () => {
      const session = sessionRef.current;
      if (!session) return;
      writeLocal(`rehearsal.session.${song.id}`, session);
      if (!saving) {
        saving = true;
        void api
          .saveSession(session)
          .catch(() => {})
          .finally(() => {
            saving = false;
          });
      }
    };
    const timer = setInterval(save, 2000);
    window.addEventListener("pagehide", save);
    return () => {
      clearInterval(timer);
      window.removeEventListener("pagehide", save);
      save();
    };
  }, [song.id]);

  const clearPending = useCallback(() => {
    if (!transport.setTransition(null)) return false;
    pendingRef.current = null;
    setPending(null);
    return true;
  }, [transport]);
  const navigate = (index: number, rangeEnd = index) => {
    const line = song.lines[index];
    if (!line) return;
    setSelectedLine(index);
    if (!usable(line)) {
      setNotice(
        "This line needs timing. Open Timing to mark its start and end.",
      );
      return;
    }
    suppressAuto.current = false;
    const passage = makePassage(song, index, rangeEnd, "none");
    pendingRef.current = null;
    setPending(null);
    setCurrentPassage(passage);
    setHistory([line.id]);
    setLoop(null);
    setMode("full");
    setChoosingSection(false);
    setRehearsal(p => ({...p, sectionId: null}));
    setBrowsing(false);
    setSessionComplete(false);
    transport.seek(passage.start);
    onExpand();
  };
  const safeExit = () => {
    const minimum = transport.getSnapshot().position + 0.3;
    const boundary = song.lines.find((l) => usable(l) && l.end >= minimum);
    return Math.min(
      song.duration - 0.02,
      boundary?.end ?? song.duration - 0.02,
    );
  };
  const queue = (
    passage: Passage,
    exit: number,
    reason: string,
    kind: Pending["kind"],
    target: number,
    sectionId?: string,
  ) => {
    const count = countPlan(beatMap, passage.start, settings);
    const next = {
      passage,
      exit: Math.min(exit, song.duration - 0.02),
      reason,
      kind,
      target,
      sectionId,
    };
    if (
      transport.setTransition({
        id: passage.id,
        exit: next.exit,
        start: passage.start,
        gap: count.duration,
        clicks: count.clicks,
        beats: settings.beats,
      })
    ) {
      pendingRef.current = next;
      setPending(next);
    }
  };
  // An audio-clock transition completed. Only now promote its destination to the active passage.
  useEffect(() => {
    if (player.pass === previousPass.current) return;
    previousPass.current = player.pass;
    passId.current = crypto.randomUUID();
    const queued = pendingRef.current;
    if (queued && Math.abs(player.position - queued.passage.start) < 0.5) {
      if (queued.kind === "section" && queued.sectionId) {
        const section = sections.find(s => s.id === queued.sectionId);
        if (section) {
          setRehearsal(p => ({...p, sectionId: section.id}));
          setLoop(sectionRange(song, section));
          setSectionPasses(0);
        }
      } else if (queued.kind === "loop") setSectionPasses(p => p + 1);
      setCurrentPassage(queued.passage);
      setSelectedLine(queued.target);
      setHistory((h) => [...h, song.lines[queued.target].id]);
      pendingRef.current = null;
      setPending(null);
    }
  }, [player.pass, player.position, song.lines]);

  useEffect(() => {
    if (player.status !== "playing" || pendingRef.current || sessionComplete)
      return;
    if (loop) {
      const passage = makePassage(song, loop[0], loop[1], settings.leadIn);
      queue(
        passage,
        Math.max(passage.end, safeExit()),
        "Your locked loop",
        "loop",
        loop[0],
      );
      return;
    }
    // Section rehearsal repeats only the section explicitly chosen by the singer.
    // Re-evaluate once per active listening second. Pending audio plans stay stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    player.status,
    player.pass,
    pending,
    mode,
    loop,
    scope,
    sessionComplete,
    settings,
    elapsed,
  ]);

  // If scheduling missed its boundary under load, choose a later phrase end without an abrupt cut.
  useEffect(() => {
    const next = pendingRef.current;
    if (
      next &&
      !player.committed &&
      player.status === "playing" &&
      player.position > next.exit + 0.05
    ) {
      if (player.position >= song.duration - 0.35) {
        clearPending();
        return;
      }
      queue(next.passage, safeExit(), next.reason, next.kind, next.target, next.sectionId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player.position, player.committed]);

  useEffect(() => {
    if (player.committed) {
      const pos = transport.getSnapshot().position;
      pendingRef.current = null;
      setPending(null);
      transport.seek(pos);
    }
    clearPending();
    setCurrentPassage(null);
    // The current recording keeps playing; only future boundaries change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [song.alignmentRevision]);
  useEffect(() => {
    if (playing && !browsing && !minimized && displayIndex >= 0)
      stage.current
        ?.querySelector(`[data-line="${displayIndex}"]`)
        ?.scrollIntoView({ block: "center", behavior: "instant" });
  }, [displayIndex, browsing, minimized, choosingSection, playing]);

  const chooseSection = (id: string) => {
    const section = sections.find(s => s.id === id);
    if (!section) return;
    const range = sectionRange(song, section);
    if (!range) { setNotice("Check this section's line timing before looping it."); setDrawer("timing"); return; }
    const passage = makePassage(song, ...range, "none");
    if (playing) {
      if (player.committed) { setNotice("Let the current count-in finish, then choose the section."); return; }
      queue(passage, loop ? Math.max(makePassage(song, ...loop, "none").end, safeExit()) : Math.max(activeSection?.end ?? 0, safeExit()),
        "Finish this section, then switch", "section", range[0], id);
    } else {
      pendingRef.current = null;
      setPending(null);
      setRehearsal(p => ({...p, sectionId: id}));
      setLoop(range);
      setSectionPasses(0);
      setCurrentPassage(passage);
      setSelectedLine(range[0]);
      void transport.play(passage.start);
    }
    setMode("focus");
    setChoosingSection(false);
    setBrowsing(false);
  };
  const rateSection = (rating: SectionRating) => {
    if (mode !== "focus") return;
    if (!rehearsingSection) { setChoosingSection(true); return; }
    setRehearsal(p => ({...p, ratings: {...p.ratings, [rehearsingSection.id]: {rating, updatedAt: new Date().toISOString()}}}));
    setNotice(rating === "ready" ? "Ready noted. Keep singing, or choose your next section." : ratingLabel(rating) + " — keep singing. This section will repeat.");
  };
  const startNextRound = () => {
    setChoosingSection(true);
    setBrowsing(true);
    stage.current?.scrollTo({top: 0, behavior: "smooth"});
  };
  const startFreeplay = () => {
    transport.pause();
    clearPending();
    setMode("full");
    setLoop(null);
    setRehearsal(p => ({...p, sectionId: null}));
    setCurrentPassage(null);
    setSectionPasses(0);
    setSessionComplete(false);
    setChoosingSection(false);
    setBrowsing(false);
    setNotice("");
    void transport.play(0);
  };
  const togglePlay = () => {
    if (!playing && mode === "focus" && !loop && drawer !== "timing") { startFreeplay(); return; }
    if (playing || player.status === "loading") {
      if (player.status === "counting" && pendingRef.current) {
        if (pendingRef.current.kind === "section" && pendingRef.current.sectionId) {
          const section = sections.find(s => s.id === pendingRef.current?.sectionId);
          if (section) {
            setRehearsal(p => ({...p, sectionId: section.id}));
            setLoop(sectionRange(song, section));
            setSectionPasses(0);
          }
        }
        setCurrentPassage(pendingRef.current.passage);
        setSelectedLine(pendingRef.current.target);
      }
      transport.pause();
    } else {
      pendingRef.current = null;
      setPending(null);
      if (player.status === "ended") {
        setCurrentPassage(null);
        setHistory([]);
      }
      void transport.play();
    }
  };
  const replay = () => {
    if (rehearsingSection && mode === "focus") {
      chooseSection(rehearsingSection.id);
      return;
    }
    if (!song.lines[feedbackIndex] || !usable(song.lines[feedbackIndex]))
      return setNotice("Set this line’s timing before replaying it.");
    const passage = phrase(song, feedbackIndex, settings);
    if (playing)
      queue(passage, safeExit(), "One more pass", "replay", feedbackIndex);
    else
      navigate(
        feedbackIndex,
        Math.min(feedbackIndex + 1, song.lines.length - 1),
      );
  };
  const toggleLoop = () => {
    if (loop) {
      if (!clearPending()) { setNotice("Let the count-in finish before releasing the loop."); return; }
      setRehearsal(p => ({...p, sectionId: null}));
      setLoop(null);
      setMode("full");
      return;
    }
    const target: [number, number] = selection ?? [
      Math.max(0, feedbackIndex),
      Math.max(0, feedbackIndex),
    ];
    if (song.lines.slice(target[0], target[1] + 1).some((l) => !usable(l)))
      return setNotice("Verify timing for these lines before looping.");
    clearPending();
    setRehearsal(p => ({...p, sectionId: null}));
    setChoosingSection(false);
    setLoop(target);
    suppressAuto.current = false;
    const passage = makePassage(song, ...target, settings.leadIn);
    setCurrentPassage(passage);
    transport.seek(passage.start);
  };
  const switchMode = (next: "full" | "focus") => {
    if (!clearPending()) {
      setNotice(
        "The transition is already counting in. Change mode after it finishes.",
      );
      return;
    }
    setMode(next);
    setLoop(null);
    if (next === "focus") setChoosingSection(true);
    setSessionComplete(false);
    suppressAuto.current = false;
    if (next === "focus") {
      setHistory([]);
      setCurrentPassage(active >= 0 ? phrase(song, active, settings) : null);
    }
  };
  const keepGoing = () => {
    if (clearPending()) {
      setLoop(null);
      setRehearsal(p => ({...p, sectionId: null}));
      setMode("full");
      setNotice("Section repeat released. The recording continues.");
    }
  };
  const rowClick = (index: number, shift = false) => {
    if (selecting || shift) {
      const first = selectionStart ?? selectedLine;
      if (selectionStart === null && !shift) {
        setSelectionStart(index);
        setSelection([index, index]);
        return;
      }
      setSelection([Math.min(first, index), Math.max(first, index)]);
      setSelectionStart(null);
      setSelecting(false);
    } else navigate(index);
  };
  const actionsRef = useRef({
    togglePlay,
    rateSection,
    replay,
    toggleLoop,
    navigate,
    keepGoing,
  });
  actionsRef.current = {
    togglePlay,
    rateSection,
    replay,
    toggleLoop,
    navigate,
    keepGoing,
  };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const element = event.target as HTMLElement;
      if (
        event.repeat ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        element.closest(
          'input, textarea, select, [contenteditable="true"], dialog',
        )
      )
        return;
      const action = actionsRef.current;
      const key = event.key.toLowerCase();
      if (key === " " && element.closest("button")) return;
      if (
        [" ", "j", "k", "r", "l", "arrowleft", "arrowright", "escape"].includes(
          key,
        )
      )
        event.preventDefault();
      if (key === " ") action.togglePlay();
      if (key === "j") action.rateSection("needs-work");
      if (key === "k") action.rateSection("ready");
      if (key === "r") action.replay();
      if (key === "l") action.toggleLoop();
      if (key === "arrowleft")
        action.navigate(Math.max(0, (active >= 0 ? active : selectedLine) - 1));
      if (key === "arrowright")
        action.navigate(
          Math.min(
            song.lines.length - 1,
            (active >= 0 ? active : selectedLine) + 1,
          ),
        );
      if (key === "escape") action.keepGoing();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, selectedLine]);

  const runJob = async (start: () => Promise<{ jobId: string }>) => {
    setBusy(true);
    setNotice("Preparing…");
    try {
      const { jobId } = await start();
      while (mounted.current) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        if (!mounted.current) return;
        const job = await api.job(jobId);
        setNotice(job.message);
        if (job.status === "FAILED") throw new Error(job.message);
        if (job.status === "COMPLETE") {
          onUpdate(await api.song(song.id));
          break;
        }
      }
    } catch (error) {
      if (mounted.current)
        setNotice(error instanceof Error ? error.message : "Processing failed");
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  const changeSettings = (patch: Partial<PlayerSettings>) => {
    clearPending();
    setSettings((old) => ({ ...old, ...patch }));
  };
  const lyricList = (
    <div className="lyric-browser">
      <label className="lyric-search">
        <Search size={17} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Find a lyric…"
          aria-label="Search lyrics"
        />
      </label>
      <button
        className={`subtle-button ${selecting ? "selected" : ""}`}
        onClick={() => {
          setSelecting(!selecting);
          setSelectionStart(null);
        }}
      >
        {selecting
          ? selectionStart === null
            ? "Choose first line…"
            : "Choose last line…"
          : "Select loop"}
      </button>
      {selection && (
        <div className="selection-actions">
          <span>
            Lines {selection[0] + 1}–{selection[1] + 1}
          </span>
          <button onClick={toggleLoop}>Loop selection</button>
          <button
            aria-label="Clear selection"
            onClick={() => setSelection(null)}
          >
            <X size={14} />
          </button>
        </div>
      )}
      {sections.map((section) => (
        <section key={section.id}>
          <h3><button className="subtle-button" onClick={() => chooseSection(section.id)}>{section.name} · Practice</button></h3>
          {song.lines
            .map((line, i) => ({ line, i }))
            .filter(
              ({ line }) =>
                section.lineIds.includes(line.id) &&
                line.text.toLowerCase().includes(search.toLowerCase()),
            )
            .map(({ line, i }) => (
              <div
                className={`browser-row ${i === active ? "current" : ""} ${selection && i >= selection[0] && i <= selection[1] ? "range-selected" : ""}`}
                key={line.id}
              >
                <button onClick={(e) => rowClick(i, e.shiftKey)}>
                  <small>
                    {formatTime(line.start)}{" "}
                    {!usable(line) && "· timing needed"}
                  </small>
                  <span>{line.text}</span>
                </button>
                
              </div>
            ))}
        </section>
      ))}
      {search &&
        !song.lines.some((l) =>
          l.text.toLowerCase().includes(search.toLowerCase()),
        ) && <p>No matching lines.</p>}
    </div>
  );

  if (minimized)
    return (
      <div className="mini-player">
        <button className="mini-title" onClick={onExpand}>
          <Music2 size={20} />
          <span>
            <b>{song.title}</b>
            <small>{formatTime(player.position)} · Return to lyrics</small>
          </span>
        </button>
        <button
          className="icon-button"
          aria-label={playing ? "Pause" : "Play"}
          onClick={togglePlay}
        >
          {playing ? <Pause /> : <Play />}
        </button>
      </div>
    );

  return (
    <div className={`rehearsal-room mode-${mode}`} ref={root}>
      <header className="player-header">
        <button
          className="icon-button"
          onClick={onLibrary}
          aria-label="Back to library"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="player-title">
          <b>{song.title}</b>
          <span>{song.artist || "Your recording"}</span>
        </div>
        <div className="mode-switch" aria-label="Playback mode">
          <button
            className={mode === "full" ? "selected" : ""}
            onClick={startFreeplay}
          >
            Freeplay
          </button>
          <button
            className={mode === "focus" ? "selected" : ""}
            onClick={() => switchMode("focus")}
          >
            <Sparkles size={14} /> Rehearse
          </button>
        </div>
        <div className="player-tools">
          <button
            className="icon-button mobile-lyrics"
            aria-label="Open lyrics"
            onClick={() => setDrawer("lyrics")}
          >
            <ListMusic size={20} />
          </button>
          <button
            className="icon-button"
            aria-label="User guide"
            onClick={() => setDrawer("help")}
          >
            <CircleHelp size={20} />
          </button>
          <button
            className="icon-button"
            aria-label="Settings"
            onClick={() => setDrawer("settings")}
          >
            <Settings2 size={20} />
          </button>
          <button
            className="icon-button fullscreen-button"
            aria-label="Fullscreen"
            onClick={() => {
              void (
                document.fullscreenElement
                  ? document.exitFullscreen()
                  : root.current?.requestFullscreen()
              )?.catch(() =>
                setNotice("Fullscreen is unavailable in this browser."),
              );
            }}
          >
            <Maximize size={19} />
          </button>
        </div>
      </header>
      <div className="rehearsal-content">
        <aside className="song-navigator">
          <div className="panel-heading">
            <span>SONG MAP</span>
            <span>{sections.length} parts</span>
          </div>
          <nav aria-label="Song sections">
            {sections.map((section, i) => (
              <button
                className={section.id === activeSection?.id ? "active" : ""}
                key={section.id}
                onClick={() => chooseSection(section.id)}
              >
                <span className="section-number">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span>{section.name}</span>

              </button>
            ))}
          </nav>
          {lyricList}
        </aside>
        <main className="lyrics-center">
          <div className="stage-heading">
            <span>
              <i className={playing ? "live-dot" : ""} />
              {player.status === "counting"
                ? "COMING BACK IN"
                : (activeSection?.name ?? "YOUR REHEARSAL ROOM")}
            </span>
            <button
              className="subtle-button"
              onClick={() => setDrawer("timing")}
            >
              <Clock3 size={14} /> Timing
            </button>
          </div>
          {player.status === "counting" && (
            <div className="count-overlay" aria-live="polite">
              <b>{player.count}</b>
              <span>
                {pending?.passage.label ?? "Get ready"} ·{" "}
                {settings.countIn === "silent" ? "silent count" : "counting in"}
              </span>
            </div>
          )}
          <div className="practice-start">
            <button className="button primary" onClick={startFreeplay}><Play size={16} /> Freeplay from beginning</button>
            <p>Read all the lyrics below. Click a section heading to practice it on repeat.</p>
          </div>
          <div
            className="lyric-stage"
            ref={stage}
            onWheel={() => setBrowsing(true)}
            onTouchMove={() => setBrowsing(true)}
            style={
              { "--lyric-size": `${settings.fontSize}px` } as CSSProperties
            }
          >
            {!song.lines.length && (
              <div className="stage-empty">
                <Music2 />
                <h2>Your audio is preparing</h2>
                <p>Lyrics will appear when the recording is ready.</p>
              </div>
            )}
            {song.lines.map((line, i) => {
              const lineProgress = Math.max(
                0,
                Math.min(1, (position - line.start) / (line.end - line.start)),
              );
              const wordTiming =
                line.tokens.length > 0 &&
                line.tokens.every(
                  (t) =>
                    t.confidence >= 0.65 &&
                    [
                      "whisper_anchored_word",
                      "whisper_global_match",
                      "manual_word",
                    ].includes(t.source),
                );
              return (
                <div
                  key={line.id}
                  data-line={i}
                  className={`stage-line ${i === displayIndex ? "is-current" : ""} ${i < displayIndex ? "is-past" : ""} ${selection && i >= selection[0] && i <= selection[1] ? "is-selected" : ""}`}
                >
                  {sections.filter(s => s.lineIds[0] === line.id).map(section => (
                    <button key={section.id} className="verse-label section-practice-heading"
                      aria-label={"Practice " + section.name}
                      aria-pressed={rehearsal.sectionId === section.id && mode === "focus"}
                      onClick={() => chooseSection(section.id)}>
                      <Repeat2 size={15} /> {section.name}
                      <small>{pending?.sectionId === section.id ? "Up next" : rehearsal.sectionId === section.id && mode === "focus" ? "Repeating" : "Practice section"} · {ratingLabel(rehearsal.ratings[section.id]?.rating)}</small>
                    </button>
                  ))}
                  <button
                    className="lyric-text"
                    onClick={(event) => rowClick(i, event.shiftKey)}
                    aria-label={`Go to line ${i + 1}: ${line.text}`}
                  >
                    {wordTiming && i === active
                      ? line.tokens.map((t) => (
                          <span
                            className={position >= t.start ? "sung-word" : ""}
                            key={t.id}
                          >
                            {t.text}{" "}
                          </span>
                        ))
                      : line.text}
                  </button>
                  <div className="line-meta">
                    <span>
                      {!usable(line) ? "Timing needed" : "Line " + (i + 1)}
                    </span>
                    
                  </div>
                  {i === active && (
                    <i className="lyric-progress">
                      <b style={{ width: `${lineProgress * 100}%` }} />
                    </i>
                  )}
                </div>
              );
            })}
          </div>
          {browsing && (
            <button
              className="follow-button"
              onClick={() => {
                setBrowsing(false);
                setSearch("");
              }}
            >
              Follow song <ArrowRight size={15} />
            </button>
          )}
          <div className="stage-status" role="status">
            {player.error ||
              store.saveError ||
              notice ||
              (!song.lines.some(usable)
                ? "Lyrics are readable. Set line timing to unlock synced rehearsal."
                : choosingSection && mode === "focus" ? "Source headings are preserved; suggested sections use repetition and stanza breaks. Edit in Timing." : "Choose another section whenever you are ready.")}
          </div>
        </main>
        {mode === "focus" && (
          <aside className="focus-panel">
            <span className="eyebrow">SECTION REHEARSAL</span>
            <div className="next-passage">
              <h2>{rehearsingSection?.name ?? "Choose your starting point."}</h2>
              <p>{pending?.kind === "section" ? pending.reason + ": " + pending.passage.label : rehearsingSection ? "Stay with this section. It repeats until you choose to move on." : "Pick a verse, chorus, or bridge. No need to catch a single line."}</p>
            </div>
            <p>{sectionPasses} repeats completed · {ratingLabel(rehearsal.ratings[rehearsal.sectionId ?? ""]?.rating)}</p>
            <button className="button primary" onClick={startNextRound}>Choose section</button>
            <p className="panel-note">Your rating never cuts the music or moves you automatically. Choose another section to switch at the end of this one.</p>
            <h3 className="small-heading">YOUR SECTIONS</h3>
            {sections.map(section => <button key={section.id} className="weak-link" onClick={() => chooseSection(section.id)}>
              <span>{section.name}</span><small>{ratingLabel(rehearsal.ratings[section.id]?.rating)}</small>
            </button>)}
          </aside>
        )}
      </div>
      <footer className="player-footer">
        {(sessionComplete || player.status === "ended") && (
          <div className="session-summary">
            <span>
              {player.status === "ended"
                ? "Song finished."
                : "Rehearsal round complete."}{" "}
              Choose a section to keep practicing.
            </span>
            <button
              
              onClick={startNextRound}
            >
              Choose a section
            </button>
          </div>
        )}
        {pending && (
          <div className="mobile-next">
            Next: {pending.passage.label}
            <button
              disabled={player.committed || pending.kind === "loop"}
              onClick={keepGoing}
            >
              Keep going
            </button>
          </div>
        )}
        <div className="section-timeline" aria-label="Section timeline">
          {sections.map((section) => (
            <button
              style={{ flexGrow: Math.max(1, section.end - section.start) }}
              className={section.id === activeSection?.id ? "current" : ""}
              key={section.id}
              title={`${section.name} · ${formatTime(section.start)}`}
              onClick={() => chooseSection(section.id)}
            >
              {section.name}
            </button>
          ))}
        </div>
        <div className="scrubber">
          <span>{formatTime(player.position)}</span>
          <input
            aria-label="Song position"
            type="range"
            min="0"
            max={player.duration || song.duration || 1}
            step="0.1"
            value={player.position}
            onChange={(e) => {
              pendingRef.current = null;
              setPending(null);
              setCurrentPassage(null);
              setLoop(null);
              setRehearsal(p => ({...p, sectionId: null}));
              setMode("full");
              suppressAuto.current = true;
              transport.seek(Number(e.target.value));
            }}
          />
          <span>{formatTime(player.duration || song.duration)}</span>
        </div>
        <div className="transport-row">
          <div className="transport-buttons">
            <button
              className="icon-button"
              aria-label="Previous line"
              onClick={() =>
                navigate(Math.max(0, (active >= 0 ? active : selectedLine) - 1))
              }
            >
              <SkipBack size={21} />
            </button>
            <button
              className="play-button"
              aria-label={playing ? "Pause" : "Play"}
              onClick={togglePlay}
            >
              {player.status === "loading" ? (
                <LoaderCircle className="spin" />
              ) : playing ? (
                <Pause fill="currentColor" />
              ) : (
                <Play fill="currentColor" />
              )}
            </button>
            <button
              className="icon-button"
              aria-label="Next line"
              onClick={() =>
                navigate(
                  Math.min(
                    song.lines.length - 1,
                    (active >= 0 ? active : selectedLine) + 1,
                  ),
                )
              }
            >
              <SkipForward size={21} />
            </button>
          </div>
          <div className="feedback-block">
            <div className="feedback-target">{rehearsingSection ? "How does " + rehearsingSection.name + " feel?" : "Choose a section to rehearse"}</div>
            <div className="feedback-buttons section-ratings">
              <button className="again-button" disabled={!rehearsingSection || mode !== "focus"} aria-pressed={rehearsal.ratings[rehearsal.sectionId ?? ""]?.rating === "needs-work"} onClick={() => rateSection("needs-work")}>Needs practice <kbd>J</kbd></button>
              <button disabled={!rehearsingSection || mode !== "focus"} aria-pressed={rehearsal.ratings[rehearsal.sectionId ?? ""]?.rating === "getting-there"} onClick={() => rateSection("getting-there")}>Getting there</button>
              <button className="got-button" disabled={!rehearsingSection || mode !== "focus"} aria-pressed={rehearsal.ratings[rehearsal.sectionId ?? ""]?.rating === "ready"} onClick={() => rateSection("ready")}>Ready <kbd>K</kbd></button>
            </div>
            <button className="subtle-button" onClick={startNextRound}>Choose / change section</button>
          </div>
          <div className="secondary-transport">
            <button onClick={replay} title="Replay this passage once (R)">
              <RotateCcw size={17} />
              <span>Replay</span>
            </button>
            <button className={loop ? "selected" : ""} onClick={toggleLoop}>
              <Repeat2 size={19} />
              <span>
                {loop ? `Loop ${loop[0] + 1}–${loop[1] + 1}` : "Loop"}
              </span>
            </button>
          </div>
        </div>
        <div className="transport-hints">
          <span>
            <Headphones size={13} />
            {mix ? "Stem mix" : "Original recording"}
          </span>
          <button onClick={() => setDrawer("settings")}>
            Repeat lead-in:{" "}
            {settings.leadIn === "previous"
              ? "previous line"
              : settings.leadIn === "short"
                ? "2 seconds"
                : "direct"}{" "}
            ·{" "}
            {beatMap?.verified && settings.countIn !== "off"
              ? `${settings.beats} ${settings.countIn === "silent" ? "silent beats" : "clicks"}`
              : "no count-in"}
          </button>
          <button onClick={() => setDrawer("help")}>
            <BookOpen size={13} /> How to use
          </button>
        </div>
      </footer>
      {drawer && (
        <Drawer
          title={
            drawer === "help"
              ? "How to rehearse"
              : drawer === "settings"
                ? "Make it your rehearsal"
                : drawer === "timing"
                  ? "Timing & sections"
                  : "Find your line"
          }
          onClose={() => setDrawer(null)}
        >
          {drawer === "help" && <UserGuide />}
          {drawer === "lyrics" && lyricList}
          {drawer === "timing" && (
            <>
              <div className="drawer-transport">
                <button className="button secondary" onClick={togglePlay}>
                  {playing ? <Pause size={16} /> : <Play size={16} />}{" "}
                  {playing ? "Pause" : "Play"}
                </button>
                <span>{formatTime(player.position)}</span>
              </div>
              <TimingEditor
                key={song.alignmentRevision ?? 0}
                song={song}
                position={player.position}
                onSeek={(n) => transport.seek(n)}
                onSave={onUpdate}
              />
            </>
          )}
          {drawer === "settings" && (
            <div className="settings-form">
              <label>
                Repeat lead-in (clicking a lyric always jumps directly)
                <select
                  value={settings.leadIn}
                  onChange={(e) =>
                    changeSettings({
                      leadIn: e.target.value as PlayerSettings["leadIn"],
                    })
                  }
                >
                  <option value="previous">Previous lyric line</option>
                  <option value="short">Short pickup (2 seconds)</option>
                  <option value="none">Direct entrance</option>
                </select>
              </label>
              <div className="field-grid">
                <label>
                  Count-in sound
                  <select
                    value={settings.countIn}
                    onChange={(e) =>
                      changeSettings({
                        countIn: e.target.value as PlayerSettings["countIn"],
                      })
                    }
                  >
                    <option value="click">Quiet clicks</option>
                    <option value="silent">Silent visual pulses</option>
                    <option value="off">Off</option>
                  </select>
                </label>
                <label>
                  Beat count
                  <select
                    value={settings.beats}
                    onChange={(e) =>
                      changeSettings({ beats: Number(e.target.value) })
                    }
                  >
                    <option value="1">1 beat</option>
                    <option value="2">2 beats</option>
                    <option value="4">4 beats</option>
                  </select>
                </label>
              </div>
              <hr />
              <h3>Find the pulse</h3>
              <p>
                {beatMap?.verified
                  ? "Beat timing confirmed. Count-ins are enabled."
                  : "Confirm the pulse before enabling counted transitions. Until then, the original lead-in plays."}
              </p>
              <button
                className="button secondary"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const beats = await api.analyzeBeats(song.id);
                    setBeatMap(beats);
                    setBpm(beats.bpm);
                    setAnchor(beats.anchor);
                    setNotice(
                      "Estimated beats found. Audition and confirm the pulse.",
                    );
                  } catch (error) {
                    setNotice(String(error));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Analyze beats
              </button>
              <div className="field-grid">
                <label>
                  Tempo (BPM)
                  <input
                    type="number"
                    min="21"
                    max="300"
                    value={bpm}
                    onChange={(e) => setBpm(Number(e.target.value))}
                  />
                </label>
                <label>
                  Beat anchor (seconds)
                  <input
                    type="number"
                    min="0"
                    max={song.duration}
                    step="0.01"
                    value={anchor}
                    onChange={(e) => setAnchor(Number(e.target.value))}
                  />
                </label>
              </div>
              <button
                className="subtle-button"
                onClick={() =>
                  setAnchor(Math.round(player.position * 100) / 100)
                }
              >
                Use playhead as beat anchor
              </button>
              <button
                className="button secondary"
                disabled={busy}
                onClick={async () => {
                  try {
                    setBeatMap(await api.saveBeats(song.id, bpm, anchor));
                    clearPending();
                    setNotice("Manual tempo and anchor confirmed.");
                  } catch (error) {
                    setNotice(String(error));
                  }
                }}
              >
                Confirm manual tempo
              </button>
              {beatMap && (
                <div className="beat-actions">
                  <button
                    className="subtle-button"
                    onClick={() => {
                      pendingRef.current = null;
                      setPending(null);
                      suppressAuto.current = true;
                      void transport
                        .audition(
                          beatMap.beats
                            .filter((t) => t >= player.position)
                            .slice(0, 4),
                        )
                        .catch((error) => setNotice(String(error)));
                    }}
                  >
                    Hear beats with song
                  </button>
                  {!beatMap.verified && (
                    <button
                      className="subtle-button"
                      onClick={async () => {
                        try {
                          const response = await fetch(
                            `/api/songs/${song.id}/beat-map/confirm`,
                            { method: "POST" },
                          );
                          if (!response.ok)
                            throw new Error("Could not confirm beats");
                          setBeatMap(await response.json());
                          setNotice("Detected beat map confirmed.");
                        } catch (error) {
                          setNotice(String(error));
                        }
                      }}
                    >
                      Confirm detected map
                    </button>
                  )}
                </div>
              )}
              <hr />
              <h3>Sound & display</h3>
              {canMix && song.originalUrl && (
                <label className="check-setting">
                  <input
                    type="checkbox"
                    checked={settings.mix}
                    onChange={(e) => {
                      restore.current = {
                        position: player.position,
                        play: playing,
                      };
                      clearPending();
                      setSettings((old) => ({ ...old, mix: e.target.checked }));
                    }}
                  />{" "}
                  Use vocal / instrumental mix
                </label>
              )}
              <label>
                Singer volume <span>{Math.round(settings.singer * 100)}%</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  disabled={!mix}
                  value={settings.singer}
                  onChange={(e) =>
                    changeSettings({ singer: Number(e.target.value) })
                  }
                />
              </label>
              <label>
                Lyric size
                <input
                  type="range"
                  min="28"
                  max="72"
                  step="2"
                  value={settings.fontSize}
                  onChange={(e) =>
                    changeSettings({ fontSize: Number(e.target.value) })
                  }
                />
              </label>
              <label>
                Visual sync offset (ms)
                <input
                  type="number"
                  min="-2000"
                  max="2000"
                  step="50"
                  value={settings.syncOffset}
                  onChange={(e) =>
                    changeSettings({ syncOffset: Number(e.target.value) })
                  }
                />
                <small>
                  Negative values delay highlighting for Bluetooth output. Song
                  timings stay unchanged.
                </small>
              </label>
              <hr />
              <h3>Improve this recording</h3>
              <div className="enhancement-buttons">
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => void runJob(() => api.startAlignment(song.id))}
                >
                  Find line sync
                </button>
                {song.originalUrl && (
                  <button
                    className="button secondary"
                    disabled={busy}
                    onClick={() => void runJob(() => api.separate(song.id))}
                  >
                    Create stems
                  </button>
                )}
                <button
                  className="button secondary"
                  disabled={busy || !canMix}
                  onClick={() =>
                    void runJob(() => api.startAlignment(song.id, true))
                  }
                >
                  Refine words locally
                </button>
              </div>
              <p>
                Stem creation and word refinement use optional local models.
                Playback remains available while they run.
              </p>
              <p className="settings-notice" role="status">
                {busy && <LoaderCircle size={15} className="spin" />}
                {notice}
              </p>
              <button
                className="danger-link"
                onClick={async () => {
                  if (
                    !window.confirm(
                      `Remove “${song.title}” and its local practice history?`,
                    )
                  )
                    return;
                  try {
                    await api.deleteSong(song.id);
                    localStorage.removeItem(`rehearsal.events.${song.id}`);
                    localStorage.removeItem(`rehearsal.outbox.${song.id}`);
                    localStorage.removeItem(`rehearsal.session.${song.id}`);
                    transport.pause();
                    onDelete();
                  } catch (error) {
                    setNotice(String(error));
                  }
                }}
              >
                Remove song from this device
              </button>
            </div>
          )}
        </Drawer>
      )}
    </div>
  );
}
