import test from 'node:test';
import assert from 'node:assert/strict';
import { getCelestialState } from '../src/celestial.js';
import { getLightingState } from '../src/lighting.js';
import { RelightingRenderer } from '../src/relighting.js';
import { photographicGrade, samplePhotographicLight, photographicSkyLikelihood } from '../src/photo-light.js';

const place = { latitude: 39.748, longitude: -104.996 };
const camera = { viewAzimuth: 100, fieldOfView: 80, verticalFieldOfView: 50, horizon: .43, crop: [1, 1] };
const at = (milliseconds) => getLightingState(getCelestialState(new Date(milliseconds), place), camera);

test('every second evaluates fresh continuous photo light across a complete day', () => {
  const start = Date.parse('2026-06-15T06:00:00Z');
  let previous;
  for (let second=0;second<86400;second++) {
    const lighting = at(start+second*1000), grade=photographicGrade(lighting);
    const field=samplePhotographicLight(grade,lighting,.82,.36,.6);
    assert.ok(field.every((value)=>Number.isFinite(value)&&value>=0&&value<=1));
    if(previous) {
      assert.notDeepEqual(lighting.sun.direction,previous.direction);
      assert.ok(Math.max(...field.map((value,index)=>Math.abs(value-previous.field[index])))<.001,'no one-second lighting jump');
    }
    previous={field,direction:lighting.sun.direction};
  }
});

test('light direction changes local illumination and color rather than only global brightness', () => {
  const state=(azimuth)=>getLightingState({sun:{altitude:8,azimuth},moon:{altitude:25,azimuth:120,illumination:.9}},camera);
  const east=state(35),west=state(165),a=photographicGrade(east),b=photographicGrade(west);
  assert.deepEqual(a.baseTint,b.baseTint,'solar altitude determines ambient exposure');
  const leftA=samplePhotographicLight(a,east,.05,.45,.5),rightA=samplePhotographicLight(a,east,.95,.45,.5);
  const leftB=samplePhotographicLight(b,west,.05,.45,.5),rightB=samplePhotographicLight(b,west,.95,.45,.5);
  assert.ok(leftA[0]>rightA[0]);assert.ok(leftB[0]<rightB[0]);
  assert.ok(Math.abs(leftA[0]/leftA[2]-rightA[0]/rightA[2])>.002,'direction also changes color balance');
});

test('moon angle and illuminated fraction affect nighttime fill continuously', () => {
  const light=(azimuth,illumination)=>getLightingState({sun:{altitude:-35,azimuth:200},moon:{altitude:45,azimuth,illumination}},camera);
  const full=light(30,1),next=light(30.01,1),dark=light(30,0);
  const sample=(l)=>samplePhotographicLight(photographicGrade(l),l,.1,.6,0);
  assert.ok(sample(full)[2]>sample(dark)[2]);
  assert.notDeepEqual(sample(full),sample(next));
  assert.ok(Math.abs(sample(full)[2]-sample(next)[2])<.00001);
});

test('source-aligned soft sky likelihood preserves foreground and uses the photograph colors', () => {
  assert.ok(photographicSkyLikelihood(.35,.6,.86,.1)>.9);
  assert.equal(photographicSkyLikelihood(.35,.6,.86,.9),0);
  assert.ok(photographicSkyLikelihood(.3,.2,.13,.1)<.01);
});

test('switching a saved fixed original photo to daylight initializes its manual clock', () => {
  const clock={},utcMillis=Date.parse('2026-06-15T18:20:30.123Z');
  const initial={utcMillis,realtime:false,originalPhoto:true,place,camera,lighting:at(utcMillis)};
  RelightingRenderer.prototype.resolveState.call(clock,initial);
  const first=RelightingRenderer.prototype.resolveState.call(clock,{...initial,originalPhoto:false});
  assert.equal(first.utcMillis,utcMillis);assert.ok(Number.isFinite(first.lighting.sun.altitude));
  const changed={...initial,utcMillis:utcMillis+3600000,originalPhoto:false};
  const interpolated=RelightingRenderer.prototype.resolveState.call(clock,changed);
  assert.ok(interpolated.utcMillis>=utcMillis&&interpolated.utcMillis<changed.utcMillis);
  assert.equal(clock.transitioningTime,true);
  RelightingRenderer.prototype.resolveState.call(clock,{...initial,utcMillis:changed.utcMillis});
  const resumed=RelightingRenderer.prototype.resolveState.call(clock,changed);
  assert.equal(resumed.utcMillis,changed.utcMillis);
});
