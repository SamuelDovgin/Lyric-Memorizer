import { readLocal, writeLocal } from "../hooks/usePracticeStore";
import { getSections, usable } from "./rehearsal";
import type { SectionOccurrence, Song } from "../types";

interface SavedPractice {
  sectionId: string;
  revision: number;
  position: number;
}

export function savedPractice(song: Song) {
  const saved = readLocal<SavedPractice | null>(`listening.practice.${song.id}`, null);
  if (!saved || saved.revision !== (song.alignmentRevision ?? 0)) return null;
  const section = getSections(song).find(section => section.id === saved.sectionId);
  if (!section || !section.lineIds.every(id => {
    const line = song.lines.find(line => line.id === id);
    return line && usable(line);
  })) return null;
  const position = Number.isFinite(saved.position) && saved.position >= section.start && saved.position < section.end
    ? saved.position : section.start;
  return {section, position};
}

export function savePractice(song: Song, section: SectionOccurrence, position: number) {
  return writeLocal(`listening.practice.${song.id}`, {
    sectionId: section.id,
    revision: song.alignmentRevision ?? 0,
    position,
  } satisfies SavedPractice);
}
