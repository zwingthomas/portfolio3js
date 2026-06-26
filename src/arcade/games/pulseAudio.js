// pulseAudio.js — browser-only WebAudio for the M3 rhythm cabinet "PULSE".
//
// Deliberately kept OUT of pulseEngine.js so the engine stays pure + unit
// testable. This module is best-effort and fully optional: the GAME CLOCK is
// owned by the component (performance.now), so gameplay + judgments work even
// when WebAudio is blocked, suspended, or absent. Audio here only adds sound.
//
// Graceful path (PROMPT.md / ASSETS.md M3): if a real track file is present in
// its slot (public/arcade/audio/rhythm-song-N.mp3) we decode + play it (and
// reverse the PCM for the "encore"); when the slot is empty we synthesize a
// metronome/tone so the player still has a beat to play to. No copyrighted
// audio is ever bundled — the repo ships NONE of these files.

export function createPulseAudio() {
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
    master.gain.value = 0.55;
    master.connect(ctx.destination);
  }

  let source = null; // BufferSourceNode for a real track
  let trackGain = null; // gain node between source and master (torn down with source)
  let schedulerId = 0; // setInterval id for the metronome scheduler
  let nextBeatTime = 0; // ctx time of the next beat to schedule
  let beatSec = 0.5;
  let startCtxTime = 0;
  let running = false;
  // memoize reversed encore buffers so a re-encountered track isn't reversed
  // (a multi-million-sample main-thread copy) again on each escalation cycle.
  const reversedCache = typeof WeakMap !== 'undefined' ? new WeakMap() : null;

  function resume() {
    if (ctx && ctx.state === 'suspended') {
      try {
        const p = ctx.resume();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } catch {
        /* ignore — stays silent, gameplay clock is independent */
      }
    }
  }

  // Fetch + decode an optional track slot. Resolves to an AudioBuffer, or null
  // when the slot is empty / unsupported / fails to decode (the silent path).
  async function loadBuffer(url) {
    if (!ctx || !url || typeof fetch === 'undefined') return null;
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const arr = await res.arrayBuffer();
      return await ctx.decodeAudioData(arr);
    } catch {
      return null;
    }
  }

  // Reverse a decoded buffer's PCM for the "encore" (each channel reversed).
  // Cached per source buffer so the heavy sample copy happens at most once.
  function reverseBuffer(buffer) {
    if (!ctx || !buffer) return buffer;
    if (reversedCache && reversedCache.has(buffer)) return reversedCache.get(buffer);
    try {
      const out = ctx.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
      for (let c = 0; c < buffer.numberOfChannels; c++) {
        const src = buffer.getChannelData(c);
        const dst = out.getChannelData(c);
        for (let i = 0, n = src.length; i < n; i++) dst[i] = src[n - 1 - i];
      }
      if (reversedCache) reversedCache.set(buffer, out);
      return out;
    } catch {
      return buffer;
    }
  }

  // A short percussive click for the metronome fallback. `accent` marks the
  // down-beat (every 4th). `reversed` gives the encore a darker, descending
  // timbre so it sounds distinct from the forward pass.
  function scheduleClick(time, accent, reversed) {
    if (!ctx || !master) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = reversed ? 'sawtooth' : 'square';
    const base = reversed ? 320 : 440;
    osc.frequency.setValueAtTime(accent ? base * 2 : base, time);
    if (reversed) {
      // descending chirp on the encore
      osc.frequency.exponentialRampToValueAtTime(Math.max(80, (accent ? base * 2 : base) * 0.6), time + 0.08);
    }
    const peak = accent ? 0.26 : 0.13;
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(peak, time + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.1);
    osc.connect(g);
    g.connect(master);
    osc.start(time);
    osc.stop(time + 0.12);
  }

  function tickScheduler(reversed) {
    if (!ctx) return;
    const ahead = ctx.currentTime + 0.14;
    let guard = 0;
    while (nextBeatTime < ahead && guard < 64) {
      const beatIndex = Math.round((nextBeatTime - startCtxTime) / beatSec);
      scheduleClick(nextBeatTime, beatIndex % 4 === 0, reversed);
      nextBeatTime += beatSec;
      guard++;
    }
  }

  // Start audio for a stage. When `buffer` is present we play the (optionally
  // reversed) track; otherwise we run the synthesized metronome at `bpm`. Either
  // way the component's own clock starts at the same wall-clock instant, so the
  // visible notes and the audible beat stay aligned to within a few ms.
  function start({ buffer = null, bpm = 124, reversed = false, rate = 1 } = {}) {
    stop();
    resume();
    beatSec = 60 / Math.max(1, bpm);
    running = true;
    if (!ctx || !master) return; // silent: gameplay clock still runs in the component

    startCtxTime = ctx.currentTime + 0.06; // tiny offset so the first beat isn't clipped
    if (buffer) {
      try {
        source = ctx.createBufferSource();
        source.buffer = reversed ? reverseBuffer(buffer) : buffer;
        // escalating loops compress the chart; speed the track to match so the
        // audible beat stays aligned with the visible notes.
        if (source.playbackRate && rate && rate !== 1) source.playbackRate.value = rate;
        trackGain = ctx.createGain();
        trackGain.gain.value = 0.85;
        source.connect(trackGain);
        trackGain.connect(master);
        source.start(startCtxTime);
      } catch {
        source = null;
      }
    } else {
      nextBeatTime = startCtxTime;
      tickScheduler(reversed);
      schedulerId = setInterval(() => tickScheduler(reversed), 25);
    }
  }

  // Short feedback blip on a judgment (bright = PERFECT, mid = GREAT, thud =
  // MISS). Independent of the beat scheduler.
  function playBlip(judgment) {
    if (!ctx || !master) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    if (judgment === 'PERFECT') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(1320, now);
    } else if (judgment === 'GREAT') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(880, now);
    } else {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(150, now);
      osc.frequency.exponentialRampToValueAtTime(70, now + 0.12);
    }
    const peak = judgment === 'MISS' ? 0.22 : 0.16;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(peak, now + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, now + (judgment === 'MISS' ? 0.16 : 0.1));
    osc.connect(g);
    g.connect(master);
    osc.start(now);
    osc.stop(now + 0.2);
  }

  function stop() {
    running = false;
    if (schedulerId) {
      clearInterval(schedulerId);
      schedulerId = 0;
    }
    if (source) {
      try { source.stop(); } catch { /* already stopped */ }
      try { source.disconnect(); } catch { /* ignore */ }
      source = null;
    }
    if (trackGain) {
      try { trackGain.disconnect(); } catch { /* ignore */ }
      trackGain = null;
    }
  }

  function dispose() {
    stop();
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
    isRunning() { return running; },
    resume,
    loadBuffer,
    reverseBuffer,
    start,
    playBlip,
    stop,
    dispose,
  };
}
