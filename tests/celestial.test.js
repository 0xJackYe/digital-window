import test from 'node:test';
import assert from 'node:assert/strict';
import { getCelestialState, getMoonPosition, getMoonIllumination, getAtmosphericRefraction, horizontalDirection } from '../src/celestial.js';
import { getSolarPosition } from '../src/solar.js';

const circularDistance = (a, b, cycle = 360) => Math.abs(((a - b + cycle / 2) % cycle + cycle) % cycle - cycle / 2);
const vectorDistance = (a, b) => Math.hypot(...a.map((value, index) => value - b[index]));
const near = (actual, expected, tolerance, message) => assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} vs ${expected}`);
const kyoto = { latitude: 35.0031, longitude: 135.7781 };

// Independent US Naval Observatory API v4.0.1 snapshots, retrieved 2026-11-11.
// The API's hc is GEOCENTRIC, airless altitude; pa is its topocentric parallax
// correction. It must not be compared directly with an apparent refracted Moon.
// Primary source and parameter definitions: https://aa.usno.navy.mil/data/api
const usno = [
  { date: '2024-04-08T18:00:00Z', latitude: 32.7767, longitude: -96.797,
    altitude: 64.23387, azimuth: 164.129088, parallax: 0.445528, illumination: 0,
    source: 'https://aa.usno.navy.mil/api/celnav?date=2024-4-8&time=18:00:00&coords=32.7767,-96.7970' },
  { date: '2026-11-11T00:00:00Z', ...kyoto,
    altitude: 6.896823, azimuth: 129.203672, parallax: 0.902378, illumination: 0.03,
    source: 'https://aa.usno.navy.mil/api/celnav?date=2026-11-11&time=00:00:00&coords=35.0031,135.7781' },
  { date: '2024-04-24T04:00:00Z', latitude: 51.5074, longitude: -0.1278,
    altitude: 5.73954, azimuth: 236.222306, parallax: 0.909938, illumination: 1,
    source: 'https://aa.usno.navy.mil/api/celnav?date=2024-4-24&time=04:00:00&coords=51.5074,-0.1278' },
  { date: '2024-04-15T20:00:00Z', latitude: 50.0755, longitude: 14.4378,
    altitude: 51.559335, azimuth: 245.75651, parallax: 0.579221, illumination: 0.5,
    source: 'https://aa.usno.navy.mil/api/celnav?date=2024-4-15&time=20:00:00&coords=50.0755,14.4378' },
  { date: '2024-04-24T01:00:00Z', latitude: 40.75, longitude: -73.98,
    altitude: 12.511364, azimuth: 122.442584, parallax: 0.8941, illumination: 1,
    source: 'https://aa.usno.navy.mil/api/celnav?date=2024-4-24&time=01:00:00&coords=40.75,-73.98' },
];

test('lunar direction, parallax and illumination agree with five independent USNO ephemerides', () => {
  for (const sample of usno) {
    const { moon } = getCelestialState(new Date(sample.date), sample);
    near(moon.geocentricAltitude, sample.altitude, 0.04, `${sample.date} geocentric altitude`);
    assert.ok(circularDistance(moon.geocentricAzimuth, sample.azimuth) < 0.04, `${sample.source} azimuth`);
    near(moon.geometricAltitude, sample.altitude - sample.parallax, 0.04, `${sample.date} topocentric altitude`);
    near(moon.illumination, sample.illumination, 0.011, `${sample.date} USNO percent-precision illumination`);
    assert.ok(moon.altitude > moon.geometricAltitude);
    assert.ok(moon.geometricAltitude < moon.geocentricAltitude);
  }
});

test('four USNO primary phase instants follow ecliptic longitude, not fixed monthly clock times', () => {
  // https://aa.usno.navy.mil/api/moon/phases/date?date=2024-4-1&nump=4
  for (const [date, phase, illumination] of [
    ['2024-04-02T03:15:00Z', 0.75, 0.5],
    ['2024-04-08T18:21:00Z', 0, 0],
    ['2024-04-15T19:13:00Z', 0.25, 0.5],
    ['2024-04-23T23:49:00Z', 0.5, 1],
  ]) {
    const moon = getMoonIllumination(new Date(date));
    assert.ok(circularDistance(moon.phase, phase, 1) < 0.0005, `${date} phase ${moon.phase}`);
    near(moon.illumination, illumination, 0.015, `${date} fraction illuminated`);
    assert.equal(moon.fraction, moon.illumination);
  }
});

test('2024 eclipse new Moon is dark while the near-full Moon is illuminated', () => {
  const newMoon = getMoonIllumination(new Date('2024-04-08T18:21:00Z'));
  const fullMoon = getMoonIllumination(new Date('2024-04-23T23:49:00Z'));
  assert.ok(newMoon.illumination < 0.0001);
  assert.ok(fullMoon.illumination > 0.999);
  const waxing = getMoonIllumination(new Date('2024-04-12T00:00:00Z'));
  const waning = getMoonIllumination(new Date('2024-04-28T00:00:00Z'));
  assert.equal(waxing.waxing, true); assert.equal(waning.waxing, false);
});

test('the Sun reuses the existing astronomical model exactly', () => {
  for (const sample of usno) {
    const date = new Date(sample.date), state = getCelestialState(date, sample);
    const expected = getSolarPosition(date, sample.latitude, sample.longitude);
    assert.equal(state.sun.altitude, expected.altitude);
    assert.equal(state.sun.azimuth, expected.azimuth);
  }
  const dallas = getCelestialState(new Date('2024-04-08T18:00:00Z'), usno[0]);
  near(dallas.sun.altitude, 63.938312, 0.04, 'USNO eclipse-day solar altitude');
  near(dallas.sun.azimuth, 163.560228, 0.04, 'USNO eclipse-day solar azimuth');
});

test('lunar motion and phase change at the same clock hour on consecutive days', () => {
  const a = getCelestialState(new Date('2026-11-11T15:00:00Z'), kyoto);
  const b = getCelestialState(new Date('2026-11-12T15:00:00Z'), kyoto);
  assert.ok(vectorDistance(a.moon.direction, b.moon.direction) > 0.05);
  assert.ok(circularDistance(a.moon.phase, b.moon.phase, 1) > 0.02);
  const later = getCelestialState(new Date('2026-11-11T16:00:00Z'), kyoto);
  assert.ok(vectorDistance(a.moon.direction, later.moon.direction) > 0.1);
});

test('positions are continuous through UTC midnight and both DST jumps', () => {
  for (const [before, after, location] of [
    ['2026-11-10T23:59:59Z', '2026-11-11T00:00:00Z', kyoto],
    ['2026-03-29T00:59:59Z', '2026-03-29T01:00:00Z', { latitude: 50.0755, longitude: 14.4378 }],
    ['2026-11-01T05:59:59Z', '2026-11-01T06:00:00Z', { latitude: 40.75, longitude: -73.98 }],
  ]) {
    const a = getCelestialState(new Date(before), location), b = getCelestialState(new Date(after), location);
    for (const body of ['sun', 'moon']) assert.ok(vectorDistance(a[body].direction, b[body].direction) < 0.0002);
    assert.ok(circularDistance(a.moon.phase, b.moon.phase, 1) < 0.00001);
    assert.ok(Math.abs(a.nightFactor - b.nightFactor) < 0.001);
  }
});

test('display time zones cannot change the physical direction at a real instant', () => {
  const instant = new Date('2026-11-11T12:34:56Z');
  assert.deepEqual(getCelestialState(instant, { ...kyoto, timeZone: 'Asia/Tokyo' }),
    getCelestialState(instant, { ...kyoto, timeZone: 'America/New_York' }));
  assert.deepEqual(getMoonPosition(instant, kyoto), getMoonPosition(instant, kyoto.latitude, kyoto.longitude));
});

test('horizon refraction is positive, bounded and continuous, including below-horizon fade', () => {
  near(getAtmosphericRefraction(0), 0.483, 0.002, 'standard horizon refraction');
  assert.ok(getAtmosphericRefraction(5) < getAtmosphericRefraction(0));
  assert.equal(getAtmosphericRefraction(-3), 0); assert.equal(getAtmosphericRefraction(-90), 0);
  assert.equal(getAtmosphericRefraction(90), 0);
  for (const boundary of [-3, -1, 0, 5, 85, 90]) {
    assert.ok(Math.abs(getAtmosphericRefraction(boundary - 0.00001) - getAtmosphericRefraction(boundary + 0.00001)) < 0.0001);
  }
  for (let altitude = -90; altitude <= 90; altitude += 0.25) {
    const correction = getAtmosphericRefraction(altitude);
    assert.ok(Number.isFinite(correction) && correction >= 0 && correction < 0.7);
  }
});

test('direction vectors are normalized in explicit east/north/up coordinates', () => {
  near(vectorDistance(horizontalDirection(0, 0), [0, 1, 0]), 0, 1e-12, 'north');
  near(vectorDistance(horizontalDirection(90, 0), [1, 0, 0]), 0, 1e-12, 'east');
  near(vectorDistance(horizontalDirection(270, 0), [-1, 0, 0]), 0, 1e-12, 'west');
  near(vectorDistance(horizontalDirection(123, 90), [0, 0, 1]), 0, 1e-12, 'zenith');
  for (const latitude of [-90, -69.65, 0, 35, 69.65, 90]) {
    const state = getCelestialState(new Date('2026-06-21T12:00:00Z'), { latitude, longitude: 0 });
    for (const body of [state.sun, state.moon]) {
      near(Math.hypot(...body.direction), 1, 1e-12, 'unit vector');
      assert.ok(body.azimuth >= 0 && body.azimuth < 360);
      assert.ok(body.altitude >= -90 && body.altitude <= 90);
    }
    assert.ok(Number.isFinite(state.moon.parallacticAngle));
    assert.ok(state.moon.distance > 350000 && state.moon.distance < 410000);
  }
});

test('night factor follows true solar altitude and moon tilt uses real limb/parallactic angles', () => {
  const noon = getCelestialState(new Date('2026-06-21T03:00:00Z'), kyoto);
  const night = getCelestialState(new Date('2026-06-21T15:00:00Z'), kyoto);
  assert.equal(noon.nightFactor, 0); assert.equal(night.nightFactor, 1);
  near(night.moon.tiltAngle, night.moon.brightLimbAngle - night.moon.parallacticAngle, 1e-12, 'lunar disk tilt');
  assert.ok(Number.isFinite(night.moon.brightLimbAngle));
});

test('invalid instants, coordinates and horizontal angles fail clearly', () => {
  for (const value of [null, undefined, 'invalid', new Date('invalid')]) assert.throws(() => getCelestialState(value, kyoto), RangeError);
  for (const location of [{ latitude: 91, longitude: 0 }, { latitude: 0, longitude: 181 }, { latitude: NaN, longitude: 0 }, { latitude: 0, longitude: Infinity }]) {
    assert.throws(() => getCelestialState(new Date(), location), RangeError);
    assert.throws(() => getMoonPosition(new Date(), location), RangeError);
  }
  assert.throws(() => getMoonIllumination('invalid'), RangeError);
  assert.throws(() => getAtmosphericRefraction(NaN), RangeError);
  assert.throws(() => horizontalDirection(NaN, 0), RangeError);
});
