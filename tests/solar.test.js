import test from 'node:test';
import assert from 'node:assert/strict';
import { getSolarPosition, getSolarState, getZonedDateParts, zonedDateTimeToDate } from '../src/solar.js';

const london = { latitude: 51.5074, longitude: -0.1278, timeZone: 'Europe/London' };
const beijing = { latitude: 39.9042, longitude: 116.4074, timeZone: 'Asia/Shanghai' };
const tromso = { latitude: 69.6492, longitude: 18.9553, timeZone: 'Europe/Oslo' };
const localMinutes = (date, timeZone) => {
  const p = getZonedDateParts(date, timeZone);
  return p.hour * 60 + p.minute;
};

test('London summer Sun, long daylight and BST sunrise/sunset agree with known solstice ranges', () => {
  const state = getSolarState(new Date('2026-06-21T12:00:00Z'), london);
  assert.equal(state.time, '13:00');
  assert.equal(state.offsetText, 'UTC+01:00');
  assert.equal(state.phase, 'day');
  assert.ok(state.altitude > 61 && state.altitude < 63);
  assert.ok(localMinutes(state.sunrise, london.timeZone) >= 280 && localMinutes(state.sunrise, london.timeZone) <= 290);
  assert.ok(localMinutes(state.sunset, london.timeZone) >= 1275 && localMinutes(state.sunset, london.timeZone) <= 1290);
  assert.ok(state.sunset - state.sunrise > 16 * 3_600_000);
});

test('London winter has a low noon Sun, late sunrise and early sunset', () => {
  const state = getSolarState(new Date('2026-12-21T12:00:00Z'), london);
  assert.equal(state.time, '12:00');
  assert.equal(state.offsetText, 'UTC+00:00');
  assert.ok(state.altitude > 14 && state.altitude < 16);
  assert.ok(localMinutes(state.sunrise, london.timeZone) >= 480 && localMinutes(state.sunrise, london.timeZone) <= 490);
  assert.ok(localMinutes(state.sunset, london.timeZone) >= 950 && localMinutes(state.sunset, london.timeZone) <= 960);
  assert.ok(state.sunset - state.sunrise < 8 * 3_600_000);
});

test('Beijing summer and winter noon altitude and midnight darkness follow the seasons', () => {
  const summer = getSolarState(new Date('2026-06-21T04:00:00Z'), beijing);
  const winter = getSolarState(new Date('2026-12-21T04:00:00Z'), beijing);
  const midnight = getSolarState(new Date('2026-06-20T16:00:00Z'), beijing);
  assert.equal(summer.time, '12:00');
  assert.ok(summer.altitude > 72 && summer.altitude < 74);
  assert.ok(winter.altitude > 26 && winter.altitude < 28);
  assert.equal(midnight.phase, 'night');
  assert.equal(midnight.daylight, 0);
  assert.equal(midnight.local.dateKey, '2026-06-21');
  assert.ok(localMinutes(summer.sunrise, beijing.timeZone) >= 280 && localMinutes(summer.sunrise, beijing.timeZone) <= 295);
});

test('same instant uses selected coordinates, not the computer clock time zone', () => {
  const instant = new Date('2026-11-11T04:00:00Z');
  const uk = getSolarState(instant, london);
  const cn = getSolarState(instant, beijing);
  assert.equal(uk.time, '04:00');
  assert.equal(cn.time, '12:00');
  assert.equal(uk.phase, 'night');
  assert.equal(cn.phase, 'day');
  assert.ok(uk.altitude < -20);
});

test('timezone display alone does not change astronomical position at the same coordinates', () => {
  const instant = new Date('2026-06-21T12:00:00Z');
  const a = getSolarState(instant, london);
  const b = getSolarState(instant, { ...london, timeZone: 'Asia/Shanghai' });
  assert.equal(a.altitude, b.altitude);
  assert.equal(a.azimuth, b.azimuth);
  assert.notEqual(a.time, b.time);
});

test('Tromsø handles polar day and polar night without invalid Dates', () => {
  const summer = getSolarState(new Date('2026-06-21T22:00:00Z'), tromso);
  const winter = getSolarState(new Date('2026-12-21T11:00:00Z'), tromso);
  assert.equal(summer.polarDay, true);
  assert.equal(summer.sunrise, null);
  assert.equal(summer.sunset, null);
  assert.equal(summer.sunriseText, '极昼');
  assert.ok(summer.altitude > 0);
  assert.equal(winter.polarNight, true);
  assert.equal(winter.sunrise, null);
  assert.equal(winter.sunsetText, '极夜');
  assert.ok(winter.altitude < 0);
  for (const s of [summer, winter]) {
    assert.ok(Number.isFinite(s.solarNoon.getTime()));
    assert.ok(s.sunX >= 0 && s.sunX <= 100);
    assert.ok(s.sunY >= 0 && s.sunY <= 100);
  }
});

test('London DST changes are applied at the exact real instant', () => {
  const before = getZonedDateParts(new Date('2026-03-29T00:59:59Z'), london.timeZone);
  const after = getZonedDateParts(new Date('2026-03-29T01:00:00Z'), london.timeZone);
  assert.equal(before.hour, 0);
  assert.equal(before.offsetMinutes, 0);
  assert.equal(after.hour, 2);
  assert.equal(after.offsetMinutes, 60);
  const dstDay = getSolarState(new Date('2026-03-29T12:00:00Z'), london);
  assert.equal(getZonedDateParts(dstDay.sunrise, london.timeZone).dateKey, '2026-03-29');
});

test('local wall time conversion rejects skipped DST time and selects earlier repeated time', () => {
  assert.equal(zonedDateTimeToDate({ year: 2026, month: 6, day: 21, hour: 13 }, london.timeZone).toISOString(), '2026-06-21T12:00:00.000Z');
  assert.throws(() => zonedDateTimeToDate({ year: 2026, month: 3, day: 29, hour: 1, minute: 30 }, london.timeZone), RangeError);
  assert.equal(zonedDateTimeToDate({ year: 2026, month: 10, day: 25, hour: 1, minute: 30 }, london.timeZone).toISOString(), '2026-10-25T00:30:00.000Z');
});

test('sunrise/sunset roots use the atmospheric solar-disc horizon convention', () => {
  const state = getSolarState(new Date('2026-06-21T12:00:00Z'), london);
  assert.ok(Math.abs(getSolarPosition(state.sunrise, london.latitude, london.longitude).altitude + 0.833) < 0.001);
  assert.ok(Math.abs(getSolarPosition(state.sunset, london.latitude, london.longitude).altitude + 0.833) < 0.001);
  assert.ok(Math.abs(getSolarPosition(state.solarNoon, london.latitude, london.longitude).hourAngle) < 0.001);
});

test('invalid dates, coordinates and IANA time zones fail clearly', () => {
  assert.throws(() => getSolarState(new Date('invalid'), london), RangeError);
  assert.throws(() => getSolarState(new Date(), { ...london, latitude: 91 }), RangeError);
  assert.throws(() => getSolarState(new Date(), { ...london, longitude: Number.NaN }), RangeError);
  assert.throws(() => getZonedDateParts(new Date(), 'Missing/Time_Zone'), RangeError);
});
