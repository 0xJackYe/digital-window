/**
 * Authored 2.5D proxy geometry for the fixed photographic camera views.
 * This is deliberately an approximate illustration model, not measured depth,
 * photogrammetry, monocular reconstruction, or a claim of full scene geometry.
 * No photograph is edited; these two transient canvases are shader data maps.
 *
 * normalDepth: RGB = (unit normal + 1) * 127.5, A = depth (0 near, 1 far).
 * Normals use [camera-right, world-up, camera-forward]. Visible front walls
 * face -Z; ground/water face +Y. material: R sky, G water, B roughness,
 * A solid occlusion strength. Sky and water are not solid shadow casters.
 */
export const SCENE_GEOMETRY_VERSION = 'authored-2.5d-1.0';
const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const lerp = (a, b, t) => a + (b - a) * t;
const normalize = (normal) => {
  const length = Math.hypot(...normal) || 1;
  return normal.map((value) => value / length);
};
const FRONT = [0, 0, -1];
const ROOF = [0, .6, -.8];
const GROUND = [0, 1, 0];
const whole = [[0, 0], [1, 0], [1, 1], [0, 1]];
const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const slopeDepth = (top, bottom, far, near) => (x, y) => lerp(far, near, clamp((y - top) / (bottom - top)));

function createCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  return canvas;
}

function createPainter(width, height) {
  const count = width * height;
  const fields = {
    normal: new Float32Array(count * 3), depth: new Float32Array(count),
    water: new Float32Array(count), roughness: new Float32Array(count),
    occlusion: new Float32Array(count), skyBlock: new Uint8Array(count),
  };
  for (let i = 0; i < count; i++) {
    fields.normal[i * 3 + 2] = -1;
    fields.depth[i] = .65; fields.roughness[i] = .86; fields.occlusion[i] = 1;
  }
  const mask = createCanvas(width, height);
  const context = mask.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('A 2D canvas context is required for scene geometry');
  function face(points, values = {}, feather = 1) {
    context.clearRect(0, 0, width, height);
    context.filter = `blur(${Math.max(.45, feather * width / 512)}px)`;
    context.fillStyle = '#fff'; context.beginPath();
    points.forEach(([x, y], i) => i ? context.lineTo(x * width, y * height) : context.moveTo(x * width, y * height));
    context.closePath(); context.fill(); context.filter = 'none';
    const coverage = context.getImageData(0, 0, width, height).data;
    const constantNormal = typeof values.normal === 'function' ? null : normalize(values.normal || FRONT);
    for (let i = 0; i < count; i++) {
      const alpha = coverage[i * 4 + 3] / 255;
      if (alpha < .002) continue;
      const x = (i % width + .5) / width, y = (Math.floor(i / width) + .5) / height;
      const normal = constantNormal || normalize(values.normal(x, y));
      for (let channel = 0; channel < 3; channel++) fields.normal[i * 3 + channel] = lerp(fields.normal[i * 3 + channel], normal[channel], alpha);
      for (const key of ['depth', 'water', 'roughness', 'occlusion']) {
        if (values[key] === undefined) continue;
        const value = typeof values[key] === 'function' ? values[key](x, y) : values[key];
        fields[key][i] = lerp(fields[key][i], clamp(value), alpha);
      }
      if (values.blockSky && alpha > .5) fields.skyBlock[i] = 1;
    }
  }
  return { ...fields, face };
}

