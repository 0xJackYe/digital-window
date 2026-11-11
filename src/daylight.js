/**
 * Five photographic light states driven by the astronomical solar state.
 * Twilight follows solar altitude, while the middle of the day follows the
 * day's own sunrise/noon/sunset span. A low winter Sun can therefore still
 * reach the noon image. These are visual blends, not weather predictions.
 */
export const DAYLIGHT_PHASES = Object.freeze([
  Object.freeze({ id: 'dawn', label: '黎明' }),
  Object.freeze({ id: 'morning', label: '早晨' }),
  Object.freeze({ id: 'noon', label: '中午' }),
  Object.freeze({ id: 'evening', label: '傍晚' }),
  Object.freeze({ id: 'night', label: '晚上' }),
]);

const HOUR = 3_600_000;
const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const smoothstep = (min, max, value) => {
  const t = clamp((value - min) / (max - min));
  return t * t * (3 - 2 * t);
};
const timestamp = (value) => value == null ? NaN : new Date(value).getTime();

/**
 * @param {object} solar A state from getSolarState (altitude/hourAngle required).
 * @param {Date|number|string} [date] The state’s real instant, including previews.
 * Omit date to infer solar-day progress from hour angle and the event spans.
 * @returns {{phase:string,label:string,weights:{dawn:number,morning:number,noon:number,evening:number,night:number}}}
 */
export function getDaylightBlend(solar, date) {
  if (!Number.isFinite(solar?.altitude) || !Number.isFinite(solar?.hourAngle)) {
    throw new TypeError('A finite solar altitude and hourAngle are required');
  }
  const altitude = clamp(solar.altitude, -90, 90);
  const hourAngle = ((solar.hourAngle + 180) % 360 + 360) % 360 - 180;
  const sunrise = timestamp(solar.sunrise);
  const noon = timestamp(solar.solarNoon);
  const sunset = timestamp(solar.sunset);
  const instant = date === undefined ? NaN : timestamp(date);
  if (date !== undefined && !Number.isFinite(instant)) throw new RangeError('Invalid daylight blend date');

  const riseSpan = Number.isFinite(noon - sunrise) && noon > sunrise ? (noon - sunrise) / HOUR : 12;
  const setSpan = Number.isFinite(sunset - noon) && sunset > noon ? (sunset - noon) / HOUR : 12;
  let riseProgress = clamp(1 + hourAngle / (15 * riseSpan));
  let setProgress = clamp(hourAngle / (15 * setSpan));
  if (Number.isFinite(instant) && Number.isFinite(noon)) {
    if (Number.isFinite(sunrise) && noon > sunrise) riseProgress = clamp((instant - sunrise) / (noon - sunrise));
    if (Number.isFinite(sunset) && sunset > noon) setProgress = clamp((instant - noon) / (sunset - noon));
  }

  // The same geometric twilight thresholds work across seasons and time zones.
  const dawnVisible = smoothstep(-10, -3, altitude);
  const morningVisible = smoothstep(-3, 8, altitude);
  const eveningVisible = smoothstep(-10, 2, altitude);
  const rising = {
    dawn: dawnVisible * (1 - morningVisible),
    morning: dawnVisible * morningVisible,
    noon: 0,
    evening: 0,
    night: 1 - dawnVisible,
  };
  const falling = { dawn: 0, morning: 0, noon: 0, evening: eveningVisible, night: 1 - eveningVisible };

  // Smooth the direction around solar noon and midnight. At ordinary night
  // both sides are the night image; this also avoids polar-day discontinuities.
  const fallingWeight = smoothstep(-0.12, 0.12, Math.sin(hourAngle * Math.PI / 180));
  const weights = Object.fromEntries(DAYLIGHT_PHASES.map(({ id }) => [id,
    rising[id] * (1 - fallingWeight) + falling[id] * fallingWeight,
  ]));
  const noonProgress = hourAngle <= 0
    ? smoothstep(0.45, 0.92, riseProgress)
    : 1 - smoothstep(0.08, 0.8, setProgress);
  const noonWeight = noonProgress * smoothstep(-3, 3, altitude);
  for (const { id } of DAYLIGHT_PHASES) weights[id] *= 1 - noonWeight;
  weights.noon += noonWeight;

  const total = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
  for (const { id } of DAYLIGHT_PHASES) weights[id] = clamp(weights[id] / total);
  const dominant = DAYLIGHT_PHASES.reduce((current, phase) => weights[phase.id] > weights[current.id] ? phase : current);
  return { phase: dominant.id, label: dominant.label, weights };
}
