# ASSETS.md — Arcade asset-slot manifest

This portfolio's 3D arcade world is built to be **100% buildable with ZERO
licensable assets present**. Anything copyrightable or licensable (music, voice
SFX, character models, cover art) is loaded **at runtime** from a documented
**asset slot** under `public/arcade/...`, and every slot has a **graceful
fallback** (a primitive mesh, a generated tone, animated CSS/canvas, or silence)
so `npm run build` is always green and the deployed site never 404s on a missing
asset.

## Rules (read before adding anything)

- **The repo ships NONE of these files.** They are git-untracked drop-in slots,
  enforced by `public/arcade/.gitignore` (ignores everything under
  `public/arcade/**` except itself) so a stray `git add .` can never stage a
  dropped licensable file. The owner (Thomas) places legally-licensed files into
  these paths locally / on the deploy; the loop must NEVER commit them.
- **Original / parody only for anything the loop creates itself.** No real
  songs, no real characters (Ken Carson, Carti, Seinfeld, The Office, Tron,
  etc.), no GTA "Wasted" art, no studio logos, no third-party screenshots.
- **Base-path aware:** the site deploys under `/portfolio3js/` on GitHub Pages.
  Reference every asset via `import.meta.env.BASE_URL` (e.g.
  `` `${import.meta.env.BASE_URL}arcade/audio/rhythm-song-1.mp3` ``), NEVER a
  leading-slash absolute path.
- **Fallback first:** code the silent/primitive fallback BEFORE wiring the
  optional asset, and feature-detect the file at runtime (failed `fetch`/`load`
  → fallback). A missing slot is a normal, supported state.
- **Recommended budgets:** audio ≤ ~3 MB/track (128–192 kbps), textures ≤ 2048²
  PNG/WebP/KTX2, models ≤ ~5 MB glb (Draco/meshopt OK).

When the loop introduces a new licensable dependency in any milestone, it MUST
add the slot to this file in the same iteration.

---

## M2 — Loading animation (original "rage/opium" aesthetic)
Original loader; assets optional. Without them the loader runs a procedural
CSS/canvas animation and is silent.

| Slot path | What it is | Accepted formats | Fallback if absent |
|---|---|---|---|
| `public/arcade/loader/bg.png` | Full-screen loader background art (ORIGINAL only) | png / webp / jpg | Procedural animated gradient/canvas |
| `public/arcade/loader/sprite.png` | Optional foreground sprite/overlay (ORIGINAL) | png / webp (transparent) | None drawn |
| `public/arcade/loader/theme.mp3` | Loader music loop (ORIGINAL only — not Carti/Ken Carson) | mp3 / ogg / m4a | Silence |

## M3 — Rhythm cabinet ("PULSE GRID" or similar original name)
One playable track to start; more reversed tracks unlock progressively. Empty
slots → a generated metronome/tone so judgments still work.

> Authoring notes: an authored `.json` beatmap's note times should span the real
> track's length (the engine anchors the chart + the reversed-encore pivot to
> the loaded track's duration). The reversed "encore" adds a ~2 s lead-in so its
> opening notes stay reactable, so expect a small lead offset versus the raw
> reversed audio. With no track file present the metronome BPM (124) drives the
> beat and the chart auto-generates on the beat grid.

| Slot path | What it is | Accepted formats | Fallback if absent |
|---|---|---|---|
| `public/arcade/audio/rhythm-song-1.mp3` | Primary playable track (encore plays it reversed) | mp3 / ogg / m4a | Generated metronome/tone (WebAudio) |
| `public/arcade/audio/rhythm-song-2.mp3` | 2nd progressively-unlocked track | mp3 / ogg / m4a | Generated tone variant |
| `public/arcade/audio/rhythm-song-3.mp3` | 3rd progressively-unlocked track | mp3 / ogg / m4a | Generated tone variant |
| `public/arcade/charts/rhythm-song-1.json` | Optional hand-authored beatmap (note times/lanes) | json | Auto-generated chart from beat detection / fixed BPM |
| `public/arcade/charts/rhythm-song-2.json` | Optional beatmap for track 2 | json | Auto-generated chart |
| `public/arcade/charts/rhythm-song-3.json` | Optional beatmap for track 3 | json | Auto-generated chart |

## M4 — Crossing cabinet ("GRIDLOCK HAUL" or similar; UNWINNABLE by design)
Original parody character + mocking-laugh SFX. Empty slots → primitive runner
mesh and silence.

