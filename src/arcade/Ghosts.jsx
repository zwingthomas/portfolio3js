import { useRef, useEffect, useMemo, useState } from 'react';
import { Text, Billboard } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  GHOST_SAMPLE_MS,
  GHOST_MAX_FRAMES,
  GHOST_MIN_FLUSH_FRAMES,
  GHOST_TTL_DAYS,
  shouldSample,
  shouldKeepFrame,
  sampleTrackPose,
  trackDuration,
  filterRecent,
  relativeAge,
} from './ghostMath';
import { ghostsEnabled, getSessionId, postGhost, fetchRecentGhosts } from './ghostClient';

// M8 — anonymous ghost recorder + replay.
//
// Records the local visitor's path (sampled camera poses) and, on exit, uploads
// it as an ANONYMOUS ghost (random sessionId + poses only — no PII; see
// ghostClient.js). On entry it fetches recent ghosts (last 30 days) and replays
// each as a translucent avatar that plays back its pose track with a floating
// date/time label above it.
//
// OFFLINE-SAFE: everything is gated on a configured base URL (VITE_GHOST_API_BASE).
// With it unset (the default shipped state) record + replay are no-ops and the
// world runs solo — the build stays green with the backend absent/unreachable.
//
// PER-FRAME ZERO-ALLOC: the replay loop binary-searches the pose track and
// writes into a reused scratch object (sampleTrackPose); avatars + labels are
// built once. The recorder pushes a small frame object only on a fixed ~120 ms
// sample tick (≈8/sec, decimated) — never every render frame.

// Camera eye height in world space ≈ capsule-centre rest (~0.85) + (eyeHeight −
// capsuleHalfHeight) (1.1) ≈ 1.95. Subtracting it from the recorded camera Y
// lands the avatar's feet on the floor (and preserves jumps / the mezzanine).
const EYE_TO_FOOT = 1.95;

// Keep replay cheap: a few ghosts max, fewer on touch/low-power devices.
const MAX_GHOSTS_DESKTOP = 6;
const MAX_GHOSTS_TOUCH = 3;

// Neon hues cycled per ghost so overlapping replays stay distinguishable.
const HUES = ['#8be9ff', '#ff7cf0', '#7cff9b', '#ffd86b', '#b58bff', '#ff9d6b'];

// prefers-reduced-motion: when set we freeze ghosts at their first pose (no
// per-frame playback) but still show them + their labels.
function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() => {
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      return false;
    }
  });
  useEffect(() => {
    let mq;
    try {
      mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    } catch {
      return undefined;
    }
    const onChange = () => setReduced(mq.matches);
    try {
      mq.addEventListener('change', onChange);
    } catch {
      mq.addListener?.(onChange); // older Safari
    }
    return () => {
      try {
        mq.removeEventListener('change', onChange);
      } catch {
        mq.removeListener?.(onChange);
      }
    };
  }, []);
  return reduced;
}

