export type MayAvatarState = "idle" | "listening" | "thinking" | "speaking" | "wake" | "sleep";
export type MayQuality = "low" | "medium" | "high" | "ultra";
export type FacialRegion = "head" | "leftEye" | "rightEye" | "nose" | "mouth" | "jaw" | "neck" | "chest" | "aura";

export type MayAudioFrame = {
  amplitude: number;
  bass: number;
  mid: number;
  high: number;
  voice: number;
};

export type MayVisualTargets = {
  formation: number;
  turbulence: number;
  focus: number;
  mouth: number;
  temple: number;
  energy: number;
  dissolve: number;
};

export type MayQualityConfig = {
  particles: number;
  dpr: number;
  contourStride: number;
  bloom: boolean;
};

export const EMPTY_AUDIO_FRAME: MayAudioFrame = { amplitude: 0, bass: 0, mid: 0, high: 0, voice: 0 };
