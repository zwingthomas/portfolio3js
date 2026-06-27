# MISSION — Revamp portfolio3js into an explorable 3D arcade world

You are the autonomous builder for **portfolio3js** — Thomas Zwinger's personal
portfolio (React 19 + Vite + react-three-fiber, deployed to GitHub Pages). Your
mission is to transform it, milestone by milestone, into a first-person,
explorable **3D arcade world**: a hub room of playable arcade cabinets, a
threat that hunts you, a rideable neon cycle, ghost replays of past visitors,
and original parody decor — while keeping the build permanently shippable.

You run inside a "ralph loop": fresh context every iteration. Make real,
coherent progress each turn, keep the tree green, and hand off cleanly via
`.ralph/PROGRESS.md`.

---

## PART 0 — IP / LEGAL RULES (NON-NEGOTIABLE, EVERY ITERATION)

These override everything. A violation is worse than missing a feature.

1. **Never commit copyrighted material.** No real song files (e.g. Juice WRLD,
   Avril 14th, Tame Impala), no GTA "Wasted" art, no tetr.io iframe, no real
   Seinfeld / The Office / Tron / Ken Carson / Playboi Carti characters, logos,
   screenshots, models, textures, or audio. Ever.
2. **Build ORIGINAL, transformative / parody mechanics only.** Game *mechanics*
   may be inspired by genres; the *names, art, audio, and characters must be
   original*. User-facing game names must NOT be "Frogger" / "Tetris" / "DDR" /
   "Tron" — invent original names.
3. **Anything licensable loads at runtime from documented asset SLOTS** under
   `public/arcade/...`, with a **graceful fallback** (a primitive mesh, a
   generated tone, or silence) when the file is absent. The repo ships **NONE**
   of these assets. The build MUST be green with no assets present. Every slot
   is documented in `ASSETS.md`, grouped by milestone. When you add a new
   licensable dependency, add its slot to `ASSETS.md` in the same iteration.
4. For the stack/falling-block game specifically: do NOT embed tetr.io.
   Document in code/comments that tetr.io sets `X-Frame-Options`/CSP that block
   embedding and that embedding it violates their ToS — so we render an
   original falling-block game in-world instead.

## PART 1 — OPERATING CONTRACT

- **Fresh context each iteration.** FIRST read `.ralph/STEER.md` (owner nudges —
  priority overlay only; they never weaken a hard gate). THEN read
  `.ralph/PROGRESS.md` to learn what is done and what is next.
- **Precedence when sources disagree** (highest wins): hard gates (build-guard
  exit codes) > this PROMPT.md > `.ralph/STEER.md` nudges > `.ralph/PROGRESS.md`
  notes.
- **Keep `npm run build` AND `npm run lint` GREEN.** Your hard gate is
  `scripts/build-guard.sh check` — run it before you consider any milestone
  step done. If it is red, fixing it is the highest-priority work.
- **Commit coherent local progress** (small, themed commits) but **NEVER push**
  and **never run `git push`**, `npm run deploy`, or `gh-pages`.
- **File ownership.** Do NOT edit `package.json`, `package-lock.json`,
  `vite.config.js`, `src/App.jsx`, `src/main.jsx`,
  `src/components/Navbar.jsx`, or the root `.gitignore` unless a milestone step
  explicitly requires it and there is no alternative — those are owned by the
  main loop. Prefer creating new files under `src/arcade/`, `src/games/`,
  `public/arcade/`, and `backend/`.
- **Dependencies.** Only use packages already in `package.json`, plus
  `@react-three/rapier` (physics — already present). Do not add new npm deps;
  if a milestone truly needs one, record it under `## NEXT ITERATION FOCUS` /
  `## GOTCHAS` for the owner instead of editing `package.json`.
- **Rewrite `.ralph/PROGRESS.md` every turn** using its fixed template:
  `## GUARDS & GATES`, `## IMMUTABLE ENV FACTS`, `## THIS ITERATION`,
  `## NEXT ITERATION FOCUS`, `## GOTCHAS`. The TOP item of NEXT ITERATION FOCUS
  is the single highest-value next action, phrased as one acceptance criterion.
- **Completion / blocked sentinels** are owned by the watchdog contract in the
  system prompt — only `touch .ralph/DONE` when the ENTIRE milestone plan is
  done and verified; only `touch .ralph/BLOCKED` (+ write `.ralph/BLOCKED.md`)
  when every remaining task is blocked on something only the human can provide.
- **Accessibility floor:** honor `prefers-reduced-motion` (provide a static /
  low-motion path), keyboard-operable where reasonable, and a mobile/touch
  fallback for movement and game input.
- **Performance budget:** target 60fps on the hub; lazy-load heavy game modules
  so the initial portfolio load stays fast.

## PART 2 — MILESTONE PLAN (execute in order; each has acceptance criteria)

Work the lowest-numbered INCOMPLETE milestone first. Within a milestone, prefer
the smallest change that advances an acceptance criterion, then re-verify the
guard. Hardening (collisions, perf, mobile, tests, polish) of an already-seeded
milestone counts as progress.

### M0 — FOUNDATIONS (owner-seeded; you VERIFY it stays green)
Owner has seeded this session: Zubie job content live; the ralph harness
(`ralph-watchdog.sh`, `scripts/`, `.ralph/`, `PROMPT.md`); the M1 world-engine
module under `src/arcade/`; and a backend scaffold under `backend/`.
- **Acceptance:** `npm run build` + `npm run lint` green; the Zubie role
  (backend SWE at Zubie, Thomas Zwinger) is present in the experience content;
  the arcade world-engine module exists under `src/arcade/`.

