import test from 'node:test';
import assert from 'node:assert/strict';
import { getLightingState } from '../src/lighting.js';
import { getSolarState } from '../src/solar.js';
import { getDaylightBlend } from '../src/daylight.js';

const celestial = (sunAltitude = 40, sunAzimuth = 180, moon = {}) => ({
  sun: { altitude: sunAltitude, azimuth: sunAzimuth },
  moon: { altitude: 30, azimuth: 180, illumination: 1, phase: .5, ...moon },
});
const near = (a, b, tolerance = 1e-10) => assert.ok(Math.abs(a - b) < tolerance, `${a} differs from ${b}`);
const distance = (a, b) => Math.hypot(...a.map((value, i) => value - b[i]));

test('camera cardinal axes follow north-clockwise azimuth and unit directions', () => {
  const north = getLightingState(celestial(0, 0));
  near(distance(north.sun.direction, [0, 0, 1]), 0);
  const east = getLightingState(celestial(0, 90));
  near(distance(east.sun.direction, [1, 0, 0]), 0);
  const overhead = getLightingState(celestial(90, 180));
  near(distance(overhead.sun.direction, [0, 1, 0]), 0);
  for (const azimuth of [-720, -1, 0, 90, 180, 359, 720]) {
    near(Math.hypot(...getLightingState(celestial(37, azimuth), { viewAzimuth: 81 }).sun.direction), 1);
  }
});

test('perspective projection has the expected centered and oblique geometry', () => {
  const options = { viewAzimuth: 180, fieldOfView: 90, verticalFieldOfView: 90, horizon: .6 };
  const centered = getLightingState(celestial(30, 180), options).sun;
  near(centered.screenX, .5);
  near(centered.screenY, .6 - Math.tan(Math.PI / 6) / 2);
  assert.equal(centered.visible, true);
  const right = getLightingState(celestial(0, 210), options).sun;
  near(right.screenX, .5 + Math.tan(Math.PI / 6) / 2);
  near(right.screenY, .6);
});

test('wider field of view reduces projected displacement without changing light', () => {
  const narrow = getLightingState(celestial(10, 200), { viewAzimuth: 180, fieldOfView: 45, verticalFieldOfView: 40 });
  const wide = getLightingState(celestial(10, 200), { viewAzimuth: 180, fieldOfView: 110, verticalFieldOfView: 90 });
  assert.ok(Math.abs(wide.sun.screenX - .5) < Math.abs(narrow.sun.screenX - .5));
  assert.ok(Math.abs(wide.sun.screenY - .5) < Math.abs(narrow.sun.screenY - .5));
  near(wide.sun.strength, narrow.sun.strength);
});

test('behind-camera and off-frame sources retain diffuse light but no visible orb', () => {
  const behind = getLightingState(celestial(30, 180), { viewAzimuth: 0 }).sun;
  assert.equal(behind.inFront, false);
  assert.equal(behind.visible, false);
  assert.equal(behind.specular, 0);
  assert.ok(behind.diffuse > 0);
  const outside = getLightingState(celestial(10, 65), { viewAzimuth: 0, fieldOfView: 70 }).sun;
  assert.equal(outside.inFront, true);
  assert.equal(outside.inFrame, false);
  assert.equal(outside.visibility, 0);
  assert.ok(outside.strength > 0);
});

test('below-horizon sun and moon contribute exactly zero direct light', () => {
  for (const altitude of [-45, -1, -.001, 0]) {
    const state = getLightingState(celestial(altitude, 180, { altitude }), { viewAzimuth: 180 });
    assert.equal(state.sun.strength, 0);
    assert.equal(state.moon.strength, 0);
    assert.equal(state.sun.visible, false);
    assert.equal(state.moon.visible, false);
  }
});

test('full moon lights a night more than quarter moon; new moon is dark', () => {
  const states = [0, .25, .5, .75, 1].map((illumination) => getLightingState(celestial(-30, 0, { illumination }), { viewAzimuth: 180 }));
  assert.equal(states[0].moon.strength, 0);
  assert.equal(states[0].moon.visible, false);
  for (let i = 1; i < states.length; i++) assert.ok(states[i].moon.strength > states[i - 1].moon.strength);
  assert.ok(states.at(-1).ambient.intensity > states[0].ambient.intensity);
  assert.ok(states.at(-1).exposure > states[0].exposure);
  assert.ok(states.at(-1).moon.strength < getLightingState(celestial(60, 180)).sun.strength / 10);
  near(states.at(-1).moon.phaseBrightness, 1);
});

test('moon phase is preserved and phase-driven light is suppressed in daytime', () => {
  const night = getLightingState(celestial(-25, 0, { phase: .77 }));
  const day = getLightingState(celestial(40, 0, { phase: .77 }));
  near(night.moon.phase, .77);
  assert.equal(day.moon.strength, 0);
  assert.ok(night.moon.strength > 0);
});

