export interface TransportState {
  status:
    "idle" | "loading" | "paused" | "playing" | "counting" | "ended" | "error";
  position: number;
  duration: number;
  pass: number;
  count: number;
  committed: boolean;
  error: string | null;
}
export interface Transition {
  id: string;
  exit: number;
  start: number;
  gap: number;
  clicks: number[];
  beats?: number;
}
interface Segment {
  at: number;
  offset: number;
  nodes: AudioBufferSourceNode[];
  gains: GainNode[];
}

/** Audio clock owns playback. The UI never starts clips from an animation callback. */
export class RehearsalTransport {
  private context: AudioContext | null = null;
  private buffers: AudioBuffer[] = [];
  private loading: Promise<void> | null = null;
  private abort = new AbortController();
  private segment: Segment | null = null;
  private incoming: Segment | null = null;
  private plan: Transition | null = null;
  private resumeReset: { gap: number; clicks: number[]; beats: number } | null =
    null;
  private initialReset: {
    at: number;
    gap: number;
    beats: number;
    clicks: number[];
  } | null = null;
  private commitAt = 0;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private listeners = new Set<() => void>();
  private clicks: OscillatorNode[] = [];
  private generation = 0;
  private disposed = false;
  private singer = 1;
  private volume = 0.8;
  private state: TransportState = {
    status: "idle",
    position: 0,
    duration: 0,
    pass: 0,
    count: 0,
    committed: false,
    error: null,
  };
  constructor(
    private urls: string[],
    private stemMix = false,
    private factory = () => new AudioContext(),
  ) {}
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private emit(patch: Partial<TransportState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }
  private get ctx() {
    if (!this.context) this.context = this.factory();
    return this.context;
  }
  private position() {
    return this.segment
      ? Math.min(
          this.state.duration,
          this.segment.offset +
            Math.max(0, this.ctx.currentTime - this.segment.at),
        )
      : this.state.position;
  }
  getPassStart = () =>
    this.incoming && this.state.status === "counting"
      ? this.incoming.offset
      : (this.segment?.offset ?? this.state.position);
  getAudiblePosition = () => {
    if (this.state.status === "counting")
      return (
        this.incoming?.offset ?? this.segment?.offset ?? this.state.position
      );
    if (!this.segment) return this.state.position;
    const latency = Math.max(0, this.ctx.outputLatency ?? 0);
    return Math.min(
      this.state.duration,
      this.segment.offset +
        Math.max(0, this.ctx.currentTime - this.segment.at - latency),
    );
  };
  private kill(segment: Segment | null, ramp = false) {
    if (!segment) return;
    const now = this.ctx.currentTime;
    segment.nodes.forEach((node, i) => {
      const gain = segment.gains[i];
      try {
        gain.gain.cancelScheduledValues(now);
        if (ramp) {
          gain.gain.setValueAtTime(gain.gain.value, now);
          gain.gain.linearRampToValueAtTime(0, now + 0.015);
        }
        node.stop(now + (ramp ? 0.015 : 0));
      } catch {
        /* already stopped */
      }
      node.onended = () => {
        node.disconnect();
        gain.disconnect();
      };
    });
  }
  private clear(ramp = false) {
    this.kill(this.segment, ramp);
    this.kill(this.incoming);
    this.segment = null;
    this.incoming = null;
    this.plan = null;
    this.initialReset = null;
    this.clicks.forEach((n) => {
      try {
        n.stop();
      } catch {
        /* ended */
      }
    });
    this.clicks = [];
    if (this.tickTimer) clearInterval(this.tickTimer);
    this.tickTimer = null;
  }
  async prepare() {
    if (this.buffers.length) return;
    if (!this.loading)
      this.loading = (async () => {
        const context = this.ctx;
        const buffers = await Promise.all(
          this.urls.map(async (url) => {
            const response = await fetch(url, { signal: this.abort.signal });
            if (!response.ok)
              throw new Error(
                "Audio could not be loaded. Check the local worker and try again.",
              );
            return context.decodeAudioData(await response.arrayBuffer());
          }),
        );
        if (this.disposed) return;
        if (!buffers.length) throw new Error("Audio is still preparing.");
        if (
          buffers.length === 2 &&
          Math.abs(buffers[0].duration - buffers[1].duration) > 0.08
        )
          throw new Error(
            "The stems have different lengths. Use the original or prepare matching stems.",
          );
        if (
          buffers.reduce(
            (sum, b) => sum + b.length * b.numberOfChannels * 4,
            0,
          ) > 350_000_000
        )
          throw new Error(
            "This recording is too large for precise buffered playback. Import a shorter recording.",
          );
        this.buffers = buffers;
        this.emit({ duration: Math.min(...buffers.map((b) => b.duration)) });
      })().finally(() => {
        this.loading = null;
      });
    return this.loading;
  }
  private scheduleClicks(at: number, offsets: number[]) {
    offsets.forEach((offset, i) => {
      const oscillator = this.ctx.createOscillator(),
        gain = this.ctx.createGain(),
        time = at + offset;
      oscillator.frequency.value = i === 0 ? 880 : 660;
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(0.12, time + 0.003);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.055);
      oscillator.connect(gain).connect(this.ctx.destination);
      oscillator.start(time);
      oscillator.stop(time + 0.06);
      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
      };
      this.clicks.push(oscillator);
    });
  }
  private create(at: number, offset: number): Segment {
    const nodes: AudioBufferSourceNode[] = [],
      gains: GainNode[] = [];
    this.buffers.forEach((buffer, i) => {
      const source = this.ctx.createBufferSource(),
        gain = this.ctx.createGain();
      source.buffer = buffer;
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(
        this.volume * (this.stemMix && i === 0 ? this.singer : 1),
        at + 0.015,
      );
      source.connect(gain).connect(this.ctx.destination);
      source.start(at, offset);
      source.onended = () => {
        source.disconnect();
        gain.disconnect();
      };
      nodes.push(source);
      gains.push(gain);
    });
    return { at, offset, nodes, gains };
  }
  async play(position = this.state.position) {
    const generation = ++this.generation;
    this.clear(true);
    this.emit({ status: "loading", committed: false, error: null });
    try {
      await this.ctx.resume();
      await this.prepare();
      if (generation !== this.generation || this.disposed) return;
      const offset = Math.max(
        0,
        Math.min(
          position >= this.state.duration ? 0 : position,
          this.state.duration - 0.01,
        ),
      );
      const at = this.ctx.currentTime + 0.025;
      const reset = this.resumeReset;
      this.resumeReset = null;
      this.segment = this.create(at + (reset?.gap ?? 0), offset);
      if (reset?.gap) {
        this.initialReset = {
          at,
          gap: reset.gap,
          beats: reset.beats,
          clicks: reset.clicks,
        };
        this.scheduleClicks(at, reset.clicks);
      }
      this.emit({
        status: reset?.gap ? "counting" : "playing",
        count: reset?.beats ?? 0,
        position: offset,
        pass: this.state.pass + 1,
      });
      this.tickTimer = setInterval(() => this.tick(), 25);
    } catch (error) {
      if (generation !== this.generation || this.disposed) return;
      this.emit({
        status: "error",
        error: error instanceof Error ? error.message : "Playback failed",
      });
    }
  }
  pause() {
    const position =
      this.state.status === "counting" && this.incoming
        ? this.incoming.offset
        : this.position();
    if (this.state.status === "counting") {
      if (this.plan)
        this.resumeReset = {
          gap: this.plan.gap,
          clicks: this.plan.clicks,
          beats: this.plan.beats ?? 2,
        };
      else if (this.initialReset)
        this.resumeReset = {
          gap: this.initialReset.gap,
          clicks: this.initialReset.clicks,
          beats: this.initialReset.beats,
        };
    }
    ++this.generation;
    this.clear(true);
    this.emit({ status: "paused", position, committed: false, count: 0 });
  }
  seek(position: number) {
    this.resumeReset = null;
    const playing = ["playing", "counting", "loading"].includes(
      this.state.status,
    );
    const target = Math.max(
      0,
      Math.min(position, this.state.duration || position),
    );
    if (playing) void this.play(target);
    else {
      ++this.generation;
      this.clear();
      this.emit({
        position: target,
        status: "paused",
        committed: false,
        pass: this.state.pass + 1,
      });
    }
  }
  setTransition(plan: Transition | null): boolean {
    if (this.state.committed) return false;
    this.plan = plan;
    return true;
  }
  async audition(beats: number[]) {
    if (!beats.length) return;
    await this.play(beats[0]);
    if (this.segment && this.state.status === "playing")
      this.scheduleClicks(
        this.segment.at,
        beats.slice(0, 4).map((t) => t - beats[0]),
      );
  }
  setSinger(value: number) {
    this.singer = value;
    for (const segment of [this.segment, this.incoming]) {
      if (segment && this.stemMix)
        segment.gains[0].gain.setTargetAtTime(
          value * this.volume,
          Math.max(this.ctx.currentTime, segment.at) + 0.02,
          0.025,
        );
    }
  }
  private tick() {
    if (!this.segment) return;
    const now = this.ctx.currentTime;
    if (this.ctx.state !== "running") {
      this.pause();
      return;
    }
    const position = this.position();
    if (this.initialReset && now < this.segment.at) {
      this.emit({
        status: "counting",
        count: Math.max(
          1,
          Math.ceil(
            (this.segment.at - now) /
              (this.initialReset.gap / this.initialReset.beats),
          ),
        ),
      });
      return;
    }
    if (this.initialReset) {
      this.initialReset = null;
      this.emit({ status: "playing", count: 0 });
    }
    if (this.plan && !this.incoming) {
      const exitAt = this.segment.at + this.plan.exit - this.segment.offset;
      const remaining = exitAt - now;
      if (remaining >= 0.025 && remaining <= 0.2) {
        const plan = this.plan;
        this.commitAt = exitAt;
        this.incoming = this.create(
          exitAt + plan.gap,
          Math.max(0, Math.min(plan.start, this.state.duration - 0.01)),
        );
        this.segment.gains.forEach((gain) => {
          gain.gain.setValueAtTime(gain.gain.value, exitAt - 0.015);
          gain.gain.linearRampToValueAtTime(0, exitAt);
        });
        this.segment.nodes.forEach((node) => node.stop(exitAt));
        this.scheduleClicks(exitAt, plan.clicks);
        this.emit({ committed: true });
      } else if (remaining < 0.025) {
        // A late main thread may not cut audio. Keep playing and let UI choose a later exit.
        this.plan = null;
      }
    }
    if (this.incoming && now >= this.commitAt) {
      if (now < this.incoming.at) {
        this.emit({
          status: "counting",
          position: this.incoming.offset,
          count: Math.max(
            1,
            Math.ceil(
              (this.incoming.at - now) /
                Math.max(
                  0.2,
                  (this.plan?.gap ?? 1) / Math.max(1, this.plan?.beats ?? 2),
                ),
            ),
          ),
        });
        return;
      }
      this.segment = this.incoming;
      this.incoming = null;
      this.plan = null;
      this.clicks = [];
      this.emit({
        status: "playing",
        committed: false,
        count: 0,
        pass: this.state.pass + 1,
        position: this.position(),
      });
      return;
    }
    if (position >= this.state.duration) {
      this.clear();
      this.emit({
        status: "ended",
        position: this.state.duration,
        committed: false,
      });
      return;
    }
    this.emit({ position: this.getAudiblePosition() });
  }
  dispose() {
    this.disposed = true;
    ++this.generation;
    this.abort.abort();
    this.clear();
    this.buffers = [];
    void this.context?.close();
    this.listeners.clear();
  }
}
