"use client";

/**
 * AgentConsole - the talk-to-Mey bar at the bottom of the world.
 * Type, press the mic, or turn on hands-free and just say "Hi Mey ...".
 * The message goes to /api/chat (Gemini), the reply is spoken through
 * /api/tts (ElevenLabs, or the browser's own voice when no key is set).
 * Reports its state back to the orb.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export type ConsoleState = "idle" | "listening" | "thinking" | "speaking";
type Msg = { role: "user" | "assistant"; content: string };
import type { Meeting } from "@/lib/schedule/store";

// Safari / Chrome expose SpeechRecognition under a webkit prefix.
type SRResult = ArrayLike<{ transcript: string }> & { isFinal: boolean };
type SR = {
  lang: string; interimResults: boolean; continuous: boolean;
  onresult: ((e: { results: ArrayLike<SRResult> }) => void) | null;
  onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null;
  start: () => void; stop: () => void; abort: () => void;
};
function getRecognizer(): SR | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

// "Hi Mey, what's the weather" → "what's the weather".
//
// "Mey" is a short name that recognisers render as "may", "my" or "me", and the last
// two are ordinary English words — matching them loosely would fire on "my head hurts".
// So the distinctive spellings wake her on their own, while the everyday ones only
// count when a greeting came first ("hey my …") or they are the whole utterance.
const WAKE_WORDS = new Set(["mey", "may", "mae", "mai",
  "مي", "ماي", "مية", "مای"]);
const WAKE_AMBIGUOUS = new Set(["my", "me", "mi", "meh", "mah", "مه"]);
const WAKE_FUZZY = /^m[ae][iy]$/i;                                  // mey, may, mai, mae
const GREETINGS = new Set(["hey", "hi", "hello", "ok", "okay", "yo", "a", "مرحبا", "مرحباً", "هاي", "يا", "اهلا", "أهلا"]);
const isWake = (w: string) => WAKE_WORDS.has(w) || WAKE_FUZZY.test(w);

function stripWake(text: string): string | null {
  const tokens = text.split(/\s+/).filter(Boolean);
  for (let i = 0; i < tokens.length; i++) {
    const word = tokens[i].toLowerCase().replace(/^[\s,،.!?؟'"]+|[\s,،.!?؟'"]+$/g, "").replace(/'s$/, "");
    const rest = tokens.slice(i + 1).join(" ").replace(/^[\s,،.!?؟]+/, "").trim();
    if (isWake(word)) return rest;
    // "my" / "me": only the name if a greeting led into it, or it is all that was said.
    if (WAKE_AMBIGUOUS.has(word) && (i > 0 || tokens.length === 1)) return rest;
    if (!GREETINGS.has(word)) return null;   // the name must be the first real word
  }
  return null;
}

// True when most of what the mic heard is words from Mey's last reply (speaker bleed).
function soundsLikeOwnReply(heard: string, reply: string): boolean {
  const words = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((w) => w.length > 2);
  const h = words(heard); if (h.length < 2) return false;
  const r = new Set(words(reply));
  const hits = h.filter((w) => r.has(w)).length;
  return hits / h.length >= 0.6;
}

// 50ms of silence. Safari only lets an <audio> element play if its FIRST play()
// happened inside a user gesture; a reply arrives a second or two later, long after
// that gesture expired. So we play this primer on the first tap/keypress, which
// permanently unlocks the one element we then reuse for every reply.
const SILENT_WAV =
  "data:audio/wav;base64,UklGRkQDAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YSADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==";
const PLAY_TIMEOUT_MS = 4000;   // Safari can leave play() pending forever - never wait past this

const HANDS_FREE_KEY = "apex.handsFree";
const NAVIGATOR_LANG = () => (typeof navigator !== "undefined" && navigator.language) || "en-US";

export default function AgentConsole({ onState, onSchedule, onAudioElement, onMicrophoneStream, className, agentName = "Mey" }: {
  onState: (s: ConsoleState) => void;
  /** Fires whenever a reply changed the calendar, so the panel can redraw. */
  onSchedule?: (meetings: Meeting[]) => void;
  /** Optional visualizers can analyse the persistent reply element without owning playback. */
  onAudioElement?: (element: HTMLAudioElement | null) => void;
  /** Reports a live microphone stream when one is available for visual analysis. */
  onMicrophoneStream?: (stream: MediaStream | null) => void;
  className?: string;
  agentName?: string;
}) {
  const [text, setText] = useState("");
  const [state, setState] = useState<ConsoleState>("idle");
  const [history, setHistory] = useState<Msg[]>([]);
  const [lastReply, setLastReply] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [micAvailable, setMicAvailable] = useState(false);
  const [handsFree, setHandsFree] = useState(false);
  const [resumePending, setResumePending] = useState(false); // hands-free was on last visit; waiting for a tap
  const [wakeHeard, setWakeHeard] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);   // one persistent element, unlocked once
  const unlockedRef = useRef(false);
  const recRef = useRef<SR | null>(null);       // push-to-talk recognizer
  const wakeRef = useRef<SR | null>(null);      // hands-free recognizer
  const wakeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const analysisStreamRef = useRef<MediaStream | null>(null);
  const stateRef = useRef<ConsoleState>("idle");
  const handsFreeRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Only persist the hands-free choice once the user has actually made one -
  // otherwise the first render writes "0" and pins it off forever.
  const handsFreeTouched = useRef(false);
  const onScheduleRef = useRef(onSchedule);
  onScheduleRef.current = onSchedule;
  const onAudioElementRef = useRef(onAudioElement);
  onAudioElementRef.current = onAudioElement;
  const onMicrophoneStreamRef = useRef(onMicrophoneStream);
  onMicrophoneStreamRef.current = onMicrophoneStream;

  const bindAudioElement = useCallback((element: HTMLAudioElement | null) => {
    audioRef.current = element;
    onAudioElementRef.current?.(element);
  }, []);

  const releaseAnalysisStream = useCallback(() => {
    analysisStreamRef.current?.getTracks().forEach((track) => track.stop());
    analysisStreamRef.current = null;
    onMicrophoneStreamRef.current?.(null);
  }, []);

  const go = useCallback((s: ConsoleState) => { stateRef.current = s; setState(s); onState(s); }, [onState]);

  useEffect(() => {
    setMicAvailable(!!getRecognizer());

    // Unlock playback on the very first gesture anywhere on the page. Without this
    // Safari refuses the reply audio (networkState 3, play() pending forever) because
    // the gesture is long gone by the time the model has answered.
    const unlock = () => {
      const a = audioRef.current;
      if (!a || unlockedRef.current) return;
      unlockedRef.current = true;
      a.src = SILENT_WAV;
      a.play().then(() => {
        a.pause(); a.currentTime = 0;
      }, () => { unlockedRef.current = false; });
    };
    window.addEventListener("pointerdown", unlock, { capture: true });
    window.addEventListener("keydown", unlock, { capture: true });

    // Hands-free is ON unless you have explicitly switched it off, so Mey listens
    // for his name without you hunting for a toggle first. Safari still refuses to
    // open the microphone until the page has been touched once, so we arm it on the
    // same first tap / key that unlocks audio - "click anywhere, then just talk".
    let wanted = true;
    try { wanted = localStorage.getItem(HANDS_FREE_KEY) !== "0"; } catch { /* private mode */ }
    const resume = () => { setResumePending(false); setHandsFree(true); };
    if (wanted && getRecognizer()) {
      setResumePending(true);
      window.addEventListener("pointerdown", resume, { once: true, capture: true });
      window.addEventListener("keydown", resume, { once: true, capture: true });
    }
    return () => {
      window.removeEventListener("pointerdown", unlock, { capture: true });
      window.removeEventListener("keydown", unlock, { capture: true });
      window.removeEventListener("pointerdown", resume, { capture: true });
      window.removeEventListener("keydown", resume, { capture: true });
    };
  }, []);

  const stopSpeaking = useCallback(() => {
    const a = audioRef.current;
    if (a) { a.pause(); a.removeAttribute("src"); a.load(); }   // keep the element - it holds the unlock
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
  }, []);

  // The browser's own voice - the fallback when there is no server audio, or when
  // the element refuses to play. Always resolves, so a reply can never hang the console.
  const speakWithBrowser = useCallback((reply: string) => new Promise<void>((resolve) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return resolve();
    const u = new SpeechSynthesisUtterance(reply);
    const voices = window.speechSynthesis.getVoices();
    u.voice = voices.find((v) => /Daniel|Oliver|Arthur/.test(v.name) && v.lang.startsWith("en-GB"))
      ?? voices.find((v) => v.lang.startsWith("en-GB")) ?? null;
    u.rate = 1.02; u.pitch = 0.9;
    u.onend = () => resolve(); u.onerror = () => resolve();
    window.speechSynthesis.speak(u);
  }), []);

  // Play one clip through the shared element. Resolves when it finishes, is stopped,
  // or fails - and rejects only if playback never actually starts, so the caller can
  // fall back to the browser voice instead of going silent.
  const playClip = useCallback((url: string) => new Promise<void>((resolve, reject) => {
    const a = audioRef.current;
    if (!a) return reject(new Error("no audio element"));
    let settled = false;
    const finish = (fn: () => void) => { if (settled) return; settled = true; clearTimeout(timer); cleanup(); fn(); };
    const onEnded = () => finish(resolve);
    const onPause = () => finish(resolve);          // stopSpeaking() - treat as finished
    const onError = () => finish(() => reject(new Error("decode failed")));
    const onPlaying = () => { clearTimeout(timer); };   // real audio started - let it run to the end
    const cleanup = () => {
      a.removeEventListener("ended", onEnded); a.removeEventListener("pause", onPause);
      a.removeEventListener("error", onError); a.removeEventListener("playing", onPlaying);
    };
    // Safari can leave play() pending and never fire an event; bail out instead of hanging.
    const timer = setTimeout(() => finish(() => reject(new Error("playback did not start"))), PLAY_TIMEOUT_MS);
    a.addEventListener("ended", onEnded); a.addEventListener("pause", onPause);
    a.addEventListener("error", onError); a.addEventListener("playing", onPlaying);
    a.src = url;
    a.play().catch(() => finish(() => reject(new Error("playback blocked"))));
  }), []);

  // Speak a reply: server audio first, the browser's voice if that is unavailable.
  const speak = useCallback(async (reply: string) => {
    stopSpeaking();
    go("speaking");
    let url = "";
    try {
      const r = await fetch("/api/tts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: reply }) });
      if (r.status === 204) { await speakWithBrowser(reply); return; }   // no engine configured
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? `TTS failed (${r.status})`);
      }
      url = URL.createObjectURL(await r.blob());
      try {
        await playClip(url);
      } catch {
        await speakWithBrowser(reply);   // blocked or undecodable - say it anyway
      }
    } catch (e) {
      setError((e as Error).message);
      await speakWithBrowser(reply);
    } finally {
      if (url) URL.revokeObjectURL(url);
      lastSpokeAtRef.current = Date.now();
      go("idle");
    }
  }, [go, stopSpeaking, playClip, speakWithBrowser]);

  const historyRef = useRef<Msg[]>([]);
  historyRef.current = history;
  const lastReplyRef = useRef("");
  lastReplyRef.current = lastReply;
  const lastSpokeAtRef = useRef(0);

  const send = useCallback(async (raw?: string) => {
    const content = (raw ?? text).trim();
    if (!content || stateRef.current === "thinking") return;
    setText("");
    setError("");
    stopSpeaking();
    const next: Msg[] = [...historyRef.current, { role: "user", content }];
    setHistory(next);
    go("thinking");
    try {
      const r = await fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messages: next }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? `Chat failed (${r.status})`);
      const reply: string = d.reply || "…";
      if (d.meetings) onScheduleRef.current?.(d.meetings as Meeting[]);
      setHistory([...next, { role: "assistant", content: reply }]);
      setLastReply(reply);
      await speak(reply);
    } catch (e) {
      const msg = (e as Error).message;
      console.warn("[chat] failed", e);
      setError(/load failed|failed to fetch|networkerror/i.test(msg) ? "Could not reach the Mey server. Is the dev server running on this port?" : msg);
      go("idle");
    }
  }, [text, go, speak, stopSpeaking]);
  const sendRef = useRef(send);
  sendRef.current = send;
  const speakRef = useRef(speak);
  speakRef.current = speak;

  const micErrorText = (code: string) =>
    code === "not-allowed" || code === "service-not-allowed"
      ? "Safari did not allow the microphone. Check Safari → Settings → Websites → Microphone, and that Siri & Dictation is on in System Settings."
      : code === "no-speech" ? "I did not hear anything, sir. Try again."
      : code === "network" ? "Speech recognition needs an internet connection."
      : `Mic error: ${code}`;

  /* ── push-to-talk ── */
  const toggleMic = useCallback(() => {
    if (stateRef.current === "listening" && recRef.current) { recRef.current.stop(); return; }
    const rec = getRecognizer();
    if (!rec) return;
    stopSpeaking();
    wakeRef.current?.abort(); // hands-free pauses while push-to-talk runs
    recRef.current = rec;
    rec.lang = NAVIGATOR_LANG();
    rec.interimResults = true;
    rec.continuous = false;
    let finalText = "";
    let failed = false;
    if (onMicrophoneStreamRef.current && navigator.mediaDevices?.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
        if (stateRef.current !== "listening") {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        releaseAnalysisStream();
        analysisStreamRef.current = stream;
        onMicrophoneStreamRef.current?.(stream);
      }).catch((error) => console.warn("[mic] analysis stream unavailable", error?.name));
    }
    rec.onresult = (e) => {
      finalText = Array.from(e.results).map((res) => res[0].transcript).join(" ");
      setText(finalText);
    };
    rec.onerror = (e) => {
      failed = e.error !== "no-speech" && e.error !== "aborted";
      console.warn("[mic] error", e.error);
      setError(micErrorText(e.error));
    };
    rec.onend = () => {
      console.log("[mic] end, heard:", JSON.stringify(finalText));
      recRef.current = null;
      releaseAnalysisStream();
      go("idle");
      const said = finalText.trim();
      if (said) { const stripped = stripWake(said); void sendRef.current(stripped === "" ? `Hello ${agentName}.` : stripped ?? said); return; }
      if (!failed) setError((prev) => prev || "I did not catch that, sir. Press the mic and speak again, or type below.");
    };
    setError("");
    go("listening");
    try {
      rec.start();
    } catch (e) {
      console.warn("[mic] start failed", e);
      recRef.current = null;
      releaseAnalysisStream();
      go("idle");
      setError(`Could not start the microphone: ${(e as Error).message}`);
    }
  }, [agentName, go, releaseAnalysisStream, stopSpeaking]);

  /* ── hands-free: keep a recognizer running whenever Mey is idle, act on "Hi Mey …" ── */
  handsFreeRef.current = handsFree;
  useEffect(() => {
    if (handsFreeTouched.current) { try { localStorage.setItem(HANDS_FREE_KEY, handsFree ? "1" : "0"); } catch { /* ignore */ } }
    if (!handsFree) {
      if (wakeTimer.current) clearTimeout(wakeTimer.current);
      wakeRef.current?.abort(); wakeRef.current = null;
      setWakeHeard("");
      return;
    }
    let disposed = false;
    // Hold an open microphone stream while hands-free is on. Safari treats the site's
    // mic permission as live while a stream is active, which lets recognition sessions
    // reopen after each pause without another tap (the user's first tap grants it).
    let keepAlive: MediaStream | null = null;
    navigator.mediaDevices?.getUserMedia({ audio: true })
      .then((stream) => {
        if (disposed) { stream.getTracks().forEach((t) => t.stop()); return; }
        keepAlive = stream;
        onMicrophoneStreamRef.current?.(stream);
      })
      .catch((e) => console.warn("[wake] mic keep-alive not granted", e?.name));
    const listen = () => {
      if (disposed || !handsFreeRef.current) return;
      if (stateRef.current !== "idle" || recRef.current) { wakeTimer.current = setTimeout(listen, 400); return; }
      if (Date.now() - lastSpokeAtRef.current < 700) { wakeTimer.current = setTimeout(listen, 700); return; }
      const rec = getRecognizer();
      if (!rec) return;
      wakeRef.current = rec;
      rec.lang = NAVIGATOR_LANG();
      rec.interimResults = true;
      rec.continuous = true;
      let heard = "";
      let fired = false;
      rec.onresult = (e) => {
        const results = Array.from(e.results);
        heard = results.map((r) => r[0].transcript).join(" ").trim();
        setWakeHeard(heard.slice(-80));
        const lastFinal = results.length && results[results.length - 1].isFinal;
        if (lastFinal && soundsLikeOwnReply(heard, lastReplyRef.current)) { console.log("[wake] ignoring own echo:", heard); heard = ""; setWakeHeard(""); return; }
        const stripped = stripWake(heard);
        if (stripped !== null && lastFinal && !fired) {
          fired = true;
          console.log("[wake] heard:", JSON.stringify(heard));
          rec.abort();
          setWakeHeard("");
          if (stripped === "") void speakRef.current("Yes, sir?");
          else void sendRef.current(stripped);
        }
      };
      rec.onerror = (e) => {
        if (e.error === "aborted" || e.error === "no-speech") return;
        console.warn("[wake] error", e.error);
        if (e.error === "not-allowed" || e.error === "service-not-allowed") {
          // Safari will not reopen the microphone on its own after a pause unless the
          // site is set to "Allow" - re-arm on the next tap instead of giving up.
          fired = true; // stop the onend auto-restart
          setHandsFree(false);
          setResumePending(true);
          return;
        }
        setError(micErrorText(e.error));
      };
      rec.onend = () => {
        if (wakeRef.current === rec) wakeRef.current = null;
        // Safari closes a session after a few seconds of silence - just open the next one.
        if (!disposed && handsFreeRef.current) wakeTimer.current = setTimeout(listen, fired ? 800 : 250);
      };
      try { rec.start(); } catch (e) { console.warn("[wake] start failed", e); wakeTimer.current = setTimeout(listen, 1500); }
    };
    listen();
    return () => {
      disposed = true;
      keepAlive?.getTracks().forEach((t) => t.stop());
      if (!analysisStreamRef.current) onMicrophoneStreamRef.current?.(null);
      if (wakeTimer.current) clearTimeout(wakeTimer.current);
      wakeRef.current?.abort(); wakeRef.current = null;
    };
  }, [handsFree, resumePending]);

  const busy = state === "thinking";
  const accent = state === "listening" ? "#ff6b6b" : state === "speaking" ? "#37d6ef" : state === "thinking" ? "#f5a623" : handsFree ? "rgba(55,214,239,0.45)" : "rgba(240,237,232,0.55)";
  const hint = resumePending ? "Tap anywhere to resume hands-free"
    : handsFree && state === "idle" ? (wakeHeard ? `Hearing: “${wakeHeard}”` : `Hands-free on - say “Hi ${agentName}…”`) : "";

  return (
    <div className={className} style={{ position: "absolute", left: "50%", bottom: 22, transform: "translateX(-50%)", zIndex: 50, width: "min(680px, 94vw)", display: "flex", flexDirection: "column", gap: 8, alignItems: "stretch" }}>
      {(lastReply || error) && (
        <div role="status" aria-live="polite" style={{
          fontSize: 12.5, lineHeight: 1.5, color: error ? "#ff8a8a" : "rgba(240,237,232,0.82)",
          background: "rgba(4,8,15,0.62)", border: `1px solid ${error ? "rgba(255,107,107,0.35)" : "rgba(55,214,239,0.18)"}`,
          borderRadius: 12, padding: "10px 14px", backdropFilter: "blur(10px)", maxHeight: 96, overflowY: "auto",
        }}>
          {error || lastReply}
        </div>
      )}
      <audio ref={bindAudioElement} preload="auto" playsInline hidden />
      <form onSubmit={(e) => { e.preventDefault(); void send(); }} style={{
        display: "flex", alignItems: "center", gap: 8, padding: "6px 6px 6px 14px",
        background: "rgba(4,8,15,0.7)", border: `1px solid ${accent}`, borderRadius: 999,
        backdropFilter: "blur(12px)", transition: "border-color 0.3s ease", boxShadow: `0 0 24px ${accent}22`,
      }}>
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={state === "listening" ? "Listening…" : busy ? "Thinking…" : hint || `Ask ${agentName} anything`}
          aria-label={`Message to ${agentName}`}
          disabled={busy}
          style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "#f0ede8", fontSize: 14, minWidth: 0 }}
        />
        {micAvailable && (
          <button type="button" onClick={() => { handsFreeTouched.current = true; setResumePending(false); setHandsFree((v) => !v); }}
            aria-label={handsFree ? "Turn hands-free off" : `Turn hands-free on (say Hi ${agentName})`} aria-pressed={handsFree} title={handsFree ? "Hands-free on" : `Hands-free: say “Hi ${agentName}”`}
            style={{ ...btn, width: "auto", padding: "0 10px", borderRadius: 999, fontSize: 10, letterSpacing: "0.12em", fontFamily: "var(--font-mono)",
              background: handsFree ? "rgba(55,214,239,0.16)" : "transparent", color: handsFree ? "#37d6ef" : "rgba(240,237,232,0.45)", border: `1px solid ${handsFree ? "rgba(55,214,239,0.4)" : "rgba(240,237,232,0.15)"}` }}>
            {handsFree ? "● HANDS-FREE" : "○ HANDS-FREE"}
          </button>
        )}
        {micAvailable && (
          <button type="button" onClick={toggleMic} disabled={busy}
            aria-label={state === "listening" ? "Stop listening" : `Speak to ${agentName}`} aria-pressed={state === "listening"}
            style={{ ...btn, background: state === "listening" ? "rgba(255,107,107,0.2)" : "transparent", color: state === "listening" ? "#ff6b6b" : "rgba(240,237,232,0.7)" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
            </svg>
          </button>
        )}
        {state === "speaking" ? (
          <button type="button" onClick={stopSpeaking} aria-label="Stop speaking" style={{ ...btn, color: "#37d6ef" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="2" /></svg>
          </button>
        ) : (
          <button type="submit" disabled={busy || !text.trim()} aria-label="Send"
            style={{ ...btn, background: text.trim() && !busy ? "rgba(55,214,239,0.18)" : "transparent", color: text.trim() && !busy ? "#37d6ef" : "rgba(240,237,232,0.35)" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </button>
        )}
      </form>
    </div>
  );
}

const btn: React.CSSProperties = {
  width: 36, height: 36, borderRadius: "50%", border: "none", cursor: "pointer",
  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "background 0.2s, color 0.2s",
};
