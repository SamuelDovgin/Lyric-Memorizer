import { browserMode } from "../lib/browserLibrary";
import { useState } from "react";
import {
  ArrowRight,
  Headphones,
  Music2,
  Plus,
  Play,
  Trash2,

} from "lucide-react";
import { playable, formatTime } from "../lib/rehearsal";
import { readLocal } from "../hooks/usePracticeStore";
import { savedPractice } from "../lib/savedPractice";
import type { Song } from "../types";
const readinessLevels = [
  { emoji: "😟", label: "Just starting", description: "The lyrics are still new to me." },
  { emoji: "😕", label: "Finding the pieces", description: "I know a few parts; most still need practice." },
  { emoji: "😐", label: "Getting familiar", description: "I can follow along, but some line starts still trip me up." },
  { emoji: "🙂", label: "Almost there", description: "I know most of it; a few spots need polishing." },
  { emoji: "😄", label: "Concert ready", description: "I feel confident singing along from start to finish." },
];
interface Props {
  songs: Song[];
  onRate: (id: string, readiness: number) => Promise<void>;
  onEdit: (id: string) => void;
  onDelete: (id: string) => Promise<void>;
  loading: boolean;
  onAdd: () => void;
  onOpen: (id: string) => void;
  onPractice: (id: string) => void;
}
export function LibraryPage({
  songs,
  loading,
  onAdd,
  onOpen,
  onPractice,
  onRate,
  onDelete,
  onEdit,
}: Props) {
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const perform = async (id: string, action: () => Promise<void>) => {
    setBusy(old => ({...old, [id]: true}));
    setErrors(old => ({...old, [id]: ""}));
    try { await action(); }
    catch (error) { setErrors(old => ({...old, [id]: `Could not save this change: ${String(error)}`})); }
    finally { setBusy(old => ({...old, [id]: false})); }
  };
  return (
    <div className="page library-page">
      <section className="hero-row">
        <div>
          <span className="eyebrow">
            <Headphones size={15} /> Your listening room
          </span>
          <h1>
            Find your verse.
            <br />
            Make it yours.
          </h1>
          <p>
            Your lyrics, in motion.
            <br />
            Every listen adds up.
          </p>
        </div>
        <div className="summary-card">
          <span>Ready when you are</span>
          <strong>
            {songs.filter(playable).length}
            <small> songs</small>
          </strong>
          <p>Your music. Your pace.</p>
          <div className="summary-rule" />
          <b>Smooth lyrics · Lifetime play counts</b>
        </div>
      </section>
      <section className="section-heading">
        <div>
          <span className="eyebrow">On repeat, for a reason</span>
          <h2>Your songs</h2>
        </div>
        {songs.length > 0 && (
          <button className="button secondary" onClick={onAdd}>
            <Plus size={17} /> {browserMode ? "Import bundle" : "Add song"}
          </button>
        )}
      </section>
      {loading ? (
        <div className="empty-card">
          <div className="spinner" />
          <p>Opening your library…</p>
        </div>
      ) : !songs.length ? (
        <div className="empty-card large">
          <span className="empty-icon">
            <Music2 size={28} />
          </span>
          <h3>One song is a good place to start.</h3>
          <p>{browserMode ? "Export a song ZIP from your Mac and import it here once." : "Bring a recording and its lyrics. No stems or quizzes required."}</p>
          <button className="button primary" onClick={onAdd}>
            <Plus size={18} /> {browserMode ? "Import your first bundle" : "Add your first song"}
          </button>
        </div>
      ) : (
        <div className="song-grid">
          {songs.map((song, index) => {
            const practice = savedPractice(song);
            const position = readLocal<number>(`listening.position.${song.id}`, 0);
            const processing = song.status === "PROCESSING";
            const processingPercent = Math.round(Math.max(0, Math.min(1, song.processingProgress ?? 0)) * 100);

            return (
              <article className="song-card" key={song.id}>
                <button
                  className="song-card-main"
                  onClick={() => onOpen(song.id)}
                >
                  <span className={`cover cover-${index % 4}`}>
                    <Music2 />
                  </span>
                  <span className="song-copy">
                    <span className="library-song-status">
                      {processing ? `Preparing timing · ${processingPercent}%` : playable(song) ? "Ready to play" : "Preparing audio"}

                    </span>
                    <strong>{song.title}</strong>
                    <span>
                      {song.artist || "Your recording"} ·{" "}
                      {formatTime(song.duration)}
                    </span>
                    {processing && <span className="library-progress" role="status" aria-label={`${processingPercent}% timing progress`}>
                      <i><b style={{width: `${Math.max(3, processingPercent)}%`}} /></i>
                      <small>{song.processingMessage || song.statusMessage || "Waiting to start"}</small>
                    </span>}
                  </span>
                  <ArrowRight size={20} className="card-arrow" />
                </button>
                <div className="song-readiness">
                  <div className="readiness-heading">
                    <span>How ready do you feel?</span>
                    <strong>{song.readiness ? readinessLevels[song.readiness - 1]?.label : "Not rated yet"}</strong>
                  </div>
                  <div className="readiness-options" role="group" aria-label={`Readiness for ${song.title}`}>
                    {readinessLevels.map((level, i) => (
                      <button key={level.label} type="button"
                        disabled={busy[song.id]}
                        aria-label={`${level.label}: ${level.description}`}
                        aria-pressed={song.readiness === i + 1}
                        title={`${level.label} — ${level.description}`}
                        onClick={() => void perform(song.id, () => onRate(song.id, i + 1))}>
                        <span aria-hidden="true">{level.emoji}</span>
                        <span className="readiness-tooltip" aria-hidden="true">{level.label} — {level.description}</span>
                      </button>
                    ))}
                  </div>
                  {errors[song.id] && <p className="song-error" role="alert">{errors[song.id]}</p>}
                </div>
                <div className="song-actions">
                  <button onClick={() => practice ? onPractice(song.id) : onOpen(song.id)}>
                    <Play size={16} />
                    {practice ? `Continue ${practice.section.name}` : position > 0
                      ? `Continue · ${formatTime(position)}`
                      : "Play song"}
                  </button>
                  <button disabled={busy[song.id]} aria-label={`Edit ${song.title}`} onClick={() => onEdit(song.id)}>Edit</button>
                  <button className="delete-song" disabled={busy[song.id]}
                    aria-label={`Delete ${song.title}`}
                    onClick={() => {
                      if (window.confirm(`Delete “${song.title}”? This removes its local audio, lyrics, and practice history. This cannot be undone.`)) {
                        void perform(song.id, () => onDelete(song.id));
                      }
                    }}><Trash2 size={16} /> Delete</button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
