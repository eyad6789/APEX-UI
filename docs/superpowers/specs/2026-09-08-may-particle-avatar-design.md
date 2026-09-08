# May Particle Avatar — Design Specification

## Goal

Add an isolated `/may` experience to APEX-UI that gives the existing AI agent a recognizable humanoid visual presence. May is formed in real time from cyan particles, luminous scan lines, and a warm facial energy field. The existing home page and agent behavior remain unchanged so the new experience can be evaluated independently.

The implementation does not replace conversation, reasoning, speech recognition, text-to-speech, scheduling, or other backend capabilities. It consumes the state and audio signals those systems already expose.

## Experience

The `/may` route is a full-viewport, dark cinematic scene. A head, neck, and shoulder silhouette occupies most of the frame, with intentional negative space around it. Facial features remain readable while continually breathing, drifting, dissolving, and reconstructing.

The visual identity combines:

- Cyan and ice-blue particles at several depths.
- Fine horizontal facial scans and curved contour traces.
- A warm white, yellow, and orange energy field concentrated around the mouth and central face.
- Restrained atmospheric particles and circular fields behind the head.
- Subtle head, camera, and eye-region response to pointer movement.

The page includes only a discreet MAY/state indicator, the existing conversation controls, a quality selector, and a link back to the original interface. The avatar remains the dominant interface.

## Route and Integration Boundary

- Add `app/may/page.tsx` as the separate entry point.
- Leave `app/page.tsx` and the current APEX screen unchanged.
- Reuse the current chat, TTS, microphone, and scheduling APIs.
- Adapt `AgentConsole` through optional callbacks or shared hooks rather than duplicating agent logic.
- Keep all May-specific rendering code below `components/may/` and pure supporting logic below `lib/may/`.

The visual layer exposes a small controller contract:

```ts
type MayAvatarState = "idle" | "listening" | "thinking" | "speaking" | "wake" | "sleep";

interface MayAvatarController {
  setState(state: MayAvatarState): void;
  setAudioData(data: MayAudioFrame): void;
  setVoiceActivity(active: boolean): void;
  setMicrophoneActivity(active: boolean): void;
}
```

React integration may implement this contract with props and refs, but the renderer must not depend on chat or backend implementation details.

## Architecture

### Scene shell

`MayExperience` owns the page layout, visual status, conversation controls, quality selection, and error fallback. `MayAvatarCanvas` owns the React Three Fiber canvas, capped device-pixel ratio, camera, lighting-independent shader materials, and post-processing.

### Facial target system

`lib/may/faceTargets.ts` creates a deterministic procedural point map for:

- Head and forehead surfaces.
- Left and right eyes and eyebrows.
- Nose bridge and tip.
- Cheeks.
- Upper lip, lower lip, and mouth cavity.
- Jaw and chin.
- Neck and shoulders.
- A sparse outer aura.

Each generated point includes position, scatter origin, size, phase, depth, noise seed, and a facial-region identifier. Curves and layered elliptical surfaces create a human-like three-dimensional form without importing a conventional head model.

The same seeded input must produce the same target map so generation can be tested and hydration remains stable.

### GPU particle renderer

`MayParticleField` uploads target positions and per-particle attributes once through `BufferGeometry`. Custom vertex and fragment shaders perform formation, breathing, turbulence, region-specific displacement, depth response, pointer repulsion, and audio response on the GPU.

The CPU updates only compact uniforms each frame: elapsed time, eased pointer position, state transition values, quality, and analyzed audio bands. It does not loop over every particle during normal animation.

Particles transition through organic noise-distorted paths rather than direct linear interpolation. A small percentage detach, drift, and return. Alpha, point size, and brightness vary with depth and facial region.

### Structural lines and fields

`MayContourField` renders a restrained set of procedural face contours, horizontal scans, orbital arcs, and neck energy paths. Lines share state, pointer, and audio uniforms with the particle field but use separate materials so they can fade or sharpen independently.

`MayEnergyCore` creates the warm central energy using layered shader planes or point volumes with additive blending, noise, radial falloff, and state-driven motion. It must never read as a flat circular sprite. Energy motion shifts toward the forehead while thinking, focuses while listening, and propagates outward from the mouth and down the neck while speaking.

### State machine

`lib/may/stateMachine.ts` defines valid states, transition timing, and visual parameters. The existing console states map directly:

| Existing state | May state |
| --- | --- |
| `idle` | `idle` |
| `listening` | `listening` |
| `thinking` | `thinking` |
| `speaking` | `speaking` |

`wake` plays on initial entrance and when returning from `sleep`. `sleep` is available to the public controller and can be used after extended inactivity. Transitions are interruptible and smoothly approach their new targets without resetting the scene.

State behavior:

- `idle`: readable but loose face, slow breathing, gentle drift, quiet energy.
- `listening`: particles converge, eye regions focus, circular listening waves appear, microphone energy gently affects the face.
- `thinking`: portions dissolve, temple and forehead activity rises, particles circulate upward, controlled glitches appear.
- `speaking`: mouth and jaw regions respond to speech, waves cross the face, sparks follow high frequencies, warm energy travels into the neck.
- `wake`: rapid staged convergence from sparse darkness into the facial structure.
- `sleep`: facial clarity and energy recede while a faint silhouette remains.

### Pointer interaction

