# Arcade — Milestone-1 3D World Engine

A self-contained, explorable first-person 3D arcade hub built on
react-three-fiber + @react-three/rapier. This is the foundation the later
milestones (M2–M7) extend with the individual games. It is GREEN with
`npm run build` once `@react-three/rapier` is installed (it already is in
`package.json`).

Everything lives under `src/arcade/` and touches no other file.

---

## Controls

| Input            | Action                                   |
| ---------------- | ---------------------------------------- |
| **W A S D**      | Move (relative to where you're looking)  |
| **Mouse**        | Look (pointer-lock)                       |
| **Click canvas** | Lock the pointer / start playing          |
| **Space**        | Jump (only when grounded)                 |
| **E**            | Pick up nearest prop in reach / drop it   |
| **Left click**   | Throw the held prop (while holding)       |
| **E near kiosk** | Open the Traxy kiosk → opens traxy.app    |
| **Esc**          | Exit the experience (and release lock)    |
| **EXIT button**  | Exit the experience (top-right of HUD)    |

Best experienced on desktop (keyboard + mouse). A note to that effect is shown
in the HUD.

### Mobile / touch fallback

On a coarse pointer (no mouse / no pointer-lock — phones & tablets) the
experience auto-switches to on-screen controls (`isCoarsePointer()`):

| Touch input         | Action                                       |
| ------------------- | -------------------------------------------- |
| **Left joystick**   | Analog move (magnitude scales walk speed)    |
| **Drag the screen** | Look (manual yaw/pitch, no pointer-lock)     |
| **JUMP** button     | Jump                                         |
| **GRAB** button     | Pick up nearest prop / drop (also opens the kiosk when nearby) |
| **THROW** button    | Throw the held prop along the view           |
| **EXIT** button     | Leave the experience                         |

How it's wired (so later milestones can reuse it):

- `touchInput.js` — a plain mutable singleton bridge (`move`, `look`,
  `throwing`) read by the Player each frame with zero re-renders, plus
  `isCoarsePointer()` and `resetTouchInput()`.
- `touchMath.js` — pure, unit-tested control math (`joystickVector`,
  `lookDelta`, `clampPitch`, `clamp`) shared by the UI and the Player.
- `TouchControls.jsx` — the DOM overlay (Pointer Events + `pointerId`
  multitouch). JUMP/GRAB dispatch synthetic `keydown` (Space / KeyE) so the
  **existing** desktop window handlers — including the kiosk's "press E
  nearby" — fire unchanged; THROW sets `touchInput.throwing`.
- `Player.jsx` takes a `touchMode` prop: it skips `PointerLockControls`, drives
  the camera from a YXZ euler, and adds the analog joystick on top of WASD.

### Tests

Framework-free smoke tests for the control math + keymap run on Node's built-in
runner (no extra dependency):

```
node --test src/arcade/__tests__/touchMath.test.mjs
```

---

## How to mount

`ArcadeExperience` is the default export of `src/arcade/index.jsx`. It renders a
full-screen `position: fixed` overlay (`z-index: 9999`) above the page, so it
sits on top of the portfolio. Mount it conditionally from a launcher:

```jsx
import { useState } from 'react';
import ArcadeExperience from './arcade';

function SomewhereInTheApp() {
  const [showArcade, setShowArcade] = useState(false);
  return (
    <>
      <button onClick={() => setShowArcade(true)}>Enter the Arcade</button>
      {showArcade && (
        <ArcadeExperience onExit={() => setShowArcade(false)} />
      )}
    </>
  );
}
```

- `onExit` is called when the user presses **Esc** or clicks the **EXIT**
  button. The host owns the toggle state.
- The overlay cleans up all of its own listeners and the pointer lock on
  unmount, so simply unmounting it (`showArcade = false`) fully tears it down.

> Requires `@react-three/rapier` (install with `--legacy-peer-deps` because of
> React 19 vs react-spring peer ranges). `@react-three/fiber` and
> `@react-three/drei` are already deps.

---

## Architecture

```
src/arcade/
  index.jsx        ArcadeExperience: overlay + HUD + <Canvas> + <Physics> +
                   <KeyboardControls> + <HeldObjectProvider>. Wires the scene.
  Player.jsx       First-person controller. Capsule RigidBody (locked rotation),
                   WASD relative to camera yaw, grounded raycast + jump,
                   PointerLockControls, camera-follow, E/throw input.
  Hub.jsx          The room: floor + 4 wall colliders, synthwave lights,
                   3 cabinets, the Traxy kiosk, spawn pad, scattered throwables,
                   and the optional baked-hub SafeModel slot.
  Cabinet.jsx      Reusable placeholder cabinet (body + glowing screen + marquee
                   label + onActivate). ORIGINAL game names only.
  Throwable.jsx    A dynamic prop (mug / stapler / cube / ball primitives).
                   Registers an imperative handle for pickup/drop/throw.
  useHeldObject.js HeldObjectProvider + useHeldObject(): coordinates the single
                   held prop with plain refs (no external state lib). Exposes
                   register / findNearest / pickUp / drop / throwHeld / subscribe.
  SafeModel.jsx    GLTF loader guarded by a HEAD check + Suspense + error
                   boundary. Falls back to primitives when the asset is absent.
  controls.js      CONTROLS_MAP (KeyboardControls) + PLAYER_CONFIG tunables.
  assets.js        ASSET_SLOTS paths (via import.meta.env.BASE_URL) + a silent
                   audio helper + assetExists() HEAD check.
```

### Held-object system

`useHeldObject.js` keeps the "currently held prop" in a **ref**, not React
state, so the per-frame Player loop reads/writes it with zero re-renders. Each
`Throwable` registers an imperative handle (`getPosition`, `onPickUp`,
`setHeldTransform`, `onDrop`, `onThrow`). The Player:

1. On **E**: drops if holding, else finds the nearest registered throwable
   within `reachDistance` of the camera and picks it up.
2. While held: the prop becomes a `KinematicPositionBased` body and the Player
   drives its position/rotation to float ~1.4 m in front of the camera.
3. On **left click** while holding: the prop returns to `Dynamic` and receives
   an impulse along the camera-forward vector (plus a small upward arc + spin).

Only one prop is held at a time (enforced in the provider).

The HUD reticle turns green while holding via a tiny `HeldStateBridge` that
`subscribe`s to held-state changes and lifts the boolean into React.

---

## Asset slots & fallback (build is green with NO assets)

All licensable art/audio is referenced by path under `public/arcade/...` via
`import.meta.env.BASE_URL`, so paths resolve under the `/portfolio3js/` base.
**None of these files need to exist** — loaders fall back gracefully:

| Slot                          | Public path                       | Fallback              |
| ----------------------------- | --------------------------------- | --------------------- |
| `ASSET_SLOTS.models.hub`      | `arcade/models/hub.glb`           | primitive room only   |
| `ASSET_SLOTS.models.cabinet`  | `arcade/models/cabinet.glb`       | primitive cabinet     |
| `ASSET_SLOTS.models.kiosk`    | `arcade/models/kiosk.glb`         | primitive kiosk       |
| `ASSET_SLOTS.audio.ambience`  | `arcade/audio/ambience.ogg`       | silence (no autoplay) |
| `ASSET_SLOTS.audio.pickup`    | `arcade/audio/pickup.ogg`         | silence               |
| `ASSET_SLOTS.audio.throw`     | `arcade/audio/throw.ogg`          | silence               |

- `SafeModel` HEAD-checks the URL before attempting `useGLTF`, and is wrapped in
  a Suspense + error boundary, so a 404 never crashes or hangs the app.
- `createSilentAudio` returns a player whose `play()` is a no-op when the file
  is missing — **never autoplay copyrighted music**; commit only original / CC0
  audio (or nothing).

> LEGAL: do not commit copyrighted models, textures, songs, logos, or
> screenshots into the repo. Game names are ORIGINAL (PULSE / GRIDLOCK /
> CASCADE), the props are abstract primitives, and the kiosk just opens
> `https://traxy.app`.

---

## Where the games plug in (M2–M7)

Each cabinet calls `onActivate(name)` when the player presses E near it or
clicks its screen (currently a `console.log` in `index.jsx`'s
`handleActivateCabinet`). To add a game in a later milestone:

1. Build the game as its own module under `src/arcade/games/<Game>.jsx`.
2. In `index.jsx`, replace `handleActivateCabinet` with a launcher that sets
   some `activeGame` state and renders the game (e.g. as an in-world screen, a
   focused mini-canvas, or a DOM overlay) — releasing pointer lock first.
3. Read input via `useKeyboardControls()` (the `CONTROLS_MAP` already includes
   `interact`/`jump`, extend the map in `controls.js` as needed).
4. Keep all new files under `src/arcade/` and follow the same asset-slot +
   fallback pattern for any game-specific art/audio.

The three placeholder cabinets map to the planned game genres:

- **PULSE** — rhythm
- **GRIDLOCK** — lane-crossing
- **CASCADE** — falling-block stacker

(All names are original — not Frogger / Tetris / DDR / Tron.)

---

## Tunables

Movement feel lives in `PLAYER_CONFIG` (`controls.js`): `moveSpeed`,
`jumpSpeed`, `airControl`, `eyeHeight`, capsule dimensions, `spawn`, and the
`groundedThreshold` for the down-raycast. Gravity is set on `<Physics>` in
`index.jsx` (`[0, -18, 0]`).
