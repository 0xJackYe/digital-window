import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateNaturalLight, relativeOpticalAirMass, horizonDiscFraction } from '../src/natural-light.js';
import { getCelestialState } from '../src/celestial.js';

const RAD = Math.PI / 180;
const make = (altitude = 45, azimuth = 180, moon = {}) => ({ sun: { altitude, azimuth }, moon: { altitude: 60, azimuth: 90, illumination: 1, phase: .5, ...moon } });
const y = (color) => color[0] * .2126 + color[1] * .7152 + color[2] * .0722;
const difference = (a, b) => Math.hypot(...a.map((value, index) => value - b[index]));

test('3D celestial axes map north to -Z, east to +X and zenith to +Y', () => {
  const near = (actual, expected) => assert.ok(difference(actual, expected) < 1e-12);
  near(evaluateNaturalLight(make(0, 0)).sunDirection, [0, 0, -1]);
  near(evaluateNaturalLight(make(0, 90)).sunDirection, [1, 0, 0]);
  near(evaluateNaturalLight(make(90, 37)).sunDirection, [0, 1, 0]);
  for (const azimuth of [-720, -1, 0, 90, 180, 359, 720]) near(evaluateNaturalLight(make(24, azimuth)).sunDirection, evaluateNaturalLight(make(24, azimuth + 360)).sunDirection);
});

test('clear overhead sunlight is near 100 klx while full moon is fractions of a lux', () => {
  const light = evaluateNaturalLight(make(85));
  assert.ok(light.sunIlluminanceLux > 80000 && light.sunIlluminanceLux < 120000);
  assert.ok(light.moonIlluminanceLux > .1 && light.moonIlluminanceLux < .3);
  assert.ok(light.sunIlluminanceLux / light.moonIlluminanceLux > 300000);
  assert.ok(Math.abs(y(light.sunColorLinear) - 1) < 1e-12);
  assert.ok(Math.abs(y(light.moonColorLinear) - 1) < 1e-12);
});

test('horizontal irradiance obeys cosine incidence independently of normal irradiance', () => {
  const light = evaluateNaturalLight(make(30, 170));
  assert.ok(Math.abs(light.sunHorizontalIlluminanceLux / light.sunIlluminanceLux - .5) < 1e-12);
  const lunar = evaluateNaturalLight(make(-40, 0, { altitude: 30 }));
  assert.ok(Math.abs(lunar.moonHorizontalIlluminanceLux / lunar.moonIlluminanceLux - .5) < 1e-12);
});

test('atmospheric optical path reddens and weakens the low Sun', () => {
  const high = evaluateNaturalLight(make(75)), low = evaluateNaturalLight(make(5));
  assert.ok(low.sun.airMass > high.sun.airMass * 8);
  assert.ok(low.sunIlluminanceLux < high.sunIlluminanceLux / 3);
  assert.ok(low.sunColorLinear[0] / low.sunColorLinear[2] > high.sunColorLinear[0] / high.sunColorLinear[2] * 4);
  assert.ok(relativeOpticalAirMass(0) > 30 && relativeOpticalAirMass(90) > .99 && relativeOpticalAirMass(90) < 1.01);
});

test('a finite solar disc crosses the horizon continuously and is absent below its limb', () => {
  assert.equal(horizonDiscFraction(-.3 * RAD, .2666 * RAD), 0);
  assert.equal(horizonDiscFraction(.3 * RAD, .2666 * RAD), 1);
  assert.equal(horizonDiscFraction(0, .2666 * RAD), .5);
  for (const altitude of [-90, -18, -1]) assert.equal(evaluateNaturalLight(make(altitude)).sunIlluminanceLux, 0);
  const below = evaluateNaturalLight(make(-.01)), above = evaluateNaturalLight(make(.01));
  assert.ok(below.sunIlluminanceLux > 0 && above.sunIlluminanceLux > below.sunIlluminanceLux);
  assert.ok(above.sunIlluminanceLux - below.sunIlluminanceLux < 20);
});

test('full, quarter and new Moon change physical energy, not a separate blue brightness filter', () => {
  const full = evaluateNaturalLight(make(-30, 0));
  const quarter = evaluateNaturalLight(make(-30, 0, { illumination: .5 }));
  const fresh = evaluateNaturalLight(make(-30, 0, { illumination: 0 }));
  assert.equal(fresh.moonIlluminanceLux, 0);
  assert.ok(quarter.moonIlluminanceLux / full.moonIlluminanceLux < .15);
  assert.ok(quarter.moonIlluminanceLux / full.moonIlluminanceLux > .04);
  assert.ok(full.moonColorLinear[0] / full.moonColorLinear[2] > .8);
  assert.equal(evaluateNaturalLight(make(-30, 0, { altitude: -1 })).moonIlluminanceLux, 0);
  // A daytime Moon still physically shines; sunlight/exposure overwhelms it.
  assert.equal(evaluateNaturalLight(make(60)).moonIlluminanceLux, full.moonIlluminanceLux);
});

