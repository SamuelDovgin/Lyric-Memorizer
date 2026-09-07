import { afterEach, describe, expect, it, vi } from "vitest";
import { RehearsalTransport } from "./transport";
function audioContext() {
  const param = () => ({
    value: 1,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
    setTargetAtTime: vi.fn(),
  });
  const nodes: any[] = [];
  const context = {
    currentTime: 0,
    state: "running",
    destination: {},
    resume: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
    decodeAudioData: vi.fn(async () => ({
      duration: 30,
      length: 300,
      numberOfChannels: 2,
    })),
    createGain: () => {
      const node = { gain: param(), connect: vi.fn(), disconnect: vi.fn() };
      node.connect.mockReturnValue(node);
      return node;
    },
    createBufferSource: () => {
      const node = {
        buffer: null,
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        disconnect: vi.fn(),
        onended: null,
      };
      node.connect.mockImplementation((target) => target);
      nodes.push(node);
      return node;
    },
    createOscillator: () => {
      const node = {
        frequency: { value: 0 },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        disconnect: vi.fn(),
        onended: null,
      };
      const gain = context.createGain();
      node.connect.mockReturnValue(gain);
      return node;
    },
  };
  return { context, nodes };
}
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
function setup() {
  vi.useFakeTimers();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(1),
    })),
  );
  const { context, nodes } = audioContext();
  const transport = new RehearsalTransport(
    ["/original.wav"],
    false,
    () => context as unknown as AudioContext,
  );
  return { transport, context, nodes };
}
describe("audio-clock transport", () => {
  it("schedules the incoming audio before outgoing completion, including the intentional reset", async () => {
    const { transport, context, nodes } = setup();
    await transport.play(0);
    transport.setTransition({
      id: "retry",
      exit: 4,
      start: 1,
      gap: 1,
      clicks: [],
      beats: 2,
    });
    context.currentTime = 3.9;
    vi.advanceTimersByTime(25);
    expect(transport.getSnapshot().committed).toBe(true);
    expect(nodes[1].start).toHaveBeenCalledWith(5.025, 1);
    expect(nodes[0].stop).toHaveBeenCalledWith(4.025);
    context.currentTime = 4.1;
    vi.advanceTimersByTime(25);
    expect(transport.getSnapshot().status).toBe("counting");
    expect(transport.getSnapshot().position).toBe(1);
    context.currentTime = 5.05;
    vi.advanceTimersByTime(25);
    expect(transport.getSnapshot().pass).toBe(2);
    expect(transport.getSnapshot().status).toBe("playing");
    transport.dispose();
  });
  it("lets a user cancel before commitment but not inside its audio horizon", async () => {
    const { transport, context } = setup();
    await transport.play();
    transport.setTransition({ id: "a", exit: 4, start: 1, gap: 0, clicks: [] });
    expect(transport.setTransition(null)).toBe(true);
    transport.setTransition({ id: "a", exit: 4, start: 1, gap: 0, clicks: [] });
    context.currentTime = 3.9;
    vi.advanceTimersByTime(25);
    expect(transport.setTransition(null)).toBe(false);
    transport.dispose();
  });
  it("keeps the recording running if the scheduler misses its boundary", async () => {
    const { transport, context, nodes } = setup();
    await transport.play();
    transport.setTransition({ id: "a", exit: 4, start: 1, gap: 0, clicks: [] });
    context.currentTime = 4.1;
    vi.advanceTimersByTime(25);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].stop).not.toHaveBeenCalled();
    transport.dispose();
  });
  it("pauses during reset and restarts the entire reset on resume", async () => {
    const { transport, context, nodes } = setup();
    await transport.play();
    transport.setTransition({
      id: "a",
      exit: 4,
      start: 1,
      gap: 1,
      clicks: [],
      beats: 2,
    });
    context.currentTime = 3.9;
    vi.advanceTimersByTime(25);
    context.currentTime = 4.1;
    vi.advanceTimersByTime(25);
    transport.pause();
    expect(transport.getSnapshot().position).toBe(1);
    context.currentTime = 10;
    await transport.play();
    expect(nodes.at(-1).start).toHaveBeenCalledWith(11.025, 1);
    expect(transport.getSnapshot().status).toBe("counting");
    transport.dispose();
  });
  it("a paused seek remains paused and does not create audio sources", async () => {
    const { transport, nodes } = setup();
    transport.seek(12);
    expect(transport.getSnapshot()).toMatchObject({
      status: "paused",
      position: 12,
    });
    expect(nodes).toHaveLength(0);
    await transport.play();
    expect(nodes[0].start).toHaveBeenCalledWith(0.025, 12);
    transport.dispose();
  });
  it("does not resurrect canceled playback after decoding completes", async () => {
    const { transport, context, nodes } = setup();
    let resolve!: (value: any) => void;
    context.decodeAudioData.mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const playing = transport.play();
    await vi.advanceTimersByTimeAsync(1);
    transport.pause();
    resolve({ duration: 30, length: 300, numberOfChannels: 2 });
    await playing;
    expect(nodes).toHaveLength(0);
    expect(transport.getSnapshot().status).toBe("paused");
    transport.dispose();
  });
});
