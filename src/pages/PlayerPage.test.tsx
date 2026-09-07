import { beforeEach, afterEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { PlayerPage } from "./PlayerPage";
import { LibraryPage } from "./LibraryPage";
import type { Song } from "../types";

const mock = vi.hoisted(() => ({
  state: {status: "paused", position: 0, duration: 20, pass: 0, error: null},
  transport: {seek: vi.fn(), play: vi.fn(), pause: vi.fn(), setTransition: vi.fn(), subscribe: vi.fn(() => () => {}), getSnapshot: () => ({position: mock.state.position})},
}));
vi.mock("../hooks/useRehearsalPlayer", () => ({useRehearsalPlayer: () => ({...mock.state, transport: mock.transport})}));
vi.mock("../hooks/useListenCounts", () => ({useListenCounts: () => ({counts: {}, record: vi.fn(), error: ""})}));
const song: Song = {
  id: "test", title: "Test song", artist: "", lyrics: "", duration: 20, status: "READY", statusMessage: "", createdAt: "", originalUrl: "/audio.wav", vocalsUrl: null, instrumentalUrl: null,
  lines: [0, 1].map(i => ({id: `line${i}`, songId: "test", index: i, section: `Verse ${i + 1}`, sectionId: `verse${i}`, text: `Lyric ${i}`, start: 1 + i * 5, end: 5 + i * 5, verified: true, confidence: 1, tokens: []})),
};
const props = {song, autoPlay: false, shuffle: false, repeat: "off" as const, queueBusy: false, queueError: "", minimized: false, resumeFocus: false, openRequest: 0,
  onShuffle: vi.fn(), onRepeat: vi.fn(), onNextSong: vi.fn(), onPreviousSong: vi.fn(), onEnded: vi.fn(), onLibrary: vi.fn(), onExpand: vi.fn(), onUpdate: vi.fn(), onDelete: vi.fn()};
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mock.state = {status: "paused", position: 0, duration: 20, pass: 0, error: null};
  window.matchMedia = vi.fn().mockReturnValue({matches: true});
  HTMLElement.prototype.scrollTo = vi.fn();
});
afterEach(cleanup);

test("loop buttons jump, share selection, switch sections and toggle off", () => {
  render(<PlayerPage {...props}/>);
  fireEvent.click(screen.getAllByRole("button", {name: "Loop Verse 1"})[0]);
  expect(mock.transport.seek).toHaveBeenLastCalledWith(1);
  for (const button of screen.getAllByRole("button", {name: "Loop Verse 1"})) expect(button).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(screen.getAllByRole("button", {name: "Loop Verse 2"})[1]);
  expect(mock.transport.seek).toHaveBeenLastCalledWith(6);
  expect(screen.getAllByRole("button", {name: "Loop Verse 1"})[0]).toHaveAttribute("aria-pressed", "false");
  fireEvent.click(screen.getAllByRole("button", {name: "Loop Verse 2"})[0]);
  expect(mock.transport.seek).toHaveBeenLastCalledWith(6);
  expect(screen.getAllByRole("button", {name: "Loop Verse 2"})[1]).toHaveAttribute("aria-pressed", "false");
});

test("rearms each pass and recovers at song end without advancing the queue", () => {
  mock.state.status = "playing";
  const view = render(<PlayerPage {...props}/>);
  fireEvent.click(screen.getAllByRole("button", {name: "Loop Verse 1"})[0]);
  expect(mock.transport.setTransition).toHaveBeenLastCalledWith({id: "verse0", start: 1, exit: 5, gap: 0, clicks: []});
  mock.state.pass++;
  view.rerender(<PlayerPage {...props}/>);
  expect(mock.transport.setTransition).toHaveBeenLastCalledWith(expect.objectContaining({start: 1, exit: 5}));
  mock.state.status = "ended";
  view.rerender(<PlayerPage {...props}/>);
  expect(mock.transport.play).toHaveBeenLastCalledWith(1);
  expect(props.onEnded).not.toHaveBeenCalled();
});

