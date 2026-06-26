// gridlockAudio.js — browser-only WebAudio for the M4 crossing cabinet "GRIDLOCK".
//
// Kept OUT of gridlockEngine.js so the engine stays pure + unit testable. This
// module is best-effort and fully optional: the gameplay clock + collision are
// owned by the component, so the game works with WebAudio blocked, suspended, or
// absent. Audio here only adds sound.
//
// Graceful path (PROMPT.md / ASSETS.md M4): the "mocking laugh" SFX loads from
// its slot (public/arcade/audio/mock-laugh.mp3) when present; when the slot is
// empty we SYNTHESIZE a short, descending, original "mocking" sting so each
// failure still has audible feedback — and if WebAudio itself is unavailable we
// stay silent. No copyrighted audio is ever bundled — the repo ships NONE of
// these files. Original SFX only (never a real character's voice / laugh).

export function createGridlockAudio() {
  let ctx = null;
  try {
    const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
    if (AC) ctx = new AC();
  } catch {
    ctx = null;
  }

  let master = null;
  if (ctx) {
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  }

  let laughBuffer = null; // decoded real SFX, when the slot is filled
  let laughLoaded = false;

  function resume() {
    if (ctx && ctx.state === 'suspended') {
      try {
        const p = ctx.resume();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } catch {
        /* ignore — stays silent, gameplay is independent */
      }
    }
  }

  // Fetch + decode the optional mock-laugh slot. Resolves quietly to a no-op when
  // the slot is empty / unsupported / fails to decode (the synth path is used).
  async function loadLaugh(url) {
    laughLoaded = true;
    if (!ctx || !url || typeof fetch === 'undefined') return;
    try {
      const res = await fetch(url);
      if (!res.ok) return;
      const arr = await res.arrayBuffer();
      laughBuffer = await ctx.decodeAudioData(arr);
    } catch {
      laughBuffer = null;
    }
  }

  // A short descending "heh-heh-heh" sting synthesized from staccato blips — an
  // ORIGINAL mocking motif (NOT anyone's real laugh). Used when the slot is empty.
  function synthLaugh() {
    if (!ctx || !master) return;
    const now = ctx.currentTime;
    const steps = [0, 0.12, 0.24, 0.36];
    const freqs = [392, 330, 277, 233]; // G4 → descending: deflating / mocking
    for (let i = 0; i < steps.length; i++) {
      const t0 = now + steps[i];
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freqs[i], t0);
      osc.frequency.exponentialRampToValueAtTime(freqs[i] * 0.78, t0 + 0.09);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.22, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.11);
      osc.connect(g);
      g.connect(master);
      osc.start(t0);
      osc.stop(t0 + 0.14);
    }
  }

  // Play the mocking laugh on a failure (real SFX if loaded, else the synth).
  function playLaugh() {
    resume();
    if (laughBuffer && ctx && master) {
      try {
        const src = ctx.createBufferSource();
        src.buffer = laughBuffer;
        const g = ctx.createGain();
        g.gain.value = 0.9;
        src.connect(g);
        g.connect(master);
        src.start();
        return;
      } catch {
        /* fall through to synth */
      }
    }
    synthLaugh();
  }

  // A tiny tick on each step — subtle juice, fully optional.
  function playStep() {
    if (!ctx || !master) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(660, now);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.07, now + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
    osc.connect(g);
    g.connect(master);
    osc.start(now);
    osc.stop(now + 0.06);
  }

  // A brighter rising chirp when a level escalates (the cabinet "hauled" another
  // block — there's no winning, only a harder board).
  function playEscalate() {
    if (!ctx || !master) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.18);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
    osc.connect(g);
    g.connect(master);
    osc.start(now);
    osc.stop(now + 0.25);
  }

  function dispose() {
    if (ctx) {
      try {
        const p = ctx.close();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } catch {
        /* ignore */
      }
      ctx = null;
      master = null;
    }
    laughBuffer = null;
  }

  return {
    get available() { return !!ctx; },
    get laughLoaded() { return laughLoaded; },
    resume,
    loadLaugh,
    playLaugh,
    playStep,
    playEscalate,
    dispose,
  };
}
