// troikaTextFix — compatibility shim for drei <Text> (troika-three-text) on three r0.175+.
//
// WHY THIS EXISTS (a real, shipping-blocking runtime crash the build/lint gate
// cannot catch): three.js r0.175's `Object3D` constructor unconditionally runs
//     this.customDepthMaterial = undefined;
//     this.customDistanceMaterial = undefined;
// (see node_modules/three/build/three.cjs ~L13200/L13210). But troika-three-text
// 0.52.x — the version drei v10 pulls in — defines `customDepthMaterial` and
// `customDistanceMaterial` as GETTER-ONLY accessors on Text.prototype (they
// lazily derive a depth/distance material from the text material for shadows).
// In ES-module strict mode, assigning to a getter-only accessor throws:
//     TypeError: Cannot set property customDepthMaterial of #<Text> which has only a getter
// That fires inside `new Text()` (via the Object3D super-constructor), so EVERY
// drei <Text> in the arcade crashes on construction → the whole world renders a
// black screen. We cannot bump three / troika / drei (package.json is owner-owned),
// so we reconcile the two at runtime instead.
//
// THE FIX: give each getter-only accessor a setter that swallows three's
// constructor assignment (it only ever assigns `undefined`) while keeping
// troika's derived-material getter authoritative — so the assignment no longer
// throws and text shadows still work exactly as troika intends. If a caller ever
// assigns a real material we honor it as an explicit override (and Text.clone()
// via Mesh.copy stays safe too); otherwise the getter keeps deriving.
//
// Imported FIRST from src/arcade/index.jsx so the prototype is patched during
// module-graph evaluation, before React ever constructs a <Text>. Idempotent:
// it only touches an accessor that is still getter-only.
import { Text } from 'troika-three-text';

function addNoopSetter(proto, name) {
  const desc = Object.getOwnPropertyDescriptor(proto, name);
  if (!desc || !desc.get || desc.set) return; // missing, or already has a setter — leave it
  const backingKey = `__troikaFix_${name}`;
  const derivedGet = desc.get;
  Object.defineProperty(proto, name, {
    configurable: true,
    enumerable: desc.enumerable,
    get() {
      const override = this[backingKey];
      return override !== undefined && override !== null ? override : derivedGet.call(this);
    },
    set(value) {
      // three's Object3D ctor assigns `undefined`; ignore that so troika's
      // derived getter stays authoritative. Honor any genuine override.
      this[backingKey] = value;
    },
  });
}

addNoopSetter(Text.prototype, 'customDepthMaterial');
addNoopSetter(Text.prototype, 'customDistanceMaterial');
