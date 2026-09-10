#!/usr/bin/env node
/**
 * Finds a "Jarvis" voice in the ElevenLabs Voice Library, adds it to your
 * account, and prints the voice id to put in .env.local as ELEVENLABS_VOICE_ID.
 *
 *   ELEVENLABS_API_KEY=... node scripts/find-jarvis-voice.mjs [search term]
 *
 * Note: ElevenLabs does not expose the Voice Library through the API on the
 * free tier. If this fails with 401/403, add the voice by hand: elevenlabs.io →
 * Voices → Library → search "Jarvis" → Add → copy its ID from "My voices".
 */
import { readFileSync } from "node:fs";

// Load .env.local if the key was not passed in the environment.
if (!process.env.ELEVENLABS_API_KEY) {
  try {
    for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch { /* no .env.local yet */ }
}
const key = process.env.ELEVENLABS_API_KEY;
if (!key) { console.error("Set ELEVENLABS_API_KEY (env or .env.local) first."); process.exit(1); }

const search = process.argv[2] ?? "jarvis";
const H = { "xi-api-key": key, "content-type": "application/json" };

// 1. Already in my voices?
const mine = await (await fetch("https://api.elevenlabs.io/v1/voices", { headers: H })).json();
const have = (mine.voices ?? []).find((v) => v.name.toLowerCase().includes(search.toLowerCase()));
if (have) { console.log(`Already in your library: ${have.name}\nELEVENLABS_VOICE_ID=${have.voice_id}`); process.exit(0); }

// 2. Search the shared Voice Library.
const q = new URLSearchParams({ search, page_size: "10", language: "en" });
const r = await fetch(`https://api.elevenlabs.io/v1/shared-voices?${q}`, { headers: H });
if (!r.ok) { console.error(`Voice Library search failed (${r.status}): ${(await r.text()).slice(0, 200)}`); process.exit(1); }
const { voices = [] } = await r.json();
if (voices.length === 0) { console.error(`No shared voice matches "${search}".`); process.exit(1); }

voices.forEach((v, i) => console.log(`${i + 1}. ${v.name}  —  ${v.description ?? ""}  (used by ${v.cloned_by_count ?? "?"})`));
const pick = voices[0];

// 3. Add the first match to my voices.
const add = await fetch(`https://api.elevenlabs.io/v1/voices/add/${pick.public_owner_id}/${pick.voice_id}`, {
  method: "POST", headers: H, body: JSON.stringify({ new_name: pick.name }),
});
if (!add.ok) { console.error(`Could not add "${pick.name}" (${add.status}): ${(await add.text()).slice(0, 200)}`); process.exit(1); }
const added = await add.json();
console.log(`\nAdded "${pick.name}" to your library.\nELEVENLABS_VOICE_ID=${added.voice_id ?? pick.voice_id}`);
