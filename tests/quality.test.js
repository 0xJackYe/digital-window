import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { SCENES, CITIES } from '../src/scenes.js';
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

test('all eight photographic scenes use original JPEGs with verified provenance and dimensions', () => {
  const sources = JSON.parse(fs.readFileSync(new URL('../assets/landscapes/photos/sources.json', import.meta.url)));
  const denver = JSON.parse(fs.readFileSync(new URL('../assets/landscapes/photos/denver-source.json', import.meta.url)));
  const photos = SCENES.filter((scene) => scene.photoReal);
  assert.equal(photos.length, 8);
  assert.equal(new Set(photos.map((scene) => scene.id)).size, 8);
  for (const scene of photos) {
    assert.equal(scene.variants, undefined, `${scene.id} must not cross-fade misregistered AI views`);
    assert.ok(scene.image.endsWith(`/photos/${scene.id}.jpg`));
    const record = scene.id === 'denver' ? denver : sources.images.find((image) => image.id === scene.id);
    assert.ok(record?.author && record.license);
    assert.deepEqual(scene.resolution, [record.nativeDimensions.width, record.nativeDimensions.height]);
    assert.ok(scene.resolution[0] >= 3840);
    const bytes = fs.readFileSync(new URL(scene.image, new URL('../src/', import.meta.url)));
    assert.equal(bytes.readUInt16BE(0), 0xffd8);
    if (record.sha256) assert.equal(createHash('sha256').update(bytes).digest('hex'), record.sha256.toLowerCase(), `${scene.id}: original photo bytes changed`);
  }
});

test('Denver uses Mountain Time with daylight saving and the office foreground', () => {
  const scene = SCENES.find(({ id }) => id === 'denver');
  const city = CITIES.find(({ id }) => id === scene.location);
  assert.equal(scene.interior, 'office');
  assert.equal(city.zone, 'America/Denver');
  assert.ok(Math.abs(city.latitude - 39.74) < .1 && Math.abs(city.longitude + 104.99) < .1);
  assert.equal(getZonedDateParts(new Date('2026-01-15T12:00:00Z'), city.zone).hour, 5);
  assert.equal(getZonedDateParts(new Date('2026-07-15T12:00:00Z'), city.zone).hour, 6);
});

test('photographic grading preserves neutral detail and changes continuously with actual light', () => {
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
