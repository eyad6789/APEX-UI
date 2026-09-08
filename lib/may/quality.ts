import type { MayQuality, MayQualityConfig } from "./types";

export const qualityConfig: Record<MayQuality, MayQualityConfig> = {
  low: { particles: 8000, dpr: 1, contourStride: 4, bloom: false },
  medium: { particles: 15000, dpr: 1.25, contourStride: 2, bloom: true },
  high: { particles: 25000, dpr: 1.5, contourStride: 1, bloom: true },
  ultra: { particles: 35000, dpr: 2, contourStride: 1, bloom: true },
};

export function resolveQuality(device: { memory?: number; cores?: number; dpr?: number }): MayQuality {
  const memory = device.memory ?? 4;
  const cores = device.cores ?? 4;
  if (memory < 4 || cores < 4) return "low";
  if (memory < 8 || cores < 8 || (device.dpr ?? 1) > 2.5) return "medium";
  return "high";
}
