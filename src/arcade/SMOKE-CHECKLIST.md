# Arcade — Manual Smoke Checklist (M10 / Polish-QA)

A repeatable hand-test pass for the explorable 3D arcade world (`src/arcade/`).
Run this after any arcade change and before a deploy. It covers M1–M9, the
accessibility floor (reduced-motion + mobile/touch), the perf budget, and the
Traxy link.

> **Automated gate first.** None of the manual steps matter if the gate is red.
> ```
> ./scripts/build-guard.sh check          # npm run build + npm run lint → exit 0
> node --test \
>   src/arcade/__tests__/touchMath.test.mjs \
>   src/arcade/__tests__/loaderMath.test.mjs \
>   src/arcade/__tests__/deathMath.test.mjs \
>   src/arcade/__tests__/cycleMath.test.mjs \
>   src/arcade/__tests__/ghostMath.test.mjs \
>   src/arcade/__tests__/questMath.test.mjs \
>   src/arcade/games/__tests__/pulseEngine.test.mjs \
>   src/arcade/games/__tests__/gridlockEngine.test.mjs \
>   src/arcade/games/__tests__/cascadeEngine.test.mjs \
>   src/arcade/games/__tests__/neonRunnerEngine.test.mjs
> # expect: 157 pass / 0 fail (pass EXPLICIT files — never the __tests__ dir)
> ```
> The world ships with **zero** licensable assets in `public/arcade/**`; every
> step below must pass with no assets present (the default shipped state).

## How to run the app locally
```
npm run dev                 # Vite dev server (HMR) — open the printed URL
# or a production-fidelity check:
npm run build && npm run preview
```
On the portfolio page, click the arcade entry point (the navbar / hero hook) to
mount `<ArcadeExperience>`. `Esc` exits the world (and closes a cabinet game
first if one is open). The dev URL accepts `?threat=now` to spawn the minotaur
immediately (QA shortcut for M6/M7).

---

## M1 — Explorable world
- [ ] Click to start → pointer locks; **WASD** moves, **mouse** looks.
- [ ] **Space** jumps; gravity returns you to the floor; you cannot pass through
      the 4 perimeter walls or fall out of the room.
- [ ] **E** picks up a nearby throwable (mug/stapler/cube/ball); reticle turns
      green while holding; **left-click** throws it with an impulse.
- [ ] All 3 cabinets (PULSE / GRIDLOCK / CASCADE) are reachable; the **Traxy
      kiosk** is present.
- [ ] Frame rate feels smooth (~60fps) roaming the hub.

## M2 — Loading animation
- [ ] On first entry the ORIGINAL "rage/opium" loader covers the screen, then
      fades once the scene is ready.
- [ ] No real-artist likeness / no copyrighted music (silent unless a slot
      asset is dropped).

## M3 — PULSE (rhythm cabinet)
- [ ] Walking into PULSE (or pressing E close) goes **full-screen**.
- [ ] Arrows scroll; **PERFECT / GREAT / MISS** judgments fire against the beat;
      score + combo update.
- [ ] On clear, the **encore** plays the track reversed; further reversed tracks
      unlock until you die/leave.
- [ ] With no audio slot present, a generated metronome/tone still drives
      judgable notes. **Esc** exits cleanly back to the hub.

## M4 — GRIDLOCK (crossing cabinet)
- [ ] Full-screen on enter; lanes of traffic; collision → respawn.
- [ ] **No win state** — difficulty keeps escalating past any "finish".
- [ ] An ORIGINAL "mock" sting plays on failure (silent if the slot is empty).
- [ ] **Esc** exits cleanly.

## M5 — CASCADE (falling-block stack)
- [ ] Full-screen on enter; **rotate / drop / line-clear / game-over** all work.
- [ ] The cabinet bezel/frame (procedural neon, or the optional sticker texture)
      surrounds the playfield — **not** an iframe (tetr.io is never embedded; see
      the code comment on its X-Frame-Options/CSP + ToS).
- [ ] **Esc** exits cleanly.

## M6 — Death & respawn
- [ ] Stepping off the **mezzanine** (climb the stairs at x≈-10) deals **fall
      damage**; the VITALS bar drops.
- [ ] After 15 min on-site (or `?threat=now`) the **minotaur** spawns and hunts
      you; a catch kills you.
- [ ] Death shows the ORIGINAL grayscale "DOWNED" overlay (+ defeat sting if the
      slot is filled, else silent), then **respawn** restores full health at
      spawn and relocates the threat.

