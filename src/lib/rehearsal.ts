import { detectSections } from "./detectSections";
import type {
  BeatMap,
  LyricLine,
  Passage,
  PlayerSettings,
  PracticeEvent,
  PracticeState,
  SectionOccurrence,
  Song,
} from "../types";

export const defaultSettings: PlayerSettings = {
  leadIn: "none",
  countIn: "click",
  beats: 2,
  versesFirst: true,
  singer: 1,
  mix: false,
  fontSize: 48,
  syncOffset: 0,
};
export const formatTime = (time: number) =>
  `${Math.floor(Math.max(0, time) / 60)}:${Math.floor(Math.max(0, time) % 60)
    .toString()
    .padStart(2, "0")}`;
export const playable = (song: Song) =>
  Boolean(song.originalUrl || (song.vocalsUrl && song.instrumentalUrl));
export const usable = (line: LyricLine) =>
  (line.verified || line.confidence >= 0.55) &&
  line.end > line.start &&
  Number.isFinite(line.start + line.end);

export function getSections(song: Song): SectionOccurrence[] {
  const sections: SectionOccurrence[] = [];
  for (const line of detectSections(song)) {
    const previous = sections.at(-1);
    const id =
      line.sectionId ??
      (previous?.name === line.section ? previous.id : `section_${line.id}`);
    if (!previous || previous.id !== id)
      sections.push({
        id,
        name: line.section,
        kind:
          /chorus/i.test(line.section) && !/pre/i.test(line.section)
            ? "chorus"
            : /verse/i.test(line.section)
              ? "verse"
              : "other",
        lineIds: [],
        start: line.start,
        end: line.end,
      });
    const section = sections.at(-1)!;
    section.lineIds.push(line.id);
    section.end = Math.max(section.end, line.end);
  }
  const seen = new Map<string, number>();
  const names = sections.map((s) => s.name);
  return sections.map((s) => {
    const n = (seen.get(s.name) ?? 0) + 1;
    seen.set(s.name, n);
    return {
      ...s,
      name:
        names.filter((n) => n === s.name).length > 1
          ? `${s.name} ${n}`
          : s.name,
    };
  });
}

export function activeLine(lines: LyricLine[], time: number): number {
  return lines.findIndex(
    (line) => usable(line) && time >= line.start && time < line.end,
  );
}
export function feedbackLine(
  lines: LyricLine[],
  time: number,
  heardFrom = 0,
): number {
  const current = activeLine(lines, time);
  if (current >= 0) {
    const line = lines[current];
    const previous = lines[current - 1];
    if (
      previous &&
      previous.end - Math.max(previous.start, heardFrom) >=
        Math.min(0.5, (previous.end - previous.start) / 2) &&
      usable(previous) &&
      line.start - previous.end < 2 &&
      time - line.start < Math.min(0.8, (line.end - line.start) / 2)
    )
      return current - 1;
    return current;
  }
  for (let index = lines.length - 1; index >= 0; index--) {
    if (
      usable(lines[index]) &&
      time >= lines[index].end &&
      time - lines[index].end <= 2
    )
      return index;
  }
  return -1;
}

export function deriveState(events: PracticeEvent[]): PracticeState {
  const byId = new Map(events.map((e) => [e.id, e]));
  const undone = new Set(
    [...byId.values()]
      .filter((e) => e.judgment === "undo")
      .map((e) => e.supersedes),
  );
  // One judgment per line/pass; a changed judgment supersedes without adding a pass.
  const passes = new Map<string, PracticeEvent>();
  for (const event of [...byId.values()].sort((a, b) =>
    a.sessionId === b.sessionId
      ? a.sequence - b.sequence
      : a.createdAt.localeCompare(b.createdAt),
  )) {
    if (event.judgment !== "undo" && !undone.has(event.id))
      passes.set(`${event.sessionId}:${event.passId}:${event.lineId}`, event);
  }
  const state: PracticeState = {};
  for (const e of [...passes.values()].sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt) || a.sequence - b.sequence,
  )) {
    const old = state[e.lineId];
    state[e.lineId] = {
      judgment: e.judgment as "again" | "got-it",
      comfortablePasses:
        e.judgment === "again" ? 0 : (old?.comfortablePasses ?? 0) + 1,
      lastAt: e.createdAt,
    };
  }
  return state;
}

