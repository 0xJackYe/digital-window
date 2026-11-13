import test from 'node:test';
import assert from 'node:assert/strict';
import { getCycleSample, capturedFrameURL, mapCycleTime } from '../src/captured-cycle.js';
import { getSolarState, zonedDateTimeToDate } from '../src/solar.js';

const cycle = { directory: '../assets/cycles/cuhk', frameCount: 1427, intervalSeconds: 60, startLocalSecond: 18 * 3600 + 14 * 60 + 1, sourceDate: '2013-03-12', sourcePlace: { latitude: 22.414, longitude: 114.214, zone: 'Asia/Hong_Kong' } };
const denver = { latitude: 39.748, longitude: -104.996, zone: 'America/Denver' };

test('dense captured samples interpolate every second rather than hold each source frame', () => {
  const start = cycle.startLocalSecond + 20 * 60;
  const samples = Array.from({ length: 60 }, (_, second) => getCycleSample(cycle, start + second));
  assert.ok(samples.every(sample => sample.frameA === 20 && sample.frameB === 21));
  samples.forEach((sample, second) => assert.ok(Math.abs(sample.fraction - second / 60) < 1e-10));
  assert.equal(capturedFrameURL(cycle, 21), '../assets/cycles/cuhk/frame0021.jpg');
});

test('whole-day sampling wraps smoothly across midnight and the recorded capture gap', () => {
  for (let second = 0; second < 86400; second++) {
    const sample = getCycleSample(cycle, second);
    assert.ok(sample.frameA >= 0 && sample.frameB < cycle.frameCount && sample.fraction >= 0 && sample.fraction < 1);
  }
  const end = cycle.startLocalSecond + 1426 * 60;
  const seam = getCycleSample(cycle, end + 420);
  assert.equal(seam.frameA, 1426); assert.equal(seam.frameB, 0); assert.equal(seam.fraction, .5); assert.equal(seam.seam, true);
  assert.deepEqual(getCycleSample(cycle, 0), getCycleSample(cycle, 86400));
  const complete = { ...cycle, frameCount: 1441, captureDurationSeconds: 86400 };
  assert.equal(getCycleSample(complete, complete.startLocalSecond + 86399).frameB, 1440);
  assert.equal(getCycleSample(complete, complete.startLocalSecond + 86400).frameA, 0);
  assert.throws(() => getCycleSample({ ...cycle, frameCount: 1 }, 0), RangeError);
});

test('solar mapping aligns recorded sunrise and sunset to the selected location', () => {
  const date = { year: 2026, month: 6, day: 15 };
  const target = getSolarState(zonedDateTimeToDate({ ...date, hour: 12 }, denver.zone), { ...denver, timeZone: denver.zone });
  const source = getSolarState(zonedDateTimeToDate({ year: 2013, month: 3, day: 13, hour: 12 }, cycle.sourcePlace.zone), { ...cycle.sourcePlace, timeZone: cycle.sourcePlace.zone });
  const sourceSecond = instant => { const utc = new Date(+instant + 8 * 3600000); return utc.getUTCHours() * 3600 + utc.getUTCMinutes() * 60 + utc.getUTCSeconds() + utc.getUTCMilliseconds() / 1000; };
  assert.ok(Math.abs(mapCycleTime(target.sunrise, denver, cycle).sourceSecond - sourceSecond(source.sunrise)) < .001);
  assert.ok(Math.abs(mapCycleTime(target.sunset, denver, cycle).sourceSecond - sourceSecond(source.sunset)) < .001);
  assert.equal(mapCycleTime(target.sunrise, denver, cycle).mapping, 'solar-anchors');
});

test('mapped playback remains monotone through every second of a Denver day and DST jump', () => {
  const start = +zonedDateTimeToDate({ year: 2026, month: 3, day: 8, hour: 0 }, denver.zone);
  let previous = mapCycleTime(start, denver, cycle).sourceSecond;
  for (let second = 1; second < 23 * 3600; second++) {
    const current = mapCycleTime(start + second * 1000, denver, cycle).sourceSecond;
    assert.ok(current > previous && current - previous < 3, `source clock discontinuity at ${second}`); previous = current;
  }
});

test('polar dates keep recorded playback in the appropriate daylight or nighttime range', () => {
  const tromso = { latitude: 69.6492, longitude: 18.9553, zone: 'Europe/Oslo' };
  const summer = mapCycleTime('2026-06-21T12:00:00Z', tromso, cycle);
  const winter = mapCycleTime('2026-12-21T12:00:00Z', tromso, cycle);
  assert.equal(summer.mapping, 'polar-day-recording'); assert.equal(winter.mapping, 'polar-night-recording');
  assert.ok(summer.sourceSecond > 6 * 3600 && summer.sourceSecond < 19 * 3600);
  assert.ok(winter.sourceSecond < 7 * 3600 || winter.sourceSecond > 18 * 3600);
});
