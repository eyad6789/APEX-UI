import assert from "node:assert/strict";
import test from "node:test";
import { qualityConfig, resolveQuality } from "../lib/may/quality.ts";

test("uses the specified particle counts and DPR caps", () => {
  assert.deepEqual(qualityConfig.low, { particles: 8000, dpr: 1, contourStride: 4, bloom: false });
  assert.equal(qualityConfig.ultra.particles, 35000);
  assert.equal(qualityConfig.ultra.dpr, 2);
});

test("selects a conservative automatic tier", () => {
  assert.equal(resolveQuality({ memory: 2, cores: 2, dpr: 3 }), "low");
  assert.equal(resolveQuality({ memory: 8, cores: 8, dpr: 2 }), "high");
});
