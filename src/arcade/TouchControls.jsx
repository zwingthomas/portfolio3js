import { useCallback, useEffect, useRef, useState } from 'react';
import { touchInput } from './touchInput';
import { joystickVector, lookDelta } from './touchMath';

// On-screen touch/mobile controls for the arcade (M1 fallback). Rendered as a
// DOM overlay ABOVE the canvas (not inside r3f) so it works without pointer
// lock, which mobile browsers don't support.
//
// Layout:
//   • bottom-left  — virtual joystick (analog WASD → touchInput.move)
//   • the rest of the screen — a transparent "look" surface: drag to rotate the
//     camera (→ touchInput.look)
//   • bottom-right — JUMP / GRAB / THROW action buttons
//
// Movement & look are written to the shared touchInput singleton and read by
// the Player each frame. JUMP and GRAB dispatch synthetic keyboard events
// (Space / KeyE) so the EXISTING desktop window-level handlers — including the
// Traxy kiosk's "press E nearby" — fire identically. THROW sets a latch the
// Player consumes (pointer lock gating doesn't apply on touch).
//
// Pointer Events give us reliable multitouch via pointerId: the joystick and
// each button claim their own pointer (stopPropagation), and any pointer that
// reaches the root surface drives the camera look.

const JOY_RADIUS = 56; // px — max thumb travel from the stick centre

