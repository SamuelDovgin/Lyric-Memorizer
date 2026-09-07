import type { LyricEmojiPin, Song } from "../types";

export type DensityPin = LyricEmojiPin & { confidence: number };
/** Only reviewed, saved annotations can appear. Dictionary lookup is a skill tool. */
export function densityCandidates(song: Song): DensityPin[] {
  const pins: DensityPin[] = [];
  const seen = new Set<string>();
  for (const line of song.lines) {
    const words = line.text.split(/\s+/).filter(Boolean);
    const valid = (song.emojiPins ?? []).filter(pin => pin.lineId === line.id && pin.lineText === line.text && words[pin.wordIndex] === pin.anchor);
    for (const [index, pin] of valid.entries()) {
      const key = `${line.id}:${pin.wordIndex}`;
      if (seen.has(key)) continue;
      seen.add(key);
      // Compatibility for older pins until reviewed by the skill. Prefer entry cues, then extras.
      pins.push({...pin, confidence: pin.confidence ?? (index === 0 ? 70 : 40)});
    }
  }
  return pins.sort((a,b) => b.confidence - a.confidence);
}
export function pinsAtDensity(candidates: DensityPin[], density: number): LyricEmojiPin[] {
  const value = Number.isFinite(density) ? Math.max(0, Math.min(100, density)) : 50;
  return candidates.slice(0, Math.round(candidates.length * value / 100));
}