// Translucent, non-occluding avatar (depthWrite off so ghosts ghost-through one
// another and the world). Built once per ghost.
function GhostAvatar({ hue }) {
  return (
    <group>
      <mesh position={[0, 0.95, 0]}>
        <capsuleGeometry args={[0.32, 0.9, 6, 12]} />
        <meshStandardMaterial
          color={hue}
          emissive={hue}
          emissiveIntensity={0.7}
          transparent
          opacity={0.3}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <mesh position={[0, 1.7, 0]}>
        <sphereGeometry args={[0.24, 16, 16]} />
        <meshStandardMaterial
          color={hue}
          emissive={hue}
          emissiveIntensity={0.9}
          transparent
          opacity={0.3}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

// One replayed ghost. Owns a single scratch pose object reused every frame
// (zero per-frame alloc). Playback loops the track; a per-ghost time offset
// keeps simultaneous ghosts out of phase.
function Ghost({ ghost, nowAtFetch, hue, offsetMs, paused, reducedMotion }) {
  const groupRef = useRef(null);
  const path = ghost.path;
  const duration = useMemo(() => trackDuration(path), [path]);
  const scratch = useRef(null);
  if (scratch.current === null) scratch.current = { x: 0, y: 0, z: 0, ry: 0 };

  // gate flags read in the per-frame loop via refs (no re-subscribe churn).
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const reducedRef = useRef(reducedMotion);
  reducedRef.current = reducedMotion;

  const label = useMemo(() => {
    const age = relativeAge(Number(ghost.createdAt), nowAtFetch);
    let clock = '';
    try {
      clock = new Date(Number(ghost.createdAt)).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      clock = '';
    }
    return clock ? `◈ VISITOR · ${age} · ${clock}` : `◈ VISITOR · ${age}`;
  }, [ghost.createdAt, nowAtFetch]);

  // Seed at the first pose so a ghost is placed correctly before the first frame
  // (and stays there under reduced motion).
  const placeAt = (tMs) => {
    const g = groupRef.current;
    if (!g) return;
    const s = sampleTrackPose(path, tMs, scratch.current);
    g.position.set(s.x, s.y - EYE_TO_FOOT > 0 ? s.y - EYE_TO_FOOT : 0, s.z);
    g.rotation.y = s.ry;
  };

  useEffect(() => {
    placeAt(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  useFrame((state) => {
    if (pausedRef.current || reducedRef.current || duration <= 0) return;
    const tMs = (offsetMs + state.clock.elapsedTime * 1000) % duration;
    placeAt(tMs);
  });

  return (
    <group ref={groupRef}>
      <GhostAvatar hue={hue} />
      <Billboard position={[0, 2.3, 0]}>
        <Text
          fontSize={0.16}
          color={hue}
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.006}
          outlineColor="#000"
          maxWidth={5}
        >
          {label}
        </Text>
      </Billboard>
    </group>
  );
}

// Fetches recent ghosts once on entry and renders the replay avatars. Renders
// nothing when ghosts are disabled (no base URL) or none are available.
export function GhostReplay({ paused = false, touchMode = false }) {
  const [ghosts, setGhosts] = useState(null); // null = loading, [] = none
  const nowRef = useRef(0);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (!ghostsEnabled()) {
      setGhosts([]);
      return undefined;
    }
    let alive = true;
    const cap = touchMode ? MAX_GHOSTS_TOUCH : MAX_GHOSTS_DESKTOP;
    fetchRecentGhosts({ sinceDays: GHOST_TTL_DAYS, limit: 50 }).then((list) => {
      if (!alive) return;
      const now = Date.now();
      nowRef.current = now;
      const mine = getSessionId();
      // Server already filters to 30 days + strips sessionId; re-apply the cutoff
      // client-side and never replay our own session if one ever leaks through.
      const recent = filterRecent(list, now, GHOST_TTL_DAYS, cap + 4).filter(
        (g) => g.sessionId == null || g.sessionId !== mine,
      );
      setGhosts(recent.slice(0, cap));
    });
    return () => {
      alive = false;
    };
  }, [touchMode]);

  if (!ghosts || ghosts.length === 0) return null;
  return (
    <group>
      {ghosts.map((g, i) => (
        <Ghost
          key={g.id || i}
          ghost={g}
          nowAtFetch={nowRef.current}
          hue={HUES[i % HUES.length]}
          offsetMs={(i * 737) % 9000}
          paused={paused}
          reducedMotion={reducedMotion}
        />
      ))}
    </group>
  );
}

// Records the local visitor's path and uploads it (anonymously) on exit. No
// visual output. No-op when ghosts are disabled. Lives inside the Canvas so it
// can read the camera each frame.
export function GhostRecorder() {
  const { camera } = useThree();
  const dir = useMemo(() => new THREE.Vector3(), []);
  const st = useRef(null);
  if (st.current === null) {
    st.current = {
      enabled: ghostsEnabled(),
      startMs: 0, // wall-clock (Date.now) of the first sample → startedAt
      startElapsed: -1, // r3f clock elapsed at first sample → t origin
      lastSample: -1e9, // elapsed-ms of the last sample tick
      path: [],
      last: null, // last KEPT frame (decimation anchor)
      flushed: false,
    };
  }

  // Best-effort upload of the recorded path. Idempotent (flushed latch) so the
  // EXIT-unmount and a pagehide can't double-post the same session. keepalive
  // lets it survive navigation/close.
  const flush = (keepalive) => {
    const s = st.current;
    if (!s.enabled || s.flushed) return;
    if (s.path.length < GHOST_MIN_FLUSH_FRAMES) return; // too little movement to be interesting
    s.flushed = true;
    postGhost(
      { sessionId: getSessionId(), startedAt: s.startMs || Date.now(), path: s.path },
      { keepalive: !!keepalive },
    );
  };

  useFrame((state) => {
    const s = st.current;
    if (!s.enabled || s.path.length >= GHOST_MAX_FRAMES) return;
    const elapsedMs = state.clock.elapsedTime * 1000;
    if (s.startElapsed < 0) {
      s.startElapsed = elapsedMs;
      s.startMs = Date.now();
    }
    if (!shouldSample(s.lastSample, elapsedMs, GHOST_SAMPLE_MS)) return;
    s.lastSample = elapsedMs;

    const x = camera.position.x;
    const y = camera.position.y;
    const z = camera.position.z;
    camera.getWorldDirection(dir);
    const ry = Math.atan2(dir.x, dir.z); // YXZ-convention heading (matches Player)

    if (shouldKeepFrame(s.last, x, y, z, ry)) {
      // round to trim payload size; offset t from the session's first sample.
      const frame = {
        t: Math.round(elapsedMs - s.startElapsed),
        x: Math.round(x * 100) / 100,
        y: Math.round(y * 100) / 100,
        z: Math.round(z * 100) / 100,
        ry: Math.round(ry * 1000) / 1000,
      };
      s.path.push(frame);
      s.last = frame;
    }
  });

  useEffect(() => {
    if (!st.current.enabled) return undefined;
    const onPageHide = () => flush(true);
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush(true);
    };
    window.addEventListener('pagehide', onPageHide);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      document.removeEventListener('visibilitychange', onVisibility);
      flush(true); // EXIT unmounts the overlay → flush on the way out
    };
  }, []);

  return null;
}

export default GhostReplay;
