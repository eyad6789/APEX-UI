# May Particle Avatar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a standalone `/may` page where the existing agent appears as an interactive, audio-reactive humanoid particle consciousness while leaving `/` unchanged.

**Architecture:** Pure TypeScript modules generate deterministic facial targets, state parameters, audio features, and quality settings. A React Three Fiber scene uploads those attributes once and drives formation, turbulence, pointer response, and regional audio response through shader uniforms; a thin React experience connects it to the existing `AgentConsole` state and audio sources.

**Tech Stack:** Next.js 15, React 19, TypeScript, Three.js 0.184, React Three Fiber 9.6, GLSL, Web Audio API, Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-08-may-particle-avatar-design.md`

## Global Constraints

- Add the experience at `/may`; do not change the existing `/` page's visuals or behavior.
- Reuse the existing `/api/chat`, `/api/tts`, microphone, speech-recognition, and scheduling behavior.
- Render a recognizable procedural head, face, neck, and shoulders without imported character assets or static animation frames.
- Keep per-frame CPU work independent of particle count; particle movement belongs in shaders.
- Support `idle`, `listening`, `thinking`, `speaking`, `wake`, and `sleep` with interruptible transitions.
- Preserve audible reply playback when attaching Web Audio analysis.
- Support automatic and manual low, medium, high, and ultra quality modes.
- Respect `prefers-reduced-motion` and keep controls usable if WebGL or audio analysis fails.
- Use Safari for browser verification.
- Do not include unrelated pre-existing worktree changes in commits.

---

### Task 1: State, quality, and shared contracts

**Files:**
- Create: `lib/may/types.ts`
- Create: `lib/may/stateMachine.ts`
- Create: `lib/may/quality.ts`
- Create: `test/may-state.test.ts`
- Create: `test/may-quality.test.ts`

**Interfaces:**
- Produces: `MayAvatarState`, `MayAudioFrame`, `MayQuality`, `MayQualityConfig`, `STATE_VISUALS`, `mapConsoleState`, `resolveQuality`, and `qualityConfig`.
- Consumes: no May-specific interfaces.

- [ ] **Step 1: Write failing state tests**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { mapConsoleState, STATE_VISUALS } from "../lib/may/stateMachine.ts";

test("maps existing console states to May states", () => {
  assert.equal(mapConsoleState("idle"), "idle");
  assert.equal(mapConsoleState("listening"), "listening");
  assert.equal(mapConsoleState("thinking"), "thinking");
  assert.equal(mapConsoleState("speaking"), "speaking");
});

test("defines distinct visual targets for every May state", () => {
  assert.deepEqual(Object.keys(STATE_VISUALS).sort(), ["idle", "listening", "sleep", "speaking", "thinking", "wake"]);
  assert.ok(STATE_VISUALS.listening.formation > STATE_VISUALS.idle.formation);
  assert.ok(STATE_VISUALS.speaking.mouth > STATE_VISUALS.idle.mouth);
  assert.ok(STATE_VISUALS.thinking.temple > STATE_VISUALS.idle.temple);
});
```

- [ ] **Step 2: Write failing quality tests**

```ts
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
```

- [ ] **Step 3: Run the tests and confirm missing-module failures**

Run: `npm test -- --test-name-pattern='May|quality|console states'`

Expected: FAIL because the new May modules do not exist.

- [ ] **Step 4: Implement contracts, state targets, and quality selection**

Create the six-state visual parameter record and direct console-state mapper. Add the four exact particle/DPR configurations from the specification. Select low below 4 GB or 4 cores, medium below 8 GB or 8 cores, high for capable devices, and reserve ultra for manual selection.

- [ ] **Step 5: Run state and quality tests**

Run: `npm test -- --test-name-pattern='May|quality|console states'`

Expected: PASS.

- [ ] **Step 6: Commit the domain layer**

```bash
git add lib/may/types.ts lib/may/stateMachine.ts lib/may/quality.ts test/may-state.test.ts test/may-quality.test.ts
git commit -m "feat: add May avatar state and quality model"
```

