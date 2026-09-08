import type { MayAvatarState, MayVisualTargets } from "./types";

export type ExistingConsoleState = "idle" | "listening" | "thinking" | "speaking";

export const STATE_VISUALS: Record<MayAvatarState, MayVisualTargets> = {
  idle:      { formation: 0.87, turbulence: 0.22, focus: 0.20, mouth: 0.04, temple: 0.12, energy: 0.28, dissolve: 0.08 },
  listening: { formation: 0.98, turbulence: 0.10, focus: 0.92, mouth: 0.08, temple: 0.20, energy: 0.52, dissolve: 0.01 },
  thinking:  { formation: 0.70, turbulence: 0.68, focus: 0.48, mouth: 0.02, temple: 1.00, energy: 0.76, dissolve: 0.42 },
  speaking:  { formation: 0.94, turbulence: 0.42, focus: 0.70, mouth: 1.00, temple: 0.36, energy: 1.00, dissolve: 0.10 },
  wake:      { formation: 1.00, turbulence: 0.86, focus: 0.78, mouth: 0.05, temple: 0.48, energy: 1.00, dissolve: 0.00 },
  sleep:     { formation: 0.18, turbulence: 0.12, focus: 0.00, mouth: 0.00, temple: 0.00, energy: 0.06, dissolve: 0.74 },
};

export function mapConsoleState(state: ExistingConsoleState): MayAvatarState {
  return state;
}
