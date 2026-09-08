"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import AgentConsole, { type ConsoleState } from "@/components/AgentConsole";
import { resolveQuality } from "@/lib/may/quality";
import { mapConsoleState } from "@/lib/may/stateMachine";
import type { MayAudioFrame, MayAvatarState, MayQuality } from "@/lib/may/types";
import MayAvatarCanvas from "./MayAvatarCanvas";
import { useMayAudioAnalyser } from "./useMayAudioAnalyser";
import "./may.css";

type QualityChoice = "auto" | MayQuality;

declare global {
  interface Window {
    mayAvatar?: {
      setState: (state: MayAvatarState) => void;
      setAudioData: (data: Partial<MayAudioFrame>) => void;
      setVoiceActivity: (active: boolean) => void;
      setMicrophoneActivity: (active: boolean) => void;
    };
  }
}

function detectedQuality(): MayQuality {
  if (typeof navigator === "undefined") return "medium";
  const device = navigator as Navigator & { deviceMemory?: number };
  return resolveQuality({ memory: device.deviceMemory, cores: navigator.hardwareConcurrency, dpr: window.devicePixelRatio });
}

export default function MayExperience() {
  const [state, setState] = useState<MayAvatarState>("wake");
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);
  const [microphoneStream, setMicrophoneStream] = useState<MediaStream | null>(null);
  const [qualityChoice, setQualityChoice] = useState<QualityChoice>("auto");
  const [autoQuality, setAutoQuality] = useState<MayQuality>("medium");
  const [reducedMotion, setReducedMotion] = useState(false);
  const [webglFailed, setWebglFailed] = useState(false);
  const audioFrameRef = useMayAudioAnalyser({ state, audioElement, microphoneStream });
  const quality = qualityChoice === "auto" ? autoQuality : qualityChoice;

  useEffect(() => {
    const timer = window.setTimeout(() => setState((current) => current === "wake" ? "idle" : current), reducedMotion ? 300 : 2600);
    return () => window.clearTimeout(timer);
  }, [reducedMotion]);

  useEffect(() => {
    setAutoQuality(detectedQuality());
    try {
      const saved = localStorage.getItem("may.quality") as QualityChoice | null;
      if (saved && ["auto", "low", "medium", "high", "ultra"].includes(saved)) setQualityChoice(saved);
    } catch { /* private browsing */ }
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  const chooseQuality = useCallback((choice: QualityChoice) => {
    setQualityChoice(choice);
    if (choice === "auto") setAutoQuality(detectedQuality());
    try { localStorage.setItem("may.quality", choice); } catch { /* private browsing */ }
  }, []);

  const onConsoleState = useCallback((next: ConsoleState) => setState(mapConsoleState(next)), []);

  useEffect(() => {
    window.mayAvatar = {
      setState,
      setAudioData: (data) => { audioFrameRef.current = { ...audioFrameRef.current, ...data }; },
      setVoiceActivity: (active) => { audioFrameRef.current.voice = active ? 1 : 0; },
      setMicrophoneActivity: (active) => setState(active ? "listening" : "idle"),
    };
    return () => { delete window.mayAvatar; };
  }, [audioFrameRef]);

  const stateCopy = useMemo(() => ({
    idle: "PRESENT", listening: "LISTENING", thinking: "SYNTHESIZING",
    speaking: "SPEAKING", wake: "FORMING", sleep: "DORMANT",
  })[state], [state]);

  return (
    <main className={`may-experience may-state-${state}`}>
      <div className="may-backdrop" aria-hidden="true" />
      <div className="may-avatar-stage">
        {webglFailed ? <div className="may-avatar-fallback" aria-hidden="true"><i /><b /><span /></div> : (
          <MayAvatarCanvas state={state} audioFrameRef={audioFrameRef} quality={quality} reducedMotion={reducedMotion} onContextFailure={() => setWebglFailed(true)} />
        )}
      </div>

      <header className="may-header">
        <div className="may-identity">
          <span className="may-index">M–01</span>
          <h1>MAY</h1>
          <span className="may-state-dot" />
          <p aria-live="polite">{stateCopy}</p>
        </div>
        <Link href="/" className="may-back-link">ORIGINAL INTERFACE <span>↗</span></Link>
      </header>

      <aside className="may-signal" aria-hidden="true">
        <span>CONSCIOUSNESS LINK</span><i /><i /><i /><em>STABLE</em>
      </aside>

      <div className="may-quality" role="group" aria-label="Avatar rendering quality">
        <span>QUALITY</span>
        {(["auto", "low", "medium", "high", "ultra"] as QualityChoice[]).map((choice) => (
          <button key={choice} type="button" aria-pressed={qualityChoice === choice} onClick={() => chooseQuality(choice)}>{choice}</button>
        ))}
        <em>{quality.toUpperCase()}</em>
      </div>

      <AgentConsole
        className="may-console"
        agentName="May"
        onState={onConsoleState}
        onAudioElement={setAudioElement}
        onMicrophoneStream={setMicrophoneStream}
      />
      <div className="may-a11y-status visually-hidden" aria-live="polite">May is {stateCopy.toLowerCase()}</div>
    </main>
  );
}
