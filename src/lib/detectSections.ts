import type { LyricLine, Song } from "../types";

const normalize = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
const unlabeled = (line: LyricLine) => !line.section || /^(song|section(?: \d+)?)$/i.test(line.section);

/** Preserve source/editor labels. Suggestions never change lyric text or timing. */
export function detectSections(song: Song): LyricLine[] {
  const lines = song.lines;
  const boundaries = new Set<number>([0]);
  // Recover stanza boundaries from original lyrics, including songs imported before detection existed.
  const raw = (song.lyrics ?? "").split(/\r?\n/);
  let cursor = 0;
  let stanza = false;
  for (const row of raw) {
    if (!row.trim()) { stanza = true; continue; }
    const text = normalize(row);
    if (!text) continue;
    const index = lines.findIndex((line, i) => i >= cursor && normalize(line.text ?? "") === text);
    if (index < 0) continue;
    if (stanza) boundaries.add(index);
    stanza = false;
    cursor = index + 1;
  }
  // Repeated multi-line phrases supply useful boundaries even for unformatted API lyrics.
  const repeated = new Map<number, number>();
  const covered = (index: number) => [...repeated].some(([start, length]) => index >= start && index < start + length);
  for (let a = 0; a < lines.length; a++) {
    if (!unlabeled(lines[a]) || covered(a)) continue;
    for (let b = a + 2; b < lines.length; b++) {
      if (covered(b)) continue;
      let length = 0;
      while (a + length < b && b + length < lines.length &&
        unlabeled(lines[a + length]) && unlabeled(lines[b + length]) &&
        normalize(lines[a + length].text ?? "") &&
        normalize(lines[a + length].text ?? "") === normalize(lines[b + length].text ?? "")) length++;
      if (length >= 2 && new Set(lines.slice(a, a + length).map(l => normalize(l.text))).size >= 2) {
        if (!repeated.has(a) && !repeated.has(b)) {
          repeated.set(a, length); repeated.set(b, length);
          boundaries.add(a); boundaries.add(a + length); boundaries.add(b); boundaries.add(b + length);
        }
      }
    }
  }
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].sectionId !== lines[i - 1].sectionId || lines[i].section !== lines[i - 1].section ||
      (lines[i].confidence >= .55 && lines[i - 1].confidence >= .55 && lines[i].start - lines[i - 1].end >= 3)) boundaries.add(i);
  }
  // When structure is ambiguous, offer manageable, neutrally named practice chunks.
  let start = 0;
  return lines.map((line, i) => {
    if (!unlabeled(line)) return line;
    if (boundaries.has(i) || i - start >= 8) start = i;
    return { ...line, section: repeated.has(start) ? "Chorus (suggested)" : "Section", sectionId: `suggested_${lines[start].id}` };
  });
}