function authorManhattan(p) {
  p.face(whole, { normal: [0, .035, -1], depth: slopeDepth(.34, 1, .95, .26), roughness: .79 });
  // Distant vertical city planes. These deliberately avoid a checkerboard of
  // per-window normals: the source photograph already contains fine detail.
  const towers = [
    [.31, .32, .35, .59, .82, [.25, 0, -1]], [.35, .275, .42, .55, .87, [-.12, 0, -1]],
    [.47, .345, .52, .60, .91, [.2, 0, -1]], [.57, .355, .615, .59, .94, [-.14, 0, -1]],
    [.615, .37, .65, .60, .94, [.25, 0, -1]], [.76, .405, .81, .60, .94, [-.2, 0, -1]],
  ];
  for (const [x0, y0, x1, y1, depth, normal] of towers) p.face(rect(x0, y0, x1, y1), { normal, depth }, .8);
  p.face([[.662, .53], [.665, .265], [.674, .23], [.678, .15], [.681, .11], [.685, .22], [.696, .26], [.701, .53]], { normal: [-.22, .035, -1], depth: .97, roughness: .73, blockSky: true }, .7);
  // Near brick apartment and its narrow return wall.
  p.face([[0, .23], [.052, .225], [.052, .39], [.238, .48], [.238, 1], [0, 1]], { normal: [.03, .015, -1], depth: .18, roughness: .91 }, .9);
  p.face([[.238, .48], [.27, .42], [.27, 1], [.238, 1]], { normal: [.74, .025, -.67], depth: .24, roughness: .88 });
  p.face([[0, .36], [.19, .38], [.27, .42], [.238, .48], [.06, .41], [0, .41]], { normal: [.08, .76, -.64], depth: .20 });
  p.face([[.24, .56], [.35, .56], [.45, .66], [.45, 1], [.24, 1]], { normal: [.36, .03, -.93], depth: slopeDepth(.56, 1, .46, .24), roughness: .89 });
  p.face([[.35, .66], [.49, .64], [.50, 1], [.35, 1]], { normal: [.68, 0, -.73], depth: .43 });
  p.face([[.49, .55], [.58, .55], [.58, 1], [.50, 1]], { normal: [.06, 0, -1], depth: .60, roughness: .86 });
  p.face([[.58, .56], [.62, .59], [.62, .87], [.58, .92]], { normal: [.73, .02, -.68], depth: .62 });
  p.face([[.75, .61], [1, .55], [1, 1], [.75, 1]], { normal: [-.12, .02, -1], depth: .19, roughness: .9 });
  p.face([[.69, .71], [.75, .69], [.75, 1], [.63, 1]], { normal: [-.78, .02, -.63], depth: .37 });
  p.face([[.77, .54], [1, .54], [1, .58], [.74, .61]], { normal: [-.16, .88, -.45], depth: .22, roughness: .83 });
  // Water towers: simple round front surfaces and pitched lids; not water.
  p.face([[.063, .14], [.112, .14], [.112, .235], [.064, .235]], { normal: (x) => [(x - .087) * 22, .02, -1], depth: .20, roughness: .94, blockSky: true }, .7);
  p.face([[.06, .14], [.09, .106], [.121, .141]], { normal: [.04, .69, -.72], depth: .20, roughness: .86, blockSky: true }, .6);
  p.face([[.777, .579], [.833, .579], [.833, .674], [.777, .674]], { normal: (x) => [(x - .805) * 22, .02, -1], depth: .21, roughness: .94 });
  p.face([[.772, .58], [.81, .54], [.848, .58]], { normal: [.02, .72, -.69], depth: .21 });
  // Small street/trees between buildings recede into the city.
  p.face([[.57, 1], [.67, .65], [.72, .65], [.65, 1]], { normal: [0, .28, -.96], depth: slopeDepth(.65, 1, .72, .28), roughness: .98 }, 2);
  return .58;
}

