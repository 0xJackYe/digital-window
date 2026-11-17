import test from 'node:test';
import assert from 'node:assert/strict';
import { SCENES, CITIES, GENERATED_PHASES } from '../src/scenes.js';
import { computeRenderSize, photographicGrade } from '../src/relighting.js';
import { getLightingState } from '../src/lighting.js';
import { getZonedDateParts } from '../src/solar.js';

test('4K and high-DPI output retain the full physical pixel dimensions', () => {
  for (const [w, h, dpr] of [[3840, 2160, 1], [1920, 1080, 2], [2560, 1440, 1.5], [2160, 3840, 1]]) {
    const result = computeRenderSize(w, h, dpr);
    assert.equal(result.width, Math.round(w * dpr));
    assert.equal(result.height, Math.round(h * dpr));
    assert.equal(result.limited, false);
  }
  const limited = computeRenderSize(7680, 4320, 2, { maxWidth: 8192, maxHeight: 4096 });
  assert.ok(limited.width <= 8192 && limited.height <= 4096 && limited.limited);
  assert.ok(Math.abs(limited.width / limited.height - 16 / 9) < .001);
  assert.throws(() => computeRenderSize(0, 2160), RangeError);
});

test('generated catalog declares eight distinct six-period asset sets with separate afternoon slots', () => {
  // This checks the requested catalog contract only. Actual output existence,
  // dimensions and visual quality belong to the strict asset readiness check;
  // passing this test does not mean the 48 images have been generated.
  assert.deepEqual(GENERATED_PHASES, ['dawn', 'morning', 'noon', 'afternoon', 'evening', 'night']);
  assert.equal(SCENES.length, 8);
  assert.equal(new Set(SCENES.map(scene => scene.id)).size, 8);
  const paths = new Set();
  for (const scene of SCENES) {
    assert.equal(scene.generated, true, scene.id);
    assert.deepEqual(Object.keys(scene.variants), GENERATED_PHASES, scene.id);
    assert.equal(scene.resolution, undefined, `${scene.id}: requested dimensions must not be represented as native output dimensions`);
    assert.equal(scene.image, scene.variants.noon, `${scene.id}: card preview uses the noon slot`);
    assert.ok(CITIES.some(city => city.id === scene.location), `${scene.id}: daylight reference must exist`);
    for (const phase of GENERATED_PHASES) {
      const path = scene.variants[phase];
      assert.equal(path, `../assets/landscapes/generated/${scene.id}/${phase}.png`);
      assert.ok(!paths.has(path), `${scene.id}/${phase}: each requested output has its own path`);
      paths.add(path);
    }
  }
  assert.equal(paths.size, 48);
});

test('Denver keeps Mountain Time and daylight saving without an interior foreground', () => {
  const scene = SCENES.find(({ id }) => id === 'denver');
  const city = CITIES.find(({ id }) => id === scene.location);
  assert.equal(scene.interior, undefined);
  assert.equal(city.zone, 'America/Denver');
  assert.ok(Math.abs(city.latitude - 39.74) < .1 && Math.abs(city.longitude + 104.99) < .1);
  assert.equal(getZonedDateParts(new Date('2026-01-15T12:00:00Z'), city.zone).hour, 5);
  assert.equal(getZonedDateParts(new Date('2026-07-15T12:00:00Z'), city.zone).hour, 6);
});

test('active catalog excludes original-photo, recorded-video and office-frame scene modes', () => {
  assert.equal(SCENES.some(scene => scene.id === 'cuhk'), false);
  for (const scene of SCENES) {
    assert.equal(scene.photoReal, undefined, scene.id);
    assert.equal(scene.cycle, undefined, scene.id);
    assert.equal(scene.isVideo, undefined, scene.id);
    assert.equal(scene.interior, undefined, scene.id);
    assert.ok(!/\/(?:photos|cycles)\//.test(scene.image), scene.id);
  }
});

test('legacy photographic-grade utility remains continuous independently of generated-image rendering', () => {
  const neutral = photographicGrade({ daylight: 1, nightFactor: 0, exposure: 1, sun: { altitude: 60, strength: 0 }, moon: { strength: 0 } });
  assert.ok(neutral.baseTint.every((value) => Math.abs(value - 1) < 1e-8));
  assert.deepEqual(neutral.sunTint, [0, 0, 0]);
  assert.deepEqual(neutral.moonTint, [0, 0, 0]);
  const light = (altitude, azimuth = 160) => getLightingState({ sun: { altitude, azimuth }, moon: { altitude: 25, azimuth: 80, illumination: .8 } });
  const a = photographicGrade(light(3)), b = photographicGrade(light(3.01));
  assert.notDeepEqual(a.baseTint, b.baseTint);
  assert.ok(Math.abs(a.baseTint[0] - b.baseTint[0]) < .001);
  assert.ok(photographicGrade(light(-30)).baseTint[0] < photographicGrade(light(60)).baseTint[0]);
});
