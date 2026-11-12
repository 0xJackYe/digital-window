/**
 * Continuous photometric lighting for the actual 3D scene, not photo grading.
 * All inputs are instantaneous celestial angles; there are no clock phases,
 * image weights, rounded times or key-frame light colors in this evaluator.
 *
 * World axes: east +X, up +Y, north -Z. Vectors point TOWARD each light.
 * Directional illuminance is lux on a receiver normal to the incoming rays;
 * horizontal illuminance includes the cosine of the apparent elevation.
 * RGB values are linear, normalized to photopic luminance Y=1, not sRGB.
 * Angular radii and lunar orientation outputs are RADIANS.
 *
 * This is an analytic clear-sky / three-band attenuation approximation. It is
 * not a measured weather feed, a spectral atmosphere solver or an eclipse
 * model. Turbidity/cloud controls approximate atmosphere, and mean skylight
 * and twilight are smooth fits rather than a claim of scientific accuracy.
 *
 * References:
 * - Kasten & Young, Applied Optics 28 (1989), optical air mass approximation:
 *   https://doi.org/10.1364/AO.28.004735
 * - Preetham, Shirley & Smits, SIGGRAPH 1999, analytic sun/sky attenuation:
 *   https://doi.org/10.1145/311535.311545
 * - Directional sources and visibility/shadow rays:
 *   https://www.pbr-book.org/4ed/Light_Sources/Distant_Lights
 * - Kyba et al., How bright is moonlight? (2017), full-Moon lux scale:
 *   https://doi.org/10.1093/astrogeo/atx025
 * - Physical camera exposure and photometric units (equations independently
 *   implemented here, not copied implementation code):
 *   https://google.github.io/filament/main/filament.html
 */

const RAD = Math.PI / 180;
const PI = Math.PI;
const LUMA = [0.2126, 0.7152, 0.0722];
const WAVELENGTH_UM = [0.680, 0.550, 0.440];
const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value));
const mix = (a, b, weight) => a.map((channel, index) => channel + (b[index] - channel) * weight);
const luminance = (rgb) => rgb.reduce((sum, channel, index) => sum + channel * LUMA[index], 0);
const normalizeY = (rgb) => {
  const y = Math.max(1e-12, luminance(rgb));
  return rgb.map((channel) => channel / y);
};
const logistic = (value) => 1 / (1 + Math.exp(-clamp(value, -700, 700)));

function finite(value, name) {
  if (!Number.isFinite(value)) throw new TypeError(`${name} must be a finite number`);
  return value;
}

function option(value, fallback, low, high, name) {
  const checked = value === undefined ? fallback : finite(value, name);
  if (checked < low || checked > high) throw new RangeError(`${name} must be between ${low} and ${high}`);
  return checked;
}

function body(source, name, defaultAngularRadius) {
  if (!source) throw new TypeError(`${name} is required`);
  const altitude = finite(source.apparentAltitude ?? source.altitude, `${name}.altitude`);
  if (altitude < -90 || altitude > 90) throw new RangeError(`${name}.altitude must be between -90 and 90`);
  const azimuth = finite(source.azimuth, `${name}.azimuth`) * RAD;
  const angularRadius = option(source.angularRadius, defaultAngularRadius, 0.001, 1, `${name}.angularRadius`) * RAD;
  const a = altitude * RAD, cosine = Math.cos(a);
  return {
    altitude,
    azimuth: ((source.azimuth % 360) + 360) % 360,
    direction: [Math.sin(azimuth) * cosine, Math.sin(a), -Math.cos(azimuth) * cosine],
    angularRadius,
  };
}

/** Apparent-elevation form; finite slightly below the horizon for a limb. */
export function relativeOpticalAirMass(altitudeDegrees) {
  finite(altitudeDegrees, 'altitude');
  const altitude = clamp(altitudeDegrees, -0.8, 90), zenith = 90 - altitude;
  return 1 / (Math.sin(altitude * RAD) + 0.50572 * Math.pow(96.07995 - zenith, -1.6364));
}

/** Visible fraction of a circular source above a flat, unobstructed horizon. */
export function horizonDiscFraction(altitudeRadians, angularRadius) {
  const x = clamp(altitudeRadians / angularRadius, -1, 1);
  return (Math.acos(-x) + x * Math.sqrt(Math.max(0, 1 - x * x))) / PI;
}

function solarTransmission(airMass, turbidity, pressureRatio) {
  // Rayleigh varies strongly with wavelength; aerosol extinction is less
  // wavelength-selective. Three samples are an RGB approximation, not a full
  // sampled spectrum. All attenuation is Beer-Lambert in optical path length.
  const aerosolBeta = Math.max(0, 0.0460836582 * turbidity - 0.0458602593);
  return WAVELENGTH_UM.map((wavelength) => {
    const rayleighDepth = 0.008735 * Math.pow(wavelength, -4.08) * pressureRatio;
    const aerosolDepth = aerosolBeta * Math.pow(wavelength, -1.3) * pressureRatio;
    return Math.exp(-airMass * (rayleighDepth + aerosolDepth));
  });
}

