import type { MayAudioFrame } from "./types";

const clamp = (value: number) => Math.max(0, Math.min(1, value));

export function extractAudioFrame(bins: Uint8Array, sampleRate: number, fftSize: number): MayAudioFrame {
  if (!bins.length) return { amplitude: 0, bass: 0, mid: 0, high: 0, voice: 0 };
  const hzPerBin = sampleRate / Math.max(1, fftSize);
  const average = (low: number, high: number) => {
    const start = Math.max(0, Math.floor(low / hzPerBin));
    const end = Math.min(bins.length, Math.max(start + 1, Math.ceil(high / hzPerBin)));
    let sum = 0;
    for (let i = start; i < end; i += 1) sum += bins[i];
    return sum / Math.max(1, end - start) / 255;
  };
  let total = 0;
  for (let i = 0; i < bins.length; i += 1) total += bins[i];
  const rawAmplitude = total / bins.length / 255;
  const bass = clamp(average(20, 250) * 1.05);
  const mid = clamp(average(250, 4000) * 1.0);
  const high = clamp(average(4000, sampleRate / 2) * 0.92);
  const amplitude = clamp(rawAmplitude * 1.3);
  const voice = clamp(Math.max(0, mid * 1.15 + amplitude * 0.35 - 0.12));
  return { amplitude, bass, mid, high, voice };
}

export function smoothAudioFrame(previous: MayAudioFrame, next: MayAudioFrame, attack = 0.32, release = 0.1): MayAudioFrame {
  const ease = (from: number, to: number) => from + (to - from) * (to > from ? attack : release);
  return {
    amplitude: ease(previous.amplitude, next.amplitude),
    bass: ease(previous.bass, next.bass),
    mid: ease(previous.mid, next.mid),
    high: ease(previous.high, next.high),
    voice: ease(previous.voice, next.voice),
  };
}
