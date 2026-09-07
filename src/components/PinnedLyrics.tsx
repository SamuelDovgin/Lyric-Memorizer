import type { LyricLine, LyricEmojiPin } from "../types";

export function PinnedLyrics({line, pins}: {line: LyricLine; pins: LyricEmojiPin[]}) {
  const valid = pins.filter(pin => pin.lineId === line.id && pin.lineText === line.text);
  if (!valid.length) return <>{line.text}</>;
  return <span className="pinned-lyrics">{Array.from(line.text.matchAll(/\S+|\s+/g), (match) => {
    if (/^\s+$/.test(match[0])) return match[0];
    const pin = valid.find(p => p.wordIndex === line.text.slice(0, match.index).split(/\s+/).filter(Boolean).length && p.anchor === match[0]);
    return <span className="pinned-word" key={match.index}>{pin && <span className="lyric-emoji-pin" aria-hidden="true" title={pin.meaning}>{pin.emoji}</span>}{match[0]}</span>;
  })}</span>;
}
