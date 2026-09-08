"use client";

import { useEffect, useRef, type MutableRefObject } from "react";
import { extractAudioFrame, smoothAudioFrame } from "@/lib/may/audioFeatures";
import { EMPTY_AUDIO_FRAME, type MayAudioFrame, type MayAvatarState } from "@/lib/may/types";

type Args = {
  state: MayAvatarState;
  audioElement: HTMLAudioElement | null;
  microphoneStream: MediaStream | null;
};

export function useMayAudioAnalyser({ state, audioElement, microphoneStream }: Args): MutableRefObject<MayAudioFrame> {
  const frameRef = useRef<MayAudioFrame>({ ...EMPTY_AUDIO_FRAME });
  const contextRef = useRef<AudioContext | null>(null);
  const outputAnalyserRef = useRef<AnalyserNode | null>(null);
  const inputAnalyserRef = useRef<AnalyserNode | null>(null);
  const elementNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const microphoneNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const audioElementRef = useRef(audioElement);
  const microphoneRef = useRef(microphoneStream);
  audioElementRef.current = audioElement;
  microphoneRef.current = microphoneStream;

  useEffect(() => {
    let disposed = false;
    const attach = async () => {
      if (disposed) return;
      const Context = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Context) return;
      const context = contextRef.current ?? new Context();
      contextRef.current = context;
      await context.resume().catch(() => undefined);

      const element = audioElementRef.current;
      if (element && !elementNodeRef.current) {
        try {
          const analyser = context.createAnalyser();
          analyser.fftSize = 512;
          analyser.smoothingTimeConstant = 0.72;
          const source = context.createMediaElementSource(element);
          source.connect(analyser);
          analyser.connect(context.destination);
          elementNodeRef.current = source;
          outputAnalyserRef.current = analyser;
        } catch (error) {
          console.warn("[may] reply audio analysis unavailable", error);
        }
      }
    };
    window.addEventListener("pointerdown", attach, { passive: true });
    window.addEventListener("keydown", attach);
    return () => {
      disposed = true;
      window.removeEventListener("pointerdown", attach);
      window.removeEventListener("keydown", attach);
    };
  }, []);

  useEffect(() => {
    const context = contextRef.current;
    if (!context || !audioElement || elementNodeRef.current) return;
    try {
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.72;
      const source = context.createMediaElementSource(audioElement);
      source.connect(analyser);
      analyser.connect(context.destination);
      elementNodeRef.current = source;
      outputAnalyserRef.current = analyser;
    } catch (error) {
      console.warn("[may] could not attach reply analyser", error);
    }
  }, [audioElement]);

  useEffect(() => {
    microphoneNodeRef.current?.disconnect();
    microphoneNodeRef.current = null;
    inputAnalyserRef.current = null;
    const context = contextRef.current;
    if (!context || !microphoneStream) return;
    try {
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.68;
      const source = context.createMediaStreamSource(microphoneStream);
      source.connect(analyser);
      microphoneNodeRef.current = source;
      inputAnalyserRef.current = analyser;
    } catch (error) {
      console.warn("[may] microphone analysis unavailable", error);
    }
    return () => {
      microphoneNodeRef.current?.disconnect();
      microphoneNodeRef.current = null;
      inputAnalyserRef.current = null;
    };
  }, [microphoneStream]);

  useEffect(() => {
    let frame = 0;
    const bins = new Uint8Array(256);
    const tick = (time: number) => {
      const analyser = state === "speaking" ? outputAnalyserRef.current : state === "listening" ? inputAnalyserRef.current : null;
      let next: MayAudioFrame;
      if (analyser && contextRef.current) {
        analyser.getByteFrequencyData(bins);
        next = extractAudioFrame(bins, contextRef.current.sampleRate, analyser.fftSize);
      } else {
        const pulse = (Math.sin(time * 0.0055) + 1) * 0.5;
        const activity = state === "speaking" ? 0.18 + pulse * 0.19 : state === "listening" ? 0.06 + pulse * 0.05 : 0;
        next = { amplitude: activity, bass: activity * 0.75, mid: activity, high: activity * 0.35, voice: activity };
      }
      frameRef.current = smoothAudioFrame(frameRef.current, next);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [state]);

  useEffect(() => () => {
    microphoneNodeRef.current?.disconnect();
    elementNodeRef.current?.disconnect();
    void contextRef.current?.close();
  }, []);

  return frameRef;
}