function authorKyoto(p) {
  p.face(whole, { normal: [0, .08, -1], depth: slopeDepth(.4, 1, .91, .22), roughness: .91 });
  // Stone road is a receiving ground plane, not a dark cut-out.
  p.face([[.20, 1], [.60, .69], [.71, .69], [.83, 1]], { normal: GROUND, depth: slopeDepth(.69, 1, .80, .12), roughness: .93, occlusion: .92 }, 1.3);
  p.face([[0, .43], [.35, .55], [.60, .66], [.60, .74], [.20, 1], [0, 1]], { normal: [.67, .04, -.74], depth: slopeDepth(.44, 1, .62, .18), roughness: .94 });
  p.face([[.36, .55], [.59, .62], [.63, .69], [.48, .81], [.36, .85]], { normal: [.76, .025, -.65], depth: .63, roughness: .9 });
  p.face([[.76, .40], [1, .25], [1, 1], [.83, 1], [.71, .69]], { normal: [-.68, .035, -.73], depth: slopeDepth(.40, 1, .62, .17), roughness: .93 });
  p.face([[.73, .56], [.86, .51], [1, .47], [1, .56], [.74, .64]], { normal: [-.18, .64, -.75], depth: .38, roughness: .87 });
  p.face([[0, .295], [.31, .39], [.48, .47], [.61, .58], [.58, .63], [.33, .53], [0, .425]], { normal: [.18, .65, -.74], depth: slopeDepth(.3, .63, .3, .58), roughness: .87 });
  p.face([[.46, .23], [.54, .34], [.52, .38], [.45, .30]], { normal: [.15, .64, -.75], depth: .61, roughness: .9 });
  p.face([[.78, .39], [.91, .11], [1, 0], [1, .18], [.82, .42]], { normal: [-.2, .62, -.76], depth: .40, roughness: .9 });
  // Five separate pagoda roofs leave actual sky gaps for pixel refinement.
  for (const [top, bottom, halfWidth] of [[.207, .281, .078], [.293, .346, .085], [.36, .407, .084], [.424, .466, .087], [.474, .516, .09]]) {
    p.face([[.682, top], [.682 + halfWidth, bottom - .01], [.682 + halfWidth * .75, bottom], [.682 - halfWidth * .73, bottom], [.682 - halfWidth, bottom - .011]], { normal: [0, .64, -.77], depth: .91, roughness: .92 }, .65);
    p.face(rect(.657, bottom - .006, .707, bottom + .035), { normal: [0, .02, -1], depth: .92, roughness: .94 }, .6);
  }
  p.face(rect(.678, .057, .684, .215), { normal: FRONT, depth: .94, roughness: .86 }, .45);
  // Foliage is soft solid geometry, but not a sky blocker: blue gaps between
  // leaves remain eligible for the top-connected color classifier.
  p.face([[0, 0], [.46, 0], [.53, .17], [.43, .27], [.35, .51], [.20, .42], [0, .67]], { normal: (x) => [.2 * Math.sin(x * 15), .30, -.95], depth: .23, roughness: 1, occlusion: .9 }, 2);
  p.face([[.52, .52], [.63, .47], [.73, .49], [.76, .64], [.64, .67], [.54, .63]], { normal: [0, .30, -.95], depth: .81, roughness: 1, occlusion: .9 }, 2);
  return .61;
}

