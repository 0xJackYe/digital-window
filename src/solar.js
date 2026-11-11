/**
 * Solar coordinates are independently implemented from the US Naval Observatory
 * approximation: https://aa.usno.navy.mil/faq/sun_approx
 * Horizon convention (-0.833 degrees) follows NOAA's solar calculator:
 * https://gml.noaa.gov/grad/solcalc/calcdetails.html
 *
 * Coordinates are astronomical estimates, not measured weather. The scene's
 * daylight and screen positions are artistic mappings of the calculated Sun.
 * All angles in the public API are degrees; longitude is positive east.
 */
const DAY = 86_400_000;
const MINUTE = 60_000;
const RAD = Math.PI / 180;
const J2000 = Date.UTC(2000, 0, 1, 12);
const formatters = new Map();
const eventCache = new Map();
const pad = (value) => String(value).padStart(2, '0');
const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const modulo = (value, divisor) => ((value % divisor) + divisor) % divisor;
const signedAngle = (value) => modulo(value + 180, 360) - 180;
const smoothstep = (min, max, value) => {
  const t = clamp((value - min) / (max - min));
  return t * t * (3 - 2 * t);
};

function asDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new RangeError('Invalid date');
  return date;
}

function formatter(timeZone) {
  if (!formatters.has(timeZone)) {
    formatters.set(timeZone, new Intl.DateTimeFormat('en-GB', {
      timeZone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hourCycle: 'h23', weekday: 'short', timeZoneName: 'shortOffset',
    }));
  }
  return formatters.get(timeZone);
}

/** Return wall-clock components for a real instant; includes IANA DST rules. */
export function getZonedDateParts(value, timeZone = 'Asia/Shanghai') {
  const date = asDate(value);
  const parts = Object.fromEntries(formatter(timeZone).formatToParts(date)
    .filter(({ type }) => type !== 'literal').map(({ type, value: part }) => [type, part]));
  const result = {};
  for (const key of ['year', 'month', 'day', 'hour', 'minute', 'second']) result[key] = Number(parts[key]);
  const representedUtc = Date.UTC(result.year, result.month - 1, result.day, result.hour, result.minute, result.second);
  result.offsetMinutes = Math.round((representedUtc - Math.floor(date.getTime() / 1000) * 1000) / MINUTE);
  result.weekday = parts.weekday;
  result.timeZoneName = parts.timeZoneName;
  result.dateKey = `${result.year}-${pad(result.month)}-${pad(result.day)}`;
  return result;
}

/**
 * Convert local wall time into an instant. During a repeated DST hour the earlier
 * occurrence is chosen. A skipped local time throws, rather than silently shifting.
 */
export function zonedDateTimeToDate(parts, timeZone = 'Asia/Shanghai') {
  const { year, month, day, hour = 0, minute = 0, second = 0 } = parts;
  const wallUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  const offsets = new Set([-DAY, 0, DAY].map((delta) => getZonedDateParts(wallUtc + delta, timeZone).offsetMinutes));
  const candidates = [...offsets].map((offset) => new Date(wallUtc - offset * MINUTE))
    .filter((date) => {
      const local = getZonedDateParts(date, timeZone);
      return ['year', 'month', 'day', 'hour', 'minute', 'second'].every((key) => local[key] === ({ year, month, day, hour, minute, second })[key]);
    }).sort((a, b) => a - b);
  if (!candidates.length) throw new RangeError('This local time does not exist in the selected time zone');
  return candidates[0];
}

/** Geometric solar position, using the actual instant rather than local-clock hours. */
export function getSolarPosition(value, latitude, longitude) {
  const date = asDate(value);
  if (!Number.isFinite(latitude) || Math.abs(latitude) > 90 || !Number.isFinite(longitude) || Math.abs(longitude) > 180) {
    throw new RangeError('Latitude must be -90…90 and longitude must be -180…180');
  }
  const days = (date - J2000) / DAY;
  const anomaly = modulo(357.529 + 0.98560028 * days, 360) * RAD;
  const meanLongitude = modulo(280.459 + 0.98564736 * days, 360);
  const ecliptic = (meanLongitude + 1.915 * Math.sin(anomaly) + 0.020 * Math.sin(2 * anomaly)) * RAD;
  const obliquity = (23.439 - 0.00000036 * days) * RAD;
  const rightAscension = Math.atan2(Math.cos(obliquity) * Math.sin(ecliptic), Math.cos(ecliptic)) / RAD;
  const declination = Math.asin(Math.sin(obliquity) * Math.sin(ecliptic));
  const equationOfTime = signedAngle(meanLongitude - rightAscension) * 4;
  const utcMinutes = date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60 + date.getUTCMilliseconds() / MINUTE;
  const hourAngle = signedAngle((utcMinutes + 4 * longitude + equationOfTime) / 4 - 180);
  const lat = latitude * RAD;
  const hour = hourAngle * RAD;
  const sinAltitude = Math.sin(lat) * Math.sin(declination) + Math.cos(lat) * Math.cos(declination) * Math.cos(hour);
  const altitude = Math.asin(clamp(sinAltitude, -1, 1)) / RAD;
  const azimuth = modulo(Math.atan2(Math.sin(hour), Math.cos(hour) * Math.sin(lat) - Math.tan(declination) * Math.cos(lat)) / RAD + 180, 360);
  return { altitude, azimuth, hourAngle, declination: declination / RAD, equationOfTime };
}

