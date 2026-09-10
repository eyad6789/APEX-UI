"use client";

import { useEffect, useMemo, type MutableRefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { MayAudioFrame, MayAvatarState } from "@/lib/may/types";

// One continuous, featureless surface. No eye, nose, or mouth geometry.
function headWidth(y: number) {
  const v = (y - .81) / 1.39;
  return .96 * Math.sqrt(Math.max(0, 1 - v * v)) * (1 - .15 * Math.max(0, -v));
}

const vertex = /* glsl */ `
  uniform float uTime;
  uniform float uActivity;
  varying vec3 vPosition;
  void main() {
    vec3 p = position;
    p.z += sin(p.y * 7.0 - uTime * 2.0) * .009 * uActivity;
    vPosition = p;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const lineFragment = /* glsl */ `
  uniform float uActivity;
  varying vec3 vPosition;
  void main() {
    vec2 q = (vPosition.xy - vec2(0., .46)) / vec2(.62, .77);
    float heat = exp(-dot(q,q) * 1.4);
    vec3 cyan = vec3(.035, .57, .8);
    vec3 orange = mix(vec3(1., .28, .008), vec3(1., .94, .24), heat);
    vec3 color = mix(cyan, orange, smoothstep(.04, .75, heat));
    float depth = .36 + .64 * smoothstep(-.4, .6, vPosition.z);
    gl_FragColor = vec4(color * (1.1 + heat * 1.6), depth * (.5 + heat * .5));
  }
`;

const coreFragment = /* glsl */ `
  uniform float uTime;
  uniform float uActivity;
  varying vec3 vPosition;
  void main() {
    vec2 q = vPosition.xy / vec2(.83, .91);
    float r = dot(q,q);
    float breath = 1. + .035 * sin(uTime * 1.2) + uActivity * .055;
    float halo = exp(-r * 2.8 / breath);
    float center = exp(-r * 5.5 / breath);
    vec3 color = mix(vec3(1., .21, .0), vec3(1., .85, .03), center);
    float alpha = halo * .86;
    gl_FragColor = vec4(color * 1.45, alpha);
  }
`;

export default function MayReferenceSculpture({ state, reducedMotion, audioFrameRef }: {
  state: MayAvatarState; reducedMotion: boolean; audioFrameRef: MutableRefObject<MayAudioFrame>;
}) {
  const assets = useMemo(() => {
    const vertices: number[] = [];
    const addCurve = (sample: (t: number) => THREE.Vector3, steps = 120) => {
      let a = sample(0);
      for (let i = 1; i <= steps; i++) {
        const b = sample(i / steps);
        vertices.push(a.x,a.y,a.z,b.x,b.y,b.z);
        a = b;
      }
    };
    // Horizontal wraps, curved in both screen-space and depth.
    for (let row = 1; row < 51; row++) {
      const y = -.58 + row * 2.78 / 51;
      const width = headWidth(y);
      addCurve(t => {
        const a = (t - .5) * Math.PI;
        const center = Math.cos(a);
        const wave = .017 * Math.sin(t * Math.PI * 5) * Math.exp(-Math.pow((y - .46) / .6, 2));
        return new THREE.Vector3(Math.sin(a) * width, y - .042 * center + wave, .54 * center);
      });
    }
    // Nested streams follow the neck outward over the shoulders and into the chest.
    for (const side of [-1, 1]) {
      for (let band = 0; band < 22; band++) {
        const b = band / 21;
        const curve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(side * (.53 - b * .40), -.28 - b * .3, .06),
          new THREE.Vector3(side * (.58 - b * .35), -.88 - b * .35, .10),
          new THREE.Vector3(side * (.83 - b * .37), -1.23 - b * .40, .14),
          new THREE.Vector3(side * (1.45 - b * .42), -1.42 - b * .46, .08),
          new THREE.Vector3(side * (2.12 - b * .61), -1.70 - b * .45, -.03),
          new THREE.Vector3(side * (2.52 - b * .7), -2.27, -.12),
        ]);
        addCurve(t => curve.getPoint(t));
      }
    }
    const lines = new THREE.BufferGeometry();
    lines.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));

    const outline: THREE.Vector3[] = [];
    for (let i = 0; i <= 240; i++) {
      const a = i / 240 * Math.PI * 2;
      const y = .81 + Math.cos(a) * 1.39;
      const v = (y - .81) / 1.39;
      outline.push(new THREE.Vector3(Math.sin(a) * .96 * (1 - .15 * Math.max(0, -v)), y, .015));
    }
    const rim = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(outline, true), 300, .020, 8, true);
    const shoulders = [-1, 1].map(side => new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * .55, -.26, 0),
      new THREE.Vector3(side * .6, -.93, 0),
      new THREE.Vector3(side * .88, -1.23, 0),
      new THREE.Vector3(side * 1.55, -1.44, 0),
      new THREE.Vector3(side * 2.18, -1.76, 0),
      new THREE.Vector3(side * 2.52, -2.27, 0),
    ]), 140, .018, 8, false));

    const gold: number[] = [];
    for (const side of [-1, 1]) for (let band = 0; band < 3; band++) {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(side * (.33 + band * .06), -.64, .3),
        new THREE.Vector3(side * (.25 + band * .05), -1.0, .32),
        new THREE.Vector3(side * (.10 + band * .055), -1.3, .3),
        new THREE.Vector3(side * (.06 + band * .035), -1.65, .25),
        new THREE.Vector3(side * (.055 + band * .025), -2.26, .2),
      ]);
      for (let i = 0; i < 100; i++) {
        const a = curve.getPoint(i / 100), b = curve.getPoint((i + 1) / 100);
        gold.push(a.x,a.y,a.z,b.x,b.y,b.z);
      }
    }
    const channels = new THREE.BufferGeometry();
    channels.setAttribute("position", new THREE.Float32BufferAttribute(gold, 3));
    return { lines, rim, shoulders, channels };
  }, []);
  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uActivity: { value: 0 } }), []);
  useEffect(() => () => {
    assets.lines.dispose(); assets.rim.dispose(); assets.channels.dispose();
    assets.shoulders.forEach(g => g.dispose());
  }, [assets]);
  useFrame(({ clock }, delta) => {
    uniforms.uTime.value = reducedMotion ? 0 : clock.elapsedTime;
    const activity = reducedMotion ? 0 : audioFrameRef.current.amplitude + (state === "listening" ? .2 : 0);
    uniforms.uActivity.value = THREE.MathUtils.damp(uniforms.uActivity.value, activity, 4, delta);
  });
  return (
    <group>
      {[1.4,1.5,1.64,1.78,1.85,1.99,2.16].map(radius => (
        <mesh key={radius} position={[0,.62,-.9]} scale={[1,1.07,1]}>
          <ringGeometry args={[radius,radius+.003,160]} />
          <meshBasicMaterial color="#22839e" transparent opacity={.15} depthWrite={false} />
        </mesh>
      ))}
      <mesh position={[0,.46,.18]}>
        <planeGeometry args={[2.5,2.7]} />
        <shaderMaterial uniforms={uniforms} vertexShader={vertex} fragmentShader={coreFragment} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      <lineSegments geometry={assets.lines}>
        <shaderMaterial uniforms={uniforms} vertexShader={vertex} fragmentShader={lineFragment} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
      </lineSegments>
      {[assets.rim,...assets.shoulders].map((geometry,i) => (
        <mesh key={i} geometry={geometry}>
          <meshBasicMaterial color={[.08,2.2,3.2]} toneMapped={false} transparent opacity={.95} />
        </mesh>
      ))}
      <lineSegments geometry={assets.channels}>
        <lineBasicMaterial color={[1.8,1.2,.25]} toneMapped={false} transparent opacity={.6} depthWrite={false} blending={THREE.AdditiveBlending} />
      </lineSegments>
    </group>
  );
}
