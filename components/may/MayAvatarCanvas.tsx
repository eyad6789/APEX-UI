"use client";

import React, { useCallback, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import * as THREE from "three";
import { qualityConfig } from "@/lib/may/quality";
import type { MayAudioFrame, MayAvatarState, MayQuality } from "@/lib/may/types";
import MayReferenceSculpture from "./MayReferenceSculpture";

type Props = {
  state: MayAvatarState;
  audioFrameRef: MutableRefObject<MayAudioFrame>;
  quality: MayQuality;
  reducedMotion: boolean;
  onContextFailure: () => void;
};

class MaySceneBoundary extends React.Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) {
    console.warn("[may] WebGL scene failed", error);
    this.props.onError();
  }
  render() { return this.state.failed ? null : this.props.children; }
}

function AvatarRig({ state, reducedMotion, audioFrameRef }: Omit<Props, "onContextFailure">) {
  const groupRef = useRef<THREE.Group>(null);
  useFrame(({ pointer, camera, clock, size }, delta) => {
    if (!groupRef.current) return;
    const amount = reducedMotion ? 0 : 1;
    groupRef.current.rotation.y = THREE.MathUtils.damp(groupRef.current.rotation.y, pointer.x * .028 * amount, 3.2, delta);
    groupRef.current.rotation.x = THREE.MathUtils.damp(groupRef.current.rotation.x, -pointer.y * .045 * amount, 3.2, delta);
    groupRef.current.position.y = THREE.MathUtils.damp(groupRef.current.position.y, Math.sin(clock.elapsedTime * .72) * .018 * amount, 2, delta);
    camera.position.x = THREE.MathUtils.damp(camera.position.x, pointer.x * .13 * amount, 2.4, delta);
    camera.position.y = THREE.MathUtils.damp(camera.position.y, .02 + pointer.y * .07 * amount, 2.4, delta);
    camera.position.z = Math.max(9.3, 5.7 / (size.width / size.height));
    camera.lookAt(0, -.08, 0);
  });
  return (
    <group ref={groupRef}>
      <MayReferenceSculpture state={state} reducedMotion={reducedMotion} audioFrameRef={audioFrameRef} />
    </group>
  );
}

export default function MayAvatarCanvas(props: Props) {
  const [epoch, setEpoch] = useState(0);
  const recoveryCount = useRef(0);
  const onLost = useCallback((event: Event) => {
    event.preventDefault();
    if (recoveryCount.current < 2) {
      recoveryCount.current += 1;
      window.setTimeout(() => setEpoch((value) => value + 1), 1200 * recoveryCount.current);
    } else {
      props.onContextFailure();
    }
  }, [props]);
  const config = qualityConfig[props.quality];

  return (
    <MaySceneBoundary onError={props.onContextFailure}>
      <Canvas
        key={epoch}
        aria-hidden="true"
        camera={{ position: [0, .02, 8], fov: 35, near: .1, far: 40 }}
        dpr={[1, config.dpr]}
        gl={{ alpha: true, antialias: props.quality !== "low", powerPreference: "high-performance" }}
        onCreated={({ gl }) => {
          gl.setClearColor(0x141e29, 1);
          gl.outputColorSpace = THREE.SRGBColorSpace;
          gl.domElement.addEventListener("webglcontextlost", onLost, { once: true });
        }}
      >
        <AvatarRig state={props.state} quality={props.quality} reducedMotion={props.reducedMotion} audioFrameRef={props.audioFrameRef} />
        {config.bloom && !props.reducedMotion ? (
          <EffectComposer multisampling={props.quality === "ultra" ? 4 : 0}>
            <Bloom intensity={1.1} luminanceThreshold={.55} luminanceSmoothing={.45} mipmapBlur />
          </EffectComposer>
        ) : null}
      </Canvas>
    </MaySceneBoundary>
  );
}
