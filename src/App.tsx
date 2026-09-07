import { OfflineStatus } from "./components/OfflineStatus";
import { browserMode } from "./lib/browserLibrary";
import { SongBundles } from "./components/SongBundles";
import { useCallback, useEffect, useRef, useState } from "react";
import { BookOpen, CircleHelp, Plus, WifiOff } from "lucide-react";
import { Brand } from "./components/Brand";
import { ImportPage } from "./pages/ImportPage";
import { LibraryPage } from "./pages/LibraryPage";
import { PlayerPage } from "./pages/PlayerPage";
import { Drawer } from "./components/Drawer";
import { UserGuide } from "./components/UserGuide";
import { api } from "./lib/api";
import { readLocal, writeLocal } from "./hooks/usePracticeStore";
import { playable } from "./lib/rehearsal";
import { nextLibrarySong, type RepeatMode } from "./lib/libraryQueue";
import type { Song } from "./types";

export function App() {
  const [route, setRoute] = useState<"library" | "import" | "player">(
    "library",
  );
  const [songs, setSongs] = useState<Song[]>([]);
  const [current, setCurrent] = useState<Song | null>(null);
  const [shuffle, setShuffle] = useState(readLocal("listening.shuffle", false));
  const [repeat, setRepeat] = useState<RepeatMode>(readLocal("listening.repeat", "off"));
  const [autoPlay, setAutoPlay] = useState(false);
  const [queueBusy, setQueueBusy] = useState(false);
  const queueLock = useRef(false);
  const played = useRef<string[]>([]);
  const history = useRef<string[]>([]);
  const [resume, setResume] = useState(false);
  const [openRequest, setOpenRequest] = useState(0);
  const openGeneration = useRef(0);
  const [help, setHelp] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    try {
      setSongs(await api.songs());
      setError("");
    } catch {
      setError(browserMode ? "Could not open device storage. Allow website storage and use a normal browsing window." : "The local audio worker is offline. Start it with npm run dev.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  // Imports can finish while the song is already open. Optional jobs do not gate playback.
  useEffect(() => {
    if (!current || current.status !== "PROCESSING") return;
    const timer = setInterval(() => {
      void api
        .song(current.id)
        .then((song) =>
          setCurrent((latest) => (latest?.id === song.id ? song : latest)),
        )
        .catch(() => {});
    }, 1500);
    return () => clearInterval(timer);
  }, [current?.id, current?.status]);
  const open = async (id: string, focus = false) => {
    const generation = ++openGeneration.current;
    try {
      const song = await api.song(id);
      if (generation !== openGeneration.current) return;
      setOpenRequest((value) => value + 1);
      setAutoPlay(false);
      played.current = [id];
      history.current = [];
      setResume(focus);
      setCurrent(song);
      setRoute("player");
    } catch (error) {
      setError(String(error));
    }
  };
  const advance = async (direction: "next" | "previous", manual = true) => {
    if (!current || queueLock.current) return;
    const ids = songs.filter(playable).map(song => song.id);
    const previous = history.current.filter(id => ids.includes(id)).at(-1);
    const target = direction === "previous" ? previous ?? ids[(ids.indexOf(current.id) - 1 + ids.length) % ids.length]
      : nextLibrarySong(ids, current.id, shuffle, played.current, repeat, manual);
    if (!target) return;
    queueLock.current = true;
    setQueueBusy(true);
    const generation = ++openGeneration.current;
    try {
      const song = await api.song(target);
      if (generation !== openGeneration.current) return;
      if (direction === "previous") history.current.pop();
      else history.current.push(current.id);
      if (played.current.includes(target)) played.current = [current.id];
      played.current.push(target);
      setError("");
      setAutoPlay(true);
      setOpenRequest(value => value + 1);
      setCurrent(song);
    } catch (error) { setError(`Could not open the next song: ${String(error)}`); }
    finally { queueLock.current = false; setQueueBusy(false); }
  };
  const update = (song: Song) => {
    setCurrent((old) => (old?.id === song.id ? song : old));
    setSongs((old) => old.map((s) => (s.id === song.id ? song : s)));
  };
  return (
    <div className="app-shell">
      {route !== "player" && (
        <header className="topbar">
          <button className="brand-button" onClick={() => setRoute("library")}>
            <Brand />
          </button>
          <nav aria-label="Primary navigation">
            <button
              onClick={() => {
                setRoute("library");
                void refresh();
              }}
            >
              <BookOpen size={17} /> Library
            </button>
            <button onClick={() => setHelp(true)}>
              <CircleHelp size={17} /> Guide
            </button>
            {!browserMode && <button className="accent" onClick={() => setRoute("import")}>
              <Plus size={17} /> Add song
            </button>}
          </nav>
        </header>
      )}
      {error && route !== "player" && (
        <div className="worker-alert" role="alert">
          <WifiOff size={17} />
          {error}
          <button onClick={() => void refresh()}>Retry</button>
        </div>
      )}
      {route === "library" && <div className="bundle-wrap">{browserMode && <OfflineStatus/>}<SongBundles songs={songs} onImported={() => void refresh()}/></div>}
      {route === "library" && (
        <LibraryPage
          songs={songs}
          loading={loading}
          onAdd={() => browserMode ? document.querySelector<HTMLInputElement>('.bundle-import input')?.click() : setRoute("import")}
          onOpen={(id) => void open(id)}
          onPractice={(id) => void open(id, true)}
          onRate={async (id, readiness) => {
            const result = await api.saveReadiness(id, readiness);
            setSongs(old => old.map(song => song.id === id ? {...song, ...result} : song));
            setCurrent(old => old?.id === id ? {...old, ...result} : old);
          }}
          onDelete={async (id) => {
            await api.deleteSong(id);
            ++openGeneration.current;
            setCurrent(old => old?.id === id ? null : old);
            setSongs(old => old.filter(song => song.id !== id));
          }}
        />
      )}
      {route === "import" && (
        <ImportPage
          onCancel={() => setRoute("library")}
          onImported={(song) => {
            setSongs((s) => [song, ...s]);
            setCurrent(song);
            setAutoPlay(false);
            played.current = [song.id];
            history.current = [];
            setResume(false);
            setRoute("player");
          }}
        />
      )}
      {current && (
        <PlayerPage
          key={current.id}
          song={current}
          autoPlay={autoPlay}
          shuffle={shuffle}
          repeat={repeat}
          queueBusy={queueBusy}
          queueError={error}
          onShuffle={() => { const value = !shuffle; setShuffle(value); writeLocal("listening.shuffle", value); played.current = [current.id]; }}
          onRepeat={() => { const value = repeat === "off" ? "all" : repeat === "all" ? "one" : "off"; setRepeat(value); writeLocal("listening.repeat", value); }}
          onNextSong={() => void advance("next")}
          onPreviousSong={() => void advance("previous")}
          onEnded={() => void advance("next", false)}
          minimized={route !== "player"}
          resumeFocus={resume}
          openRequest={openRequest}
          onLibrary={() => {
            setRoute("library");
            void refresh();
          }}
          onExpand={() => setRoute("player")}
          onUpdate={update}
          onDelete={() => {
            setCurrent(null);
            setRoute("library");
            void refresh();
          }}
        />
      )}
      {help && (
        <Drawer title="How to listen" onClose={() => setHelp(false)}>
          <UserGuide />
        </Drawer>
      )}
    </div>
  );
}
