import test from 'node:test';
import assert from 'node:assert/strict';
import { IMAGE_PHASES, normalizeWeights, weightsToAlphas, interpolateWeights } from '../src/scene-view.js';

test('all six requested time-of-day layers include a distinct afternoon', () => {
  assert.deepEqual(IMAGE_PHASES, ['dawn', 'morning', 'noon', 'afternoon', 'evening', 'night']);
  assert.deepEqual(normalizeWeights({ afternoon: 1 }), { dawn: 0, morning: 0, noon: 0, afternoon: 1, evening: 0, night: 0 });
  assert.equal(normalizeWeights({ noon: -3, afternoon: NaN, night: Infinity }).noon, 1);
});

test('six DOM layers preserve intended image contributions rather than darkening their blend', () => {
  const target = normalizeWeights({ dawn: 1, morning: 2, noon: 3, afternoon: 4, evening: 5, night: 6 });
  const alpha = weightsToAlphas(target);
  for (let i = 0; i < IMAGE_PHASES.length; i++) {
    let contribution = alpha[IMAGE_PHASES[i]];
    for (let j = i + 1; j < IMAGE_PHASES.length; j++) contribution *= 1 - alpha[IMAGE_PHASES[j]];
    assert.ok(Math.abs(contribution - target[IMAGE_PHASES[i]]) < 1e-12);
  }
});

test('afternoon-to-night transition has continuous normalized nonnegative weights', () => {
  for (let index = 0; index <= 1000; index++) {
    const progress = index / 1000, value = interpolateWeights({ afternoon: 1 }, { night: 1 }, progress);
    assert.ok(Math.abs(value.afternoon - (1 - progress)) < 1e-12);
    assert.ok(Math.abs(value.night - progress) < 1e-12);
    assert.ok(Math.abs(Object.values(value).reduce((sum, weight) => sum + weight, 0) - 1) < 1e-12);
  }
});
