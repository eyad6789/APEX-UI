# APEX-UI

An animated **autonomous-agent orb + reasoning-graph** interface — the front-end of
[Apex](https://reznikov-engineering.com/apex), released open source.

Tap the orb to cycle its state (idle → thinking → speaking); the reasoning web reacts,
agent nodes orbit the core, and clicking any node opens an overview card. The orb ring,
agent graph and status bar are **hand-written SVG / CSS**; the cyan particle core is a
small `react-three-fiber` scene (skipped under `prefers-reduced-motion`); and the WebGL
shader backdrop + the overview lamp panel are **MIT community components from
[21st.dev](https://21st.dev/community/components)** (see [CREDITS](./CREDITS.md)).

> Built with Next.js 15 + React 19. Runtime deps: `lucide-react` (icons) and
> `three` / `@react-three/fiber` / `@react-three/postprocessing` (the particle core) —
> all MIT-licensed.

## Demo

```bash
npm install
npm run dev
# open http://localhost:3000
```

Then `npm run build` for a production build, or deploy to Vercel in one click.

## Talk to it (the live agent)

This fork adds a working agent behind the orb: type, press the mic, or switch on
**HANDS-FREE** and just say *"Hi Apex, …"* — the message goes to a Gemini model and the
reply is spoken in an ElevenLabs voice. The orb follows along (listening → thinking → speaking).
Hands-free keeps Safari's speech recognition open while Apex is idle and fires on the name
(matched loosely — "AFX", "Eric", "a pex" all count, because that is what the recogniser
hears); saying only the name gets a "Yes, sir?".

```bash
cp .env.local.example .env.local      # then paste your keys in
node scripts/find-jarvis-voice.mjs     # finds "Jarvis" in the ElevenLabs Voice Library,
                                       # adds it to your account, prints ELEVENLABS_VOICE_ID
npm run dev
```

| Var | What |
|-----|------|
| `GEMINI_API_KEY` | the brain — [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |
| `APEX_MODEL` | optional, default `gemini-3.7-flash` |
| `ELEVENLABS_API_KEY` | the voice — [elevenlabs.io](https://elevenlabs.io/app/settings/api-keys) |
| `ELEVENLABS_VOICE_ID` | the Jarvis voice from your library; falls back to the stock "Daniel" voice |
| `ELEVENLABS_MODEL` | optional, default `eleven_multilingual_v2` (Arabic works) |

No ElevenLabs key → the browser's own speech synthesis reads the reply instead.
Pieces: `components/AgentConsole.tsx` (the bar), `app/api/chat` (Gemini), `app/api/tts` (ElevenLabs).

## The voices and the schedule

**Everything falls back.** Each layer tries the good option first and degrades
rather than failing:

| Layer | First choice | Falls back to |
|-------|--------------|---------------|
| Brain (`lib/brain`) | Gemini | `qwen2.5:7b-instruct` on local Ollama |
| Voice (`lib/tts`) | ElevenLabs | Piper (local) → Kokoro → macOS `say` → the browser voice |

Both cascade at *runtime*, not just on missing keys: a 401, an exhausted quota or
a dropped connection moves to the next option mid-request.

```bash
npm run tts:setup           # Piper + the en_GB "Alan" voice (~60MB, MIT, offline)
npm run tts:setup:kokoro    # optional richer voice (pulls PyTorch, ~2GB)
ollama pull qwen2.5:7b-instruct   # the offline brain
```

Pin one for testing with `APEX_TTS=piper` or `APEX_BRAIN=local` in `.env.local`.

### Hands-free

Hands-free is **on by default** and arms on the first click or keypress anywhere
on the page — Safari will not open a microphone or play audio until the page has
been touched once. After that, just say *"Apex, …"*. Switch it off with the
HANDS-FREE button and the choice is remembered.

> Audio note: Safari refuses `play()` on an element whose first play did not
> happen inside a gesture, and it does so *silently* — the promise never settles.
> That is why the console keeps one `<audio>` element, primes it with 50ms of
> silence on your first interaction, and reuses it for every reply.

### Schedule

Apex keeps a calendar in `data/schedule.json` and can change it by voice:

> *"Add a meeting at 3:33 pm with Ammar."*
> *"Book a call with Dr. Zay tomorrow at 10 am."*
> *"What's on my schedule?"*

The model emits a small `<apex:schedule>{…}</apex:schedule>` command that the
server executes (`lib/schedule/`), so what Apex says is the real outcome — he
cannot claim to have booked something that did not save. `GET/POST/DELETE
/api/schedule` is the same calendar over HTTP, and the panel on the left shows it.

## What's inside

| Piece | What it does |
|-------|--------------|
| `ApexOrb` | The golden ring frame, waveform and orbit dots (pure SVG) |
| `ApexCore3D` | The cyan particle core (`react-three-fiber` + bloom) |
| `ApexHeroOrb` | Stacks the SVG ring + the particle core, scaled to fit |
| `ReasoningWeb` | The agent constellation — circuit traces, orbit rings, 18-node roster |
| `OrbStatusBar` | The equalizer + STANDBY cluster along the bottom |
| `ShaderBackground` | Animated WebGL "plasma waves" backdrop (MIT component from 21st.dev — see CREDITS) |
| `ApexWorld` | Composes the above; owns the tap-state cycle and the agent overview cards |
| `ApexOverviewPanel` | Top-left HUD: live clock, weather, and social links |
| `app/api/weather` | Keyless [open-meteo](https://open-meteo.com) proxy for the panel's weather |

## Customise

- **Social links** → edit `TILES` in `components/ApexOverviewPanel.tsx`.
- **Weather** → auto-detects the **visitor's** city on Vercel (geo headers); edit `FALLBACK` in `app/api/weather/route.ts` to change the off-Vercel / localhost default.
- **Agents & copy** → the `ROSTER` and `INFO` maps in `components/ApexWorld.tsx`.
- **Backdrop** → the shader in `components/ShaderBackground.jsx`; its opacity/tint are set where `<ShaderBackground>` is used in `ApexWorld.tsx`.

## Accessibility

The decorative SVG graph is mirrored by a real, keyboard-navigable agent list
(`.visually-hidden`), the orb and every control are focusable, and the whole thing
respects `prefers-reduced-motion`.

## Not included (on purpose)

This repo is the **UI only**. The production Apex page also has a spoken-voice layer and a
"story" narrative — those are personal recordings and private copy, so they are intentionally
left out. The orb stays fully interactive without them.

## License

Code is released under the **[MIT License](./LICENSE)** — use it, fork it, ship it.

The **name "Apex" and the Reznikov Engineering branding are not part of this license.**
If you build on this, please use your own product name and branding.

---

Made by [Eyad Qasim](https://github.com/eyad6789) — the voice agent, brain, tools and
the May avatar — on top of the original APEX-UI orb interface by
[Ruben Mouradian — Reznikov Engineering](https://reznikov-engineering.com).
If you use it, a link back is appreciated (not required).
