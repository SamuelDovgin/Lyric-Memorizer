/** Encode the exact practice passage so native media looping needs no JS timer. */
export function practiceWav(buffers: AudioBuffer[], start: number, end: number): Blob {
  const rate = buffers[0].sampleRate;
  const channels = Math.min(2, Math.max(...buffers.map(b => b.numberOfChannels)));
  const first = Math.round(start * rate);
  const frames = Math.max(1, Math.round(end * rate) - first);
  const data = new ArrayBuffer(44 + frames * channels * 2);
  const view = new DataView(data);
  const text = (at: number, value: string) => [...value].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  text(0, 'RIFF'); view.setUint32(4, data.byteLength - 8, true); text(8, 'WAVE');
  text(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, channels, true); view.setUint32(24, rate, true);
  view.setUint32(28, rate * channels * 2, true); view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, data.byteLength - 44, true);
  const inputs = buffers.map(b => Array.from({length: channels}, (_, c) => b.getChannelData(Math.min(c, b.numberOfChannels - 1))));
  for (let i = 0; i < frames; i++) for (let c = 0; c < channels; c++) {
    const sample = Math.max(-1, Math.min(1, inputs.reduce((sum, input) => sum + (input[c][first + i] ?? 0), 0) * .8));
    view.setInt16(44 + (i * channels + c) * 2, Math.round(sample * (sample < 0 ? 32768 : 32767)), true);
  }
  return new Blob([data], {type: 'audio/wav'});
}
