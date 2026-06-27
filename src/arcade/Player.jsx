import { useRef, useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useKeyboardControls, PointerLockControls } from '@react-three/drei';
import { RigidBody, CapsuleCollider, useRapier } from '@react-three/rapier';
import * as THREE from 'three';
import { Controls, PLAYER_CONFIG } from './controls';
import { useHeldObject } from './useHeldObject';
import { usePlayerState } from './usePlayerState';
import { useRideState } from './useRideState';
import { touchInput } from './touchInput';
import { clampPitch } from './touchMath';
import { fallDamage } from './deathMath';
import { RIDE_MAX_SPEED, RIDE_ACCEL, RIDE_FRICTION, MOUNT_RADIUS } from './cycleMath';

// First-person player: a dynamic capsule RigidBody with locked rotations.
// - WASD moves relative to camera yaw.
// - Space jumps only when grounded (raycast straight down).
// - Mouse look via PointerLockControls; clicking the canvas locks the pointer.
// - Camera rides the capsule at eye height every frame.
// - E picks up / drops the nearest throwable; left-click throws while holding.
//
// All per-frame math reuses preallocated THREE temporaries to avoid GC churn.

export default function Player({ onLockChange, touchMode = false, paused = false, reachDistance = 3.2, throwImpulse = 14 }) {
  const bodyRef = useRef(null);
  const lockRef = useRef(null);
  const { camera } = useThree();
  const { rapier, world } = useRapier();
  const held = useHeldObject();
  const player = usePlayerState();
  const ride = useRideState();
  const [, getKeys] = useKeyboardControls();

  // grounded flag + jump latch live in refs (read inside useFrame).
  const grounded = useRef(false);
  const wantJump = useRef(false);
  const isLocked = useRef(false);
  // Peak downward speed observed while airborne — converted to fall damage on
  // the landing frame, then reset (see deathMath.fallDamage).
  const peakDown = useRef(0);
  // When a full-screen game (e.g. PULSE) is open, the world is frozen: input is
  // ignored and the avatar is damped to a stop so arrow-key play can't drive
  // movement behind the overlay. Read via ref so handlers don't re-subscribe.
  const pausedRef = useRef(paused);

  // Manual look state for touch mode (no pointer lock on mobile). Yaw/pitch in
  // radians, applied to the camera each frame via a YXZ euler.
  const yaw = useRef(0);
  const pitch = useRef(0);

  // Preallocated scratch objects (no per-frame allocation).
  const tmp = useMemo(() => ({
    forward: new THREE.Vector3(),
    right: new THREE.Vector3(),
    move: new THREE.Vector3(),
    camDir: new THREE.Vector3(),
    holdPos: new THREE.Vector3(),
    bodyPos: new THREE.Vector3(),
    quat: new THREE.Quaternion(),
    impulse: { x: 0, y: 0, z: 0 },
    down: { x: 0, y: -1, z: 0 },
  }), []);

  const config = PLAYER_CONFIG;

  // keep the paused ref current without re-running the input effect.
  useEffect(() => { pausedRef.current = paused; }, [paused]);

  // ---- pointer lock + E/throw input (window-level, cleaned up on unmount) ----
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (pausedRef.current) return; // world frozen while a game overlay is open
      if (e.code === 'KeyE') {
        e.preventDefault();
        // M7: E is the single owner of mount/dismount so it never double-fires
        // with pickup. If riding -> dismount. Else if standing by the parked
        // cycle -> drop anything held and mount. Otherwise the usual pickup/drop.
        if (ride.getRiding()) {
          ride.dismount();
          return;
        }
        const pp = ride.getParkedPose();
        const mdx = camera.position.x - pp.x;
        const mdz = camera.position.z - pp.z;
        if (mdx * mdx + mdz * mdz < MOUNT_RADIUS * MOUNT_RADIUS) {
          if (held.getHeld()) held.drop();
          ride.mount();
          return;
        }
        // toggle: drop if holding, otherwise try to pick up nearest in reach.
        if (held.getHeld()) {
          held.drop();
        } else {
          tmp.holdPos.copy(camera.position);
          const handle = held.findNearest(tmp.holdPos, reachDistance);
          if (handle) held.pickUp(handle.id);
        }
      } else if (e.code === 'Space') {
        // queue a jump; consumed in useFrame if grounded.
        wantJump.current = true;
      }
    };

    const handleMouseDown = (e) => {
      if (pausedRef.current) return; // world frozen while a game overlay is open
      if (e.button !== 0) return; // left click only
      if (!isLocked.current) return; // ignore the click that grabs the lock
      if (held.getHeld()) {
        // throw along camera forward.
        camera.getWorldDirection(tmp.camDir);
        tmp.impulse.x = tmp.camDir.x * throwImpulse;
        tmp.impulse.y = tmp.camDir.y * throwImpulse + 2.0; // slight arc
        tmp.impulse.z = tmp.camDir.z * throwImpulse;
        held.throwHeld(tmp.impulse);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('mousedown', handleMouseDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('mousedown', handleMouseDown);
    };
  }, [camera, held, ride, reachDistance, throwImpulse, tmp]);

  // ---- touch mode: manual look needs a YXZ euler; there is no pointer lock,
  // so tell the HUD we're "active" immediately and seed yaw/pitch from where
  // the camera currently points. ----
  useEffect(() => {
    if (!touchMode) return undefined;
    camera.rotation.order = 'YXZ';
    yaw.current = camera.rotation.y;
    pitch.current = camera.rotation.x;
    isLocked.current = true;
    if (onLockChange) onLockChange(true);
    return undefined;
  }, [touchMode, camera, onLockChange]);

  // ---- physics + camera per frame ----
  useFrame(() => {
    const body = bodyRef.current;
    if (!body) return;

    // Respawn (M6): consumed once after a defeat. Hard-reset the body back to
    // the spawn pad with zero velocity so the player drops in cleanly. Done
    // BEFORE the paused guard so it still applies on the frame death clears.
    if (player.consumeRespawn()) {
      const sp = config.spawn;
      body.setTranslation({ x: sp[0], y: sp[1], z: sp[2] }, true);
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      peakDown.current = 0;
      // step off the cycle on respawn so you drop back in on foot (the cycle
      // parks where you fell).
      if (ride.getRiding()) ride.dismount();
    }

    // frozen while a game overlay is open OR the defeat screen is up: damp to a
    // stop, ignore all input.
    if (pausedRef.current) {
      const lv = body.linvel();
      body.setLinvel({ x: lv.x * 0.6, y: lv.y, z: lv.z * 0.6 }, true);
      return;
    }

    const keys = getKeys();
    const t = body.translation();
    tmp.bodyPos.set(t.x, t.y, t.z);

    // touch look: fold accumulated drag deltas into yaw/pitch and apply via a
    // YXZ euler (no pointer lock on mobile). Done before movement so the
    // forward/right vectors below reflect the new heading this frame.
    if (touchMode) {
      yaw.current += touchInput.look.dx;
      pitch.current = clampPitch(pitch.current + touchInput.look.dy);
      touchInput.look.dx = 0;
      touchInput.look.dy = 0;
      camera.rotation.set(pitch.current, yaw.current, 0);
    }

    // grounded check: short ray straight down from just under the capsule centre.
    // We EXCLUDE the player's own rigid body so the ray cannot self-hit the
    // capsule and report a false "grounded" (which would allow infinite jumps).
    grounded.current = false;
    let rayDone = false;
    if (rapier && world) {
      try {
        // start a hair below centre so we never originate inside our own collider
        const origin = { x: t.x, y: t.y - 0.05, z: t.z };
        const ray = new rapier.Ray(origin, tmp.down);
        // distance from origin to capsule bottom, plus the grounded slop.
        const maxToi =
          config.capsuleHalfHeight + config.capsuleRadius + config.groundedThreshold;
        // 7th arg = filterExcludeRigidBody (raw rapier RigidBody). In
        // @react-three/rapier v2 the RigidBody ref IS the raw rapier body.
        const hit = world.castRay(
          ray, maxToi, true, undefined, undefined, undefined, body,
        );
        grounded.current = !!hit;
        rayDone = true;
      } catch {
        // ray API shape differed — fall through to the velocity heuristic.
        rayDone = false;
      }
    }
    if (!rayDone) {
      // Fallback: treat near-zero vertical velocity as grounded so jumping still
      // works rather than crashing the frame. Not perfect, but never air-jumps
      // continuously because rising/falling velocity blocks it.
      const lv = body.linvel();
      grounded.current = Math.abs(lv.y) < 0.05;
    }

    // movement vectors from camera yaw (flatten Y so we stay on the plane).
    camera.getWorldDirection(tmp.forward);
    tmp.forward.y = 0;
    tmp.forward.normalize();
    tmp.right.crossVectors(tmp.forward, camera.up).normalize();

    tmp.move.set(0, 0, 0);
    if (keys[Controls.forward]) tmp.move.add(tmp.forward);
    if (keys[Controls.back]) tmp.move.sub(tmp.forward);
    if (keys[Controls.right]) tmp.move.add(tmp.right);
    if (keys[Controls.left]) tmp.move.sub(tmp.right);

    // analog joystick contribution (touch). Adds on top of any keyboard input.
    if (touchMode) {
      if (touchInput.move.z) tmp.move.addScaledVector(tmp.forward, touchInput.move.z);
      if (touchInput.move.x) tmp.move.addScaledVector(tmp.right, touchInput.move.x);
    }

    const lv = body.linvel();

    // Fall damage (M6): track the peak downward speed while airborne; on the
    // landing frame, convert it to damage (0 below the safe threshold) and reset.
    if (grounded.current) {
      if (peakDown.current > 0) {
        const dmg = fallDamage(peakDown.current);
        if (dmg > 0) player.damage(dmg);
        peakDown.current = 0;
      }
    } else if (-lv.y > peakDown.current) {
      peakDown.current = -lv.y;
    }

    // M7: while mounted on the neon cycle the controller swaps to ride physics —
    // a higher top speed (faster than the hunter, so you outrun it), lower
    // authority (momentum: you spool up), and a gentle coast instead of the
    // snappy on-foot friction. Constants live in cycleMath.js (unit-tested).
    const riding = ride.getRiding();
    const topSpeed = riding ? RIDE_MAX_SPEED : config.moveSpeed;
    const groundAuthority = riding ? RIDE_ACCEL : 1;
    const airAuthority = riding ? RIDE_ACCEL * 0.5 : config.airControl;
    const coastFriction = riding ? RIDE_FRICTION : 0.7;

    // magnitude (<=1) lets a partial joystick push walk slowly; keyboard input
    // (length 1, or ~1.41 on diagonals) clamps to 1 → full speed as before.
    const inputMag = Math.min(tmp.move.length(), 1);
    if (inputMag > 0.0001) {
      tmp.move.normalize();
      const authority = grounded.current ? groundAuthority : airAuthority;
      const speed = topSpeed * inputMag;
      const targetX = tmp.move.x * speed;
      const targetZ = tmp.move.z * speed;
      // lerp horizontal velocity toward target for snappy-but-damped feel.
      const nx = lv.x + (targetX - lv.x) * authority;
      const nz = lv.z + (targetZ - lv.z) * authority;
      body.setLinvel({ x: nx, y: lv.y, z: nz }, true);
    } else if (grounded.current) {
      // friction-style stop when no input and on the ground (cycle coasts).
      body.setLinvel({ x: lv.x * coastFriction, y: lv.y, z: lv.z * coastFriction }, true);
    }

    // jump (only when grounded; latch consumed once).
    if (wantJump.current && grounded.current) {
      const cur = body.linvel();
      body.setLinvel({ x: cur.x, y: config.jumpSpeed, z: cur.z }, true);
    }
    wantJump.current = false;

    // touch throw: consume the latch and hurl the held prop along the view.
    if (touchMode && touchInput.throwing) {
      touchInput.throwing = false;
      if (held.getHeld()) {
        camera.getWorldDirection(tmp.camDir);
        tmp.impulse.x = tmp.camDir.x * throwImpulse;
        tmp.impulse.y = tmp.camDir.y * throwImpulse + 2.0;
        tmp.impulse.z = tmp.camDir.z * throwImpulse;
        held.throwHeld(tmp.impulse);
      }
    }

    // camera rides the capsule at eye height.
    camera.position.set(
      tmp.bodyPos.x,
      tmp.bodyPos.y + (config.eyeHeight - config.capsuleHalfHeight),
      tmp.bodyPos.z,
    );

    // M7: while mounted, publish the live cycle pose (feet on the floor, nose
    // pointing where the camera looks) so Cycle.jsx places the mesh under the
    // rider. tmp.forward is the flattened, normalised camera forward computed
    // above; atan2(x, z) is the YXZ-convention yaw. Alloc-free.
    if (riding) {
      const yawHeading = Math.atan2(tmp.forward.x, tmp.forward.z);
      const feetY = tmp.bodyPos.y - (config.capsuleHalfHeight + config.capsuleRadius);
      ride.setLivePose(tmp.bodyPos.x, feetY, tmp.bodyPos.z, yawHeading);
    }

    // drive the held object to float in front of the camera.
    const heldHandle = held.getHeld();
    if (heldHandle && heldHandle.setHeldTransform) {
      camera.getWorldDirection(tmp.camDir);
      tmp.holdPos
        .copy(camera.position)
        .addScaledVector(tmp.camDir, 1.4)
        .addScaledVector(camera.up, -0.25);
      tmp.quat.copy(camera.quaternion);
      heldHandle.setHeldTransform(
        { x: tmp.holdPos.x, y: tmp.holdPos.y, z: tmp.holdPos.z },
        { x: tmp.quat.x, y: tmp.quat.y, z: tmp.quat.z, w: tmp.quat.w },
      );
    }
  });

  // ---- pointer-lock state propagation ----
  useEffect(() => {
    const controls = lockRef.current;
    if (!controls) return undefined;
    const onLock = () => { isLocked.current = true; onLockChange && onLockChange(true); };
    const onUnlock = () => { isLocked.current = false; onLockChange && onLockChange(false); };
    controls.addEventListener('lock', onLock);
    controls.addEventListener('unlock', onUnlock);
    return () => {
      try {
        controls.removeEventListener('lock', onLock);
        controls.removeEventListener('unlock', onUnlock);
      } catch { /* controls may be torn down already */ }
    };
  }, [onLockChange]);

  return (
    <>
      <RigidBody
        ref={bodyRef}
        position={config.spawn}
        colliders={false}
        enabledRotations={[false, false, false]}
        lockRotations
        linearDamping={config.linearDamping}
        friction={0}
        restitution={0}
        canSleep={false}
        ccd
      >
        <CapsuleCollider args={[config.capsuleHalfHeight, config.capsuleRadius]} />
      </RigidBody>
      {/* Desktop only: pointer lock is unsupported on touch, where the camera
          is driven manually from the on-screen look pad (see touchMode above). */}
      {!touchMode && <PointerLockControls ref={lockRef} />}
    </>
  );
}