export default function TouchControls() {
  const rootRef = useRef(null);
  const joyBaseRef = useRef(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const [joyActive, setJoyActive] = useState(false);

  const joyPointer = useRef(null); // pointerId currently driving the joystick
  const joyCentre = useRef({ x: 0, y: 0 });
  const lookPointer = useRef(null); // pointerId currently driving look
  const lookLast = useRef({ x: 0, y: 0 });

  // Clear all input on unmount so a re-entry starts neutral, and release any
  // in-flight pointer captures so they can't leak to the next mount.
  useEffect(() => () => {
    if (lookPointer.current !== null) {
      try { rootRef.current?.releasePointerCapture?.(lookPointer.current); } catch { /* ignore */ }
    }
    if (joyPointer.current !== null) {
      try { joyBaseRef.current?.releasePointerCapture?.(joyPointer.current); } catch { /* ignore */ }
    }
    touchInput.move.x = 0;
    touchInput.move.z = 0;
    touchInput.look.dx = 0;
    touchInput.look.dy = 0;
    touchInput.throwing = false;
    joyPointer.current = null;
    lookPointer.current = null;
  }, []);

  const fireKey = useCallback((code) => {
    try {
      window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
    } catch { /* environments without KeyboardEvent ctor — ignore */ }
  }, []);

  // ----------------------------- joystick --------------------------------
  const updateJoy = useCallback((clientX, clientY) => {
    const dx = clientX - joyCentre.current.x;
    const dy = clientY - joyCentre.current.y;
    const v = joystickVector(dx, dy, JOY_RADIUS);
    setKnob({ x: v.knobX, y: v.knobY });
    touchInput.move.x = v.moveX;
    touchInput.move.z = v.moveZ;
  }, []);

  const onJoyDown = useCallback((e) => {
    e.stopPropagation();
    if (e.cancelable) e.preventDefault(); // suppress iOS callout / scroll
    if (joyPointer.current !== null) return;
    const base = joyBaseRef.current;
    if (base) {
      const r = base.getBoundingClientRect();
      joyCentre.current = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
    joyPointer.current = e.pointerId;
    setJoyActive(true);
    try { base?.setPointerCapture?.(e.pointerId); } catch { /* ignore */ }
    updateJoy(e.clientX, e.clientY);
  }, [updateJoy]);

  const onJoyMove = useCallback((e) => {
    if (e.pointerId !== joyPointer.current) return;
    e.stopPropagation();
    updateJoy(e.clientX, e.clientY);
  }, [updateJoy]);

  const endJoy = useCallback((e) => {
    if (e.pointerId !== joyPointer.current) return;
    e.stopPropagation();
    try { joyBaseRef.current?.releasePointerCapture?.(e.pointerId); } catch { /* ignore */ }
    joyPointer.current = null;
    setJoyActive(false);
    setKnob({ x: 0, y: 0 });
    touchInput.move.x = 0;
    touchInput.move.z = 0;
  }, []);

  // ------------------------------- look ----------------------------------
  const onRootDown = useCallback((e) => {
    // Only the look surface itself drives the camera — taps that land on the
    // joystick/buttons (children, which stopPropagation) or on sibling HUD
    // controls (the EXIT button) must never start a look-drag.
    if (e.target !== e.currentTarget) return;
    if (lookPointer.current !== null) return; // one look finger at a time
    if (e.cancelable) e.preventDefault();
    lookPointer.current = e.pointerId;
    lookLast.current = { x: e.clientX, y: e.clientY };
    try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch { /* ignore */ }
  }, []);

  const onRootMove = useCallback((e) => {
    if (e.pointerId !== lookPointer.current) return;
    const dx = e.clientX - lookLast.current.x;
    const dy = e.clientY - lookLast.current.y;
    lookLast.current = { x: e.clientX, y: e.clientY };
    const { yaw, pitch } = lookDelta(dx, dy);
    touchInput.look.dx += yaw;
    touchInput.look.dy += pitch;
  }, []);

  // Fires for both pointerup and pointercancel (iOS system gestures). Release
  // the capture and discard any residual look delta so a cancelled drag can't
  // leak one last frame of camera rotation.
  const onRootUp = useCallback((e) => {
    if (e.pointerId !== lookPointer.current) return;
    try { e.currentTarget?.releasePointerCapture?.(e.pointerId); } catch { /* ignore */ }
    lookPointer.current = null;
    touchInput.look.dx = 0;
    touchInput.look.dy = 0;
  }, []);

  // ----------------------------- buttons ---------------------------------
  const btnHandlers = (onPress) => ({
    onPointerDown: (e) => {
      e.stopPropagation();
      if (e.cancelable) e.preventDefault(); // block iOS double-tap zoom / focus jank
      onPress();
    },
    onPointerUp: (e) => { e.stopPropagation(); },
    onPointerCancel: (e) => { e.stopPropagation(); },
  });

  return (
    <div
      ref={rootRef}
      onPointerDown={onRootDown}
      onPointerMove={onRootMove}
      onPointerUp={onRootUp}
      onPointerCancel={onRootUp}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 2,
        touchAction: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {/* virtual joystick (bottom-left) */}
      <div
        ref={joyBaseRef}
        onPointerDown={onJoyDown}
        onPointerMove={onJoyMove}
        onPointerUp={endJoy}
        onPointerCancel={endJoy}
        style={{
          position: 'absolute',
          left: 28,
          bottom: 36,
          width: JOY_RADIUS * 2,
          height: JOY_RADIUS * 2,
          borderRadius: '50%',
          border: '2px solid rgba(54,214,255,0.55)',
          background: 'rgba(10,4,32,0.35)',
          boxShadow: joyActive ? '0 0 18px rgba(54,214,255,0.6)' : 'none',
          touchAction: 'none',
        }}
      >
        <div
          aria-hidden
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: 52,
            height: 52,
            marginLeft: -26,
            marginTop: -26,
            transform: `translate(${knob.x}px, ${knob.y}px)`,
            borderRadius: '50%',
            background: 'radial-gradient(circle at 35% 30%, #6df0ff, #1b8bd6)',
            boxShadow: '0 0 12px rgba(54,214,255,0.8)',
            pointerEvents: 'none',
          }}
        />
      </div>

      {/* action buttons (bottom-right) */}
      <div
        style={{
          position: 'absolute',
          right: 24,
          bottom: 36,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: 14,
          touchAction: 'none',
        }}
      >
        <div style={{ display: 'flex', gap: 14 }}>
          <ActionButton label="GRAB" color="#36ff9e" {...btnHandlers(() => fireKey('KeyE'))} />
          <ActionButton label="THROW" color="#ff5cf4" {...btnHandlers(() => { touchInput.throwing = true; })} />
        </div>
        <ActionButton label="JUMP" color="#ffd23b" big {...btnHandlers(() => fireKey('Space'))} />
      </div>

      {/* hint */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: 56,
          left: '50%',
          transform: 'translateX(-50%)',
          color: '#bfe9ff',
          fontFamily: 'monospace',
          fontSize: 12,
          textAlign: 'center',
          pointerEvents: 'none',
          textShadow: '0 0 8px #000',
        }}
      >
        drag to look · stick to move
      </div>
    </div>
  );
}

function ActionButton({ label, color, big = false, ...handlers }) {
  const size = big ? 86 : 70;
  return (
    <button
      type="button"
      aria-label={label}
      {...handlers}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        border: `2px solid ${color}`,
        background: 'rgba(10,4,32,0.5)',
        color,
        fontFamily: 'monospace',
        fontWeight: 800,
        fontSize: big ? 15 : 13,
        letterSpacing: 0.5,
        touchAction: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        WebkitTapHighlightColor: 'transparent',
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );
}
