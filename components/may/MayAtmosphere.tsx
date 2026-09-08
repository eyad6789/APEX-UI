"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

export default function MayAtmosphere({ reducedMotion }: { reducedMotion: boolean }) {
  const pointsRef = useRef<THREE.Points>(null);
  const positions = useMemo(() => {
    const values = new Float32Array(750 * 3);
    let seed = 7331;
    const random = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };
    for (let i = 0; i < 750; i += 1) {
      const k = i * 3;
      values[k] = (random() - .5) * 12;
      values[k + 1] = (random() - .5) * 8;
      values[k + 2] = -1.5 + (random() - .5) * 5;
    }
    return values;
  }, []);
  useFrame(({ clock }) => {
    if (pointsRef.current && !reducedMotion) pointsRef.current.rotation.y = clock.elapsedTime * .006;
  });
  return (
    <group position={[0, 0, -1]}>
      <points ref={pointsRef}>
        <bufferGeometry><bufferAttribute attach="attributes-position" args={[positions, 3]} /></bufferGeometry>
        <pointsMaterial color="#0a9dc7" size={0.018} transparent opacity={0.34} depthWrite={false} blending={THREE.AdditiveBlending} />
      </points>
      {[2.25, 2.8, 3.45].map((radius, index) => (
        <mesh key={radius} position={[0, .25, -.7 - index * .08]}>
          <ringGeometry args={[radius, radius + .006 + index * .002, 128]} />
          <meshBasicMaterial color={index === 1 ? "#167b9d" : "#0bb9dd"} transparent opacity={.12 - index * .025} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}
