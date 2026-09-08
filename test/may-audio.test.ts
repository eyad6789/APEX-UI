import assert from "node:assert/strict";
import test from "node:test";
import { extractAudioFrame } from "../lib/may/audioFeatures.ts";

test("normalizes separate frequency bands", () => {
  const bins = new Uint8Array(64);
  bins.fill(220, 0, 8);
  bins.fill(105, 8, 36);
  bins.fill(35, 36);
  const frame = extractAudioFrame(bins, 48000, 128);
  assert.ok(frame.bass > frame.mid);
  assert.ok(frame.mid > frame.high);
  for (const value of Object.values(frame)) assert.ok(value >= 0 && value <= 1);
});

test("returns silence for an empty spectrum", () => {
  assert.deepEqual(extractAudioFrame(new Uint8Array(0), 48000, 128), {
    amplitude: 0, bass: 0, mid: 0, high: 0, voice: 0,
  });
});