function authorMedieval(p) {
  p.face(whole, { normal: [0, .12, -.99], depth: slopeDepth(.31, 1, .96, .23), roughness: .89 });
  p.face([[.40, 1], [.65, .67], [.73, 1]], { normal: GROUND, depth: slopeDepth(.67, 1, .81, .12), roughness: .96, occlusion: .94 });
  p.face([[0, .31], [.48, .67], [0, .85]], { normal: [.18, .64, -.75], depth: slopeDepth(.31, .85, .44, .15), roughness: .91 }, 1.4);
  p.face([[0, .85], [.48, .67], [.45, 1], [0, 1]], { normal: [.31, .04, -.95], depth: .19, roughness: .95 });
  p.face([[.70, .48], [1, .40], [1, 1], [.70, 1]], { normal: [-.43, .03, -.90], depth: slopeDepth(.48, 1, .54, .16), roughness: .95 });
  p.face([[.69, .49], [.84, .29], [1, .23], [1, .39], [.71, .57]], { normal: [-.22, .64, -.74], depth: .36, roughness: .9 });
  p.face([[.28, .36], [.40, .35], [.52, .56], [.36, .49]], { normal: [.20, .66, -.72], depth: .67, roughness: .91 });
  p.face([[.48, .52], [.56, .58], [.61, .61], [.53, .68]], { normal: [.3, .62, -.72], depth: .73, roughness: .93 });
  p.face([[.52, .69], [.61, .64], [.61, .88], [.48, 1]], { normal: [.7, .025, -.71], depth: .64, roughness: .92 });
  p.face([[.65, .65], [.69, .61], [.71, 1], [.65, .94]], { normal: [-.76, .02, -.65], depth: .68, roughness: .94 });
  // Dome and belfry, with only narrow solid areas blocking white-sky leakage.
  p.face([[.364, .233], [.378, .186], [.399, .162], [.420, .181], [.443, .229], [.442, .311], [.365, .311]], { normal: (x) => [(x - .403) * 10, .28, -.94], depth: .93, roughness: .66, blockSky: true }, .7);
  p.face(rect(.365, .25, .445, .39), { normal: [.12, .03, -.99], depth: .94, roughness: .88 }, .8);
  p.face([[.462, .342], [.462, .175], [.468, .12], [.473, .087], [.477, .12], [.485, .176], [.485, .342]], { normal: [-.16, .03, -.99], depth: .94, roughness: .88 }, .6);
  // Gothic towers are thin polygons instead of one solid skyline rectangle.
  for (const [x, top, bottom, half] of [[.696, .118, .406, .025], [.747, .055, .406, .026]]) {
    p.face([[x - half, bottom], [x - half, top + .12], [x - half * .48, top + .10], [x, top], [x + half * .48, top + .10], [x + half, top + .12], [x + half, bottom]], { normal: [x < .72 ? .15 : -.15, .03, -.99], depth: .97, roughness: .91 }, .6);
  }
  p.face([[0, 0], [.31, 0], [.34, .10], [.30, .36], [.19, .41], [0, .31]], { normal: [.1, .30, -.95], depth: .25, roughness: 1, occlusion: .9 }, 2);
  p.face([[.48, .34], [.55, .27], [.60, .33], [.64, .49], [.59, .60], [.50, .57]], { normal: [0, .32, -.95], depth: .78, roughness: 1, occlusion: .9 }, 2);
  return .53;
}

function authorFuji(p) {
  p.face(whole, { normal: [0, .28, -.96], depth: .89, roughness: .98 });
  const mountain = [[0, .565], [.075, .57], [.125, .565], [.22, .52], [.30, .46], [.35, .43], [.43, .38], [.47, .344], [.51, .344], [.55, .385], [.64, .45], [.72, .49], [.80, .565], [.90, .59], [1, .615], [1, .676], [0, .676]];
  p.face(mountain, {
    normal: (x, y) => {
      const side = clamp((x - .5) * 1.15, -.48, .48);
      return [side, .48 + .10 * clamp((.64 - y) / .30), -Math.sqrt(Math.max(.2, 1 - side * side - .55 * .55))];
    },
    depth: (x, y) => .91 + .065 * clamp((.676 - y) / .34), roughness: .98, blockSky: true,
  }, 1.0);
  p.face(rect(0, .625, 1, .682), { normal: [0, .24, -.97], depth: .86, roughness: .98 }, 1.5);
  p.face(rect(0, .681, 1, 1), { normal: GROUND, depth: slopeDepth(.681, 1, .78, .12), water: 1, roughness: .16, occlusion: .12 }, .8);
  return .665;
}

