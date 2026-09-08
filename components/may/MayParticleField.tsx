"use client";

import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { createFaceTargets } from "@/lib/may/faceTargets";
import { qualityConfig } from "@/lib/may/quality";
import { STATE_VISUALS } from "@/lib/may/stateMachine";
import type { MayAudioFrame, MayAvatarState, MayQuality } from "@/lib/may/types";
import { particleFragmentShader, particleVertexShader } from "./shaders";

type Props = {
  state: MayAvatarState;
  quality: MayQuality;
  reducedMotion: boolean;
  audioFrameRef: MutableRefObject<MayAudioFrame>;
};

export default function MayParticleField({ state, quality, reducedMotion, audioFrameRef }: Props) {
  const pointsRef = useRef<THREE.Points>(null);
  const targets = useMemo(() => createFaceTargets(qualityConfig[quality].particles), [quality]);
  const geometry = useMemo(() => {
    const value = new THREE.BufferGeometry();
    value.setAttribute("position", new THREE.BufferAttribute(targets.positions, 3));
    value.setAttribute("aScatter", new THREE.BufferAttribute(targets.scatter, 3));
    value.setAttribute("aRegion", new THREE.BufferAttribute(targets.regions, 1));
    value.setAttribute("aSize", new THREE.BufferAttribute(targets.sizes, 1));
    value.setAttribute("aPhase", new THREE.BufferAttribute(targets.phases, 1));
    value.setAttribute("aDepth", new THREE.BufferAttribute(targets.depths, 1));
    value.computeBoundingSphere();
    return value;
  }, [targets]);
  const uniforms = useMemo(() => ({
    uTime: { value: 0 }, uFormation: { value: 0.05 }, uTurbulence: { value: 0.8 },
    uFocus: { value: 0 }, uMouth: { value: 0 }, uTemple: { value: 0 },
    uDissolve: { value: 0.7 }, uReduced: { value: reducedMotion ? 1 : 0 },
    uPixelRatio: { value: Math.min(2, typeof window === "undefined" ? 1 : window.devicePixelRatio) },
    uPointer: { value: new THREE.Vector2() }, uAudio: { value: new THREE.Vector4() }, uVoice: { value: 0 },
  }), [reducedMotion]);
  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms, vertexShader: particleVertexShader, fragmentShader: particleFragmentShader,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }), [uniforms]);

  useEffect(() => () => { geometry.dispose(); material.dispose(); }, [geometry, material]);

  useFrame(({ clock, pointer }, delta) => {
    const target = STATE_VISUALS[state];
    const damp = (key: "uFormation" | "uTurbulence" | "uFocus" | "uMouth" | "uTemple" | "uDissolve", value: number, speed = 3.8) => {
      uniforms[key].value = THREE.MathUtils.damp(uniforms[key].value, value, speed, delta);
    };
    uniforms.uTime.value = clock.elapsedTime;
    damp("uFormation", target.formation, state === "wake" ? 2.2 : 4.0);
    damp("uTurbulence", target.turbulence);
    damp("uFocus", target.focus);
    damp("uMouth", target.mouth, 6.5);
    damp("uTemple", target.temple);
    damp("uDissolve", target.dissolve);
    uniforms.uReduced.value = reducedMotion ? 1 : 0;
    uniforms.uPointer.value.lerp(pointer, reducedMotion ? 0.015 : 0.075);
    const audio = audioFrameRef.current;
    uniforms.uAudio.value.set(audio.amplitude, audio.bass, audio.mid, audio.high);
    uniforms.uVoice.value = audio.voice;
    if (pointsRef.current) pointsRef.current.rotation.y = Math.sin(clock.elapsedTime * 0.18) * 0.025;
  });

  return <points ref={pointsRef} geometry={geometry} material={material} frustumCulled={false} />;
}
