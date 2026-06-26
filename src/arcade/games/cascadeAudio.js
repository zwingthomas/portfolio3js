// cascadeAudio.js — browser-only WebAudio for the M5 stack cabinet "CASCADE".
//
// Kept OUT of cascadeEngine.js so the engine stays pure + unit testable. This
// module is best-effort and fully optional: the game's clock, gravity and
// collisions are owned by the component, so play works with WebAudio blocked,
// suspended, or absent. Audio here only adds juice.
//
// Graceful path (PROMPT.md / ASSETS.md M5): the line-clear SFX loads from its
// slot (public/arcade/audio/stack-clear.mp3) when present; when the slot is
// empty we SYNTHESIZE an ORIGINAL rising "clear" arpeggio so a clear still has
// audible feedback — and if WebAudio itself is unavailable we stay silent. The
// move/rotate/lock/drop ticks and the top-out sting are always synthesized
// (original blips — never sampled). No copyrighted audio is ever bundled.

export function createCascadeAudio() {
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
    master.gain.value = 0.42;
    master.connect(ctx.destination);
  }

  let clearBuffer = null; // decoded line-clear SFX, when the slot is filled
  let clearLoaded = false;

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

  // Fetch + decode the optional stack-clear slot. Resolves quietly to a no-op
  // when the slot is empty / unsupported / fails to decode (the synth is used).
  async function loadClear(url) {
    clearLoaded = true;
    if (!ctx || !url || typeof fetch === 'undefined') return;
    try {
      const res = await fetch(url);
      if (!res.ok) return;
      const arr = await res.arrayBuffer();
      clearBuffer = await ctx.decodeAudioData(arr);
    } catch {
      clearBuffer = null;
    }
  }

  // One short blip — the primitive used for move/rotate/lock ticks.
  function blip(freq, dur, type, gain, when = 0) {
    if (!ctx || !master) return;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function playMove() { blip(420, 0.04, 'square', 0.05); }
  function playRotate() { blip(560, 0.05, 'triangle', 0.06); }
  function playLock() { blip(180, 0.07, 'square', 0.09); }
  function playDrop() { blip(120, 0.10, 'sawtooth', 0.10); }

  // An ORIGINAL rising arpeggio whose brightness scales with the number of lines
  // cleared (a single ticks low; a tetris sparkles). Used when the slot is empty.
  function synthClear(lines) {
    if (!ctx || !master) return;
    const n = Math.max(1, Math.min(4, lines));
    const root = 392; // G4
    for (let i = 0; i < n + 1; i++) {
      blip(root * Math.pow(1.18, i), 0.12, 'triangle', 0.12, i * 0.05);
    }
  }

  // Play on a line clear: real SFX if loaded, else the synth arpeggio.
  function playClear(lines) {
    resume();
    if (clearBuffer && ctx && master) {
      try {
        const src = ctx.createBufferSource();
        src.buffer = clearBuffer;
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
    synthClear(lines);
  }

  // A short descending sting on top-out (game over). Original motif.
  function playGameOver() {
    if (!ctx || !master) return;
    const freqs = [330, 262, 196, 147];
    for (let i = 0; i < freqs.length; i++) {
      blip(freqs[i], 0.18, 'sawtooth', 0.14, i * 0.12);
    }
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
    clearBuffer = null;
  }

  return {
    get available() { return !!ctx; },
    get clearLoaded() { return clearLoaded; },
    resume,
    loadClear,
    playMove,
    playRotate,
    playLock,
    playDrop,
    playClear,
    playGameOver,
    dispose,
  };
}
