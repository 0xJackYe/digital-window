/**
 * Continuous, camera-relative lighting for photographic 2.5D relighting.
 * Azimuth is degrees clockwise from north; altitude is degrees above horizon.
 * Source directions are [camera-right, world-up, camera-forward], where +Z
 * points into the scene. They point TOWARD the source, not along its rays.
 * screenX/screenY are unclamped image coordinates, +Y down. Only use them for
 * drawing a source when visible is true. No celestial bodies are drawn here.
 *
 * Distant-light and cosine-irradiance principles:
 * https://www.pbr-book.org/4ed/Light_Sources/Distant_Lights
 * https://pbr-book.org/4ed/Radiometry%2C_Spectra%2C_and_Color/Radiometry
 * Moonlight is reflected sunlight and varies with illuminated phase:
 * https://science.nasa.gov/moon/moonlight/
 *
 * Intensities are restrained photographic corrections, NOT lux or measured
 * weather. Moon phase uses a diffuse-sphere approximation; atmospheric loss,
 * ambient colors and separate night exposure compensation are artistic models.
 * The original photographs do not supply actual scene depth or surface normals.
 */
const RAD = Math.PI / 180;
const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const wrap = (value, period) => ((value % period) + period) % period;
const smoothstep = (min, max, value) => {
  const t = clamp((value - min) / (max - min));
  return t * t * (3 - 2 * t);
};
const mix = (a, b, t) => a.map((channel, i) => channel + (b[i] - channel) * t);
const finite = (value, name) => {
  if (!Number.isFinite(value)) throw new TypeError(`${name} must be a finite number`);
  return value;
};

function cameraState(options) {
  const viewAzimuth = wrap(finite(options.viewAzimuth ?? 0, 'viewAzimuth'), 360);
  const fieldOfView = finite(options.fieldOfView ?? 80, 'fieldOfView');
  const verticalFieldOfView = finite(options.verticalFieldOfView ?? 60, 'verticalFieldOfView');
  if (fieldOfView <= 0 || fieldOfView >= 180 || verticalFieldOfView <= 0 || verticalFieldOfView >= 180) {
    throw new RangeError('Camera fields of view must be between 0 and 180 degrees');
  }
  return {
    viewAzimuth, fieldOfView, verticalFieldOfView,
    horizon: clamp(finite(options.horizon ?? .5, 'horizon')),
    exposure: clamp(finite(options.exposure ?? 1, 'exposure'), .1, 4),
    maxShadowLength: Math.max(.1, finite(options.maxShadowLength ?? 14, 'maxShadowLength')),
  };
}

function projectSource(source, camera) {
  const altitude = finite(source.altitude, 'source altitude');
  if (altitude < -90 || altitude > 90) throw new RangeError('Source altitude must be between -90 and 90 degrees');
  const azimuth = wrap(finite(source.azimuth, 'source azimuth'), 360);
  const relativeAzimuth = wrap(azimuth - camera.viewAzimuth + 180, 360) - 180;
  const cosineAltitude = Math.cos(altitude * RAD);
  const direction = [Math.sin(relativeAzimuth * RAD) * cosineAltitude, Math.sin(altitude * RAD), Math.cos(relativeAzimuth * RAD) * cosineAltitude];
  const [x, y, z] = direction;
  // A finite denominator also makes diagnostics safe for exactly side-on light.
  const denominator = z >= 0 ? Math.max(z, 1e-6) : Math.min(z, -1e-6);
  const screenX = .5 + x / (2 * denominator * Math.tan(camera.fieldOfView * RAD / 2));
  const screenY = camera.horizon - y / (2 * denominator * Math.tan(camera.verticalFieldOfView * RAD / 2));
  const inFront = z > 1e-6;
  const inFrame = inFront && screenX >= 0 && screenX <= 1 && screenY >= 0 && screenY <= 1;
  const aboveHorizon = altitude > 0;
  return { altitude, azimuth, relativeAzimuth, direction, screenX, screenY, inFront, inFrame, aboveHorizon };
}

/**
 * @param {{sun:{altitude:number,azimuth:number},moon?:{altitude:number,azimuth:number,illumination:number,phase?:number,distance?:number},nightFactor?:number}} celestial
 * @param {{viewAzimuth?:number,fieldOfView?:number,verticalFieldOfView?:number,horizon?:number,exposure?:number,maxShadowLength?:number}} [options]
 * @returns {object} All colors are bounded RGB triples; strength/diffuse/specular
 * are exposure-calibrated gains independent of whether a source is in frame.
 * visible gates a possible source depiction, never its diffuse lighting.
 */
