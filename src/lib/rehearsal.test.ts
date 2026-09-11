import { describe, expect, it } from "vitest";
import {
  chooseNext,
  countPlan,
  defaultSettings,
  deriveState,
  feedbackLine,
  activeLine,
  getSections,
  makePassage,
  phrase,
} from "./rehearsal";
import type { PracticeEvent, Song } from "../types";
const song: Song = {
  id: "s",
  title: "Test",
  artist: "",
  lyrics: "",
  duration: 30,
  status: "READY",
  statusMessage: "",
  createdAt: "",
  originalUrl: "/a.wav",
  vocalsUrl: null,
  instrumentalUrl: null,
  lines: Array.from({ length: 6 }, (_, i) => ({
    id: `l${i}`,
    songId: "s",
    index: i,
    section: i < 2 ? "Chorus" : i < 4 ? "Verse" : "Chorus",
    sectionId: `s${Math.floor(i / 2)}`,
    text: i % 2 ? "different ending" : "same text",
    start: i * 4 + 1,
    end: i * 4 + 4,
    confidence: 0.8,
    verified: true,
    tokens: [],
  })),
};
const event = (
  sequence: number,
  judgment: PracticeEvent["judgment"],
  pass = "a",
): PracticeEvent => ({
  id: `e${sequence}`,
  songId: "s",
  sessionId: "session",
  sequence,
  passId: pass,
  lineId: "l0",
  judgment,
  sourceTime: 1,
  createdAt: `2026-09-05T12:00:0${sequence}Z`,
});
describe("musical navigation", () => {
  it("chooses the newer lyric when Whisper and catalog windows overlap", () => {
    const overlapping = song.lines.map((line) => ({...line}));
    overlapping[1].start = 4.2;
    overlapping[0].end = 4.6;
    expect(activeLine(overlapping, 4.3)).toBe(1);
  });
  it("distinguishes identically named choruses and keeps exact occurrence scope", () => {
    expect(getSections(song).map((s) => s.name)).toEqual([
      "Chorus 1",
      "Verse",
      "Chorus 2",
    ]);
    expect(chooseNext(song, {}, [], "s2", false)).toBe(4);
  });
  it("keeps the actual preceding line as context, even at a verse entrance", () => {
    const p = makePassage(song, 2, 3);
    expect(p.start).toBe(song.lines[1].start);
    expect(p.targetStart).toBe(song.lines[2].start);
    expect(p.lineIds).toEqual(["l2", "l3"]);
  });
  it("does not extend a target into an unrelated section", () => {
    expect(phrase(song, 1, defaultSettings).lineIds).toEqual(["l1"]);
  });
  it("expands a comfortable passage to the exact section", () => {
    expect(phrase(song, 4, defaultSettings, true).lineIds).toEqual([
      "l4",
      "l5",
    ]);
  });
  it("uses a capped late-feedback grace period and expires in gaps", () => {
    expect(feedbackLine(song.lines, 5.2)).toBe(0);
    expect(feedbackLine(song.lines, 6)).toBe(1);
    expect(feedbackLine(song.lines, 29)).toBe(-1);
  });
});
describe("feedback evidence", () => {
  it("deduplicates retries and counts one comfortable judgment per pass", () => {
    const first = event(1, "got-it");
    const state = deriveState([first, first, event(2, "got-it")]);
    expect(state.l0.comfortablePasses).toBe(1);
  });
  it("a later Again replaces comfort without manufacturing another pass", () => {
    expect(
      deriveState([event(1, "got-it"), event(2, "again")]).l0,
    ).toMatchObject({ judgment: "again", comfortablePasses: 0 });
  });
  it("undo restores the preceding judgment, including across passes", () => {
    expect(
      deriveState([
        event(1, "again"),
        event(2, "got-it", "b"),
        { ...event(3, "undo"), supersedes: "e2" },
      ]).l0.judgment,
    ).toBe("again");
  });
  it("listening without a mark produces no state", () =>
    expect(deriveState([])).toEqual({}));
  it("a weak chorus takes priority over an unmarked verse", () =>
    expect(
      chooseNext(song, deriveState([event(1, "again")]), [], "", true),
    ).toBe(0));
  it("does not automatically replay the last target indefinitely", () =>
    expect(
      chooseNext(song, deriveState([event(1, "again")]), ["l0"], "", true),
    ).not.toBe(0));
  it("does not schedule uncertain lines", () => {
    const uncertain = {
      ...song,
      lines: song.lines.map((l) => ({
        ...l,
        confidence: 0.18,
        verified: false,
      })),
    };
    expect(chooseNext(uncertain, {}, [], "", true)).toBe(null);
  });
});
describe("count-in planning", () => {
  const map = {
    bpm: 120,
    anchor: 0,
    beats: [0, 0.5, 1, 1.5, 2],
    confidence: 0.8,
    verified: true,
    source: "manual",
  };
  it("falls back to original lead-in for unconfirmed beats", () =>
    expect(
      countPlan({ ...map, verified: false }, 1, defaultSettings).duration,
    ).toBe(0));
  it("counts two beats and preserves the destination pickup phase", () => {
    expect(countPlan(map, 1, defaultSettings)).toEqual({
      duration: 1,
      clicks: [0, 0.5],
    });
    expect(countPlan(map, 1.25, defaultSettings)).toEqual({
      duration: 1.25,
      clicks: [0, 0.5],
    });
  });
  it("retains count duration but removes audio in silent mode", () =>
    expect(
      countPlan(map, 1, { ...defaultSettings, countIn: "silent" }),
    ).toEqual({ duration: 1, clicks: [] }));
});
