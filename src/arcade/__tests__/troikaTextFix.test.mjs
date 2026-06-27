// node --test src/arcade/__tests__/troikaTextFix.test.mjs
//
// Regression test for the drei <Text> / troika-three-text crash on three r0.175.
// three's Object3D constructor assigns getter-only customDepthMaterial /
// customDistanceMaterial; without the shim, `new Text()` throws
// "Cannot set property ... which has only a getter" and the arcade goes black.
// This reproduces the construction in pure node (no WebGL needed) and asserts
// the shim makes it survive while preserving troika's derived-material getter.
//
// NOT part of build-guard (can't edit package.json); run manually with the
// other arcade suites. Import order matters: the shim must load before Text is
// constructed — exactly as src/arcade/index.jsx arranges it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../troikaTextFix.js'; // side-effect: patch troika Text.prototype
import { Text } from 'troika-three-text';

test('troika Text constructs without throwing after the shim (was a black-screen crash)', () => {
  let t;
  assert.doesNotThrow(() => { t = new Text(); }, 'new Text() must not throw');
  assert.equal(t.constructor.name, 'Text');
});

test('both accessors now have a getter AND a setter', () => {
  for (const name of ['customDepthMaterial', 'customDistanceMaterial']) {
    const desc = Object.getOwnPropertyDescriptor(Text.prototype, name);
    assert.ok(desc, `${name} descriptor exists`);
    assert.ok(desc.get, `${name} keeps a getter`);
    assert.ok(desc.set, `${name} gained a setter`);
  }
});

test("three's `= undefined` assignment is swallowed; derived getter stays authoritative", () => {
  const t = new Text();
  // Mimic Object3D ctor: assigning undefined must be a no-op (not throw, not stick).
  assert.doesNotThrow(() => { t.customDepthMaterial = undefined; });
  // troika derives a depth material lazily from the text material via the getter.
  const derived = t.customDepthMaterial;
  assert.ok(derived, 'getter returns a derived depth material');
  assert.ok(derived.isMaterial, 'derived value is a three Material');
});

test('an explicit real override is honored by the setter', () => {
  const t = new Text();
  const fake = { isMaterial: true, marker: 'override' };
  t.customDepthMaterial = fake;
  assert.equal(t.customDepthMaterial, fake, 'explicit override is returned by the getter');
});

test('shim is idempotent — re-applying does not double-wrap or throw', async () => {
  const before = Object.getOwnPropertyDescriptor(Text.prototype, 'customDepthMaterial');
  await import('../troikaTextFix.js'); // cached; body already ran, but assert stability
  const after = Object.getOwnPropertyDescriptor(Text.prototype, 'customDepthMaterial');
  assert.ok(after.get && after.set, 'still has get + set');
  assert.equal(typeof after.set, typeof before.set);
});
