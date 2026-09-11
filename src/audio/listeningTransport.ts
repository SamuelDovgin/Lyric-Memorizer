import type { Transition, TransportState } from './transport';
import { practiceWav } from './practiceAudio';

/** Native audio continues independently of background-page timers. */
export class ListeningTransport {
  private audio: HTMLAudioElement;
  private listeners = new Set<() => void>();
  private state: TransportState = {status: 'idle', position: 0, duration: 0, pass: 0, count: 0, committed: false, error: null};
  private plan: Transition | null = null;
  private sourceKey = '';
  private sourceStart = 0;
  private objectUrl = '';
  private buffers?: Promise<AudioBuffer[]>;
  private context?: AudioContext;
  private abort = new AbortController();
  private generation = 0;
  private disposed = false;
  private repeat = false;
  private previous = 0;
  constructor(private urls: string[], factory = () => new Audio()) {
    this.audio = factory();
    this.audio.preload = 'auto';
    this.audio.volume = .8;
    this.audio.addEventListener('timeupdate', this.update);
    this.audio.addEventListener('ended', this.ended);
    this.audio.addEventListener('pause', this.paused);
    this.audio.addEventListener('playing', this.started);
    this.audio.addEventListener('error', this.failed);
    this.audio.addEventListener('loadedmetadata', this.metadata);
    if (urls.length === 1) { this.audio.src = urls[0]; this.sourceKey = 'full'; }
  }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private emit(patch: Partial<TransportState>) { this.state = {...this.state, ...patch}; this.listeners.forEach(fn => fn()); }
  private metadata = () => { if (this.sourceKey === 'full' && Number.isFinite(this.audio.duration)) this.emit({duration: this.audio.duration}); };
  private update = () => {
    const time = this.audio.currentTime;
    const wrapped = this.audio.loop && time < this.previous;
    this.previous = time;
    // Expose the completed boundary before the native loop jumps back, so a
    // foreground completed listen still receives credit.
    if (wrapped) this.emit({position: this.sourceStart + this.audio.duration});
    this.emit({position: this.sourceStart + time, pass: this.state.pass + (wrapped ? 1 : 0)});
  };
  private ended = () => { this.update(); this.emit({status: 'ended'}); };
  private paused = () => { if (this.state.status === 'playing' && !this.audio.ended) { this.update(); this.emit({status: 'paused'}); } };
  private started = () => this.emit({status: 'playing', error: null});
  private failed = () => this.emit({status: 'error', error: 'Audio could not play. Try pressing Play again.'});
  private decode() {
    if (!this.buffers) this.buffers = (async () => {
      this.context = new AudioContext();
      const buffers = await Promise.all(this.urls.map(async url => {
        const response = await fetch(url, {signal: this.abort.signal});
        if (!response.ok) throw new Error('Audio could not be loaded.');
        return this.context!.decodeAudioData(await response.arrayBuffer());
      }));
      if (!buffers.length) throw new Error('Audio is still preparing.');
      if (buffers.some(b => Math.abs(b.duration - buffers[0].duration) > .08)) throw new Error('The stems have different lengths. Use the original recording.');
      if (buffers.reduce((sum, b) => sum + b.length * b.numberOfChannels * 4, 0) > 350_000_000) throw new Error('Use a shorter recording to prepare background practice.');
      if (!this.disposed) this.emit({duration: Math.min(...buffers.map(b => b.duration))});
      return buffers;
    })().catch(error => { this.buffers = undefined; throw error; }).finally(() => { void this.context?.close(); });
    return this.buffers;
  }
  private desiredKey() { return this.plan ? `${this.plan.start}:${this.plan.exit}` : 'full'; }
  private async source(generation: number) {
    const key = this.desiredKey();
    if (this.sourceKey === key) return true;
    const plan = this.plan;
    let url = this.urls[0];
    let objectUrl = '';
    if (plan || this.urls.length !== 1) {
      const buffers = await this.decode();
      if (generation !== this.generation || this.disposed) return false;
      const start = Math.max(0, plan?.start ?? 0);
      const end = Math.min(this.state.duration, plan?.exit ?? this.state.duration);
      if (end <= start) throw new Error('This practice passage needs valid start and end times.');
      objectUrl = URL.createObjectURL(practiceWav(buffers, start, end));
      url = objectUrl;
    }
    if (generation !== this.generation || this.disposed) { if (objectUrl) URL.revokeObjectURL(objectUrl); return false; }
    this.audio.pause();
    this.audio.src = url;
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = objectUrl;
    this.sourceKey = key;
    this.sourceStart = Math.max(0, plan?.start ?? 0);
    // Encoded audio already includes the listening gain.
    this.audio.volume = objectUrl ? 1 : .8;
    return true;
  }
  async play(position = this.state.position) {
    const generation = ++this.generation;
    this.emit({status: 'loading', error: null});
    try {
      if (this.sourceKey !== this.desiredKey() && !await this.source(generation)) return;
      if (generation !== this.generation || this.disposed) return;
      const end = this.plan?.exit ?? this.state.duration;
      const target = position < this.sourceStart || (end > 0 && position >= end) ? this.sourceStart : position;
      this.audio.loop = !!this.plan || this.repeat;
      this.audio.currentTime = Math.max(0, target - this.sourceStart);
      this.previous = this.audio.currentTime;
      await this.audio.play();
      if (generation !== this.generation || this.disposed) return;
      this.emit({status: 'playing', position: target, pass: this.state.pass + 1});
    } catch (error) {
      if (generation === this.generation && !this.disposed) {
        this.audio.pause();
        this.emit({status: 'error', error: error instanceof Error ? error.message : 'Press Play to resume audio.'});
      }
    }
  }
  pause() { ++this.generation; this.audio.pause(); this.update(); this.emit({status: 'paused'}); }
  seek(position: number) {
    const target = Math.max(0, Math.min(position, this.state.duration || position));
    if (['playing', 'loading'].includes(this.state.status)) void this.play(target);
    else {
      // A paused click must move the native media element too. Previously the
      // React position changed while the audio head stayed where it was.
      const end = this.plan?.exit ?? this.state.duration;
      const inCurrentSource = this.sourceKey === this.desiredKey()
        && target >= this.sourceStart
        && (!end || target < end);
      if (inCurrentSource) {
        this.audio.currentTime = Math.max(0, target - this.sourceStart);
        this.previous = this.audio.currentTime;
      }
      this.emit({position: target, status: 'paused'});
    }
  }
  seekBy(offset: number) {
    if (!Number.isFinite(offset)) return;
    const plan = this.plan;
    const end = plan ? Math.min(plan.exit, this.state.duration || plan.exit) : 0;
    const length = plan ? end - plan.start : 0;
    if (!plan || length <= 0) {
      this.seek(this.state.position + offset);
      return;
    }
    const current = this.state.position >= plan.start && this.state.position < end
      ? this.state.position
      : plan.start;
    const wrapped = ((current - plan.start + offset) % length + length) % length;
    this.seek(plan.start + wrapped);
  }
  setTransition(plan: Transition | null) {
    if (plan && (plan.gap !== 0 || plan.clicks.length)) throw new Error('Listening practice supports continuous repeats.');
    const previousKey = this.desiredKey();
    this.plan = plan;
    if (previousKey !== this.desiredKey()) {
      this.audio.loop = !!plan || this.repeat;
      if (['playing', 'loading'].includes(this.state.status)) void this.play(this.state.position);
    }
    return true;
  }
  setRepeat(repeat: boolean) { this.repeat = repeat; this.audio.loop = !!this.plan || repeat; }
  dispose() {
    this.disposed = true; ++this.generation; this.abort.abort();
    this.listeners.clear();
    this.audio.removeEventListener('timeupdate', this.update);
    this.audio.removeEventListener('ended', this.ended);
    this.audio.removeEventListener('pause', this.paused);
    this.audio.removeEventListener('playing', this.started);
    this.audio.removeEventListener('error', this.failed);
    this.audio.removeEventListener('loadedmetadata', this.metadata);
    this.audio.pause(); this.audio.removeAttribute('src'); this.audio.load();
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
  }
}
