// Asset-slot registry for the arcade experience.
//
// Everything licensable (models, textures, audio) lives under public/arcade/...
// and is referenced here via import.meta.env.BASE_URL so paths resolve under
// the GitHub Pages base ("/portfolio3js/"). NONE of these files need to exist
// for the build to be green — loaders below fall back to null/silence so the
// hub renders with primitive meshes and runs silently when assets are absent.
//
// To add real art later: drop the file at the documented path and the loader
// guards will pick it up automatically. Keep filenames ORIGINAL — never commit
// copyrighted models/songs into the repo.

const BASE = import.meta.env.BASE_URL || '/';

// Normalise so we never produce a double slash when BASE ends in "/".
const pub = (p) => `${BASE}${p}`.replace(/([^:]\/)\/+/g, '$1');

export const ASSET_SLOTS = {
  models: {
    // Optional baked hub environment. When present it is rendered as decoration
    // on top of the always-present primitive room (which owns the colliders).
    hub: pub('arcade/models/hub.glb'),
    cabinet: pub('arcade/models/cabinet.glb'),
    kiosk: pub('arcade/models/kiosk.glb'),
    // M6 roaming threat. Empty slot → a primitive horned-capsule mesh built in
    // Minotaur.jsx. ORIGINAL model only — never a real character (see ASSETS.md M6).
    minotaur: pub('arcade/models/minotaur.glb'),
    // M7 rideable neon light-cycle. Empty slot → a primitive low-poly neon cycle
    // built in Cycle.jsx. ORIGINAL model only — never a real Tron/light-cycle
    // likeness (see ASSETS.md M7).
    cycle: pub('arcade/models/cycle.glb'),
    // M9 optional baked office-decor model, layered on top of the always-present
    // procedural set dressing in Decor.jsx. Empty slot → null (procedural decor
    // only). ORIGINAL parody only — never real "The Office"/Dunder Mifflin IP
    // (see ASSETS.md M9).
    decor: pub('arcade/models/decor.glb'),
  },
  loader: {
    // M2 loading animation. ALL optional — the loader runs a procedural,
    // ORIGINAL "rage/opium"-aesthetic canvas animation and is silent when these
    // slots are empty (the default shipped state). Original/parody art only:
    // never a Ken Carson / Carti likeness or their music.
    bg: pub('arcade/loader/bg.png'),
    sprite: pub('arcade/loader/sprite.png'),
    theme: pub('arcade/loader/theme.mp3'),
  },
  audio: {
    // Ambient pad for the hub. Silence when missing — NEVER autoplay licensed
    // music, and never commit real song files (use original/CC0 audio only).
    ambience: pub('arcade/audio/ambience.ogg'),
    pickup: pub('arcade/audio/pickup.ogg'),
    throw: pub('arcade/audio/throw.ogg'),
    // M4 GRIDLOCK cabinet: ORIGINAL "mocking laugh" SFX played on each failure.
    // Empty slot → a synthesized descending mock sting (see games/gridlockAudio.js
    // + ASSETS.md M4). Never a real character's voice/laugh.
    mockLaugh: pub('arcade/audio/mock-laugh.mp3'),
    // M5 CASCADE cabinet: ORIGINAL line-clear SFX. Empty slot → a synthesized
    // rising arpeggio (see games/cascadeAudio.js + ASSETS.md M5). Original only.
    stackClear: pub('arcade/audio/stack-clear.mp3'),
    // M6 death: ORIGINAL defeat sting played once on death. Empty slot → silence
    // (createSilentAudio no-ops). Never a real song/score (see ASSETS.md M6).
    defeatSting: pub('arcade/audio/defeat-sting.mp3'),
    // M7 neon cycle: optional looping engine/hum while riding. Empty slot →
    // silence (createSilentAudio no-ops). ORIGINAL audio only (see ASSETS.md M7).
    cycleHum: pub('arcade/audio/cycle-hum.mp3'),
    // M3 PULSE cabinet tracks. ALL optional — empty slots fall back to a
    // generated WebAudio metronome/tone so judgments still work (see
    // games/pulseAudio.js + ASSETS.md M3). Track 1 is the primary; the encore
    // plays it reversed; tracks 2/3 unlock progressively (also reversed).
    rhythm: [
      pub('arcade/audio/rhythm-song-1.mp3'),
      pub('arcade/audio/rhythm-song-2.mp3'),
      pub('arcade/audio/rhythm-song-3.mp3'),
    ],
  },
  textures: {
    // M5 CASCADE cabinet: ORIGINAL bezel/sticker art framing the playfield.
    // Empty slot → a procedural neon bezel drawn on the canvas (the default
    // shipped state — see games/CascadeGame.jsx + ASSETS.md M5). Original only.
    stackCabinet: pub('arcade/textures/stack-cabinet.png'),
  },
  defeat: {
    // M6 grayscale defeat screen art (ORIGINAL — NOT GTA "Wasted"). Empty slot →
    // a procedural grayscale vignette + original "DOWNED" text drawn in the DOM
    // overlay (the default shipped state — see DefeatOverlay.jsx + ASSETS.md M6).
    overlay: pub('arcade/defeat/overlay.png'),
  },
  // Optional hand-authored beatmaps for the PULSE tracks. Absent → the engine
  // auto-generates a deterministic fixed-BPM chart (see games/pulseEngine.js).
  charts: [
    pub('arcade/charts/rhythm-song-1.json'),
    pub('arcade/charts/rhythm-song-2.json'),
    pub('arcade/charts/rhythm-song-3.json'),
  ],
};

// Returns a tiny <audio>-style player that is safe to call even when the asset
// is missing: a failed load simply makes play() a no-op. No autoplay.
//
// play() is NOT gated on a `canplaythrough` flag on purpose: a real track may
// not have buffered yet when the caller fires play() (common over a network),
// and gating would make it silently never play. Instead we attempt play()
// whenever an element exists and swallow any rejection (autoplay/decoding
// policy). The 'error' handler nulls `el` so a genuinely MISSING asset still
// no-ops via the `if (!el)` guard — the silent fallback is preserved.
export function createSilentAudio(url, { volume = 0.5, loop = false } = {}) {
  let el = null;
  if (typeof Audio !== 'undefined' && url) {
    try {
      el = new Audio();
      el.src = url;
      el.loop = loop;
      el.volume = volume;
      el.preload = 'auto';
      el.addEventListener('error', () => { el = null; });
    } catch {
      el = null;
    }
  }
  return {
    play() {
      if (!el) return; // silence fallback (no asset / unsupported)
      try {
        el.currentTime = 0;
        const p = el.play();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } catch {
        /* ignore — autoplay/decoding policy, stay silent */
      }
    },
    stop() {
      if (!el) return;
      try { el.pause(); } catch { /* ignore */ }
    },
    dispose() {
      this.stop();
      el = null;
    },
  };
}

// HEAD-check a public asset so callers can decide whether to attempt a GLTF
// load (which would otherwise throw/suspend forever on a 404). Returns a
// Promise<boolean>. Used by <SafeModel> as a belt-and-suspenders guard on top
// of its Suspense + error boundary.
export async function assetExists(url) {
  if (!url || typeof fetch === 'undefined') return false;
  try {
    const res = await fetch(url, { method: 'HEAD' });
    return res.ok;
  } catch {
    return false;
  }
}

export { pub as publicUrl };