function authorLegacy(id, p) {
  if (id === 'forest') {
    p.face(whole, { normal: (x) => [.10 * Math.sin(x * 23), .20, -.98], depth: (x, y) => lerp(.78, .24, y), roughness: 1, occlusion: .88 }, 2);
    p.face([[.05, 1], [.39, .68], [.55, .68], [.95, 1]], { normal: [0, .82, -.57], depth: slopeDepth(.68, 1, .65, .16), roughness: 1 }, 8);
    return 0;
  }
  const coast = id === 'coast';
  p.face(whole, { normal: [0, .42, -.91], depth: .84, roughness: .96 });
  p.face(rect(0, coast ? .48 : .60, 1, 1), { normal: GROUND, depth: slopeDepth(coast ? .48 : .60, 1, .83, .13), water: 1, roughness: coast ? .20 : .15, occlusion: .12 }, 2);
  if (coast) {
    p.face([[0, .35], [.15, .39], [.31, .56], [.25, .72], [0, 1]], { normal: [0, .72, -.69], depth: slopeDepth(.35, 1, .58, .14), water: 0, roughness: .98, occlusion: .94 }, 3);
  } else {
    p.face([[0, .26], [.21, .24], [.34, .37], [.45, .34], [.58, .38], [.79, .28], [1, .23], [1, .60], [0, .60]], { normal: (x) => [clamp((x - .5) * .7, -.3, .3), .53, -.85], depth: .91, water: 0, roughness: .98 }, 2);
    p.face([[.48, .52], [.79, .43], [1, .27], [1, .72], [.75, .62]], { normal: [-.21, .26, -.94], depth: .75, water: 0, roughness: 1 }, 2);
    p.face([[0, .04], [.22, .07], [.34, .36], [.26, 1], [0, 1]], { normal: [.16, .23, -.96], depth: .16, water: 0, roughness: 1, occlusion: .9 }, 3);
  }
  return coast ? .56 : .45;
}

function classifySky(pixels, width, height, maxY, skyBlock) {
  const count = width * height, allowed = new Uint8Array(count), sky = new Uint8Array(count);
  if (maxY <= 0) return sky;
  for (let y = 0; y < Math.min(height, Math.ceil(height * maxY)); y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x, offset = i * 4;
      if (skyBlock[i]) continue;
      const r = pixels[offset], g = pixels[offset + 1], b = pixels[offset + 2];
      const coolBlue = b > 105 && b > r + 8 && b > g * .98 && g > r * .92;
      const paleCloud = Math.min(r, g, b) > 165 && Math.max(r, g, b) - Math.min(r, g, b) < 57 && b > r * .94 && b > g * .96;
      allowed[i] = coolBlue || paleCloud ? 1 : 0;
    }
  }
  const queue = new Uint32Array(count); let head = 0, tail = 0;
  for (let x = 0; x < width; x++) if (allowed[x]) { sky[x] = 1; queue[tail++] = x; }
  while (head < tail) {
    const i = queue[head++], x = i % width;
    for (const next of [x ? i - 1 : -1, x + 1 < width ? i + 1 : -1, i - width, i + width]) {
      if (next < 0 || next >= count || sky[next] || !allowed[next]) continue;
      sky[next] = 1; queue[tail++] = next;
    }
  }
  return sky;
}

/**
 * Make two shader data textures aligned to the source image, without modifying
 * that image. Polygon edges and sky boundaries are lightly softened at map
 * resolution. Unknown/imported images receive flat, gentle geometry only.
 */