`useMayPointer` converts pointer position and velocity into eased normalized coordinates. The shader applies distance falloff, depth weighting, spring-like lag, local repulsion, and a low-amplitude head rotation. Eye-region movement is stronger than camera movement so May appears to look toward the user rather than sliding with the cursor.

Touch devices use a centered resting focus and brief localized response to touch movement. No interaction is required for the avatar to remain alive.

### Audio analysis

`useMayAudioAnalyser` accepts either the microphone `MediaStream` or the persistent reply `HTMLAudioElement`. It maintains one `AudioContext`, one analyser per active source, and typed arrays reused across frames.

The analyser derives smoothed values for:

- Overall amplitude.
- Bass.
- Midrange.
- High frequencies.
- Voice activity.

Signal mapping is regional rather than global:

- Bass drives low-amplitude structural and chest movement.
- Midrange drives mouth, jaw, and cheek displacement.
- High frequencies drive fine sparks and line shimmer.
- Overall amplitude drives controlled brightness and energy expansion.
- Voice activity gates speech-specific mouth waves.

Microphone analysis is active only while listening. Reply analysis is active only while May is speaking. The audio graph must preserve audible output and must not create more than one `MediaElementSourceNode` for the persistent audio element. Browser autoplay and permission failures leave the avatar functional with state-based animation.

## Performance and Quality

Quality tiers control particle count, contour density, bloom, and device-pixel ratio:

| Tier | Approx. particles | DPR cap | Effects |
| --- | ---: | ---: | --- |
| Low | 8,000 | 1.0 | Minimal contours, no bloom |
| Medium | 15,000 | 1.25 | Moderate contours, light glow |
| High | 25,000 | 1.5 | Full contours and restrained bloom |
| Ultra | 35,000 | 2.0 | Highest density and full effects |

Automatic selection uses device memory, hardware concurrency, screen density, and a short measured frame-time sample. The user can override it, and the preference is stored locally. Runtime adaptation may step down one tier after sustained poor frame time but does not oscillate between tiers.

All geometries, materials, textures, analyser nodes, animation frames, and event listeners are disposed on unmount. WebGL context loss shows a quiet static fallback and attempts a bounded recovery without taking down chat controls.

`prefers-reduced-motion` keeps a stable facial form, removes pointer repulsion and glitches, reduces drift, and disables unnecessary post-processing. The experience remains meaningful rather than disappearing.

## Responsive Behavior

- Desktop: head, neck, and shoulders are fully visible; conversation controls sit near the lower edge without covering the mouth.
- Tablet: shoulder width and camera distance tighten while preserving facial space.
- Mobile: the crop prioritizes the entire head and upper neck; controls become compact and remain clear of the face.
- Landscape short viewports: status and controls use edge-aligned compact layouts.

The canvas uses CSS viewport sizing and responds to resize without regenerating particle targets unnecessarily.

## Error Handling and Accessibility

- If WebGL is unavailable, show a CSS-rendered atmospheric silhouette, MAY state label, and fully functional conversation controls.
- If microphone access fails, preserve text input and show the existing microphone error behavior.
- If audio analysis cannot initialize, speaking and listening animations use state-driven fallback envelopes.
- The canvas is decorative and hidden from assistive technology. Live state text is exposed through an `aria-live="polite"` region.
- Controls remain keyboard accessible with visible focus states and sufficient contrast.
- Quality selection has an explicit accessible label.

## Testing

Unit tests cover:

- Deterministic facial target generation and required facial-region coverage.
- Valid state transitions and state-to-visual parameter mapping.
- Existing-console-to-May state mapping.
- Quality auto-selection and clamping.
- Audio band normalization and smoothing with synthetic frequency data.

Integration verification covers:

- `/may` renders without changing `/`.
- Existing text conversation still reaches the chat API.
- Microphone interaction enters and leaves listening state.
- Reply playback enters speaking state and drives analyser data when available.
- Audio remains audible after connecting the analyser.
- No console errors or resource leaks appear after repeated route changes.

Visual verification in Safari covers desktop, tablet, and mobile viewport sizes, all six states, pointer interaction, reduced motion, quality switching, WebGL fallback, and sustained animation performance.

## Acceptance Criteria

- `/may` presents a clearly recognizable humanoid head, neck, and shoulders made from dynamic particles and procedural lines.
- The original `/` page remains visually and behaviorally unchanged.
- The avatar visibly and distinctly represents idle, listening, thinking, speaking, wake, and sleep.
- Pointer movement creates subtle focus, parallax, local displacement, and recovery without moving the entire face as one object.
- Real microphone amplitude affects listening visuals when permission is available.
- Real reply audio frequency bands affect speaking visuals without muting or interrupting playback.
- Mouth and jaw responses are localized and never become a cartoon mouth.
- The warm facial energy core is volumetric in appearance and changes behavior by state.
- Automatic and manual low, medium, high, and ultra quality modes work.
- The experience respects reduced-motion preferences and retains a usable fallback when WebGL or audio analysis is unavailable.
- The production build and existing tests pass.
- The running page has no uncaught console errors in Safari.

## Non-Goals

- Replacing the AI backend, prompt logic, voice provider, speech recognition system, or schedule storage.
- Photorealistic skin, a conventional rigged character, lip-synced phonemes, or imported copyrighted character assets.
- Reworking or deleting the existing home experience.
- Adding unrelated dashboards, agent graphs, or new backend capabilities to the May page.
