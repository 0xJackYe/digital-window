/**
 * Continuous Sun/Moon directions from a real UTC instant and geographic position.
 * Public angles are degrees; azimuth is clockwise from north.
 * direction = [east, north, up], a unit vector toward the celestial body.
 *
 * Lunar series: Meeus, Astronomical Algorithms, chapters 22/47/48; adapted from
 * SunCalc https://github.com/mourner/suncalc (retrieved 2026-11-11).
 * Upstream source revision: 5b6cedd154a8138c51c061b2980090ddacc4f963
 * https://github.com/mourner/suncalc/blob/5b6cedd154a8138c51c061b2980090ddacc4f963/index.js
 * Primary independent validation: https://aa.usno.navy.mil/data/api
 * Refraction convention: Saemundsson/Meeus standard-atmosphere approximation.
 *
 * The full 60+60-term lunar series includes nutation, TT-UT correction and
 * WGS84 topocentric parallax. It is an approximate visual ephemeris, not a
 * precision navigation/occultation model. Tests compare selected 2024/2026 USNO
 * samples within 0.04 degrees (before refraction). Atmospheric refraction near
 * the horizon depends on actual weather; no live weather or terrain is modeled.
 * The fitted TT-UT correction is intended mainly for 1900–2100.
 *
 * SunCalc BSD-2-Clause license for the adapted lunar/coordinate series:
 * Copyright (c) 2026, Volodymyr Agafonkin
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without modification, are
 * permitted provided that the following conditions are met:
 *
 *    1. Redistributions of source code must retain the above copyright notice, this list of
 *       conditions and the following disclaimer.
 *    2. Redistributions in binary form must reproduce the above copyright notice, this list
 *       of conditions and the following disclaimer in the documentation and/or other materials
 *       provided with the distribution.
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE
 * COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
 * EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
 * SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION)
 * HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR
 * TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 * SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
import { getSolarPosition } from './solar.js';

const { PI, sin, cos, tan, asin, atan2: atan, acos, sqrt, abs, round, floor } = Math;
const rad = PI / 180;
const dayMs = 86_400_000;
const J2000 = Date.UTC(2000, 0, 1, 12);
const earthRadius = 6378.137;
const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const wrap = (value, cycle = 360) => ((value % cycle) + cycle) % cycle;
const smoothstep = (min, max, value) => {
  const t = clamp((value - min) / (max - min)); return t * t * (3 - 2 * t);
};
function checkedDate(value) {
  if (value === null || value === undefined) throw new RangeError('A real UTC instant is required');
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new RangeError('Invalid celestial date');
  return date;
}
function checkedLocation(latitude, longitude) {
  if (!Number.isFinite(latitude) || Math.abs(latitude) > 90 || !Number.isFinite(longitude) || Math.abs(longitude) > 180) {
    throw new RangeError('Latitude must be -90…90 and longitude -180…180');
  }
}
function toDays(date) { return (date.getTime() - J2000) / dayMs; }
function deltaT(d) {
    const y = 2000 + d / 365.2425;
    let t;
    if (y < 1920) { t = y - 1900; return -2.79 + t * (1.494119 + t * (-0.0598939 + t * (0.0061966 - t * 0.000197))); }
    if (y < 1941) { t = y - 1920; return 21.20 + t * (0.84493 + t * (-0.076100 + t * 0.0020936)); }
    if (y < 1961) { t = y - 1950; return 29.07 + t * (0.407 + t * (-1 / 233 + t / 2547)); }
    if (y < 1986) { t = y - 1975; return 45.45 + t * (1.067 + t * (-1 / 260 - t / 718)); }
    if (y < 2005) { t = y - 2000; return 63.86 + t * (0.3345 + t * (-0.060374 + t * (0.0017275 + t * (0.000651814 + t * 0.00002373599)))); }
    if (y < 2050) { t = y - 2000; return 62.92 + t * (0.32217 + t * 0.005589); }
    t = (y - 1820) / 100; return -20 + 32 * t * t - 0.5628 * (2150 - y);
}
function toDaysTT(d) {
    return d + deltaT(d) / 86400;
}


function sunCoords(d) {
    const t = d / 36525;
    const L0 = rad * (280.46646 + t * (36000.76983 + t * 0.0003032)); // 25.2 geometric mean longitude
    const M = rad * (357.52911 + t * (35999.05029 - t * 0.0001537)); // 25.3 mean anomaly
    const sinM = sin(M);
    const cosM = cos(M);
    const C = rad * ((1.914602 - t * (0.004817 + t * 0.000014)) * sinM + // equation of center
        (0.019993 - 0.000101 * t) * 2 * sinM * cosM + 0.000289 * sinM * (3 - 4 * sinM * sinM));
    const Om = rad * (125.04 - 1934.136 * t); // longitude of the ascending node
    const L = L0 + C - rad * (0.00569 + 0.00478 * sin(Om)); // apparent longitude (nutation + aberration)
    // 22.2 mean obliquity + 25.8 correction for apparent position
    const e = rad * (23.439291 - t * (0.0130042 + t * (0.00000016 - t * 0.000000504))) + rad * 0.00256 * cos(Om);

    return {
        ra: atan(cos(e) * sin(L), cos(L)), // 25.6
        dec: asin(sin(e) * sin(L)),        // 25.7
        lon: L
    };
}


// moon calculations, based on Meeus ch. 47 (truncated ELP-2000/82 series)

// Nutation in longitude (Δψ) and true obliquity of the ecliptic, both in degrees,
// from the abridged series of Meeus ch. 22 (sub-arcsecond, ample for our needs).
function nutationObliquity(t) {
    const om = rad * (125.04452 - 1934.136261 * t); // longitude of the Moon's ascending node
    const ls = rad * (280.4665 + 36000.7698 * t);   // mean longitude of the Sun
    const lm = rad * (218.3165 + 481267.8813 * t);  // mean longitude of the Moon
    const dpsi = (-17.20 * sin(om) - 1.32 * sin(2 * ls) - 0.23 * sin(2 * lm) + 0.21 * sin(2 * om)) / 3600;
    const deps = (9.20 * cos(om) + 0.57 * cos(2 * ls) + 0.10 * cos(2 * lm) - 0.09 * cos(2 * om)) / 3600;
    const eps0 = 23.439291 - t * (0.0130042 + t * (0.00000016 - t * 0.000000504)); // 22.2 mean obliquity
    return {dpsi, eps: rad * (eps0 + deps)};
}

// Meeus table 47.A — periodic terms for the Moon's longitude (Σl, ×1e-6 deg) and
// distance (Σr, ×1e-3 km). Flat rows of 6: D, M, M', F, Σl, Σr.
const moonLon = new Int32Array([
    0, 0, 1, 0, 6288774, -20905355,
    2, 0, -1, 0, 1274027, -3699111,
    2, 0, 0, 0, 658314, -2955968,
    0, 0, 2, 0, 213618, -569925,
    0, 1, 0, 0, -185116, 48888,
    0, 0, 0, 2, -114332, -3149,
    2, 0, -2, 0, 58793, 246158,
    2, -1, -1, 0, 57066, -152138,
    2, 0, 1, 0, 53322, -170733,
    2, -1, 0, 0, 45758, -204586,
    0, 1, -1, 0, -40923, -129620,
    1, 0, 0, 0, -34720, 108743,
    0, 1, 1, 0, -30383, 104755,
    2, 0, 0, -2, 15327, 10321,
    0, 0, 1, 2, -12528, 0,
    0, 0, 1, -2, 10980, 79661,
    4, 0, -1, 0, 10675, -34782,
    0, 0, 3, 0, 10034, -23210,
    4, 0, -2, 0, 8548, -21636,
    2, 1, -1, 0, -7888, 24208,
    2, 1, 0, 0, -6766, 30824,
    1, 0, -1, 0, -5163, -8379,
    1, 1, 0, 0, 4987, -16675,
    2, -1, 1, 0, 4036, -12831,
    2, 0, 2, 0, 3994, -10445,
    4, 0, 0, 0, 3861, -11650,
    2, 0, -3, 0, 3665, 14403,
    0, 1, -2, 0, -2689, -7003,
    2, 0, -1, 2, -2602, 0,
    2, -1, -2, 0, 2390, 10056,
    1, 0, 1, 0, -2348, 6322,
    2, -2, 0, 0, 2236, -9884,
    0, 1, 2, 0, -2120, 5751,
    0, 2, 0, 0, -2069, 0,
    2, -2, -1, 0, 2048, -4950,
    2, 0, 1, -2, -1773, 4130,
    2, 0, 0, 2, -1595, 0,
    4, -1, -1, 0, 1215, -3958,
    0, 0, 2, 2, -1110, 0,
    3, 0, -1, 0, -892, 3258,
    2, 1, 1, 0, -810, 2616,
    4, -1, -2, 0, 759, -1897,
    0, 2, -1, 0, -713, -2117,
    2, 2, -1, 0, -700, 2354,
    2, 1, -2, 0, 691, 0,
    2, -1, 0, -2, 596, 0,
    4, 0, 1, 0, 549, -1423,
    0, 0, 4, 0, 537, -1117,
    4, -1, 0, 0, 520, -1571,
    1, 0, -2, 0, -487, -1739,
    2, 1, 0, -2, -399, 0,
    0, 0, 2, -2, -381, -4421,
    1, 1, 1, 0, 351, 0,
    3, 0, -2, 0, -340, 0,
    4, 0, -3, 0, 330, 0,
    2, -1, 2, 0, 327, 0,
    0, 2, 1, 0, -323, 1165,
    1, 1, -1, 0, 299, 0,
    2, 0, 3, 0, 294, 0,
    2, 0, -1, -2, 0, 8752
]);

// Meeus table 47.B — periodic terms for the Moon's latitude (Σb, ×1e-6 deg).
// Flat rows of 5: D, M, M', F, Σb.
const moonLat = new Int32Array([
    0, 0, 0, 1, 5128122,
    0, 0, 1, 1, 280602,
    0, 0, 1, -1, 277693,
    2, 0, 0, -1, 173237,
    2, 0, -1, 1, 55413,
    2, 0, -1, -1, 46271,
    2, 0, 0, 1, 32573,
    0, 0, 2, 1, 17198,
    2, 0, 1, -1, 9266,
    0, 0, 2, -1, 8822,
    2, -1, 0, -1, 8216,
    2, 0, -2, -1, 4324,
    2, 0, 1, 1, 4200,
    2, 1, 0, -1, -3359,
    2, -1, -1, 1, 2463,
    2, -1, 0, 1, 2211,
    2, -1, -1, -1, 2065,
    0, 1, -1, -1, -1870,
    4, 0, -1, -1, 1828,
    0, 1, 0, 1, -1794,
    0, 0, 0, 3, -1749,
    0, 1, -1, 1, -1565,
    1, 0, 0, 1, -1491,
    0, 1, 1, 1, -1475,
    0, 1, 1, -1, -1410,
    0, 1, 0, -1, -1344,
    1, 0, 0, -1, -1335,
    0, 0, 3, 1, 1107,
    4, 0, 0, -1, 1021,
    4, 0, -1, 1, 833,
    0, 0, 1, -3, 777,
    4, 0, -2, 1, 671,
    2, 0, 0, -3, 607,
    2, 0, 2, -1, 596,
    2, -1, 1, -1, 491,
    2, 0, -2, 1, -451,
    0, 0, 3, -1, 439,
    2, 0, 2, 1, 422,
    2, 0, -3, -1, 421,
    2, 1, -1, 1, -366,
    2, 1, 0, 1, -351,
    4, 0, 0, 1, 331,
    2, -1, 1, 1, 315,
    2, -2, 0, -1, 302,
    0, 0, 1, 3, -283,
    2, 1, 1, -1, -229,
    1, 1, 0, -1, 223,
    1, 1, 0, 1, 223,
    0, 1, -2, -1, -220,
    2, 1, -1, -1, -220,
    1, 0, 1, 1, -185,
    2, -1, -2, -1, 181,
    0, 1, 2, 1, -177,
    4, 0, -2, -1, 176,
    4, -1, -1, -1, 166,
    1, 0, 1, -1, -164,
    4, 0, 1, -1, 132,
    1, 0, -1, -1, -119,
    4, -1, 0, -1, 115,
    2, -2, 0, 1, 107
]);

// geocentric apparent equatorial coordinates of the Moon, Meeus ch. 47. d = days since J2000 (TT).
function moonCoords(d) {
    const t = d / 36525;

    // fundamental arguments (degrees), 47.1–47.6
    const Lp = 218.3164477 + t * (481267.88123421 + t * (-0.0015786 + t * (1 / 538841 - t / 65194000)));
    const D = 297.8501921 + t * (445267.1114034 + t * (-0.0018819 + t * (1 / 545868 - t / 113065000)));
    const M = 357.5291092 + t * (35999.0502909 + t * (-0.0001536 + t / 24490000));
    const Mp = 134.9633964 + t * (477198.8675055 + t * (0.0087414 + t * (1 / 69699 - t / 14712000)));
    const F = 93.2720950 + t * (483202.0175233 + t * (-0.0036539 + t * (-1 / 3526000 + t / 863310000)));
    const A1 = 119.75 + 131.849 * t;
    const A2 = 53.09 + 479264.290 * t;
    const A3 = 313.45 + 481266.484 * t;
    const E = 1 - t * (0.002516 + t * 0.0000074); // eccentricity factor for solar-anomaly terms

    const Dr = rad * D, Mr = rad * M, Mpr = rad * Mp, Fr = rad * F;
    let sl = 0, sr = 0, sb = 0;
    for (let i = 0; i < moonLon.length; i += 6) {
        const m = moonLon[i + 1];
        const arg = moonLon[i] * Dr + m * Mr + moonLon[i + 2] * Mpr + moonLon[i + 3] * Fr;
        const f = m === 1 || m === -1 ? E : m === 2 || m === -2 ? E * E : 1;
        sl += moonLon[i + 4] * f * sin(arg);
        sr += moonLon[i + 5] * f * cos(arg);
    }
    for (let i = 0; i < moonLat.length; i += 5) {
        const m = moonLat[i + 1];
        const arg = moonLat[i] * Dr + m * Mr + moonLat[i + 2] * Mpr + moonLat[i + 3] * Fr;
        const f = m === 1 || m === -1 ? E : m === 2 || m === -2 ? E * E : 1;
        sb += moonLat[i + 4] * f * sin(arg);
    }

    // additive terms (Venus, Jupiter and flattening of the Earth), 47 p.342
    const A1r = rad * A1, Lpr = rad * Lp;
    sl += 3958 * sin(A1r) + 1962 * sin(Lpr - Fr) + 318 * sin(rad * A2);
    sb += -2235 * sin(Lpr) + 382 * sin(rad * A3) + 175 * sin(A1r - Fr) + 175 * sin(A1r + Fr) +
        127 * sin(Lpr - Mpr) - 115 * sin(Lpr + Mpr);

    const {dpsi, eps} = nutationObliquity(t);
    const l = rad * (Lp + sl / 1e6 + dpsi); // apparent ecliptic longitude
    const b = rad * (sb / 1e6);             // ecliptic latitude

    return {
        ra: atan(sin(l) * cos(eps) - tan(b) * sin(eps), cos(l)),  // 13.3
        dec: asin(sin(b) * cos(eps) + cos(b) * sin(eps) * sin(l)), // 13.4
        dist: 385000.56 + sr / 1000, // distance to the Moon in km
        lon: l
    };
}



/** Standard-atmosphere refraction in degrees, smoothly faded below -1 degrees. */
export function getAtmosphericRefraction(geometricAltitude) {
  if (!Number.isFinite(geometricAltitude)) throw new RangeError('Invalid altitude');
  if (geometricAltitude <= -3 || geometricAltitude >= 90) return 0;
  const h = Math.max(-1, geometricAltitude);
  const correction = Math.max(0, 1.02 / tan((h + 10.3 / (h + 5.11)) * rad) / 60);
  return correction * smoothstep(-3, -1, geometricAltitude);
}

