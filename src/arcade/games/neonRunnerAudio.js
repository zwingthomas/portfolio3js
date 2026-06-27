// neonRunnerAudio.js — browser-only WebAudio for the M7 "NEON RUNNER" grid duel.
//
// Kept OUT of neonRunnerEngine.js so the engine stays pure + unit testable. This
// module is best-effort and fully OPTIONAL: the duel clock + collision are owned
// by the component, so the game works with WebAudio blocked, suspended, or
// absent. Audio here only adds sound — all of it SYNTHESIZED (no asset bundled).
//
// LEGAL: every sound is generated from oscillators. No copyrighted audio is ever
// shipped; the duel ships NO sound files. Original SFX only.

export function createNeonRunnerAudio() {
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
    master.gain.value = 0.45;
    master.connect(ctx.destination);
  }

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

  // tiny helper: one enveloped oscillator note.
  function blip(type, f0, f1, t0, dur, peak) {
    if (!ctx || !master) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + Math.min(0.012, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  // a soft tick on each turn — directional juice.
  function playTurn() {
    if (!ctx) return;
    blip('square', 540, 680, ctx.currentTime, 0.05, 0.06);
  }

  // descending crunch on a crash.
  function playCrash() {
    if (!ctx) return;
    const now = ctx.currentTime;
    blip('sawtooth', 320, 70, now, 0.34, 0.22);
    blip('triangle', 160, 50, now + 0.02, 0.3, 0.16);
  }

  // bright rising arpeggio on a win.
  function playWin() {
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = [440, 554, 659, 880];
    for (let i = 0; i < notes.length; i++) {
      blip('triangle', notes[i], notes[i], now + i * 0.09, 0.16, 0.2);
    }
  }

  // a deflating two-note fall on a loss.
  function playLose() {
    if (!ctx) return;
    const now = ctx.currentTime;
    blip('sawtooth', 300, 240, now, 0.18, 0.18);
    blip('sawtooth', 220, 150, now + 0.16, 0.34, 0.2);
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
  }

  return {
    get available() { return !!ctx; },
    resume,
    playTurn,
    playCrash,
    playWin,
    playLose,
    dispose,
  };
}
