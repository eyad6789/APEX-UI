import type { FacialRegion } from "./types";

export const REGION_INDEX: Record<FacialRegion, number> = {
  head: 0,
  leftEye: 1,
  rightEye: 2,
  nose: 3,
  mouth: 4,
  jaw: 5,
  neck: 6,
  chest: 7,
  aura: 8,
};

export type FaceTargetBuffers = {
  positions: Float32Array;
  scatter: Float32Array;
  regions: Float32Array;
  sizes: Float32Array;
  phases: Float32Array;
  depths: Float32Array;
  regionNames: FacialRegion[];
};

type Point = [number, number, number];

function mulberry32(seed: number) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function noisy(value: number, amount: number, random: () => number) {
  return value + (random() - 0.5) * amount;
}

function ellipseArc(cx: number, cy: number, rx: number, ry: number, z: number, random: () => number): Point {
  const a = random() * Math.PI * 2;
  const thickness = 0.82 + random() * 0.3;
  return [noisy(cx + Math.cos(a) * rx * thickness, 0.035, random), noisy(cy + Math.sin(a) * ry * thickness, 0.03, random), noisy(z, 0.1, random)];
}

function sampleRegion(region: FacialRegion, random: () => number): Point {
  if (region === "head") {
    const a = random() * Math.PI * 2;
    const radial = Math.sqrt(random());
    const x = Math.cos(a) * 1.38 * radial;
    const y = 0.42 + Math.sin(a) * 1.88 * radial;
    const normalized = Math.min(1, (x * x) / (1.38 * 1.38) + ((y - 0.42) * (y - 0.42)) / (1.88 * 1.88));
    const front = 0.24 + Math.sqrt(Math.max(0, 1 - normalized)) * 0.64;
    const z = (random() < 0.83 ? front : -front * 0.7) + (random() - 0.5) * 0.13;
    return [x, y, z];
  }
  if (region === "leftEye" || region === "rightEye") {
    const side = region === "leftEye" ? -1 : 1;
    const brow = random() < 0.24;
    if (brow) {
      const t = random() * Math.PI;
      return [side * (0.30 + (1 - Math.cos(t)) * 0.36), 0.98 + Math.sin(t) * 0.15, noisy(0.83, 0.06, random)];
    }
    const p = ellipseArc(side * 0.53, 0.70, 0.34, 0.14, 0.91, random);
    if (random() < 0.15) {
      p[0] = noisy(side * 0.53, 0.06, random);
      p[1] = noisy(0.70, 0.05, random);
      p[2] += 0.05;
    }
    return p;
  }
  if (region === "nose") {
    const branch = random();
    if (branch < 0.62) {
      const t = random();
      const side = random() < 0.5 ? -1 : 1;
      return [noisy(side * (0.04 + t * 0.10), 0.035, random), 0.69 - t * 0.84, 0.94 + Math.sin(t * Math.PI) * 0.22];
    }
    const a = random() * Math.PI;
    return [Math.cos(a) * 0.25, -0.19 + Math.sin(a) * 0.11, noisy(1.04, 0.08, random)];
  }
  if (region === "mouth") {
    const upper = random() < 0.5;
    const a = random() * Math.PI;
    const side = random() < 0.5 ? -1 : 1;
    const x = side * Math.cos(a) * 0.48;
    const curve = Math.pow(Math.abs(x) / 0.48, 1.6);
    const y = upper ? -0.52 + curve * 0.08 : -0.61 - curve * 0.04;
    return [noisy(x, 0.025, random), noisy(y, 0.035, random), noisy(0.91, 0.08, random)];
  }
  if (region === "jaw") {
    const t = random();
    const side = random() < 0.5 ? -1 : 1;
    const x = side * (1.15 * (1 - t) + 0.12 * t);
    const y = -0.73 - Math.sin(t * Math.PI * 0.55) * 0.70;
    return [noisy(x, 0.08, random), noisy(y, 0.06, random), noisy(0.45 + t * 0.27, 0.13, random)];
  }
  if (region === "neck") {
    const side = random() < 0.5 ? -1 : 1;
    const t = random();
    return [noisy(side * (0.48 + t * 0.08), 0.10, random), -1.23 - t * 1.02, noisy(0.08, 0.38, random)];
  }
  if (region === "chest") {
    const t = random();
    const side = random() < 0.5 ? -1 : 1;
    return [side * (0.48 + Math.pow(t, 0.72) * 2.0), -2.13 - t * 0.48 + Math.pow(t, 2) * 0.22, noisy(-0.03, 0.46, random)];
  }
  const theta = random() * Math.PI * 2;
  const phi = Math.acos(2 * random() - 1);
  const radius = 2.25 + random() * 1.35;
  return [Math.sin(phi) * Math.cos(theta) * radius, 0.1 + Math.cos(phi) * radius * 0.9, Math.sin(phi) * Math.sin(theta) * radius * 0.65];
}

const REGION_WEIGHTS: [FacialRegion, number][] = [
  ["head", 0.43], ["leftEye", 0.095], ["rightEye", 0.095], ["nose", 0.065],
  ["mouth", 0.095], ["jaw", 0.065], ["neck", 0.045], ["chest", 0.065], ["aura", 0.045],
];

export function createFaceTargets(count: number, seed = 0x4d4159): FaceTargetBuffers {
  const safeCount = Math.max(9, Math.floor(count));
  const random = mulberry32(seed);
  const positions = new Float32Array(safeCount * 3);
  const scatter = new Float32Array(safeCount * 3);
  const regions = new Float32Array(safeCount);
  const sizes = new Float32Array(safeCount);
  const phases = new Float32Array(safeCount);
  const depths = new Float32Array(safeCount);
  const regionNames = new Array<FacialRegion>(safeCount);
  let cumulative = 0;
  const cuts = REGION_WEIGHTS.map(([name, weight], index) => {
    cumulative += weight;
    return [name, index === REGION_WEIGHTS.length - 1 ? 1 : cumulative] as const;
  });

  for (let i = 0; i < safeCount; i += 1) {
    const selector = (i + 0.5) / safeCount;
    const region = cuts.find(([, cut]) => selector <= cut)?.[0] ?? "aura";
    const [x, y, z] = sampleRegion(region, random);
    const k = i * 3;
    positions[k] = x;
    positions[k + 1] = y;
    positions[k + 2] = z;
    const theta = random() * Math.PI * 2;
    const radius = 2.7 + random() * 2.6;
    scatter[k] = Math.cos(theta) * radius + x * 0.12;
    scatter[k + 1] = (random() - 0.5) * 6.8 + y * 0.18;
    scatter[k + 2] = Math.sin(theta) * radius * 0.72 + (random() - 0.5) * 2.2;
    regions[i] = REGION_INDEX[region];
    sizes[i] = 0.55 + random() * 1.35;
    phases[i] = random() * Math.PI * 2;
    depths[i] = z;
    regionNames[i] = region;
  }

  return { positions, scatter, regions, sizes, phases, depths, regionNames };
}