test('diffuse sky passes through daylight, colored twilight and genuinely dark moonless night', () => {
  const moonless = { illumination: 0 };
  const day = evaluateNaturalLight(make(60, 0, moonless));
  const civil = evaluateNaturalLight(make(-6, 0, moonless));
  const nautical = evaluateNaturalLight(make(-12, 0, moonless));
  const dark = evaluateNaturalLight(make(-20, 0, moonless));
  assert.ok(day.skyIrradianceLux > 5000);
  assert.ok(civil.skyIrradianceLux > .5 && civil.skyIrradianceLux < 10);
  assert.ok(nautical.skyIrradianceLux < .01);
  assert.ok(dark.skyIrradianceLux < .001);
  assert.notDeepEqual(day.ambientSkyLinear, civil.ambientSkyLinear);
  assert.ok(day.starsVisibility < 1e-5 && dark.starsVisibility > .9);
  assert.ok(day.cityLightsVisibility < .001 && dark.cityLightsVisibility > .999);
});

test('camera exposure follows physical illuminance without making a moonless scene as bright as day', () => {
  const day = evaluateNaturalLight(make(60));
  const night = evaluateNaturalLight(make(-30, 0, { illumination: 0 }));
  assert.ok(day.exposureEV100 > 14 && day.exposureEV100 < 16);
  assert.ok(night.exposureEV100 > -2 && night.exposureEV100 < -1.9);
  assert.ok(day.exposure < 0.00004);
  assert.ok(night.skyIrradianceLux * night.exposure < day.skyIrradianceLux * day.exposure / 50);
  assert.ok(Math.abs(day.exposure * 1.2 * Math.pow(2, day.exposureEV100) - 1) < 1e-12);
});

test('more aerosol or cloud reduces direct energy and higher elevation reduces attenuation', () => {
  const clear = evaluateNaturalLight(make(35), { turbidity: 1.5 });
  const hazy = evaluateNaturalLight(make(35), { turbidity: 7 });
  const cloud = evaluateNaturalLight(make(35), { turbidity: 1.5, cloudCoverage: .9 });
  const mountain = evaluateNaturalLight(make(35), { turbidity: 1.5, elevationMeters: 2500 });
  assert.ok(hazy.sunIlluminanceLux < clear.sunIlluminanceLux);
  assert.ok(cloud.sunIlluminanceLux < clear.sunIlluminanceLux / 20);
  assert.ok(mountain.sunIlluminanceLux > clear.sunIlluminanceLux);
});

test('all sky energy components add up and ground bounce follows receiving albedo', () => {
  const light = evaluateNaturalLight(make(20), { groundAlbedo: .35, lightPollutionLux: .02 });
  assert.ok(Math.abs(light.skyIrradianceLux - light.solarSkyIlluminanceLux - light.moonSkyIlluminanceLux - light.nightSkyIlluminanceLux) < 1e-8);
  assert.ok(Math.abs(light.skyLuminanceCdM2 * Math.PI - light.skyIrradianceLux) < 1e-8);
  assert.ok(Math.abs(light.groundIlluminanceLux - .35 * light.totalHorizontalIlluminanceLux) < 1e-8);
  assert.equal(evaluateNaturalLight(make(20), { groundAlbedo: 0 }).groundIlluminanceLux, 0);
});

test('real consecutive seconds and seasonal orbital positions vary without phase-image inputs', () => {
  const place = { latitude: 39.748, longitude: -104.996 };
  const instant = Date.parse('2026-06-21T19:00:00Z');
  const before = evaluateNaturalLight(getCelestialState(new Date(instant), place));
  const after = evaluateNaturalLight(getCelestialState(new Date(instant + 1000), place));
  assert.ok(difference(before.sunDirection, after.sunDirection) > 1e-6);
  assert.notEqual(before.sunIlluminanceLux, after.sunIlluminanceLux);
  assert.ok(Math.abs(before.sunIlluminanceLux - after.sunIlluminanceLux) < 10);
  const winter = evaluateNaturalLight(getCelestialState(new Date('2026-12-21T19:00:00Z'), place));
  assert.ok(before.sun.altitude - winter.sun.altitude > 35);
  assert.ok(before.sunHorizontalIlluminanceLux > winter.sunHorizontalIlluminanceLux * 1.5);
});

test('sub-second evaluation remains continuous at solar horizon and former five-phase times', () => {
  for (const altitude of [-18, -12, -6, -.2666, 0, .2666, 5, 15, 60]) {
    const a = evaluateNaturalLight(make(altitude - 1e-6)), b = evaluateNaturalLight(make(altitude + 1e-6));
    assert.ok(Math.abs(a.sunIlluminanceLux - b.sunIlluminanceLux) < .1);
    assert.ok(Math.abs(a.skyIrradianceLux - b.skyIrradianceLux) < .1);
    assert.ok(Math.abs(a.exposureEV100 - b.exposureEV100) < 1e-4);
  }
});

test('lunar orientation is forwarded in radians and invalid atmosphere/celestial data is rejected', () => {
  const light = evaluateNaturalLight(make(-25, 0, { brightLimbAngle: 70, parallacticAngle: 20, angularRadius: .26 }));
  assert.ok(Math.abs(light.moonAngularRadius - .26 * RAD) < 1e-14);
  assert.ok(Math.abs(light.moonPhaseTiltAngle - 50 * RAD) < 1e-14);
  assert.throws(() => evaluateNaturalLight({}), TypeError);
  assert.throws(() => evaluateNaturalLight(make(NaN)), TypeError);
  assert.throws(() => evaluateNaturalLight(make(91)), RangeError);
  assert.throws(() => evaluateNaturalLight(make(), { turbidity: 0 }), RangeError);
  assert.throws(() => evaluateNaturalLight(make(), { cloudCoverage: NaN }), TypeError);
});