test('low sun creates longer ground shadows, pointing away from the light', () => {
  const low = getLightingState(celestial(20, 90), { viewAzimuth: 0 });
  const high = getLightingState(celestial(60, 90), { viewAzimuth: 0 });
  assert.equal(low.shadow.source, 'sun');
  near(low.shadow.direction[0], -1);
  near(low.shadow.direction[1], 0);
  near(low.shadow.physicalLength, 1 / Math.tan(20 * Math.PI / 180));
  assert.ok(low.shadow.length > high.shadow.length);
  assert.ok(low.shadow.length < low.camera.maxShadowLength);
  const opposite = getLightingState(celestial(20, 270));
  near(distance(low.shadow.direction, opposite.shadow.direction), 2);
});

test('night shadows follow the moon and disappear with an unlit or set moon', () => {
  const moonlit = getLightingState(celestial(-40, 100, { azimuth: 270 }));
  assert.equal(moonlit.shadow.source, 'moon');
  assert.ok(moonlit.shadow.direction[0] > .99);
  for (const moon of [{ illumination: 0 }, { altitude: -10 }]) {
    const dark = getLightingState(celestial(-40, 100, moon));
    assert.equal(dark.shadow.source, 'none');
    assert.equal(dark.shadow.strength, 0);
  }
});

test('solar lighting changes every minute even while the same noon photograph dominates', () => {
  const place = { latitude: 35.426739, longitude: 138.872791, timeZone: 'Asia/Tokyo' };
  const noon = getSolarState(new Date('2026-06-21T03:00:00Z'), place).solarNoon;
  let previous;
  for (let minute = -10; minute <= 10; minute++) {
    const instant = new Date(+noon + minute * 60_000);
    const solar = getSolarState(instant, place);
    const blend = getDaylightBlend(solar, instant);
    near(blend.weights.noon, 1);
    const current = getLightingState({ sun: solar }, { viewAzimuth: 228 });
    if (previous) assert.ok(distance(previous.sun.direction, current.sun.direction) > 1e-5);
    previous = current;
  }
});

test('direct transmission and color vary continuously through active sunlight', () => {
  const a = getLightingState(celestial(25, 170));
  const b = getLightingState(celestial(25.01, 170.2));
  assert.notEqual(a.sun.strength, b.sun.strength);
  assert.notEqual(a.sun.colorTemperature, b.sun.colorTemperature);
  assert.notEqual(a.ambient.intensity, b.ambient.intensity);
  assert.ok(Math.abs(a.sun.strength - b.sun.strength) < .001);
  assert.ok(distance(a.sun.color, b.sun.color) < .001);
});

test('azimuth wrap and equivalent camera headings cause no seam', () => {
  const a = getLightingState(celestial(15, 359.999), { viewAzimuth: 0 });
  const b = getLightingState(celestial(15, .001), { viewAzimuth: 360 });
  assert.ok(distance(a.sun.direction, b.sun.direction) < .0001);
  assert.ok(Math.abs(a.sun.screenX - b.sun.screenX) < .0001);
  assert.ok(distance(a.shadow.direction, b.shadow.direction) < .0001);
});

test('valid extreme geometry stays finite and optional lunar metadata is carried through', () => {
  const scan = (value) => {
    if (typeof value === 'number') assert.ok(Number.isFinite(value));
    else if (value && typeof value === 'object') Object.values(value).forEach(scan);
  };
  for (const altitude of [-90, -.00001, 0, .00001, 45, 90]) {
    for (const azimuth of [0, 90, 180, 270, 360]) scan(getLightingState(celestial(altitude, azimuth, { altitude })));
  }
  const state = getLightingState(celestial(-25, 0, { distance: 384400, geometricAltitude: 29.9, brightLimbAngle: 20, parallacticAngle: -9 }));
  near(state.moon.geometricAltitude, 29.9);
  assert.ok(state.moon.angularRadius > .24 && state.moon.angularRadius < .27);
  near(state.moon.brightLimbAngle, 20);
  near(state.moon.parallacticAngle, -9);
  scan(getLightingState({ sun: { altitude: 30, azimuth: 150 } }));
});

test('invalid celestial data and camera fields of view are rejected', () => {
  assert.throws(() => getLightingState({}), TypeError);
  assert.throws(() => getLightingState(celestial(NaN)), TypeError);
  assert.throws(() => getLightingState(celestial(91)), RangeError);
  assert.throws(() => getLightingState(celestial(), { fieldOfView: 180 }), RangeError);
  assert.throws(() => getLightingState(celestial(), { verticalFieldOfView: 0 }), RangeError);
  assert.throws(() => getLightingState(celestial(), { viewAzimuth: Infinity }), TypeError);
});