### Task 2: Deterministic procedural facial targets

**Files:**
- Create: `lib/may/faceTargets.ts`
- Create: `test/may-face-targets.test.ts`

**Interfaces:**
- Consumes: `FacialRegion` from `lib/may/types.ts`.
- Produces: `FaceTargetBuffers` and `createFaceTargets(count: number, seed?: number): FaceTargetBuffers`.

- [ ] **Step 1: Write failing generator tests**

Create tests asserting deterministic typed packed arrays of lengths `count * 3` and `count`, all nine facial regions, a head top above `y=2.2`, and shoulders below `y=-2.2`.

- [ ] **Step 2: Implement seeded sampling and packed buffers**

Export positions, scatter positions, numeric regions, sizes, phases, depths, and discovered region names. Use a deterministic PRNG and allocate quotas across layered head ellipsoids, eye/brow arcs, nose bridge, cheeks, lip arcs, jaw, neck cylinders, shoulder curves, and an outer aura. Shape Z depth per feature and generate scatter origins on a larger noisy ellipsoid.

- [ ] **Step 3: Run tests and commit**

Run `npm test -- --test-name-pattern='facial|particle attributes'`, expect PASS, then commit only `lib/may/faceTargets.ts` and `test/may-face-targets.test.ts` with message `feat: generate May procedural facial targets`.

### Task 3: Audio feature extraction and source exposure

**Files:**
- Create: `lib/may/audioFeatures.ts`
- Create: `components/may/useMayAudioAnalyser.ts`
- Create: `test/may-audio.test.ts`
- Modify: `components/AgentConsole.tsx`

**Interfaces:**
- Consumes: `MayAudioFrame` from `lib/may/types.ts`.
- Produces: `extractAudioFrame`, `useMayAudioAnalyser`, plus optional `onAudioElement`, `onMicrophoneStream`, and `className` properties on `AgentConsole`.

- [ ] **Step 1: Test separate frequency bands**

Use a synthetic `Uint8Array` with stronger low bins than middle and high bins; assert `bass > mid > high` and all outputs are clamped to 0–1.

- [ ] **Step 2: Implement pure band extraction**

Average bins for roughly 20–250 Hz, 250–4000 Hz, and 4000 Hz–Nyquist, apply bounded perceptual gains, and derive voice activity from weighted midrange plus amplitude.

- [ ] **Step 3: Expose existing audio sources**

Extend `AgentConsole` with optional callbacks for its persistent `HTMLAudioElement` and active `MediaStream`. Use a callback ref for the element. Report the hands-free keep-alive stream when acquired and null on cleanup. When push-to-talk is active, open an analysis-only stream only if the callback is present and stop it with recognition. Preserve existing callers and Safari's single playback element.

- [ ] **Step 4: Implement analyser hook**

Create one lazily resumed `AudioContext`, cache the `MediaElementAudioSourceNode`, connect playback through analyser to destination, and connect microphone input without routing to speakers. Reuse typed buffers, smooth frames into a mutable ref, and synthesize restrained state envelopes when analysis is unavailable.

- [ ] **Step 5: Verify audio integration**

Run `npm test -- --test-name-pattern='frequency bands' && npx tsc --noEmit`, then commit only the four task files.

### Task 4: GPU avatar scene

**Files:**
- Create: `components/may/shaders.ts`
- Create: `components/may/MayParticleField.tsx`
- Create: `components/may/MayContourField.tsx`
- Create: `components/may/MayEnergyCore.tsx`
- Create: `components/may/MayAtmosphere.tsx`
- Create: `components/may/MayAvatarCanvas.tsx`

**Interfaces:**
- Consumes: May types, face targets, quality configuration, and the mutable audio frame ref.
- Produces: `MayAvatarCanvas({ state, audioFrameRef, quality, reducedMotion, onContextFailure })`.

- [ ] **Step 1: Define shared GLSL programs**