/** Unit direction in local east/north/up coordinates. */
export function horizontalDirection(azimuth, altitude) {
  if (!Number.isFinite(azimuth) || !Number.isFinite(altitude)) throw new RangeError('Invalid horizontal angles');
  const az = azimuth * rad, alt = altitude * rad, horizontal = cos(alt);
  return [horizontal * sin(az), horizontal * cos(az), sin(alt)];
}

function lunarPosition(date, latitude, longitude, coordinates) {
  const d = toDays(date), phi = latitude * rad;
  const nutation = nutationObliquity(toDaysTT(d) / 36525);
  // Apparent sidereal angle: UT Earth rotation plus the equation of equinoxes.
  const lst = (280.46061837 + 360.98564736629 * d + longitude + nutation.dpsi * cos(nutation.eps)) * rad;
  const { ra, dec, dist } = coordinates;
  const hourAngle = lst - ra;
  const geocentricAltitude = asin(clamp(sin(phi) * sin(dec) + cos(phi) * cos(dec) * cos(hourAngle), -1, 1)) / rad;
  const geocentricAzimuth = wrap(atan(sin(hourAngle), cos(hourAngle) * sin(phi) - tan(dec) * cos(phi)) / rad + 180);
  // Subtract a sea-level WGS84 observer in equatorial Cartesian coordinates.
  // This avoids the singularities of approximate RA/declination parallax fixes.
  const primeVerticalRadius = earthRadius / sqrt(1 - 0.00669437999014 * sin(phi) ** 2);
  const x = dist * cos(dec) * cos(ra) - primeVerticalRadius * cos(phi) * cos(lst);
  const y = dist * cos(dec) * sin(ra) - primeVerticalRadius * cos(phi) * sin(lst);
  const z = dist * sin(dec) - primeVerticalRadius * (1 - 0.00669437999014) * sin(phi);
  const east = -sin(lst) * x + cos(lst) * y;
  const north = -sin(phi) * cos(lst) * x - sin(phi) * sin(lst) * y + cos(phi) * z;
  const up = cos(phi) * cos(lst) * x + cos(phi) * sin(lst) * y + sin(phi) * z;
  const geometricAltitude = atan(up, sqrt(east * east + north * north)) / rad;
  const azimuth = wrap(atan(east, north) / rad);
  const refraction = getAtmosphericRefraction(geometricAltitude);
  const altitude = Math.min(90, geometricAltitude + refraction);
  const topDec = atan(z, sqrt(x * x + y * y)), topRA = atan(y, x), topHour = lst - topRA;
  const parallacticAngle = atan(sin(topHour), tan(phi) * cos(topDec) - sin(topDec) * cos(topHour)) / rad;
  const angularRadius = asin(1737.4 / sqrt(x * x + y * y + z * z)) / rad;
  return {
    altitude, geometricAltitude, geocentricAltitude, geocentricAzimuth, azimuth,
    refraction, distance: dist, topocentricDistance: sqrt(x * x + y * y + z * z),
    parallacticAngle, angularRadius,
    direction: horizontalDirection(azimuth, altitude),
    geometricDirection: horizontalDirection(azimuth, geometricAltitude),
    visible: altitude + angularRadius > 0,
  };
}

