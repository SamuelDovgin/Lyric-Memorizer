import { detectSections } from "../lib/detectSections";
import { useState } from "react";
import { api } from "../lib/api";
import { getSections, formatTime } from "../lib/rehearsal";
import type { LyricLine, Song } from "../types";
export function TimingEditor({
  song,
  position,
  onSeek,
  onSave,
}: {
  song: Song;
  position: number;
  onSeek: (n: number) => void;
  onSave: (s: Song) => void;
}) {
  const [lines, setLines] = useState(() => structuredClone(detectSections(song)));
  const [selected, setSelected] = useState(() => Math.max(0, song.lines.findIndex(line => !line.verified && line.timingQuality === "needs_review")));
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const line = lines[selected];
  const update = (patch: Partial<LyricLine>) =>
    setLines((old) =>
      old.map((l, i) => (i === selected ? { ...l, ...patch } : l)),
    );
  const changeBoundary = (key: "start" | "end", value: number) => {
    if (!Number.isFinite(value)) return;
    update({ [key]: value, verified: false });
  };
  const save = async () => {
    if (
      lines.some(
        (l) =>
          l.start < 0 ||
          l.end > song.duration ||
          l.end <= l.start ||
          !Number.isFinite(l.start + l.end),
      )
    )
      return setMessage(
        "Every line needs a valid start/end inside the recording.",
      );
    setBusy(true);
    try {
      const changed = lines.map((l) => {
        const original = song.lines.find((o) => o.id === l.id)!;
        if (l.start === original.start && l.end === original.end) return l;
        return {
          ...l,
          tokens: l.tokens.map((t, i) => ({
            ...t,
            start: l.start + (i * (l.end - l.start)) / l.tokens.length,
            end: l.start + ((i + 1) * (l.end - l.start)) / l.tokens.length,
            confidence: 0.18,
            source: "manual_line_boundary",
          })),
        };
      });
      onSave(
        await api.updateAlignment(
          song.id,
          changed,
          song.alignmentRevision ?? 0,
        ),
      );
      setMessage(
        "Timing saved. Line verification does not verify estimated word timing.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };
  if (!line) return <p>This song has no lyric lines.</p>;
  return (
    <div className="timing-editor">
      <p>
        Repair the lines you need. Mark the actual sung entrance and finish,
        including pickups and sustained endings.
      </p>
      {song.alignmentRun?.snapshotPath && song.alignmentRun.inputRevision !== undefined && song.alignmentRun.inputRevision + 1 === song.alignmentRevision && <button className="button secondary" disabled={busy} onClick={async () => {
        setBusy(true);
        try {onSave(await api.restoreAlignment(song.id, song.alignmentRevision ?? 0));}
        catch (error) {setMessage(String(error));}
        finally {setBusy(false);}
      }}>Undo last automatic timing run</button>}
      <label>
        Lyric line
        <select
          value={selected}
          onChange={(e) => setSelected(Number(e.target.value))}
        >
          {lines.map((l, i) => (
            <option key={l.id} value={i}>
              {i + 1}. {l.text}{!l.verified && l.timingQuality === "needs_review" ? " · Check timing" : ""}
            </option>
          ))}
        </select>
      </label>
      <blockquote>{line.text}</blockquote>
      {!line.verified && line.timingQuality === "needs_review" && <p role="status">This line needs a listening check. The model could not confidently replace its saved timing.</p>}
      {lines.some(l => !l.verified && l.timingQuality === "needs_review") && <button className="button secondary" onClick={() => {
        const next = [...lines.keys()].map(i => (selected + 1 + i) % lines.length).find(i => !lines[i].verified && lines[i].timingQuality === "needs_review");
        if (next !== undefined) {setSelected(next); onSeek(Math.max(0, lines[next].start - 1));}
      }}>Next line to review</button>}
      <p className="muted">
        Playhead {formatTime(position)} · {position.toFixed(2)}s
      </p>
      <div className="field-grid">
        {(["start", "end"] as const).map((key) => (
          <label key={key}>
            {key === "start" ? "Start" : "End"} (seconds)
            <input
              type="number"
              min="0"
              max={song.duration}
              step="0.05"
              value={line[key]}
              onChange={(e) => changeBoundary(key, Number(e.target.value))}
            />
            <button
              className="button secondary"
              onClick={() =>
                changeBoundary(key, Math.round(position * 100) / 100)
              }
            >
              Mark {key} here
            </button>
          </label>
        ))}
      </div>
      <button
        className="button ghost"
        onClick={() => onSeek(Math.max(0, line.start - 1))}
      >
        Preview entrance
      </button>
      <label className="check-setting">
        <input
          type="checkbox"
          checked={line.verified}
          onChange={(e) => update({ verified: e.target.checked })}
        />{" "}
        I checked this line's start and end
      </label>
      <button
        className="button primary"
        disabled={busy}
        onClick={() => void save()}
      >
        Save timing
      </button>
      {message && <p role="status">{message}</p>}
      <hr />
      <h3>Section boundaries</h3>
      <p>
        Rename this section, or start a new section at the selected line.
        Repeated choruses remain separate.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const values = new FormData(e.currentTarget);
          const section = getSections(song).find((s) =>
            s.lineIds.includes(line.id),
          );
          if (!section) return setBusy(false);
          try {
            if (section.id.startsWith("suggested_")) {
              const name = String(values.get("name")).trim();
              if (!name) throw new Error("Enter a section name.");
              const split = Boolean(values.get("split"));
              const start = lines.findIndex(l => l.id === line.id);
              const sectionId = split ? `manual_${crypto.randomUUID()}` : section.id;
              const updated = lines.map((l, i) => section.lineIds.includes(l.id) && (!split || i >= start)
                ? {...l, section: name, sectionId} : l);
              onSave(await api.updateAlignment(song.id, updated, song.alignmentRevision ?? 0));
              setMessage("Section updated.");
              return;
            }
            onSave(
              await api.saveStructure(song.id, {
                sectionId: section.id,
                name: String(values.get("name")),
                revision: song.alignmentRevision ?? 0,
                ...(values.get("split") ? { splitAt: line.id } : {}),
              }),
            );
            setMessage("Section updated.");
          } catch (error) {
            setMessage(String(error));
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Section name
          <input name="name" required placeholder={line.section} />
        </label>
        <label className="check-setting">
          <input name="split" type="checkbox" /> Start a new section at this
          line
        </label>
        <button className="button secondary" disabled={busy}>
          Save section
        </button>
      </form>
    </div>
  );
}
