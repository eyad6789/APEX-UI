import assert from "node:assert/strict";
import test from "node:test";
import { createFaceTargets } from "../lib/may/faceTargets.ts";

test("creates deterministic packed particle attributes", () => {
  const a = createFaceTargets(8000, 42);
  const b = createFaceTargets(8000, 42);
  assert.equal(a.positions.length, 24000);
  assert.equal(a.scatter.length, 24000);
  assert.equal(a.regions.length, 8000);
  assert.equal(a.sizes.length, 8000);
  assert.deepEqual(Array.from(a.positions.slice(0, 60)), Array.from(b.positions.slice(0, 60)));
});

test("covers every required facial region", () => {
  const points = createFaceTargets(8000, 7);
  assert.deepEqual(new Set(points.regionNames), new Set(["head", "leftEye", "rightEye", "nose", "mouth", "jaw", "neck", "chest", "aura"]));
  const ys = Array.from({ length: points.positions.length / 3 }, (_, i) => points.positions[i * 3 + 1]);
  assert.ok(Math.max(...ys) > 2.2);
  assert.ok(Math.min(...ys) < -2.2);
});

test("places features in recognizable regions", () => {
  const points = createFaceTargets(8000, 19);
  const means = new Map<string, { x: number; y: number; n: number }>();
  points.regionNames.forEach((name, i) => {
    const v = means.get(name) ?? { x: 0, y: 0, n: 0 };
    v.x += points.positions[i * 3];
    v.y += points.positions[i * 3 + 1];
    v.n += 1;
    means.set(name, v);
  });
  const left = means.get("leftEye")!;
  const right = means.get("rightEye")!;
  const mouth = means.get("mouth")!;
  assert.ok(left.x / left.n < -0.2);
  assert.ok(right.x / right.n > 0.2);
  assert.ok(mouth.y / mouth.n < left.y / left.n);
});
