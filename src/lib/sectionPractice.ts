import type { Song, SectionOccurrence } from "../types";
import { usable } from "./rehearsal";

export type SectionRating = "needs-work" | "getting-there" | "ready";
export interface SectionPractice {
  sectionId: string | null;
  ratings: Record<string, { rating: SectionRating; updatedAt: string }>;
}
export function sectionRange(song: Song, section: SectionOccurrence): [number, number] | null {
  const indices = section.lineIds.map(id => song.lines.findIndex(line => line.id === id));
  if (!indices.length || indices.some(i => i < 0 || !usable(song.lines[i]) || song.lines[i].end > song.duration)) return null;
  return [indices[0], indices[indices.length - 1]];
}
export const ratingLabel = (rating?: SectionRating) => rating === "ready" ? "Ready" : rating === "getting-there" ? "Getting there" : rating === "needs-work" ? "Needs practice" : "Not rated";
