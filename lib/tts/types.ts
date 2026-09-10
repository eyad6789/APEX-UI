/** What every engine hands back: bytes plus the MIME type that describes them. */
export type Speech = { audio: Uint8Array<ArrayBuffer>; contentType: string };

export type Engine = {
  /** Name used by the APEX_TTS env var. */
  readonly id: string;
  /** Human-readable, for the "engine not ready" message. */
  readonly label: string;
  /** False when the engine's binary, model or API key is missing. */
  isConfigured(): boolean;
  /** What to tell the developer when isConfigured() is false. */
  setupHint(): string;
  speak(text: string): Promise<Speech>;
};

export class EngineUnavailable extends Error {}