| Slot path | What it is | Accepted formats | Fallback if absent |
|---|---|---|---|
| `public/arcade/models/runner.glb` | ORIGINAL parody character pushing a cabinet | glb / gltf | Primitive capsule + box "cabinet" |
| `public/arcade/audio/mock-laugh.mp3` | ORIGINAL mocking-laugh SFX on each failure | mp3 / ogg / wav | Silence (or short generated blip) |
| `public/arcade/textures/city-lane.png` | Optional stylized road/lane texture (ORIGINAL) | png / webp / ktx2 | Solid/striped procedural material |

## M5 — Stack cabinet ("CASCADE"; original falling-block puzzle)
Rendered in-world on the cabinet screen. **NOT an iframe to tetr.io** — tetr.io
sets `X-Frame-Options`/CSP that block embedding, and embedding it violates their
ToS. The cabinet art frames an original playfield.

| Slot path | What it is | Accepted formats | Fallback if absent |
|---|---|---|---|
| `public/arcade/textures/stack-cabinet.png` | ORIGINAL cabinet bezel/art (original stickers) | png / webp | Procedural neon bezel material |
| `public/arcade/audio/stack-clear.mp3` | Optional line-clear SFX (ORIGINAL) | mp3 / ogg / wav | Generated blip |

## M6 — Death & respawn (original grayscale defeat screen + sting)
"WASTED"-style but ORIGINAL art + ORIGINAL defeat sting.

| Slot path | What it is | Accepted formats | Fallback if absent |
|---|---|---|---|
| `public/arcade/defeat/overlay.png` | ORIGINAL grayscale defeat overlay art | png / webp (transparent) | Procedural grayscale vignette + original "DOWNED"-style text |
| `public/arcade/audio/defeat-sting.mp3` | ORIGINAL defeat sting played on death | mp3 / ogg / wav | Silence |
| `public/arcade/models/minotaur.glb` | ORIGINAL roaming threat model | glb / gltf | Primitive horned-capsule mesh |

## M7 — Neon light-cycle ("NEON RUNNER" or similar original name)
Rideable original cycle; grid-duel encounter in "tall grass" zones.

| Slot path | What it is | Accepted formats | Fallback if absent |
|---|---|---|---|
| `public/arcade/models/cycle.glb` | ORIGINAL neon cycle model | glb / gltf | Primitive low-poly cycle (boxes/cylinders) |
| `public/arcade/audio/cycle-hum.mp3` | Optional engine/hum loop (ORIGINAL) | mp3 / ogg | Silence / generated hum |

## M8 — Ghost backend (Cloud Run + Firestore)
No binary asset slots — this is runtime config, not a committed asset. Endpoint
config is provided via env/build config, never a committed secret. Recorded
sessions are **fully anonymous** (random client UUID + sampled world poses only:
no name, email, IP, or user-agent) with a **30-day TTL** (Firestore TTL policy
on `expiresAt`, re-applied client-side on read). Client code:
`src/arcade/ghostMath.js` (pure, node-tested), `src/arcade/ghostClient.js`
(network), `src/arcade/Ghosts.jsx` (record + replay).

| Config | What it is | Where it lives | Fallback if absent |
|---|---|---|---|
| `VITE_GHOST_API_BASE` | Cloud Run base URL for record/replay (e.g. `https://ghost-replay-api-xxxx.run.app`) | Vite env (`.env` / deploy env) — Vite exposes `VITE_*` to the client at build time; NOT committed, no `vite.config.js` edit needed | **Ghost record + replay disabled; world runs solo** (default shipped state). All network calls are gated on this; build stays green with it unset. |

> Owner action to enable: deploy `backend/` to Cloud Run, enable the Firestore
> TTL policy on `expiresAt` (see `backend/README.md`), then set
> `VITE_GHOST_API_BASE` to the service URL and rebuild. The backend's
> `ALLOWED_ORIGINS` must include the site origin (default already lists the
> GitHub Pages origin + Vite dev). No client change required.

## M9 — Office-flavor decor (ORIGINAL parody only — NO real The Office IP)
| Slot path | What it is | Accepted formats | Fallback if absent |
|---|---|---|---|
| `public/arcade/textures/decor-*.png` | ORIGINAL parody workplace-sitcom decor textures | png / webp | Procedural materials / primitive props |
| `public/arcade/models/decor-*.glb` | ORIGINAL parody decor props | glb / gltf | Primitive prop meshes |

## M10 — Polish / QA
No new asset slots. Verifies all of the above degrade gracefully when their
slots are empty (the default shipped state).
