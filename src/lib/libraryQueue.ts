export type RepeatMode = "off" | "all" | "one";
export function nextLibrarySong(ids: string[], current: string, shuffle: boolean, played: string[], repeat: RepeatMode, manual = false, random = Math.random): string | null {
  if (!ids.length) return null;
  if (!manual && repeat === "one") return current;
  if (shuffle) {
    let pool = ids.filter(id => id !== current && !played.includes(id));
    if (!pool.length && (repeat === "all" || manual)) pool = ids.filter(id => id !== current);
    return pool.length ? pool[Math.floor(random() * pool.length)] : repeat === "all" ? current : null;
  }
  const index = ids.indexOf(current);
  return ids[index + 1] ?? ((repeat === "all" || manual) ? ids[0] : null);
}