test("jumping outside the loop clears it", () => {
  render(<PlayerPage {...props}/>);
  fireEvent.click(screen.getAllByRole("button", {name: "Loop Verse 1"})[0]);
  fireEvent.click(screen.getByRole("button", {name: "Go to line 2: Lyric 1"}));
  expect(screen.getAllByRole("button", {name: "Loop Verse 1"})[0]).toHaveAttribute("aria-pressed", "false");
  expect(mock.transport.seek).toHaveBeenLastCalledWith(6);
});

test("library continues the saved section and position after the player is closed", () => {
  const view = render(<PlayerPage {...props}/>);
  fireEvent.click(screen.getAllByRole("button", {name: "Loop Verse 2"})[0]);
  mock.state.position = 8;
  fireEvent.click(screen.getByRole("button", {name: "Back to library"}));
  view.unmount();
  const onPractice = vi.fn();
  const library = render(<LibraryPage songs={[song]} loading={false} onPractice={onPractice} onOpen={vi.fn()} onAdd={vi.fn()} onDelete={vi.fn()} onRate={vi.fn()}/>);
  fireEvent.click(screen.getByRole("button", {name: "Continue Verse 2"}));
  expect(onPractice).toHaveBeenCalledWith(song.id);
  library.unmount();
  render(<StrictMode><PlayerPage {...props} resumeFocus openRequest={1}/></StrictMode>);
  expect(mock.transport.play).toHaveBeenLastCalledWith(8);
  expect(screen.getAllByRole("button", {name: "Loop Verse 2"})[0]).toHaveAttribute("aria-pressed", "true");
});

test("continuing practice also works when the same song is still mounted", () => {
  const view = render(<PlayerPage {...props}/>);
  fireEvent.click(screen.getAllByRole("button", {name: "Loop Verse 2"})[0]);
  mock.state.position = 8;
  fireEvent.click(screen.getByRole("button", {name: "Back to library"}));
  fireEvent.click(screen.getByRole("button", {name: "Go to line 1: Lyric 0"}));
  view.rerender(<PlayerPage {...props} resumeFocus openRequest={1}/>);
  expect(mock.transport.play).toHaveBeenLastCalledWith(8);
  expect(screen.getAllByRole("button", {name: "Loop Verse 2"})[0]).toHaveAttribute("aria-pressed", "true");
});

test("library autoplay does not restart a saved practice loop", () => {
  const view = render(<PlayerPage {...props}/>);
  fireEvent.click(screen.getAllByRole("button", {name: "Loop Verse 2"})[0]);
  view.unmount();
  render(<PlayerPage {...props} autoPlay openRequest={1}/>);
  expect(mock.transport.play).toHaveBeenLastCalledWith(0);
  expect(screen.getAllByRole("button", {name: "Loop Verse 2"})[0]).toHaveAttribute("aria-pressed", "false");
});

test("changed timing invalidates saved practice instead of restoring an outdated loop", () => {
  const view = render(<PlayerPage {...props}/>);
  fireEvent.click(screen.getAllByRole("button", {name: "Loop Verse 2"})[0]);
  view.unmount();
  render(<PlayerPage {...props} song={{...song, alignmentRevision: 1}} resumeFocus openRequest={1}/>);
  expect(mock.transport.play).not.toHaveBeenCalled();
  expect(screen.getAllByRole("button", {name: "Loop Verse 2"})[0]).toHaveAttribute("aria-pressed", "false");
});

test("a saved position outside the phrase resumes at its entrance", () => {
  const view = render(<PlayerPage {...props}/>);
  fireEvent.click(screen.getAllByRole("button", {name: "Loop Verse 2"})[0]);
  mock.state.position = 12;
  view.unmount();
  render(<PlayerPage {...props} resumeFocus openRequest={1}/>);
  expect(mock.transport.play).toHaveBeenLastCalledWith(6);
});