Create particle shaders using position, scatter, region, size, phase, and depth attributes. Implement noise-distorted formation, breathing, depth parallax, region-gated mouth/temple/eye motion, pointer displacement, cyan depth coloring, and soft additive point falloff.

- [ ] **Step 2: Build particle field**

Generate buffers only when particle count changes, update only uniforms in `useFrame`, smoothly approach `STATE_VISUALS`, and dispose GPU resources on unmount.

- [ ] **Step 3: Build contours and energy**

Create limited face/shoulder curve geometries, horizontal scan lines, and orbit rings. Add a layered warm shader volume with white-yellow-orange noise, state-dependent vertical movement, mouth expansion, and neck energy during speech.

- [ ] **Step 4: Add atmosphere and camera response**

Add sparse background particles and circular fields. Ease the scene and camera toward small pointer rotations while eye-region response remains stronger. Frame the full head, neck, and shoulders.

- [ ] **Step 5: Assemble resilient canvas**

Configure alpha, tier-based antialiasing/DPR, high-performance preference, optional restrained bloom, a React error boundary, and bounded WebGL-context recovery.

- [ ] **Step 6: Verify renderer**

Run `npx tsc --noEmit && npm run build`, then commit only renderer files.

### Task 5: Standalone May page

**Files:**
- Create: `components/may/MayExperience.tsx`
- Create: `components/may/may.css`
- Create: `app/may/page.tsx`

**Interfaces:**
- Consumes: the avatar canvas, audio analyser hook, state mapper, quality resolver, and extended `AgentConsole`.
- Produces: `/may`.

- [ ] **Step 1: Build experience controller**

Start in wake, transition to idle, map later console states, hold reported audio sources, detect reduced motion, and feed audio and state into the canvas.

- [ ] **Step 2: Add quality control**

Resolve automatic quality from device memory, hardware concurrency, and DPR. Honor a `may.quality` localStorage override and render an accessible Auto/Low/Medium/High/Ultra selector.

- [ ] **Step 3: Create cinematic shell**

Add a deep blue-black field, edge vignette, subtle CSS noise, MAY wordmark, live state, quality control, back link, and existing conversation console. Keep controls clear of the face at desktop, tablet, mobile, and short landscape sizes.

- [ ] **Step 4: Add fallback and route**

When WebGL fails, retain controls and render a CSS silhouette with radial gradients and contour pseudo-elements. Mark decorative visuals hidden from assistive technology and state live. Export May-specific route metadata without changing root metadata.

- [ ] **Step 5: Verify route**

Run `npx tsc --noEmit && npm run build`; confirm both `/` and `/may` compile, then commit only May page files.

### Task 6: Full regression and Safari verification

**Files:**
- Modify only files implicated by verified failures.

**Interfaces:**
- Consumes: the complete May experience.
- Produces: a verified release candidate.

- [ ] **Step 1: Run automated gates**

Run `npm test`, `npx tsc --noEmit`, and `npm run build`. Fix only verified May regressions and rerun each failing gate.

- [ ] **Step 2: Launch the app and inspect Safari**

Start `npm run dev`, open `http://localhost:3000/may` in Safari, and inspect desktop, tablet, and mobile viewport behavior. Confirm the head, eyes, nose, mouth, jaw, neck, and shoulders are recognizable; no other browser may be substituted.

- [ ] **Step 3: Exercise interactive states**

Verify wake entrance, idle breathing, listening focus, thinking dissolution, speaking mouth/energy behavior, pointer parallax and local displacement, quality switching, reduced motion, WebGL fallback, text input, microphone state, and audible reply playback. Confirm no uncaught Safari console errors.

- [ ] **Step 4: Confirm resource and route safety**

Navigate repeatedly between `/` and `/may`, confirm `/` is unchanged, and ensure listeners, animation frames, media streams, analyser nodes, and WebGL scenes clean up.

- [ ] **Step 5: Stop the server and commit verified polish**

Stop the dev server. If verification required changes, commit only those May-related files with `git commit -m "fix: polish May avatar verification issues"`.
