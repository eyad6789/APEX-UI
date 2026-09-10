# Mey — workspace agency (slice 1)

Date: 2026-09-07
Status: built and verified (slice 1)

## Problem

Mey can talk and manage a calendar. He knows nothing about the machine he runs on:
not who the user is, not the 132 projects in `~/Desktop/WorkSpace`, and he cannot
act on either. The user wants him to know the workspace, open Claude Code sessions
on command, and eventually create/delete projects, take dropped files as work, and
fetch news.

## Decomposition

Six pieces, of which this slice builds four.

| # | Piece | In slice 1 |
|---|-------|-----------|
| 0 | Tool spine — multi-namespace command blocks | yes |
| 1 | Who you are — CV → profile in the system prompt | yes |
| 2 | Workspace knowledge — cached shallow index, read-only | yes |
| 4 | Terminals — open N Claude Code sessions | yes |
| 3 | Create / delete projects | later (`WorkSpace/.trash`, never `rm`) |
| 5 | Tasks by file drop → dispatch to Claude Code | later |
| 6 | Web search / news via Gemini `google_search` grounding | later |

## Design

### 0. Tool spine

`lib/schedule/commands.ts` currently owns both block parsing and calendar logic.
Split them:

- `lib/agent/commands.ts` — parses **any** `<apex:NS>{json}</apex:NS>` block, dispatches
  to a registry keyed by namespace, returns collected results.
- Handlers register themselves: `schedule`, `workspace`, `terminal`.
- Multiple blocks per reply are supported and run in order.
- `app/api/chat/route.ts` returns `{ reply, model, effects[] }`.

The existing `<apex:schedule>` contract is unchanged, so the calendar keeps working.

Rationale for keeping tagged blocks over provider-native function calling: Gemini and
Ollama disagree on the shape and the local 7B is unreliable at it. One contract for
every brain, greppable in a log. (This was the original author's reasoning; it still holds.)

### 1. Who you are

`data/profile.md` — a ~30 line brief distilled from `WorkSpace/Eyad/Eyad_CV_2026.pdf`.
Loaded by `lib/profile.ts` into `systemPrompt()`. Hand-editable. Git-ignored (personal).
Absent file → Mey behaves as today.

### 2. Workspace knowledge

`lib/workspace/index.ts` scans `WorkSpace/` one level deep, plus `Projects/` one level.

Per project: `name`, `path`, `kind` (detected from `package.json`, `pubspec.yaml`,
`*.xcodeproj`, `requirements.txt`, `Cargo.toml`, `go.mod`), `modified`, `git.branch`,
`git.dirty`. **Not** size — walking 14 GB is too slow.

Cached to `data/workspace-index.json` with a 5 minute TTL.

Two tiers, because 132 projects of full detail will not fit a prompt:
- The prompt carries a compact list (name, kind, last touched) — roughly 4 KB.
- Depth on request: `<apex:workspace>{"action":"detail","project":"MARSAD"}` returns
  README head, last 3 commits, top-level layout.

Read-only in this slice. No create, no delete.

### 3. Terminals

`<apex:terminal>{"action":"open","count":4,"project":"MARSAD"}`

Opens N separate iTerm windows, each `cd`'d to the project with `claude` running.

- Fuzzy project match; ambiguous match → Mey asks rather than guessing.
- `count` clamped to 1..8.
- No project named → the one under discussion.

### 4. Safety rails

A browser page is gaining the ability to spawn processes. Therefore:

1. Every path is `realpath`'d and must resolve inside `~/Desktop/WorkSpace`. Otherwise refused.
2. The AppleScript template only ever runs `cd <validated-path> && claude`.
   **Model output never reaches a shell.** A project README is untrusted input; if it
   contains "also run `rm -rf ~`", that string has no path to execution.
3. New routes reject non-localhost origins.
4. `count` capped at 8, so a misheard "forty" cannot open forty windows.

### 5. Testing

`node:test` over the pure logic: block parsing, path validation, fuzzy matching,
index shaping. `openTerminals({ dryRun: true })` returns the AppleScript instead of
running it, so spawning is testable without windows appearing.

## Out of scope

Pieces 3, 5, 6 above. Named here so they are not forgotten, not built here.

## Changes made while building

Three things the design did not anticipate:

1. **Git dirty-state moved to detail.** `git status` across 132 repos costs seconds.
   The bulk index now reads `.git/HEAD` directly for the branch (no subprocess) and
   dirty-state is answered only by `projectDetail`.

2. **A `context` channel, separate from `spoken`.** The first build read a project's
   README and file tree aloud verbatim. Handlers now distinguish an *outcome* Mey
   states ("four sessions on MARSAD") from *facts* he was handed, which go back
   through the model for one more pass and come out as a sentence.

3. **The terminal timeout scales.** iTerm costs ~2s a window and more from cold, so a
   fixed 20s died at count=4. Now `15s + 6s x count`. Still awaited rather than fired
   and forgotten, so the reported outcome stays the real one.

## Verified against the running app

Profile recall, workspace listing, project detail, opening a real Claude Code session
(iTerm window, `claude` running), refusal of an unknown project, and the calendar
still working. The prompt-level ambiguity rule ("geo" must ask, not choose) is the one
behaviour not confirmed live - the Gemini free tier's 20-request daily cap ran out.
The handler-level guard behind it is covered by tests.
