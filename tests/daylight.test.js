import test from 'node:test';
import assert from 'node:assert/strict';
import { DAYLIGHT_PHASES, getDaylightBlend } from '../src/daylight.js';
import { getSolarState, getZonedDateParts } from '../src/solar.js';

// Independent place fixtures deliberately use the requested coordinates rather
// than importing UI scene data: a mislabeled scene must not validate itself.
const places = [
  { id: 'nyc', name: '纽约', latitude: 40.75, longitude: -73.98, timeZone: 'America/New_York' },
  { id: 'prague', name: '布拉格', latitude: 50.0755, longitude: 14.4378, timeZone: 'Europe/Prague' },
  { id: 'kyoto', name: '京都', latitude: 35.009, longitude: 135.778, timeZone: 'Asia/Tokyo' },
  { id: 'hirano', name: '平野', latitude: 35.4262, longitude: 138.9039, timeZone: 'Asia/Tokyo' },
];
const HOUR = 3_600_000;
const stateAt = (date, place) => getSolarState(new Date(date), place);
const blendAt = (date, place) => getDaylightBlend(stateAt(date, place), new Date(date));
const normalized = (blend) => {
  assert.deepEqual(Object.keys(blend.weights), ['dawn', 'morning', 'noon', 'evening', 'night']);
  for (const weight of Object.values(blend.weights)) assert.ok(Number.isFinite(weight) && weight >= 0 && weight <= 1);
  assert.ok(Math.abs(Object.values(blend.weights).reduce((a, b) => a + b, 0) - 1) < 1e-12);
};

test('phase vocabulary uses exactly the five requested labels', () => {
  assert.deepEqual(DAYLIGHT_PHASES.map(({ id, label }) => [id, label]), [
    ['dawn', '黎明'], ['morning', '早晨'], ['noon', '中午'], ['evening', '傍晚'], ['night', '晚上'],
  ]);
});

for (const place of places) {
  test(`${place.name}: all five light states dominate at corresponding astronomical times`, () => {
    const day = stateAt('2026-06-21T12:00:00Z', place);
    const times = {
      dawn: +day.sunrise,
      morning: +day.sunrise + (+day.solarNoon - day.sunrise) * 0.4,
      noon: +day.solarNoon,
      evening: +day.sunset - 20 * 60_000,
      night: +day.solarNoon + 12 * HOUR,
    };
    for (const [phase, instant] of Object.entries(times)) {
      const blend = blendAt(instant, place);
      normalized(blend);
      assert.equal(blend.phase, phase, `${place.name} expected ${phase} at ${new Date(instant).toISOString()}: ${JSON.stringify(blend.weights)}`);
    }
  });
}

test('a low winter Sun still reaches the noon image in London and Prague', () => {
  const london = { latitude: 51.5074, longitude: -0.1278, timeZone: 'Europe/London' };
  for (const place of [london, places[1]]) {
    const events = stateAt('2026-12-21T12:00:00Z', place);
    const state = stateAt(events.solarNoon, place);
    const blend = getDaylightBlend(state, state.solarNoon);
    assert.ok(state.altitude > 0 && state.altitude < 20);
    assert.equal(blend.phase, 'noon');
    assert.ok(blend.weights.noon > 0.999);
    assert.equal(getDaylightBlend(state).phase, 'noon');
  }
});

test('actual noon is not replaced by a hardcoded time such as 12:00 civil time', () => {
  const westChina = { latitude: 39.47, longitude: 75.99, timeZone: 'Asia/Shanghai' };
  const events = stateAt('2026-06-21T06:00:00Z', westChina);
  const actualNoon = stateAt(events.solarNoon, westChina);
  assert.ok(actualNoon.local.hour >= 14);
  assert.equal(getDaylightBlend(actualNoon).phase, 'noon');
});

test('twilight altitude and rising/falling direction select dawn, evening and deep night', () => {
  assert.equal(getDaylightBlend({ altitude: -3, hourAngle: -105 }).phase, 'dawn');
  assert.equal(getDaylightBlend({ altitude: 8, hourAngle: -60 }).phase, 'morning');
  assert.equal(getDaylightBlend({ altitude: 2, hourAngle: 85 }).phase, 'evening');
  for (const altitude of [-10, -30, -90]) {
    for (const hourAngle of [-179, -100, 0, 100, 179]) {
      const blend = getDaylightBlend({ altitude, hourAngle });
      assert.equal(blend.phase, 'night');
      assert.equal(blend.weights.night, 1);
      normalized(blend);
    }
  }
});

test('all weights remain continuous and normalized across full summer/winter days', () => {
  for (const place of places) {
    for (const day of ['2026-06-21', '2026-12-21']) {
      const start = +new Date(`${day}T00:00:00Z`);
      let previous;
      for (let seconds = 0; seconds <= 86_400; seconds += 30) {
        const blend = blendAt(start + seconds * 1000, place);
        normalized(blend);
        if (previous) for (const { id } of DAYLIGHT_PHASES) {
          assert.ok(Math.abs(blend.weights[id] - previous.weights[id]) < 0.06,
            `${place.id} ${day} discontinuity in ${id} at +${seconds}s`);
        }
        previous = blend;
      }
    }
  }
});

test('hour-angle inference closely matches explicit real-instant progress', () => {
  for (const place of places) {
    const day = stateAt('2026-12-21T12:00:00Z', place);
    for (let fraction = 0; fraction <= 1; fraction += 0.1) {
      const instant = +day.sunrise + (day.sunset - day.sunrise) * fraction;
      const state = stateAt(instant, place);
      const inferred = getDaylightBlend(state), explicit = getDaylightBlend(state, instant);
      for (const { id } of DAYLIGHT_PHASES) assert.ok(Math.abs(inferred.weights[id] - explicit.weights[id]) < 0.01);
    }
  }
});

test('Prague spring DST and New York autumn DST do not jump the light blend', () => {
  for (const [place, before, after] of [
    [places[1], '2026-03-29T00:59:59Z', '2026-03-29T01:00:00Z'],
    [places[0], '2026-11-01T05:59:59Z', '2026-11-01T06:00:00Z'],
  ]) {
    const a = blendAt(before, place), b = blendAt(after, place);
    assert.notEqual(getZonedDateParts(new Date(before), place.timeZone).offsetMinutes, getZonedDateParts(new Date(after), place.timeZone).offsetMinutes);
    for (const { id } of DAYLIGHT_PHASES) assert.ok(Math.abs(a.weights[id] - b.weights[id]) < 0.002);
    normalized(a); normalized(b);
  }
});

test('polar-day direction changes and polar-night states remain finite', () => {
  const tromso = { latitude: 69.6492, longitude: 18.9553, timeZone: 'Europe/Oslo' };
  for (const date of ['2026-06-21T22:00:00Z', '2026-12-21T11:00:00Z']) normalized(blendAt(date, tromso));
  const a = getDaylightBlend({ altitude: 3, hourAngle: 179.999 });
  const b = getDaylightBlend({ altitude: 3, hourAngle: -179.999 });
  for (const { id } of DAYLIGHT_PHASES) assert.ok(Math.abs(a.weights[id] - b.weights[id]) < 0.001);
});

test('invalid states and explicit dates fail clearly', () => {
  assert.throws(() => getDaylightBlend(null), TypeError);
  assert.throws(() => getDaylightBlend({ altitude: Number.NaN, hourAngle: 0 }), TypeError);
  assert.throws(() => getDaylightBlend({ altitude: 20, hourAngle: 0 }, 'invalid'), RangeError);
});