export function createSceneGeometry(scene, noonImage, width = 512, height) {
  const sourceWidth = noonImage?.naturalWidth || noonImage?.videoWidth || noonImage?.width;
  const sourceHeight = noonImage?.naturalHeight || noonImage?.videoHeight || noonImage?.height;
  if (!(sourceWidth > 0 && sourceHeight > 0)) throw new RangeError('A decoded source image is required for scene geometry');
  if (!Number.isFinite(width) || width < 16 || width > 4096) throw new RangeError('Geometry width must be between 16 and 4096');
  width = Math.round(width); height = height === undefined ? Math.max(1, Math.round(width * sourceHeight / sourceWidth)) : Math.round(height);
  if (!Number.isFinite(height) || height < 1 || height > 4096) throw new RangeError('Geometry height must be between 1 and 4096');
  const normalDepth = createCanvas(width, height), material = createCanvas(width, height);
  const source = createCanvas(width, height), sourceContext = source.getContext('2d', { willReadFrequently: true });
  const p = createPainter(width, height), id = typeof scene === 'string' ? scene : scene?.id;
  let skyLimit = 0;
  const photoReal = typeof scene === 'object' && scene?.photoReal === true;
  if (photoReal) {
    // New photographs must never inherit polygon coordinates authored for an
    // unrelated AI view. Their pixels keep the photographed illumination.
    // Retain conservative, top-connected sky classification as metadata only;
    // the photographic compositor does not synthesize silhouettes or shadows.
    p.face(whole, { normal: FRONT, depth: .55, roughness: .96, occlusion: 0 });
    skyLimit = clamp(scene.camera?.horizon ?? .5);
  }
  else if (id === 'manhattan') skyLimit = authorManhattan(p);
  else if (id === 'kyoto') skyLimit = authorKyoto(p);
  else if (id === 'medieval') skyLimit = authorMedieval(p);
  else if (id === 'fuji') skyLimit = authorFuji(p);
  else if (['lake', 'coast', 'forest'].includes(id)) skyLimit = authorLegacy(id, p);
  else p.face(whole, { normal: FRONT, depth: .55, roughness: .96, occlusion: .12 });

  let sourcePixels = new Uint8ClampedArray(width * height * 4);
  try {
    sourceContext.drawImage(noonImage, 0, 0, width, height);
    sourcePixels = sourceContext.getImageData(0, 0, width, height).data;
  } catch {
    // A tainted imported source still gets the safe uniform map. Never guess
    // its sky from an arbitrary height when pixels cannot be inspected.
    skyLimit = 0;
  }
  const sky = classifySky(sourcePixels, width, height, skyLimit, p.skyBlock);
  const normalContext = normalDepth.getContext('2d'), materialContext = material.getContext('2d');
  const normalPixels = normalContext.createImageData(width, height), materialPixels = materialContext.createImageData(width, height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x, offset = i * 4;
    // A small cross filter antialiases silhouettes without bleeding a broad
    // halo over roofs, snow caps, or dark foliage.
    let skyWeight = sky[i] * 4, samples = 4;
    for (const next of [x ? i - 1 : -1, x + 1 < width ? i + 1 : -1, y ? i - width : -1, y + 1 < height ? i + width : -1]) {
      if (next >= 0) { skyWeight += sky[next]; samples++; }
    }
    skyWeight /= samples;
    const normal = normalize([lerp(p.normal[i * 3], 0, skyWeight), lerp(p.normal[i * 3 + 1], 1, skyWeight), lerp(p.normal[i * 3 + 2], 0, skyWeight)]);
    for (let channel = 0; channel < 3; channel++) normalPixels.data[offset + channel] = Math.round((normal[channel] + 1) * 127.5);
    normalPixels.data[offset + 3] = Math.round(255 * lerp(p.depth[i], 1, skyWeight));
    // Restrict authored water to cool water-like pixels. This protects the
    // white beach and warm shore from a rectangular ocean specular region.
    const r = sourcePixels[offset], g = sourcePixels[offset + 1], b = sourcePixels[offset + 2];
    const waterColor = b >= r * .94 && g >= r * .92 && b > 55 ? 1 : .05;
    const water = p.water[i] * waterColor * (1 - skyWeight);
    materialPixels.data[offset] = Math.round(255 * skyWeight);
    materialPixels.data[offset + 1] = Math.round(255 * water);
    materialPixels.data[offset + 2] = Math.round(255 * lerp(p.roughness[i], 1, skyWeight));
    // Canvas stores premultiplied pixels internally: alpha=0 would erase the
    // sky RGB mask on upload. A single alpha byte preserves it while giving
    // sky only 1/255 (effectively zero) solid occlusion.
    materialPixels.data[offset + 3] = Math.max(1, Math.round(255 * p.occlusion[i] * (1 - skyWeight)));
  }
  // Direct byte writes preserve the independent depth alpha; painting a depth
  // with source-over RGBA fills would corrupt RGB normals at overlaps.
  normalContext.putImageData(normalPixels, 0, 0); materialContext.putImageData(materialPixels, 0, 0);
  return { normalDepth, material, version: photoReal ? 'photographic-preserved-1.0' : SCENE_GEOMETRY_VERSION, width, height };
}
