import { readLocal, writeLocal } from "../hooks/usePracticeStore";
import { getSections, usable } from "./rehearsal";
import type { SectionOccurrence, Song } from "../types";

interface SavedPractice {
  sectionId: string;
  revision: number;
  position: number;
  range?: [number, number] | null;
  chunkSize?: number;
}

export function savedPractice(song: Song) {
  const saved = readLocal<SavedPractice | null>(`listening.practice.${song.id}`, null);
  if (!saved || saved.revision !== (song.alignmentRevision ?? 0)) return null;
  const section = getSections(song).find(section => section.id === saved.sectionId);
  if (!section || !section.lineIds.every(id => {
    const line = song.lines.find(line => line.id === id);
    return line && usable(line);
  })) return null;
  const range = saved.range && saved.range.length === 2 && saved.range.every(Number.isInteger) && saved.range[0] >= 0 && saved.range[1] >= saved.range[0] && saved.range[1] < section.lineIds.length ? saved.range : null;
  const start = range ? song.lines.find(l => l.id === section.lineIds[range[0]])!.start : section.start;
  const end = range ? song.lines.find(l => l.id === section.lineIds[range[1]])!.end : section.end;
  const position = Number.isFinite(saved.position) && saved.position >= start && saved.position < end
    ? saved.position : start;
  return {section, position, range, chunkSize: Number.isInteger(saved.chunkSize) && saved.chunkSize! > 0 ? saved.chunkSize! : 2};
}

export function savePractice(song: Song, section: SectionOccurrence, position: number, range: [number, number] | null = null, chunkSize = 2) {
  return writeLocal(`listening.practice.${song.id}`, {
    sectionId: section.id,
    revision: song.alignmentRevision ?? 0,
    position,
    range,
    chunkSize,
  } satisfies SavedPractice);
}
