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
  },
  audio: {
    // Ambient pad for the hub. Silence when missing — NEVER autoplay licensed
    // music, and never commit real song files (use original/CC0 audio only).
    ambience: pub('arcade/audio/ambience.ogg'),
    pickup: pub('arcade/audio/pickup.ogg'),
    throw: pub('arcade/audio/throw.ogg'),
  },
};

// Returns a tiny <audio>-style player that is safe to call even when the asset
// is missing: a failed load simply makes play() a no-op. No autoplay.
export function createSilentAudio(url, { volume = 0.5, loop = false } = {}) {
  let el = null;
  let ok = false;
  if (typeof Audio !== 'undefined' && url) {
    try {
      el = new Audio();
      el.src = url;
      el.loop = loop;
      el.volume = volume;
      el.preload = 'auto';
      el.addEventListener('canplaythrough', () => { ok = true; }, { once: true });
      el.addEventListener('error', () => { ok = false; el = null; });
    } catch {
      el = null;
    }
  }
  return {
    play() {
      if (!el || !ok) return; // silence fallback
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
