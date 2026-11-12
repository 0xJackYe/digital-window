/** Continuous photographic light field. No clock phases or reconstructed city geometry. */
const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
const smoothstep = (a, b, value) => { const t = clamp((value - a) / (b - a)); return t * t * (3 - 2 * t); };
const tint = (color, amount) => [0, 1, 2].map((index) => clamp(color?.[index] ?? 1) * amount);

export const ORIGINAL_PHOTO_GRADE = Object.freeze({ baseTint: [1, 1, 1], sunTint: [0, 0, 0], moonTint: [0, 0, 0], twilightTint: [0, 0, 0], daylight: 1, night: 0, twilight: 0 });

/** Display-referred exposure and white balance, evaluated from floating-point solar angles. */
export function photographicGrade(lighting) {
  const daylight = clamp(lighting?.daylight ?? 1);
  const night = 1 - daylight;
  const altitude = clamp(lighting?.sun?.altitude ?? 45, -90, 90);
  const sun = clamp((lighting?.sun?.strength ?? 0) / .38);
  const moon = clamp((lighting?.moon?.strength ?? 0) / .028);
  const twilight = Math.exp(-Math.pow((altitude + 2) / 7, 2));
  const warmth = Math.exp(-Math.pow((altitude - 3) / 15, 2)) * daylight * sun;
  const gain = .105 + .895 * Math.pow(daylight, .72);
  // Daytime retains the original photograph's high-frequency texture. At night,
  // exposure and a cool sky fill change together, rather than a black overlay.
  const base = gain * (1 - sun * .12);
  const baseTint = [base * (1 - night * .27), base * (1 - night * .14 - warmth * .065), base * (1 + night * .07 - warmth * .23)];
  return {
    baseTint, sunTint: tint(lighting?.sun?.color, sun * .22),
    moonTint: tint(lighting?.moon?.color, moon * .105),
    twilightTint: [twilight * .20, twilight * .067, twilight * .025],
    daylight, night, twilight,
  };
}

/**
 * Smooth screen-space illumination, preserving every original photographic edge.
 * sky is a soft mask classified from this very photo, not another scene's depth.
 * Source directions are camera-relative and remain continuous across north.
 */
export function samplePhotographicLight(grade, lighting, u, v, sky = 0) {
  const sun = lighting?.sun?.direction ?? [0, 1, 0];
  const moon = lighting?.moon?.direction ?? [0, 1, 0];
  const facing = (direction) => clamp(.5 + direction[0] * (u - .5) * .72 + direction[1] * (.5 - v) * .55 + direction[2] * .19);
  const solar = facing(sun), lunar = facing(moon);
  const upper = 1 - smoothstep(.15, .78, v);
  const skyWeight = clamp(sky) * .75 + upper * .25;
  const horizon = Math.exp(-Math.pow((v - .43) / .31, 2));
  const sunward = .32 + .68 * solar;
  return grade.baseTint.map((base, index) => {
    const direct = grade.sunTint[index] * (.18 + solar * .82) * (1 - skyWeight * .24);
    const lunarFill = grade.moonTint[index] * (.15 + lunar * .85) * (1 - skyWeight * .30);
    const dusk = grade.twilightTint[index] * horizon * sunward * (.18 + skyWeight * .82);
    // The cool upper-sky fill and warm horizon have independent color gradients.
    const skyFill = [0, .016, .038][index] * grade.daylight * skyWeight;
    return clamp(base + direct + lunarFill + dusk + skyFill);
  });
}

/** Conservative, source-aligned sky likelihood. It never erases photo content. */
export function photographicSkyLikelihood(r, g, b, v) {
  const high = Math.max(r, g, b), low = Math.min(r, g, b);
  const upper = 1 - smoothstep(.25, .72, v);
  const blue = smoothstep(-.015, .15, b - (r + g) * .5) * smoothstep(.12, .42, b);
  const pale = smoothstep(.58, .88, (r + g + b) / 3) * (1 - smoothstep(.10, .36, high - low));
  return upper * Math.max(blue, pale * .75);
}
