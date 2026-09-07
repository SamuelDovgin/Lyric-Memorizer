import type { SectionOccurrence } from "../types";

/** A completed listen must cover at least 90% in one continuous visit. Seeks reset it. */
export class ListenTracker {
  private previous: number | null = null;
  private coverage = new Map<string, number>();
  private completed = new Set<string>();
  reset() { this.previous = null; this.coverage.clear(); this.completed.clear(); }
  sample(position: number, advancing: boolean, sections: SectionOccurrence[]): string[] {
    const previous = this.previous;
    this.previous = position;
    if (previous === null || !advancing || position === previous) return [];
    const delta = position - previous;
    if (delta < 0 || delta > 2) { this.reset(); this.previous = position; return []; }
    const result: string[] = [];
    for (const section of sections) {
      const key = section.lineIds[0];
      if (!key || section.end <= section.start || this.completed.has(key)) continue;
      const overlap = Math.max(0, Math.min(position, section.end) - Math.max(previous, section.start));
      const heard = (this.coverage.get(key) ?? 0) + overlap;
      this.coverage.set(key, heard);
      if (position >= section.end && heard >= (section.end - section.start) * .9) {
        result.push(key); this.completed.add(key);
      }
    }
    return result;
  }
}