/**
 * @param {object} celestial getCelestialState() result; angles in degrees.
 * @param {object} [options] Hypothetical atmosphere, not local measured weather.
 * @returns {object} Instantaneous physical light and HDR camera/sky parameters.
 */
export function evaluateNaturalLight(celestial, options = {}) {
  if (!celestial?.sun) throw new TypeError('celestial.sun is required');
  const turbidity = option(options.turbidity, 2.4, 1, 10, 'turbidity');
  const groundAlbedo = option(options.groundAlbedo, 0.2, 0, 1, 'groundAlbedo');
  const cloudCoverage = option(options.cloudCoverage, 0, 0, 1, 'cloudCoverage');
  const elevationMeters = option(options.elevationMeters, 0, -500, 9000, 'elevationMeters');
  const lightPollutionLux = option(options.lightPollutionLux, 0, 0, 100, 'lightPollutionLux');
  const minExposureEV100 = option(options.minExposureEV100, -2, -12, 18, 'minExposureEV100');
  const exposureCompensation = option(options.exposureCompensation, 0, -8, 8, 'exposureCompensation');
  const sun = body(celestial.sun, 'sun', 0.2666);
  const moonInput = celestial.moon ?? { altitude: -90, azimuth: 0, illumination: 0, phase: 0 };
  const moon = body(moonInput, 'moon', 0.25);
  const illumination = option(moonInput.illumination ?? moonInput.fraction, 0, 0, 1, 'moon.illumination');
  const moonPhase = option(moonInput.phase, 0, 0, 1, 'moon.phase');
  const distanceKm = option(moonInput.topocentricDistance ?? moonInput.distance, 384400, 250000, 500000, 'moon.distance');
  const pressureRatio = Math.exp(-elevationMeters / 8434.5);
  const cloudTransmission = Math.exp(-5 * cloudCoverage * cloudCoverage);

  const sunAirMass = relativeOpticalAirMass(sun.altitude);
  const sunTransmission = solarTransmission(sunAirMass, turbidity, pressureRatio);
  const sunDisc = horizonDiscFraction(sun.altitude * RAD, sun.angularRadius);
  // 127.5 klx is the chosen extraterrestrial photometric reference. Under the
  // default clear atmosphere this yields roughly 100 klx near the zenith.
  const sunIlluminanceLux = 127500 * luminance(sunTransmission) * sunDisc * cloudTransmission;
  const sunHorizontalIlluminanceLux = sunIlluminanceLux * Math.max(0, sun.direction[1]);
  const sunColorLinear = normalizeY(sunTransmission);

  const moonAirMass = relativeOpticalAirMass(moon.altitude);
  const moonDisc = horizonDiscFraction(moon.altitude * RAD, moon.angularRadius);
  const phaseAngle = Math.acos(clamp(2 * illumination - 1, -1, 1));
  const lambertPhase = illumination === 0 ? 0 : Math.max(0, (Math.sin(phaseAngle) + (PI - phaseAngle) * Math.cos(phaseAngle)) / PI);
  // A compact opposition correction makes a quarter Moon substantially dimmer
  // than half a full Moon. This is an approximate phase curve, not a measured
  // lunar BRDF. The 0.25-lx reference is a clear high full-Moon representative.
  const phaseBrightness = lambertPhase * Math.exp(-0.8 * phaseAngle);
  const lunarAtmosphere = Math.exp(-0.18 * pressureRatio * (moonAirMass - 1));
  const moonIlluminanceLux = 0.25 * phaseBrightness * Math.pow(384400 / distanceKm, 2) * lunarAtmosphere * moonDisc * cloudTransmission;
  const moonHorizontalIlluminanceLux = moonIlluminanceLux * Math.max(0, moon.direction[1]);
  const lunarTransmission = solarTransmission(moonAirMass, turbidity, pressureRatio);
  const zenithTransmission = solarTransmission(1, turbidity, pressureRatio);
  // Moonlight is reflected sunlight, not a saturated blue spotlight. Lower
  // elevations redden it through the same atmosphere; the sky adds blue fill.
  const moonColorLinear = normalizeY(lunarTransmission.map((channel, index) => channel / zenithTransmission[index] * [0.96, 0.98, 1][index]));

  // Continuous solar-elevation fit for diffuse daylight through twilight. It
  // has no switch at clock hours or civil/nautical twilight boundaries.
  const daylightVisibility = logistic((sun.altitude + 1) / 0.8);
  const positiveSun = Math.max(0, sun.direction[1]);
  const diffuseDayLux = 10500 * Math.pow(0.02 + positiveSun, 0.6) * daylightVisibility * (0.82 + 0.075 * turbidity) * (1 + 0.65 * cloudCoverage);
  // Approximately natural airglow / unresolved stellar irradiance. This is a
  // physical source estimate, not an artistic display brightness floor.
  const naturalNightSkyLux = 0.00055 * (1 - cloudCoverage * 0.8);
  const moonDiffuseLux = moonHorizontalIlluminanceLux * (0.12 + turbidity * 0.012);
  const skyIrradianceLux = diffuseDayLux + naturalNightSkyLux + moonDiffuseLux + lightPollutionLux;
  const skyLuminanceCdM2 = skyIrradianceLux / PI;
  const horizonWarmth = Math.exp(-Math.pow((sun.altitude + 1.2) / 4.5, 2));
  const daySky = normalizeY(mix([0.26, 0.48, 1], [0.52, 0.66, 1], cloudCoverage));
  const twilightSky = normalizeY(mix([0.18, 0.31, 0.78], [1, 0.30, 0.055], horizonWarmth * 0.52));
  const nightSky = normalizeY([0.25, 0.37, 0.62]);
  const dayBlend = logistic((sun.altitude - 5) / 2.2);
  const twilightBlend = logistic((sun.altitude + 10) / 1.8);
  const ambientSkyLinear = normalizeY(mix(mix(nightSky, twilightSky, twilightBlend), daySky, dayBlend));
  const totalHorizontalIlluminanceLux = sunHorizontalIlluminanceLux + moonHorizontalIlluminanceLux + skyIrradianceLux;
  const groundIlluminanceLux = totalHorizontalIlluminanceLux * groundAlbedo;
  const groundBounceLinear = normalizeY(ambientSkyLinear.map((channel, index) => channel * 0.45 + sunColorLinear[index] * 0.55 * daylightVisibility));

  // The maximum night gain is a CAMERA constraint; it never increases actual
  // moon lux or inserts a fictitious hemisphere light. Smooth metering avoids
  // a derivative discontinuity when reaching that camera limit.
  const meteringFloorLux = 2.5 * Math.pow(2, minExposureEV100);
  const exposureEV100 = Math.log2((totalHorizontalIlluminanceLux + meteringFloorLux) / 2.5) - exposureCompensation;
  const exposure = 1 / (1.2 * Math.pow(2, exposureEV100));
  const starsVisibility = 1 / (1 + Math.pow(skyLuminanceCdM2 / 0.003, 1.1));
  const cityLightsVisibility = 1 / (1 + Math.pow(totalHorizontalIlluminanceLux / 40, 1.1));
  const rayleigh = 2 * pressureRatio;
  const mieCoefficient = 0.001 + turbidity * 0.0013;
  const mieDirectionalG = 0.8;
  const moonBrightLimbAngle = finite(moonInput.brightLimbAngle ?? 0, 'moon.brightLimbAngle') * RAD;
  const moonParallacticAngle = finite(moonInput.parallacticAngle ?? 0, 'moon.parallacticAngle') * RAD;

  return {
    model: 'analytic-photometric-three-band-1.0',
    timestamp: Number.isFinite(celestial.timestamp) ? celestial.timestamp : null,
    sunDirection: sun.direction, moonDirection: moon.direction,
    sunIlluminanceLux, sunHorizontalIlluminanceLux, sunColorLinear,
    moonIlluminanceLux, moonHorizontalIlluminanceLux, moonColorLinear,
    sunAngularRadius: sun.angularRadius, moonAngularRadius: moon.angularRadius,
    moonIllumination: illumination, moonPhase, moonBrightLimbAngle, moonParallacticAngle,
    moonPhaseTiltAngle: moonBrightLimbAngle - moonParallacticAngle,
    skyIrradianceLux, skyLuminanceCdM2, ambientSkyLinear, groundBounceLinear,
    solarSkyIlluminanceLux: diffuseDayLux,
    moonSkyIlluminanceLux: moonDiffuseLux,
    nightSkyIlluminanceLux: naturalNightSkyLux + lightPollutionLux,
    naturalNightSkyIlluminanceLux: naturalNightSkyLux, lightPollutionLux,
    groundIlluminanceLux, totalHorizontalIlluminanceLux,
    exposureEV100, exposure, starsVisibility, cityLightsVisibility,
    turbidity, groundAlbedo, cloudCoverage, elevationMeters, pressureRatio,
    rayleigh, mieCoefficient, mieDirectionalG,
    daylightVisibility, twilightVisibility: twilightBlend * (1 - dayBlend),
    sun: { ...sun, illuminanceLux: sunIlluminanceLux, horizontalIlluminanceLux: sunHorizontalIlluminanceLux, colorLinear: sunColorLinear, visibleFraction: sunDisc, airMass: sunAirMass },
    moon: { ...moon, illuminanceLux: moonIlluminanceLux, horizontalIlluminanceLux: moonHorizontalIlluminanceLux, colorLinear: moonColorLinear, visibleFraction: moonDisc, airMass: moonAirMass, phaseBrightness, illumination, phase: moonPhase },
    sky: { irradianceLux: skyIrradianceLux, luminanceCdM2: skyLuminanceCdM2, colorLinear: ambientSkyLinear, rayleigh, mieCoefficient, mieDirectionalG, turbidity },
    ambient: { skyColorLinear: ambientSkyLinear, groundColorLinear: groundBounceLinear, skyIlluminanceLux: skyIrradianceLux, groundIlluminanceLux },
  };
}