## M7 — NEON RUNNER (neon cycle + grid duel)
- [ ] **E** near the CYCLE BAY mounts the cycle; **E** again dismounts.
- [ ] Riding has momentum (spool-up + coast) and clearly **outruns** the
      minotaur.
- [ ] Riding through a **TALL GRASS** patch triggers a full-screen grid-duel vs
      the CPU within a second or two; the duel resolves (win/lose); **Esc**
      returns you to the ride.

## M8 — Ghost backend (default: DISABLED)
- [ ] With `VITE_GHOST_API_BASE` **unset** (default): world runs solo, no network
      calls, build green — record + replay are no-ops.
- [ ] With a deployed Cloud Run URL set: a visit records anonymously (poses
      only); recent visitors replay as translucent ghosts with a floating
      `VISITOR · Nd ago · HH:MM` label. **No PII** ever leaves the browser; 30-day
      TTL enforced (server policy + client `filterRecent`).

## M9 — Office-flavor + adventure layer
- [ ] On entry the **DIRECTORY** signpost (near spawn) names each attraction with
      a compass bearing + a floor cone pointing toward it.
- [ ] The **objective HUD** (top-center) shows `OBJECTIVES n/7` + the next
      suggested attraction; pips fill as you discover each landmark; a brief
      `DISCOVERED: X` line appears on a new find; `TOUR COMPLETE` at 7/7.
- [ ] Decor reads as an ORIGINAL parody office: reception desk, motivational
      posters (original slogans), break-room (water cooler + coffee station),
      filing cabinets, a staff bulletin board (original sticky-notes), plants.
- [ ] No decor traps you (walk through/around all of it — visual only, no
      colliders) and nothing clips a cabinet/kiosk/cycle/grass.
- [ ] **No real "The Office"/Office Space IP** — no Dunder Mifflin, no real
      names/likenesses/catchphrases, no studio logos.

---

## Accessibility floor
- [ ] **Reduced motion** (OS "Reduce Motion" on / emulate
      `prefers-reduced-motion: reduce`): the loader uses its calm static
      composition; ghosts freeze at their first pose; the defeat overlay does not
      strobe; M9 decor + objective HUD are static (no animation). The world is
      still fully playable.
- [ ] **Keyboard**: WASD/Space/E/left-click/Esc all operable; the EXIT button is
      reachable.
- [ ] **Mobile / touch** (coarse pointer): on-screen joystick + drag-to-look +
      labelled GRAB/THROW/JUMP buttons appear; movement, look, pickup/throw,
      jump, cabinet entry, and the cycle all work by touch.
- [ ] **HUD layering on touch**: the touch look-hint (top), the M9 objective
      tracker (offset below it), and the RIDING hint never overlap. The objective
      tracker hides while riding; everything hides while a cabinet game / defeat
      overlay owns the screen.

## Perf budget
- [ ] Hub holds ~60fps on a mid laptop; initial portfolio paint stays fast
      (cabinet games + the duel are lazy-loaded; the rapier WASM chunk is the
      known large inlined base64 — expected, not a regression).
- [ ] No per-frame allocation in any `useFrame` (decor is static; the quest
      watcher does distance² compares into existing refs; ghost replay writes a
      reused scratch). Watch the heap timeline for sawtooth GC while roaming.

## Traxy link
- [ ] The in-world **TRAXY KIOSK** (press E / click) opens `https://traxy.app` in
      a new tab (`noopener,noreferrer`). ✅ wired in `src/arcade/Hub.jsx`.
- [ ] *(Owner action — outside arcade scope)* If a portfolio **footer** link to
      `https://traxy.app` is desired in addition to the kiosk, add it to a
      portfolio content component (e.g. `Contact.jsx`); the loop leaves portfolio
      content files to the owner.

## Cross-browser
- [ ] Chrome / Edge (Chromium): pointer-lock, WebGL, audio gestures OK.
- [ ] Firefox: pointer-lock + WebGL OK.
- [ ] Safari (desktop + iOS): WebGL OK; iOS uses the touch fallback (no
      pointer-lock). Audio requires a user gesture (tap) first — expected.

---

### Known-good baseline (update when it changes)
- build-guard: **GREEN** (exit 0). Unit tests: **157 pass / 0 fail**.
- Ships with no `public/arcade/**` assets; all slots degrade gracefully.
- Original names only: PULSE / GRIDLOCK / CASCADE / minotaur / "DOWNED" /
  NEON RUNNER + neon cycle; M9 decor copy + ghost labels all original/anonymous.
