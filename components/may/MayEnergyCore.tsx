"use client";

import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { STATE_VISUALS } from "@/lib/may/stateMachine";
import type { MayAudioFrame, MayAvatarState } from "@/lib/may/types";
import { energyFragmentShader, energyVertexShader } from "./shaders";

export default function MayEnergyCore({ state, audioFrameRef, reducedMotion }: { state: MayAvatarState; audioFrameRef: MutableRefObject<MayAudioFrame>; reducedMotion: boolean }) {
  const pointsRef = useRef<THREE.Points>(null);
  const { geometry, phases, scales } = useMemo(() => {
    const count = 1100;
    const positions = new Float32Array(count * 3);
    const localPhases = new Float32Array(count);
    const localScales = new Float32Array(count);
    let seed = 99173;
    const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    for (let i = 0; i < count; i += 1) {
      const a = random() * Math.PI * 2;
      const r = Math.pow(random(), .48);
      const k = i * 3;
      positions[k] = Math.cos(a) * r * .66;
      positions[k + 1] = .03 + Math.sin(a) * r * .68 + (random() - .5) * .20;
      positions[k + 2] = .64 + (random() - .5) * .72 * (1 - r * .42);
      localPhases[i] = random() * Math.PI * 2;
      localScales[i] = .3 + random() * 1.2;
    }
    const value = new THREE.BufferGeometry();
    value.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    value.setAttribute("aPhase", new THREE.BufferAttribute(localPhases, 1));
    value.setAttribute("aScale", new THREE.BufferAttribute(localScales, 1));
    return { geometry: value, phases: localPhases, scales: localScales };
  }, []);
  void phases; void scales;
  const neckGeometry = useMemo(() => {
    const vertices: number[] = [];
    for (let channel = -4; channel <= 4; channel += 1) {
      let previous = new THREE.Vector3(channel * .07, -1.02, .42 - Math.abs(channel) * .035);
      for (let i = 1; i <= 36; i += 1) {
        const t = i / 36;
        const x = channel * (.07 + t * .055) + Math.sin(t * Math.PI * 3 + channel) * .018;
        const next = new THREE.Vector3(x, -1.02 - t * 1.55, .42 - t * .34 - Math.abs(channel) * .035);
        vertices.push(previous.x, previous.y, previous.z, next.x, next.y, next.z);
        previous = next;
      }
    }
    const value = new THREE.BufferGeometry();
    value.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    return value;
  }, []);
  const neckMaterialRef = useRef<THREE.LineBasicMaterial>(null);
  const uniforms = useMemo(() => ({
    uTime: { value: 0 }, uEnergy: { value: .15 }, uMouth: { value: 0 }, uVoice: { value: 0 },
    uThinking: { value: 0 }, uPixelRatio: { value: Math.min(2, typeof window === "undefined" ? 1 : window.devicePixelRatio) },
  }), []);
  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms, vertexShader: energyVertexShader, fragmentShader: energyFragmentShader,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }), [uniforms]);
  useEffect(() => () => { geometry.dispose(); neckGeometry.dispose(); material.dispose(); }, [geometry, neckGeometry, material]);
  useFrame(({ clock }, delta) => {
    const target = STATE_VISUALS[state];
    uniforms.uTime.value = clock.elapsedTime * (reducedMotion ? .25 : 1);
    uniforms.uEnergy.value = THREE.MathUtils.damp(uniforms.uEnergy.value, target.energy + audioFrameRef.current.amplitude * .5, 4, delta);
    uniforms.uMouth.value = THREE.MathUtils.damp(uniforms.uMouth.value, target.mouth, 6, delta);
    uniforms.uVoice.value = audioFrameRef.current.voice;
    uniforms.uThinking.value = THREE.MathUtils.damp(uniforms.uThinking.value, state === "thinking" ? 1 : 0, 2.5, delta);
    if (neckMaterialRef.current) {
      neckMaterialRef.current.opacity = THREE.MathUtils.damp(neckMaterialRef.current.opacity, .22 + target.energy * .32 + audioFrameRef.current.mid * .3, 4, delta);
    }
    if (pointsRef.current) pointsRef.current.rotation.z = reducedMotion ? 0 : Math.sin(clock.elapsedTime * .31) * .035;
  });
  return (
    <group>
      <points ref={pointsRef} geometry={geometry} material={material} frustumCulled={false} />
      <lineSegments geometry={neckGeometry}>
        <lineBasicMaterial ref={neckMaterialRef} color="#ffb02e" transparent opacity={.3} blending={THREE.AdditiveBlending} depthWrite={false} />
      </lineSegments>
    </group>
  );
}