export function getLightingState(celestial, options = {}) {
  if (!celestial?.sun) throw new TypeError('celestial.sun is required');
  const camera = cameraState(options);
  const sun = projectSource(celestial.sun, camera);
  const moonInput = celestial.moon ?? { altitude: -90, azimuth: 0, illumination: 0, phase: 0 };
  const moon = projectSource(moonInput, camera);
  const illumination = clamp(finite(moonInput.illumination ?? 0, 'moon illumination'));
  const phase = wrap(finite(moonInput.phase ?? 0, 'moon phase'), 1);
  const sineAltitude = Math.max(0, Math.sin(sun.altitude * RAD));
  const moonSineAltitude = Math.max(0, Math.sin(moon.altitude * RAD));
  const nightFactor = Number.isFinite(celestial.nightFactor)
    ? clamp(celestial.nightFactor) : smoothstep(0, 12, -sun.altitude);
  // No five-phase image weights or quantized clock states enter this evaluator.
  const daylight = 1 / (1 + Math.exp(-(sun.altitude + 4) / 4));
  const horizonGlow = Math.exp(-Math.pow((sun.altitude + 1) / 8, 2));
  const sunlightTransmission = Math.exp(-.14 * (1 / Math.max(.035, sineAltitude) - 1));
  const sunHorizonFade = smoothstep(0, 2.5, sun.altitude);
  const sunStrength = .38 * sunHorizonFade * sunlightTransmission;
  const sunColorTemperature = 2200 + 3900 * (1 - Math.exp(-4 * sineAltitude));
  const sunColor = mix([1, .47, .24], [1, .96, .90], 1 - Math.exp(-3.5 * sineAltitude));
  Object.assign(sun, {
    strength: sunStrength,
    diffuse: sunStrength,
    // Behind-camera sources may illuminate surfaces but cannot produce an
    // on-image source-facing specular/glare lobe in this photographic model.
    specular: sunStrength * .22 * smoothstep(0, .3, sun.direction[2]),
    color: sunColor, colorTemperature: sunColorTemperature,
    transmission: sunlightTransmission,
    visibility: sunHorizonFade * (sun.inFrame ? 1 : 0),
    visible: sun.aboveHorizon && sun.inFrame,
    angularRadius: .2666,
  });

  // Lambert sphere phase law, exactly zero at new Moon and one at full Moon.
  const phaseAngle = Math.acos(clamp(2 * illumination - 1, -1, 1));
  const phaseBrightness = illumination === 0 ? 0 : clamp((Math.sin(phaseAngle) + (Math.PI - phaseAngle) * Math.cos(phaseAngle)) / Math.PI);
  const moonTransmission = Math.exp(-.20 * (1 / Math.max(.04, moonSineAltitude) - 1));
  const moonHorizonFade = smoothstep(0, 4, moon.altitude);
  const moonStrength = .028 * phaseBrightness * moonTransmission * moonHorizonFade * nightFactor;
  Object.assign(moon, {
    illumination, phase, phaseBrightness,
    geometricAltitude: Number.isFinite(moonInput.geometricAltitude) ? moonInput.geometricAltitude : moon.altitude,
    brightLimbAngle: Number.isFinite(moonInput.brightLimbAngle) ? moonInput.brightLimbAngle : 0,
    parallacticAngle: Number.isFinite(moonInput.parallacticAngle) ? moonInput.parallacticAngle : 0,
    strength: moonStrength, diffuse: moonStrength,
    specular: moonStrength * .18 * smoothstep(0, .3, moon.direction[2]),
    color: [.66, .75, .94], colorTemperature: 8500,
    transmission: moonTransmission,
    visibility: moonHorizonFade * Math.sqrt(illumination) * (.06 + .94 * nightFactor) * (moon.inFrame ? 1 : 0),
    visible: moon.aboveHorizon && moon.inFrame && illumination > 0,
    angularRadius: Number.isFinite(moonInput.distance) && moonInput.distance > 1737.4
      ? Math.asin(1737.4 / moonInput.distance) / RAD : .25,
  });

  const moonFill = moonStrength / .028;
  const twilightColorWeight = horizonGlow * (.2 + .15 * Math.max(0, sun.direction[2]));
  const ambientColor = mix(mix([.27, .34, .49], [.72, .82, .97], daylight), [.70, .47, .40], twilightColorWeight);
  const skyColor = mix(mix([.025, .045, .105], [.36, .58, .88], daylight), [.91, .47, .31], horizonGlow * .35);
  const ambient = { color: ambientColor, intensity: .095 + .49 * daylight + .045 * moonFill };
  const sky = {
    color: skyColor,
    intensity: .025 + .75 * daylight * (.55 + .45 * Math.sqrt(sineAltitude)) + .025 * moonFill,
    colorTemperature: 9500 - 1600 * daylight - 2400 * horizonGlow,
    horizonGlow,
  };

  const shadowSource = sunStrength > .00001 ? sun : moonStrength > .00001 ? moon : null;
  let shadow = { source: 'none', direction: [0, 0], angle: 0, length: 0, physicalLength: 0, strength: 0 };
  if (shadowSource) {
    const [x, , z] = shadowSource.direction;
    const magnitude = Math.hypot(x, z);
    // A ground-plane shadow points away from the source: -right, toward camera.
    const direction = magnitude > 1e-8 ? [-x / magnitude, z / magnitude] : [0, 0];
    const physicalLength = magnitude / Math.max(.000001, shadowSource.direction[1]);
    shadow = {
      source: shadowSource === sun ? 'sun' : 'moon', direction,
      angle: Math.atan2(direction[1], direction[0]) / RAD,
      // Smooth artistic cap keeps near-horizon shadows bounded without a clamp
      // plateau; physicalLength remains the true unit-height ground-plane ratio.
      length: camera.maxShadowLength * (1 - Math.exp(-physicalLength / camera.maxShadowLength)),
      physicalLength,
      strength: shadowSource.strength,
    };
  }

  return {
    sun, moon, ambient, sky, shadow, nightFactor, daylight, camera,
    exposure: camera.exposure * (.88 + .14 * daylight + .045 * moonFill),
    colorTemperature: 9500 * (1 - daylight) + sunColorTemperature * daylight,
  };
}
