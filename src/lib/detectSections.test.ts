import { expect, it } from "vitest";
import type { Song } from "../types";
import { getSections } from "./rehearsal";
import { detectSections } from "./detectSections";
const song = (texts: string[], lyrics = texts.join("\n")) => ({ lyrics, lines: texts.map((text, i) => ({id: `l${i}`, text, section: "Song", sectionId: "old", start: i * 3, end: i * 3 + 2, confidence: .9})) }) as Song;
it("finds repeated multi-line choruses without overlapping fragments", () => {
  const s = song(["First verse", "Another thought", "Stay with me", "In the light", "A new verse", "Something else", "Stay with me", "In the light"]);
  expect(getSections(s).map(s => [s.name, s.lineIds.length])).toEqual([["Section 1", 2], ["Chorus (suggested) 1", 2], ["Section 2", 2], ["Chorus (suggested) 2", 2]]);
});
it("preserves source labels and does not change lyrics or timing", () => {
  const s = song(["one", "two"]);
  s.lines.forEach(l => { l.section = "Bridge"; });
  expect(detectSections(s)).toEqual(s.lines);
});
it("uses stanza breaks and manageable neutral chunks without inventing verses", () => {
  const s = song(["one", "two", "three", "four"], "one\ntwo\n\nthree\nfour");
  expect(getSections(s).map(s => s.lineIds.length)).toEqual([2, 2]);
  expect(getSections(song(Array.from({length: 19}, (_, i) => `Unique line ${i}`))).map(s => s.lineIds.length)).toEqual([8, 8, 3]);
});
it("does not call repeated single-word chants a chorus", () => {
  expect(getSections(song(["hey", "hey", "hey", "hey"])).map(s => s.name)).toEqual(["Section"]);
});
it("uses reliable silence gaps for unlabeled lyrics", () => {
  const s = song(["one", "two", "three"]); s.lines[2].start = 12;
  expect(getSections(s).map(s => s.lineIds.length)).toEqual([2, 1]);
});