function horizonCrossing(a, b, latitude, longitude) {
  let left = a;
  let right = b;
  let leftValue = getSolarPosition(left, latitude, longitude).altitude + 0.833;
  for (let i = 0; i < 18; i++) {
    const middle = (left + right) / 2;
    const middleValue = getSolarPosition(middle, latitude, longitude).altitude + 0.833;
    if ((leftValue > 0) === (middleValue > 0)) {
      left = middle;
      leftValue = middleValue;
    } else right = middle;
  }
  return new Date((left + right) / 2);
}

function getSolarEvents(date, latitude, longitude, timeZone, local) {
  const key = `${local.dateKey}|${latitude}|${longitude}|${timeZone}`;
  if (eventCache.has(key)) return eventCache.get(key);
  const localNoon = zonedDateTimeToDate({ ...local, hour: 12, minute: 0, second: 0 }, timeZone).getTime();
  // Search across the whole local date, including 23/25-hour DST days. Filter
  // each crossing by its actual local date rather than assuming a 24-hour day.
  let previous = localNoon - 18 * 60 * MINUTE;
  let previousAltitude = getSolarPosition(previous, latitude, longitude).altitude;
  let sunrise = null;
  let sunset = null;
  let minAltitude = 90;
  let maxAltitude = -90;
  for (let current = previous + 10 * MINUTE; current <= localNoon + 18 * 60 * MINUTE; current += 10 * MINUTE) {
    const altitude = getSolarPosition(current, latitude, longitude).altitude;
    if (getZonedDateParts(current, timeZone).dateKey === local.dateKey) {
      minAltitude = Math.min(minAltitude, altitude);
      maxAltitude = Math.max(maxAltitude, altitude);
    }
    if ((altitude + 0.833 > 0) !== (previousAltitude + 0.833 > 0)) {
      const crossing = horizonCrossing(previous, current, latitude, longitude);
      if (getZonedDateParts(crossing, timeZone).dateKey === local.dateKey) {
        if (altitude > previousAltitude) sunrise = crossing;
        else sunset = crossing;
      }
    }
    previous = current;
    previousAltitude = altitude;
  }
  let solarNoon = localNoon;
  for (let i = 0; i < 4; i++) {
    const { hourAngle } = getSolarPosition(solarNoon, latitude, longitude);
    solarNoon -= hourAngle * 4 * MINUTE;
  }
  const result = {
    sunrise: sunrise?.getTime() ?? null,
    sunset: sunset?.getTime() ?? null,
    solarNoon,
    polarDay: !sunrise && !sunset && minAltitude > -0.833,
    polarNight: !sunrise && !sunset && maxAltitude < -0.833,
  };
  if (eventCache.size >= 64) eventCache.delete(eventCache.keys().next().value);
  eventCache.set(key, result);
  return result;
}

/** Complete scene-ready state for a selected location and real UTC instant. */
export function getSolarState(value, { latitude, longitude, timeZone = 'Asia/Shanghai' }) {
  const date = asDate(value);
  const position = getSolarPosition(date, latitude, longitude);
  const local = getZonedDateParts(date, timeZone);
  const events = getSolarEvents(date, latitude, longitude, timeZone, local);
  const { altitude, hourAngle } = position;
  const rising = hourAngle < 0;
  const phase = altitude < -6 ? 'night' : altitude <= 6 ? (rising ? 'dawn' : 'dusk') : 'day';
  const phaseLabel = ({ night: '夜晚', dawn: '晨光', day: '日间', dusk: '暮色' })[phase];
  const sunrise = events.sunrise === null ? null : new Date(events.sunrise);
  const sunset = events.sunset === null ? null : new Date(events.sunset);
  const clock = (instant) => {
    const p = getZonedDateParts(instant, timeZone);
    return `${pad(p.hour)}:${pad(p.minute)}`;
  };
  const offsetSign = local.offsetMinutes >= 0 ? '+' : '−';
  const offsetText = `UTC${offsetSign}${pad(Math.floor(Math.abs(local.offsetMinutes) / 60))}:${pad(Math.abs(local.offsetMinutes) % 60)}`;
  const dayProgress = sunrise && sunset ? (date - sunrise) / (sunset - sunrise) : (hourAngle + 90) / 180;
  return {
    ...position,
    phase, phaseLabel,
    daylight: smoothstep(-8, 25, altitude),
    twilight: clamp(1 - Math.abs(altitude) / 12),
    sunX: 10 + clamp(dayProgress) * 80,
    sunY: clamp(64 - Math.max(0, altitude) * 0.62, 8, 74),
    sunVisible: altitude > -0.833,
    sunrise, sunset,
    solarNoon: new Date(events.solarNoon),
    sunriseText: sunrise ? clock(sunrise) : (events.polarDay ? '极昼' : events.polarNight ? '极夜' : '—'),
    sunsetText: sunset ? clock(sunset) : (events.polarDay ? '极昼' : events.polarNight ? '极夜' : '—'),
    polarDay: events.polarDay,
    polarNight: events.polarNight,
    time: `${pad(local.hour)}:${pad(local.minute)}`,
    timeWithSeconds: `${pad(local.hour)}:${pad(local.minute)}:${pad(local.second)}`,
    dateText: `${local.year}年${local.month}月${local.day}日`,
    timeZone, timeZoneName: local.timeZoneName, offsetText, local,
  };
}