export function makePassage(
  song: Song,
  first: number,
  last = first,
  leadIn: PlayerSettings["leadIn"] = "previous",
): Passage {
  first = Math.max(0, Math.min(first, song.lines.length - 1));
  last = Math.max(first, Math.min(last, song.lines.length - 1));
  const line = song.lines[first];
  const ending = song.lines[last];
  const previous = song.lines[first - 1];
  const start =
    leadIn === "previous" && previous && usable(previous)
      ? previous.start
      : Math.max(0, line.start - (leadIn === "none" ? 0.08 : 2));
  const section = getSections(song).find((s) => s.lineIds.includes(line.id));
  return {
    id: `${line.id}:${ending.id}`,
    lineIds: song.lines.slice(first, last + 1).map((l) => l.id),
    start,
    end: Math.min(song.duration, ending.end + 0.08),
    targetStart: line.start,
    targetEnd: ending.end,
    label: `${section?.name ?? line.section} · ${first === last ? `line ${first + 1}` : `lines ${first + 1}–${last + 1}`}`,
  };
}

export function phrase(
  song: Song,
  index: number,
  settings: PlayerSettings,
  expand = false,
): Passage {
  const section = getSections(song).find((s) =>
    s.lineIds.includes(song.lines[index]?.id),
  );
  if (expand && section) {
    const a = song.lines.findIndex((l) => l.id === section.lineIds[0]);
    return makePassage(
      song,
      a,
      a + section.lineIds.length - 1,
      settings.leadIn,
    );
  }
  const next = song.lines[index + 1];
  const last =
    next && section?.lineIds.includes(next.id) && usable(next)
      ? index + 1
      : index;
  return makePassage(song, index, last, settings.leadIn);
}

export function chooseNext(
  song: Song,
  state: PracticeState,
  history: string[],
  scope: string,
  versesFirst: boolean,
): number | null {
  const sections = getSections(song);
  const scoped = sections.find((s) => s.id === scope);
  const candidates = song.lines
    .map((line, index) => ({
      line,
      index,
      section: sections.find((s) => s.lineIds.includes(line.id)),
    }))
    .filter(
      ({ line }) =>
        usable(line) &&
        line.end <= song.duration &&
        (!scoped || scoped.lineIds.includes(line.id)),
    )
    .filter(({ line }) => !history.slice(-1).includes(line.id));
  if (!candidates.length) return null;
  const normalized = (text: string) =>
    text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  const comfortableTexts = new Set(
    song.lines
      .filter((l) => state[l.id]?.judgment === "got-it")
      .map((l) => normalized(l.text)),
  );
  const scored = candidates
    .map((c) => {
      const mark = state[c.line.id];
      const visited = history.filter((id) => id === c.line.id).length;
      let score =
        mark?.judgment === "again"
          ? 100
          : mark?.judgment === "got-it"
            ? -30
            : 20;
      score -= visited * 35;
      if (versesFirst && c.section?.kind === "verse") score += 8;
      if (
        versesFirst &&
        c.section?.kind === "chorus" &&
        comfortableTexts.has(normalized(c.line.text)) &&
        mark?.judgment !== "again"
      )
        score -= 25;
      return { ...c, score };
    })
    .sort((a, b) => b.score - a.score || a.index - b.index);
  return scored[0].score > -40 ? scored[0].index : null;
}

export function countPlan(
  map: BeatMap | null,
  start: number,
  settings: PlayerSettings,
): { duration: number; clicks: number[] } {
  if (!map?.verified || settings.countIn === "off" || !map.beats.length)
    return { duration: 0, clicks: [] };
  let index = map.beats.findIndex((t) => t >= start);
  if (index < 0) index = map.beats.length - 1;
  const step =
    index > 0 ? map.beats[index] - map.beats[index - 1] : 60 / map.bpm;
  if (!Number.isFinite(step) || step <= 0) return { duration: 0, clicks: [] };
  // Count into the source entry's fractional beat phase, preserving pickups.
  const previousBeat =
    map.beats[index] > start ? map.beats[index] - step : map.beats[index];
  const phase = Math.max(0, Math.min(step, start - previousBeat));
  const duration = settings.beats * step + phase;
  return {
    duration,
    clicks:
      settings.countIn === "click"
        ? Array.from({ length: settings.beats }, (_, i) => i * step)
        : [],
  };
}
