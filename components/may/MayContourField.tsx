"use client";

import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { qualityConfig } from "@/lib/may/quality";
import { STATE_VISUALS } from "@/lib/may/stateMachine";
import type { MayAudioFrame, MayAvatarState, MayQuality } from "@/lib/may/types";

type Props = { state: MayAvatarState; quality: MayQuality; reducedMotion: boolean; audioFrameRef: MutableRefObject<MayAudioFrame> };

function buildContours(stride: number) {
  const vertices: number[] = [];
  const segment = (a: THREE.Vector3, b: THREE.Vector3) => vertices.push(a.x, a.y, a.z, b.x, b.y, b.z);
  const curve = (point: (t: number) => THREE.Vector3, steps = 56) => {
    let previous = point(0);
    for (let i = 1; i <= steps; i += stride) {
      const current = point(Math.min(1, i / steps));
      segment(previous, current);
      previous = current;
    }
    if (steps % stride !== 0) segment(previous, point(1));
  };
  curve((t) => { const a = -Math.PI * .92 + t * Math.PI * 1.84; return new THREE.Vector3(Math.sin(a) * 1.39, .43 + Math.cos(a) * 1.89, .23 + Math.cos(a) * .13); }, 96);
  for (const side of [-1, 1]) {
    curve((t) => new THREE.Vector3(side * (.52 + Math.cos(t * Math.PI * 2) * .34), .70 + Math.sin(t * Math.PI * 2) * .14, .94), 40);
    curve((t) => new THREE.Vector3(side * (.31 + t * .57), .97 + Math.sin(t * Math.PI) * .16, .87), 30);
  }
  curve((t) => new THREE.Vector3(Math.sin(t * Math.PI * 2) * .09, .72 - t * .83, .99 + Math.sin(t * Math.PI) * .19), 34);
  curve((t) => new THREE.Vector3(-.49 + t * .98, -.55 + Math.pow(Math.abs(t - .5) * 2, 1.6) * .09, .94), 38);
  curve((t) => new THREE.Vector3(-.45 + t * .90, -.62 - Math.pow(Math.abs(t - .5) * 2, 1.4) * .04, .91), 38);
  curve((t) => { const a = -.86 + t * 1.72; return new THREE.Vector3(Math.sin(a) * 1.22, -.15 - Math.cos(a) * 1.26, .50 + Math.cos(a) * .2); }, 56);
  for (let i = 0; i < 17; i += stride) {
    const y = -1.18 + i * .20;
    const ny = (y - .43) / 1.89;
    const half = 1.39 * Math.sqrt(Math.max(0, 1 - ny * ny));
    if (half > .12) segment(new THREE.Vector3(-half, y, .17), new THREE.Vector3(half, y, .17));
  }
  curve((t) => new THREE.Vector3(-.48, -1.25 - t * 1.0, .06), 24);
  curve((t) => new THREE.Vector3(.48, -1.25 - t * 1.0, .06), 24);
  curve((t) => new THREE.Vector3(-2.45 + t * 1.98, -2.48 + Math.sin(t * Math.PI) * .34, -.04), 46);
  curve((t) => new THREE.Vector3(.47 + t * 1.98, -2.14 - Math.sin(t * Math.PI) * .34, -.04), 46);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  return geometry;
}

export default function MayContourField({ state, quality, reducedMotion, audioFrameRef }: Props) {
  const groupRef = useRef<THREE.Group>(null);
  const materialRef = useRef<THREE.LineBasicMaterial>(null);
  const geometry = useMemo(() => buildContours(qualityConfig[quality].contourStride), [quality]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useFrame(({ clock }, delta) => {
    const target = STATE_VISUALS[state];
    if (materialRef.current) {
      const desired = .11 + target.focus * .23 + audioFrameRef.current.high * .22;
      materialRef.current.opacity = THREE.MathUtils.damp(materialRef.current.opacity, desired, 4, delta);
      materialRef.current.color.setRGB(.08 + audioFrameRef.current.high * .08, .65 + target.focus * .15, .88 + target.energy * .1);
    }
    if (groupRef.current) {
      groupRef.current.position.y = reducedMotion ? 0 : Math.sin(clock.elapsedTime * .58) * .012;
      groupRef.current.rotation.z = reducedMotion ? 0 : Math.sin(clock.elapsedTime * .22) * .004;
    }
  });
  return (
    <group ref={groupRef}>
      <lineSegments geometry={geometry}>
        <lineBasicMaterial ref={materialRef} color="#2bdcf8" transparent opacity={0.18} blending={THREE.AdditiveBlending} depthWrite={false} />
      </lineSegments>
    </group>
  );
}