### M1 — EXPLORABLE WORLD
First-person **WASD + mouse-look** (pointer lock), **gravity + jump**, a physics
**ground + walls**, **pick up** objects with `E` and **throw** them with an
impulse on click. An **"arcade hub" room** containing **3 placeholder cabinets**
plus a **Traxy kiosk** that opens `https://traxy.app`. Owner seeds the basics;
you harden: collisions, 60fps perf, **mobile/touch fallback** (on-screen
joystick + look + action buttons), polish, and tests.
- **Acceptance:** you can walk, look, jump, pick up and throw an object, and
  enter the hub; the Traxy kiosk opens `https://traxy.app`; build + lint green.

### M2 — LOADING ANIMATION
An **ORIGINAL** stylized "rage / opium"-aesthetic full-screen loader (NOT a Ken
Carson / Carti likeness or their music). Asset slots for its art and music with
graceful fallback (animated CSS/canvas if no art; silence if no music).
- **Acceptance:** the loader shows during initial load, uses ORIGINAL assets
  only, and its slots are documented in `ASSETS.md`.

### M3 — RHYTHM CABINET (arrow keys)  [original name, e.g. "PULSE GRID"]
Scrolling arrow lanes with **PERFECT / GREAT / MISS** judgment text + scoring +
combo, **ONE** playable song from an asset slot, **full-screen** when entered.
On clear, an **"encore"** plays the same track **reversed**; then
progressively-unlocked reversed tracks (all asset slots) until the player dies
or leaves. Use **original placeholder audio only** (a generated tone/metronome
when the slot is empty).
- **Acceptance:** judgments fire correctly against the beat, the cabinet goes
  full-screen on enter, `ESC` exits cleanly, encore/reverse logic works.

### M4 — CROSSING CABINET  [original name, e.g. "GRIDLOCK HAUL"]
An **ORIGINAL parody character** shoving an arcade cabinet across lanes of
traffic in a stylized city. **UNWINNABLE by design** (difficulty scales beyond
any completion point). An original **"mocking laugh" SFX** (asset slot, with
silent fallback) plays on each failure. **Full-screen** when entered.
- **Acceptance:** lanes / collision / respawn work, there is NO win state,
  difficulty escalates, and it exits cleanly.

### M5 — STACK CABINET (falling blocks)  [original name, e.g. "STACKFALL"]
An **ORIGINAL** falling-block puzzle rendered **IN-WORLD on the cabinet screen**
(NOT an iframe to tetr.io — document in code that tetr.io sets
`X-Frame-Options`/CSP that block embedding and that embedding violates their
ToS). The cabinet art (with **original** stickers) frames the playfield.
- **Acceptance:** rotate / drop / line-clear / game-over all work; the cabinet
  frame is visible around the playfield.

### M6 — DEATH & RESPAWN
**Fall damage** on big drops. A roaming **"minotaur" threat** that spawns after
**15 minutes on-site** and pursues the player. On death, an **ORIGINAL**
grayscale defeat screen ("WASTED"-style but original art + an original defeat
sting from an asset slot, silent fallback), then **respawn**.
- **Acceptance:** fall damage + roaming threat + defeat overlay + respawn all
  work; the 15-minute timer persists across the session.

### M7 — NEON LIGHT-CYCLE  [original name, e.g. "NEON RUNNER"]
A rideable **original neon cycle** to explore. Entering **"tall grass" zones**
triggers a **grid-duel** encounter vs a CPU. While riding you can **outrun the
minotaur**.
- **Acceptance:** mount / dismount, ride physics, encounter trigger, the duel
  resolves, and you can outrun the threat while riding.

### M8 — GHOST BACKEND
Integrate the **Cloud Run + Firestore ghost service** (scaffolded this session
under `backend/`). Record **anonymous** sessions; replay **"ghosts"** of
visitors from the **last 30 days** with a **date/time label** floating above
each ghost; fully anonymous; **30-day TTL**.
- **Acceptance:** a visit is recorded, recent ghosts replay with labels, NO PII
  is stored, and the TTL/retention is enforced (or documented if server-side).

### M9 — OFFICE-FLAVOR + ADVENTURE LAYER
**ORIGINAL parody "workplace-sitcom" decor / easter-eggs** (NO real The Office
IP). Group the 3 games + threat + cycle into a discoverable, explorable
adventure.
- **Acceptance:** a cohesive themed world where the games + threat + cycle are
  discoverable through exploration.

### M10 — POLISH / QA
Cross-browser, mobile, **accessibility (reduced-motion floor)**, a perf budget,
and **automated tests**. The `https://traxy.app` link is present and working.
- **Acceptance:** build + lint green, tests pass, and a manual smoke checklist
  is documented (in `PROGRESS.md` or a docs file you own).

## PART 3 — STANDING OBLIGATIONS (CHECK EVERY ITERATION)

1. `npm run build` AND `npm run lint` are GREEN (`scripts/build-guard.sh check`).
2. No copyrighted assets committed — only documented slots in `ASSETS.md`.
3. The tree is left buildable (no half-applied edits that fail the guard).
4. `.ralph/PROGRESS.md` rewritten with all five sections; NEXT ITERATION FOCUS
   top item is the single highest-value next acceptance criterion.
5. Original / parody names + art only; Traxy kiosk + footer link to
   `https://traxy.app` intact.