function lunarIllumination(date, moon) {
  const sun = sunCoords(toDaysTT(toDays(date)));
  const separation = acos(clamp(sin(sun.dec) * sin(moon.dec) + cos(sun.dec) * cos(moon.dec) * cos(sun.ra - moon.ra), -1, 1));
  const incidence = atan(149598000 * sin(separation), moon.dist - 149598000 * cos(separation));
  const brightLimbAngle = atan(cos(sun.dec) * sin(sun.ra - moon.ra),
    sin(sun.dec) * cos(moon.dec) - cos(sun.dec) * sin(moon.dec) * cos(sun.ra - moon.ra)) / rad;
  const phase = wrap((moon.lon - sun.lon) / (2 * PI), 1);
  const illumination = clamp((1 + cos(incidence)) / 2);
  return { illumination, fraction: illumination, phase, waxing: phase < 0.5, brightLimbAngle, angle: brightLimbAngle, elongation: separation / rad };
}

export function getMoonPosition(value, latitudeOrLocation, longitude) {
  const date = checkedDate(value);
  const latitude = typeof latitudeOrLocation === 'object' && latitudeOrLocation !== null ? latitudeOrLocation.latitude : latitudeOrLocation;
  const lng = typeof latitudeOrLocation === 'object' && latitudeOrLocation !== null ? latitudeOrLocation.longitude : longitude;
  checkedLocation(latitude, lng);
  return lunarPosition(date, latitude, lng, moonCoords(toDaysTT(toDays(date))));
}

export function getMoonIllumination(value = new Date()) {
  const date = checkedDate(value);
  return lunarIllumination(date, moonCoords(toDaysTT(toDays(date))));
}

/** Continuous instant-based state; time-zone/DST display cannot move either body. */
export function getCelestialState(value, { latitude, longitude }) {
  const date = checkedDate(value); checkedLocation(latitude, longitude);
  const solar = getSolarPosition(date, latitude, longitude);
  const sun = { ...solar, geometricAltitude: solar.altitude,
    apparentAltitude: solar.altitude + getAtmosphericRefraction(solar.altitude),
    direction: horizontalDirection(solar.azimuth, solar.altitude), visible: solar.altitude > -0.833 };
  const moonCoordsAtTime = moonCoords(toDaysTT(toDays(date)));
  const position = lunarPosition(date, latitude, longitude, moonCoordsAtTime);
  const illumination = lunarIllumination(date, moonCoordsAtTime);
  const moon = { ...position, ...illumination, tiltAngle: illumination.brightLimbAngle - position.parallacticAngle };
  return { sun, moon, nightFactor: 1 - smoothstep(-8, 3, sun.altitude), timestamp: date.getTime() };
}
