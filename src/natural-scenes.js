import * as THREE from '../vendor/three.module.js';

/**
 * Offline, relightable three-dimensional scene studies. These are deliberately
 * modelled geometry inspired by the named places, not photogrammetry, surveyed
 * city models, or photographs. All visible surfaces have actual world normals
 * and can receive/cast the renderer's directional-light shadow maps.
 * Local camera-forward is -Z, right is +X, up is +Y. The renderer transforms
 * astronomical ENU source directions using cameraAzimuth.
 */
const TAU = Math.PI * 2;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const mix = (a, b, t) => a + (b - a) * t;
function random(seed) {
  let state = seed >>> 0;
  return () => { state = Math.imul(1664525, state) + 1013904223 | 0; return (state >>> 0) / 4294967296; };
}
function canvasTexture(width, height, paint, color = true) {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  paint(canvas.getContext('2d'), width, height);
  const map = new THREE.CanvasTexture(canvas); map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  map.anisotropy = 8;
  return map;
}
function noiseTexture(seed, rgb, grain = 16) {
  const rng = random(seed);
  return canvasTexture(256, 256, (c, w, h) => {
    const data = c.createImageData(w, h);
    for (let i = 0; i < data.data.length; i += 4) {
      const change = (rng() - .5) * grain;
      for (let k = 0; k < 3; k++) data.data[i + k] = clamp(rgb[k] + change, 0, 255);
      data.data[i + 3] = 255;
    }
    c.putImageData(data, 0, 0);
  });
}
function facadeTextures(style, seed) {
  const rng = random(seed), windows = [], columns = 6, rows = 16;
  for (let y = 0; y < rows; y++) for (let x = 0; x < columns; x++) windows.push({ x, y, lit: rng() > .62, blind: rng(), variation: rng() });
  const wall = style === 'brick' ? [112, 75, 59] : style === 'historic' ? [184, 172, 150] : style === 'glass' ? [82, 101, 107] : [153, 153, 144];
  const map = canvasTexture(512, 1024, (c, w, h) => {
    c.fillStyle = `rgb(${wall.join(',')})`; c.fillRect(0, 0, w, h);
    if (style === 'brick') {
      c.strokeStyle = '#b3a293'; c.lineWidth = .55;
      for (let y = 0; y < h; y += 9) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke();
        for (let x = y % 18 ? -10 : 0; x < w; x += 24) { c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + 9); c.stroke(); }
      }
    }
    for (const item of windows) {
      const cw = w / columns, ch = h / rows, x = item.x * cw, y = item.y * ch;
      if (style === 'glass') {
        c.fillStyle = `rgb(${Math.round(65 + item.variation * 20)},${Math.round(85 + item.variation * 22)},${Math.round(94 + item.variation * 21)})`; c.fillRect(x + 2, y + 2, cw - 4, ch - 4);
        c.fillStyle = '#c0c2b4'; c.fillRect(x, y + ch - 3, cw, 3); c.fillRect(x, y, 2, ch);
      } else {
        const wx = x + cw * .19, wy = y + ch * .19;
        c.fillStyle = '#b5b3a4'; c.fillRect(wx - 3, wy - 2, cw * .63 + 6, ch * .64 + 5);
        c.fillStyle = `rgb(${42 + item.variation * 13},${57 + item.variation * 16},${62 + item.variation * 17})`; c.fillRect(wx, wy, cw * .63, ch * .64);
        c.fillStyle = '#a2a395'; c.fillRect(wx + cw * .3, wy, 2, ch * .64); c.fillRect(wx, wy + ch * .31, cw * .63, 2);
        if (item.blind > .7) { c.fillStyle = '#bab7a3'; c.fillRect(wx, wy, cw * .63, ch * .25); }
        c.fillStyle = '#6d7066'; c.fillRect(wx - 3, wy + ch * .64, cw * .63 + 6, 3);
      }
    }
    const grain = random(seed + 800);
    for (let i = 0; i < 12000; i++) { c.fillStyle = `rgba(0,0,0,${grain() * .06})`; c.fillRect(grain() * w, grain() * h, 1, 2); }
  });
  const emissive = canvasTexture(512, 1024, (c, w, h) => {
    c.fillStyle = '#000'; c.fillRect(0, 0, w, h);
    for (const item of windows) if (item.lit) {
      const cw = w / columns, ch = h / rows;
      const base = item.variation > .26 ? [255, 201, 133] : [206, 223, 224];
      const brightness = .32 + .65 * item.variation * item.variation;
      const wx = item.x * cw + cw * .23, wy = item.y * ch + ch * .23;
      const gradient = c.createLinearGradient(0, wy, 0, wy + ch * .55);
      gradient.addColorStop(0, `rgb(${base.map(v => Math.round(v * brightness * .65)).join(',')})`);
      gradient.addColorStop(1, `rgb(${base.map(v => Math.round(v * brightness)).join(',')})`);
      c.fillStyle = gradient; c.fillRect(wx, wy, cw * .53, ch * .55);
      // Mullions and partly drawn blinds remain dark even in a lit room.
      c.fillStyle = '#000'; c.fillRect(wx + cw * .255, wy, 2, ch * .55); c.fillRect(wx, wy + ch * .26, cw * .53, 2);
      if (item.blind > .76) c.fillRect(wx, wy, cw * .53, ch * .17);
    }
  });
  return { map, emissive };
}
function stoneTexture() {
  const rng = random(216);
  return canvasTexture(512, 512, (c, w, h) => {
    c.fillStyle = '#585c59'; c.fillRect(0, 0, w, h);
    for (let y = -32; y < h; y += 25) for (let x = -30; x < w; x += 34) {
      const shade = 105 + rng() * 44; c.fillStyle = `rgb(${shade},${shade + 1},${shade - 2})`;
      c.fillRect(x + (y % 50 ? 16 : 0) + 1, y + 1, 31, 22);
      c.fillStyle = 'rgba(255,255,255,.055)'; c.fillRect(x + (y % 50 ? 16 : 0) + 3, y + 2, 27, 2);
    }
  });
}
function leafTexture() {
  return canvasTexture(64, 64, (c) => {
    c.clearRect(0, 0, 64, 64); c.fillStyle = '#fff'; c.beginPath(); c.moveTo(2, 32); c.bezierCurveTo(23, 4, 45, 5, 62, 30); c.bezierCurveTo(43, 59, 23, 57, 2, 32); c.fill();
  }, false);
}

export function buildNaturalScene(id, options = {}) {
  const group = new THREE.Group(); group.name = `natural-${id}`;
  const textures = new Set(), materials = new Set(), geometries = new Set(), illuminated = [], nightLights = [], water = [];
  const rng = random(73214 + [...id].reduce((n, c) => n + c.charCodeAt(0), 0));
  const ownTexture = (t) => { textures.add(t); return t; };
  const material = (parameters) => { const m = new THREE.MeshStandardMaterial(parameters); materials.add(m); return m; };
  const rough = (color, extra = {}) => material({ color, roughness: .9, metalness: 0, ...extra });
  const concrete = rough('#8e9089'), metal = rough('#4a5253', { metalness: .7, roughness: .32 });
  const roofMat = rough('#676d68', { metalness: .15, roughness: .72 });
  const glassMat = material({ color: '#536c73', roughness: .19, metalness: .4 });
  const masonry = ownTexture(noiseTexture(53, [139, 138, 124], 24)); masonry.repeat.set(12, 12);
  const groundMat = rough('#b8b7a8', { map: masonry, bumpMap: masonry, bumpScale: .035 });
  const addMesh = (geometry, mat, position = [0, 0, 0], parent = group, cast = true) => {
    geometries.add(geometry); const mesh = new THREE.Mesh(geometry, mat); mesh.position.set(...position); mesh.castShadow = cast; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  };
  const box = (w, h, d, mat, x = 0, y = 0, z = 0, parent = group) => addMesh(new THREE.BoxGeometry(w, h, d), mat, [x, y + h / 2, z], parent);
  const cylinder = (r0, r1, h, mat, x, y, z, segments = 10, parent = group) => addMesh(new THREE.CylinderGeometry(r1, r0, h, segments), mat, [x, y + h / 2, z], parent);
  const ground = (mat = groundMat, size = 900, y = -.04) => { const mesh = addMesh(new THREE.PlaneGeometry(size, size), mat, [0, y, -150], group, false); mesh.rotation.x = -Math.PI / 2; return mesh; };
  const facadeCache = new Map();
  function facade(style, seed, w, h) {
    const key = `${style}-${seed % 3}`;
    if (!facadeCache.has(key)) { const t = facadeTextures(style, seed % 3 + 61); textures.add(t.map); textures.add(t.emissive); facadeCache.set(key, t); }
    const source = facadeCache.get(key), map = source.map.clone(), emissiveMap = source.emissive.clone();
    textures.add(map); textures.add(emissiveMap); map.repeat.set(w / 18, h / 48); emissiveMap.repeat.copy(map.repeat);
    const m = material({ map, roughness: style === 'glass' ? .28 : .9, metalness: style === 'glass' ? .35 : .015, emissiveMap, emissive: '#ffffff', emissiveIntensity: 0 }); illuminated.push({ material: m, strength: .18 + ((seed >>> 0) % 7) * .028 }); return m;
  }
  function building(x, z, w, h, d, style = 'concrete', seed = 1, detailed = false) {
    const front = facade(style, seed, w, h), side = facade(style, seed, d, h);
    const wall = box(w, h, d, [side, side, roofMat, roofMat, front, front], x, 0, z);
    box(w + .3, .35, d + .3, roofMat, x, h, z);
    if (h > 12) {
      box(w * .24, 1.5, d * .28, concrete, x + w * .17, h + .35, z - d * .18);
      box(w * .22, .7, d * .22, metal, x - w * .22, h + .35, z + d * .17);
    }
    if (detailed) {
      const rows = Math.max(1, Math.floor(h / 3)), cols = Math.max(1, Math.floor(w / 3));
      const geometry = new THREE.PlaneGeometry(1.65, 1.7); geometries.add(geometry);
      const placements = Array.from({ length: 6 }, () => []), roomRandom = random(seed + 786), dummy = new THREE.Object3D();
      for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
        placements[roomRandom() > .7 ? 1 + Math.floor(roomRandom() * 5) : 0].push([x - w / 2 + (col + .5) * w / cols, (row + .54) * h / rows, z + d / 2 + .018]);
      }
      const roomColors = ['#ffc17d', '#ffd1a0', '#ffe0b8', '#d4e4e8', '#e4e9d7'], roomStrengths = [.10, .21, .38, .11, .25];
      for (let lit = 0; lit < placements.length; lit++) {
        const glass = lit ? material({ color: '#536c73', roughness: .19, metalness: .4, emissive: roomColors[lit - 1], emissiveIntensity: 0 }) : glassMat;
        if (lit) illuminated.push({ material: glass, strength: roomStrengths[lit - 1] });
        const windows = new THREE.InstancedMesh(geometry, glass, placements[lit].length);
        placements[lit].forEach((position, i) => { dummy.position.set(...position); dummy.updateMatrix(); windows.setMatrixAt(i, dummy.matrix); });
        windows.receiveShadow = true; windows.instanceMatrix.needsUpdate = true; group.add(windows);
      }
      for (let y = 3; y < h; y += 3) box(w + .13, .09, d + .13, roofMat, x, y, z);
    }
    return wall;
  }
  function oldHouse(x, z, w, h, d, color, roofColor = '#794d3c') {
    building(x, z, w, h, d, 'historic', Math.round(x + z) + 50);
    const trim = rough(color); box(w + .14, .25, d + .14, trim, x, h - .3, z);
    const outline = new THREE.Shape(); outline.moveTo(-w / 2 - .35, 0); outline.lineTo(w / 2 + .35, 0); outline.lineTo(0, w * .35); outline.closePath();
    const geometry = new THREE.ExtrudeGeometry(outline, { depth: d + .55, bevelEnabled: false });
    addMesh(geometry, rough(roofColor), [x, h, z - d / 2 - .275]);
    box(.7, 2.3, .8, concrete, x + w * .22, h + .6, z - d * .15);
  }
  const barkMap = ownTexture(noiseTexture(345, [101, 89, 70], 65)); barkMap.repeat.set(2, 8);
  const bark = rough('#b0a88c', { map: barkMap, bumpMap: barkMap, bumpScale: .075 });
  const foliage = rough('#3d5037', { roughness: .95 });
  function conifer(x, z, h, r = h * .17, y = 0) {
    cylinder(h * .018, h * .01, h, bark, x, y, z, 7);
    for (let level = 0; level < 4; level++) {
      const hh = h * (.58 - level * .075), rr = r * (1 - level * .2);
      const cone = addMesh(new THREE.ConeGeometry(rr, hh, 10), foliage, [x, y + h * (.4 + level * .14), z]); cone.rotation.y = level * .6;
    }
  }
  function mountain(cx, cz, radius, height, seed, snowy = false, jagged = .16) {
    const geometry = new THREE.PlaneGeometry(radius * 2.6, radius * 2.6, 96, 96); geometry.rotateX(-Math.PI / 2);
    const positions = geometry.attributes.position, colors = new Float32Array(positions.count * 3);
    const stone = new THREE.Color('#69756b'), snow = new THREE.Color('#d4d6ca'), low = new THREE.Color('#445c43');
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i), z = positions.getZ(i), r = Math.hypot(x, z) / radius;
      const noise = Math.sin(x * .042 + seed) * Math.cos(z * .038 - seed) * .45 + Math.sin(x * .101 - seed) * Math.sin(z * .092) * .18;
      const shaped = Math.min(snowy && jagged < .2 ? .965 : 1, Math.max(0, 1 - Math.pow(r, .78))), value = height * shaped * (1 + noise * jagged);
      positions.setY(i, value);
      const color = low.clone().lerp(stone, clamp(value / height * 1.5));
      if (snowy) color.lerp(snow, clamp((value / height - .65 - noise * .045) / .15));
      color.multiplyScalar(.94 + noise * .09); color.toArray(colors, i * 3);
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3)); geometry.computeVertexNormals();
    return addMesh(geometry, material({ vertexColors: true, roughness: .99 }), [cx, -.6, cz]);
  }
  function waterPlane(size = 1800, color = '#496c71') {
    const normal = ownTexture(canvasTexture(256, 256, (c, w, h) => {
      const pixels = c.createImageData(w, h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const p = (y * w + x) * 4; pixels.data[p] = 128 + Math.sin(x / w * TAU * 7 + Math.cos(y / h * TAU * 4)) * 16; pixels.data[p + 1] = 128 + Math.cos(y / h * TAU * 9 + Math.sin(x / w * TAU * 5)) * 13; pixels.data[p + 2] = 252; pixels.data[p + 3] = 255; } c.putImageData(pixels, 0, 0);
    }, false)); normal.repeat.set(100, 100);
    const mat = material({ color, roughness: .21, metalness: .28, normalMap: normal, normalScale: new THREE.Vector2(.22, .22) });
    const plane = addMesh(new THREE.PlaneGeometry(size, size), mat, [0, 0, -size * .22], group, false); plane.rotation.x = -Math.PI / 2; plane.name = 'natural-water'; water.push(plane); return plane;
  }
  function street(x, z, width, depth) {
    const asphalt = ownTexture(noiseTexture(593, [57, 61, 59], 19)); asphalt.repeat.set(width / 3, depth / 3);
    box(width, .04, depth, rough('#a7aaa1', { map: asphalt, bumpMap: asphalt, bumpScale: .025 }), x, -.01, z);
    const line = rough('#c7c1a0'); for (let zz = z - depth / 2; zz < z + depth / 2; zz += 9) box(.15, .008, 3.5, line, x, .04, zz);
  }
  function officeForeground(y, z, width = 15) {
    const frame = rough('#434c4c', { metalness: .55, roughness: .38 }), plaster = rough('#aaa89b');
    box(width * 2, .6, 8, plaster, 0, y - 3.5, z + 4);
    box(width * 2, .5, 8, plaster, 0, y + 4.2, z + 4);
    for (const x of [-width / 2, width / 2]) box(.75, 9, 8, plaster, x, y - 4, z + 4);
    for (const x of [-width / 2 + .5, width * .19, width / 2 - .5]) box(.14, 8, .32, frame, x, y - 3.3, z);
    box(width - .6, .23, .7, frame, 0, y - 3.35, z);
    box(width - .6, .14, .35, frame, 0, y + 4.05, z);
    box(width + .6, .18, 1.15, rough('#8b8e84'), 0, y - 3.52, z + .18);
    // A nearby interior sill/floor receives the actual sun and frame shadows.
    box(width * .7, .12, 3.2, rough('#777e75'), -width * .05, y - 3.65, z + 2.2);
  }
  function cityNightLighting(city) {
    // Local artificial sources in scene metres. Three.js PointLight intensity
    // is candela with inverse-square (decay=2) falloff. These are plausible
    // scene parameters, not measurements of the actual named city.
    const lampMetal = rough('#46504f', { roughness: .4, metalness: .65 });
    for (const [x, z, strength, hue] of [[-7, -12, 180, '#ffcc91'], [7, -36, 150, '#ffdbb1'], [-7, -68, 220, '#ffce94'], [7, -103, 195, '#ffdbb1']]) {
      const height = 7.8;
      cylinder(.13, .09, height, lampMetal, x, 0, z, 8);
      const arm = box(1.6, .1, .16, lampMetal, x - Math.sign(x) * .65, height - .1, z);
      const headX = x - Math.sign(x) * 1.35;
      box(1.25, .16, .65, lampMetal, headX, height - .08, z);
      const diffuser = material({ color: '#d9ceaf', emissive: hue, emissiveIntensity: 0, roughness: .65 });
      box(1.02, .075, .44, diffuser, headX, height - .17, z);
      illuminated.push({ material: diffuser, strength: .65 });
      const light = new THREE.PointLight(hue, 0, 48, 2); light.position.set(headX, height - .22, z); group.add(light); nightLights.push({ light, intensity: strength });
    }
    const windowSpills = city === 'denver'
      ? [[-24, 25.8, 36, 72, '#ffc58b'], [37, 24.8, 29, 88, '#ffdab0']]
      : [[-30, 26, 27, 65, '#ffc78f'], [36, 24, 25, 82, '#ffd8a6']];
    for (let i = 0; i < windowSpills.length; i++) {
      const [x, y, z, strength, hue] = windowSpills[i];
      const light = new THREE.PointLight(hue, 0, 27, 2); light.position.set(x, y, z);
      // One bounded local shadow caster lets the warm spill respect the nearby
      // facade and roof geometry without six large city-wide cube shadow maps.
      if (i === 0) { light.castShadow = true; light.shadow.mapSize.set(256, 256); light.shadow.camera.near = .25; light.shadow.camera.far = 27; light.shadow.normalBias = .06; }
      group.add(light); nightLights.push({ light, intensity: strength });
    }
  }

  let cameraPosition = [0, 22, 75], cameraTarget = [0, 22, -90], cameraFov = 48, cameraAzimuth = 0;
  if (id === 'denver' || id === 'manhattan') {
    ground(); street(0, -70, 16, 450); street(0, 20, 350, 13);
    for (let row = 0; row < 5; row++) for (let col = -4; col <= 4; col++) {
      if (Math.abs(col) < 1) continue;
      const x = col * 33 + (rng() - .5) * 6, z = -row * 49 - 25, h = 15 + rng() * (row > 2 ? 55 : 30);
      building(x, z, 18 + rng() * 8, h, 19 + rng() * 9, id === 'manhattan' && rng() > .3 ? 'brick' : rng() > .5 ? 'glass' : 'concrete', row * 11 + col + 100);
    }
    if (id === 'denver') {
      cameraPosition = [0, 36, 80]; cameraTarget = [0, 36, -100]; cameraAzimuth = 120; cameraFov = 52;
      building(-11, -72, 26, 81, 22, 'glass', 41);
      // Wells Fargo Center-inspired profile: the curved stepped roof is real
      // extruded geometry, rather than a photographed billboard.
      const outline = new THREE.Shape(); outline.moveTo(-14, 0); outline.lineTo(14, 0); outline.lineTo(14, 73);
      outline.bezierCurveTo(13, 85, 2, 91, -14, 91); outline.lineTo(-14, 0);
      const cap = new THREE.ExtrudeGeometry(outline, { depth: 19, bevelEnabled: false });
      const capPositions = cap.attributes.position, capNormals = cap.attributes.normal, capUV = cap.attributes.uv;
      for (let i = 0; i < capPositions.count; i++) capUV.setXY(i, Math.abs(capNormals.getZ(i)) > .5 ? (capPositions.getX(i) + 14) / 28 : capPositions.getZ(i) / 19, capPositions.getY(i) / 91);
      addMesh(cap, facade('concrete', 86, 28, 91), [13, 0, -106]);
      building(49, -98, 31, 108, 25, 'concrete', 53);
      building(-48, -31, 26, 69, 22, 'glass', 17, true);
      building(-24, 21, 25, 30, 22, 'brick', 73, true);
      building(37, 11, 27, 28, 26, 'glass', 11, true);
      // Daniels & Fisher Tower-inspired warm stone clock tower.
      const tower = rough('#b39b79'); box(5.5, 45, 5.5, tower, -36, 0, -12);
      box(7, 1.2, 7, tower, -36, 34, -12); box(7, 1.1, 7, tower, -36, 44, -12);
      const clockFace = ownTexture(canvasTexture(128, 128, c => { c.fillStyle = '#b8b09a'; c.fillRect(0, 0, 128, 128); c.strokeStyle = '#454a43'; c.lineWidth = 4; c.beginPath(); c.arc(64, 64, 48, 0, TAU); c.stroke(); for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; c.beginPath(); c.moveTo(64 + Math.sin(a) * 39, 64 + Math.cos(a) * 39); c.lineTo(64 + Math.sin(a) * 45, 64 + Math.cos(a) * 45); c.stroke(); } c.beginPath(); c.moveTo(64, 64); c.lineTo(64, 30); c.moveTo(64, 64); c.lineTo(88, 78); c.stroke(); }));
      addMesh(new THREE.PlaneGeometry(4.5, 4.5), rough('#ffffff', { map: clockFace }), [-36, 39, -9.235]);
      const top = addMesh(new THREE.ConeGeometry(4.3, 6, 4), rough('#6c7062'), [-36, 48.1, -12]); top.rotation.y = Math.PI / 4;
      officeForeground(36, 72, 12.2);
    } else {
      cameraAzimuth = 30; cameraPosition = [0, 25, 74]; cameraTarget = [0, 29, -120];
      building(-35, 10, 30, 39, 25, 'brick', 20, true); building(36, 8, 31, 37, 23, 'brick', 35, true);
      building(-12, -60, 24, 52, 23, 'brick', 13, true); building(36, -78, 25, 67, 22, 'concrete', 12);
      // Setback silhouette and needle inspired by the Empire State Building.
      for (const [w, h, base] of [[29, 61, 0], [23, 17, 61], [17, 13, 78], [10, 10, 91], [5, 8, 101]]) box(w, h, w * .74, facade('concrete', 45, w, h), 7, base, -172);
      cylinder(1.1, .45, 17, metal, 7, 109, -172, 10);
      const tankMat = rough('#5f5745'); for (const [x, z, y] of [[-35, 10, 40], [37, 8, 38], [-12, -60, 53]]) { cylinder(2.1, 2.1, 3.5, tankMat, x, y, z, 12); addMesh(new THREE.ConeGeometry(2.5, 1.5, 12), metal, [x, y + 4.25, z]); }
      officeForeground(25, 66, 15);
    }
    cityNightLighting(id);
  } else if (id === 'medieval') {
    cameraPosition = [0, 7, 61]; cameraTarget = [0, 15, -48]; cameraFov = 54; cameraAzimuth = 15;
    const paving = ownTexture(stoneTexture()); paving.repeat.set(120, 120); ground(rough('#c5c3b7', { map: paving, bumpMap: paving, bumpScale: .055 }));
    for (let i = 0; i < 6; i++) { oldHouse(-43 + i * 17.5, -66 - Math.abs(i - 3) * 3, 15.8, 15 + rng() * 6, 16, ['#c7bda0', '#b2b4a7', '#bdac8b'][i % 3]); }
    for (let i = 0; i < 4; i++) { oldHouse(-49, 25 - i * 26, 16, 14 + rng() * 7, 23, '#aaa38c'); oldHouse(49, 25 - i * 26, 16, 15 + rng() * 7, 23, '#c0b79b'); }
    const church = rough('#a29d89'); box(33, 21, 19, church, 14, 0, -82);
    for (const x of [3, 25]) {
      box(7, 35, 8, church, x, 0, -72); box(8, 1, 9, church, x, 30, -72);
      const roof = addMesh(new THREE.ConeGeometry(6.0, 17, 4), rough('#454b48'), [x, 43.5, -72]); roof.rotation.y = Math.PI / 4;
      for (const dx of [-3.4, 3.4]) for (const dz of [-3.4, 3.4]) { cylinder(.45, .3, 4, church, x + dx, 34, -72 + dz, 5); addMesh(new THREE.ConeGeometry(1, 4, 5), roofMat, [x + dx, 40, -72 + dz]); }
    }
    const statue = rough('#3d5048', { metalness: .45 }); cylinder(5.5, 4.5, 1, concrete, -8, 0, -12, 20); box(2, 3, 2, statue, -8, 1, -12); cylinder(.6, .3, 3, statue, -8, 4, -12, 12); addMesh(new THREE.SphereGeometry(.5, 12, 10), statue, [-8, 7.4, -12]);
  } else if (id === 'kyoto') {
    cameraPosition = [0, 2.4, 45]; cameraTarget = [0, 7, -75]; cameraFov = 51; cameraAzimuth = 290;
    const paving = ownTexture(stoneTexture()); paving.repeat.set(90, 90); ground(rough('#c2c1b5', { map: paving, bumpMap: paving, bumpScale: .035 }), 600);
    const woodTexture = ownTexture(noiseTexture(84, [87, 70, 51], 38)); woodTexture.repeat.set(5, 1);
    const wood = rough('#8a7962', { map: woodTexture, bumpMap: woodTexture, bumpScale: .02 });
    const plaster = rough('#b3aa90'), tile = rough('#4b504d', { metalness: .08, roughness: .87 });
    const latticePositions = [], timbers = [], timber = (w, h, d, x, y, z) => timbers.push([w, h, d, x, y, z]);
    for (let i = 0; i < 9; i++) for (const side of [-1, 1]) {
      const x = side * (8.6 + rng() * .4), z = 31 - i * 14, h = 7.2 + rng() * .9;
      box(9.5, h, 12.8, plaster, x, 0, z); box(10.4, .38, 13.5, tile, x, h, z); box(10, .3, 13.4, tile, x, 3.7, z);
      for (let k = 0; k < 7; k++) timber(.15, h, .2, x - 4.7 + k * 1.57, 0, z + 6.43);
      for (const yy of [.3, 3.3, 6.6]) timber(9.5, .18, .2, x, yy, z + 6.45);
      // Narrow timber shop-front lattice on the side facing the lane.
      for (let k = 0; k < 16; k++) timber(.07, 2.7, .12, x - 4.3 + k * .56, .5, z + 6.52);
      const innerX = x - side * 4.77;
      box(.1, 2.9, 12.2, glassMat, innerX, .45, z);
      for (const yy of [.35, 3.35, 6.65]) timber(.18, .16, 12.8, innerX - side * .05, yy, z);
      for (let k = 0; k < 40; k++) latticePositions.push([innerX - side * .12, 1.85, z - 5.95 + k * .305]);
      for (let k = 0; k < 7; k++) timber(.17, h, .16, innerX - side * .05, 0, z - 6.1 + k * 2.03);
      if (i < 5) {
        const lampMat = material({ color: '#dbcfac', emissive: '#ffd19a', emissiveIntensity: .2, roughness: .9 }); illuminated.push({ material: lampMat, strength: 4 });
        const lampX = side * 3.5; box(.6, 1.2, .6, lampMat, lampX, 2.8, z + 4.4); timber(.78, .1, .78, lampX, 4, z + 4.4); timber(.7, .1, .7, lampX, 2.7, z + 4.4);
        if (i < 2) { const light = new THREE.PointLight('#ffd1a0', 0, 13, 2); light.position.set(lampX, 3.4, z + 4.4); group.add(light); nightLights.push({ light, intensity: 9 }); }
      }
    }
    const timberGeometry = new THREE.BoxGeometry(1, 1, 1); geometries.add(timberGeometry);
    const timberMesh = new THREE.InstancedMesh(timberGeometry, wood, timbers.length), timberDummy = new THREE.Object3D();
    timbers.forEach(([w, h, d, x, y, z], i) => { timberDummy.position.set(x, y + h / 2, z); timberDummy.scale.set(w, h, d); timberDummy.updateMatrix(); timberMesh.setMatrixAt(i, timberDummy.matrix); }); timberMesh.castShadow = timberMesh.receiveShadow = true; timberMesh.instanceMatrix.needsUpdate = true; group.add(timberMesh);
    const latticeGeometry = new THREE.BoxGeometry(.08, 2.7, .055); geometries.add(latticeGeometry);
    const lattice = new THREE.InstancedMesh(latticeGeometry, wood, latticePositions.length), latticeDummy = new THREE.Object3D();
    latticePositions.forEach((p, i) => { latticeDummy.position.set(...p); latticeDummy.updateMatrix(); lattice.setMatrixAt(i, latticeDummy.matrix); }); lattice.castShadow = lattice.receiveShadow = true; lattice.instanceMatrix.needsUpdate = true; group.add(lattice);
    const pagodaX = -7, pagodaZ = -89;
    for (let level = 0; level < 5; level++) {
      const base = level * 5.1, width = 11 - level * 1.15;
      box(width * .65, 4, width * .65, wood, pagodaX, base, pagodaZ);
      const geo = new THREE.ConeGeometry(width * .78, 2.3, 4, 1, true); geo.rotateY(Math.PI / 4);
      addMesh(geo, tile, [pagodaX, base + 4.65, pagodaZ]); box(width + .6, .18, width + .6, tile, pagodaX, base + 3.55, pagodaZ);
    }
    cylinder(.18, .1, 8, metal, pagodaX, 27, pagodaZ, 8);
    for (let i = 0; i < 5; i++) cylinder(.8 - i * .1, .8 - i * .1, .12, metal, pagodaX, 29 + i * .65, pagodaZ, 12);
  } else if (id === 'fuji' || id === 'lake' || id === 'procedural') {
    waterPlane(2200, '#486c71');
    cameraAzimuth = id === 'fuji' ? 241 : id === 'lake' ? 235 : 180;
    cameraPosition = [0, 5.5, 90]; cameraTarget = [0, 33, -380]; cameraFov = 45;
    if (id === 'fuji') {
      mountain(0, -480, 340, 198, 8, true, .11);
      mountain(-270, -400, 170, 44, 11); mountain(290, -450, 170, 37, 12);
      const shore = box(1100, 1.8, 28, rough('#65765b'), 0, -.8, -205);
      for (let i = 0; i < 55; i++) conifer(-330 + i * 12, -206 + rng() * 13, 3 + rng() * 4, 1.1);
    } else {
      mountain(-150, -340, 240, 190, 17, true, .7); mountain(90, -420, 260, 238, 4, true, .64); mountain(335, -320, 240, 220, 12, true, .72);
      const shoreline = box(180, 2, 165, rough('#6b775b'), -120, -.5, 16);
      for (let i = 0; i < 48; i++) conifer(-65 - rng() * 130, 60 - rng() * 160, 8 + rng() * 15, 1.6 + rng() * 2, 1);
    }
  } else if (id === 'coast') {
    cameraPosition = [0, 3.5, 48]; cameraTarget = [0, 3, -100]; cameraFov = 52; cameraAzimuth = 135;
    waterPlane(2300, '#326c76');
    const sandMap = ownTexture(noiseTexture(934, [188, 181, 155], 23)); sandMap.repeat.set(40, 40);
    const sand = rough('#d6cfb3', { map: sandMap, bumpMap: sandMap, bumpScale: .02 });
    box(95, .8, 130, sand, -48, -.25, 40); box(70, .7, 25, sand, -8, -.3, 62);
    const pierMat = rough('#9c947c'); box(3, .25, 100, pierMat, 21, 1.6, -12);
    for (let z = 32; z > -58; z -= 8) for (const x of [19.9, 22.1]) cylinder(.16, .15, 2.1, bark, x, -.2, z, 8);
    const palmLeaf = rough('#465d35', { side: THREE.DoubleSide });
    for (const [x, z, height] of [[-10, 28, 13], [-21, 10, 16], [-28, -16, 12], [-5, 47, 15]]) {
      const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(x, .5, z), new THREE.Vector3(x + .8, height * .45, z), new THREE.Vector3(x + 2.5, height, z - 1)]);
      addMesh(new THREE.TubeGeometry(curve, 16, .25, 8), bark);
      for (let leaf = 0; leaf < 10; leaf++) {
        const angle = leaf / 10 * TAU + .4, vertices = [], indices = [];
        for (let segment = 0; segment <= 10; segment++) {
          const t = segment / 10, reach = t * 5.8, yy = height + Math.sin(t * Math.PI) * 1.5 - t * 1.9;
          const width = Math.sin(t * Math.PI) * .53;
          for (const side of [-1, 1]) vertices.push(x + 2.5 + Math.cos(angle) * reach - Math.sin(angle) * width * side, yy, z - 1 + Math.sin(angle) * reach + Math.cos(angle) * width * side);
          if (segment < 10) { const q = segment * 2; indices.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
        }
        const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geo.setIndex(indices); geo.computeVertexNormals(); addMesh(geo, palmLeaf);
      }
    }
  } else {
    cameraPosition = [0, 2.1, 35]; cameraTarget = [0, 4, -80]; cameraFov = 48; cameraAzimuth = 180;
    const soilMap = ownTexture(noiseTexture(964, [95, 86, 62], 58)); soilMap.repeat.set(45, 45);
    ground(rough('#a39a76', { map: soilMap, bumpMap: soilMap, bumpScale: .08 }), 550);
    const pathMap = ownTexture(noiseTexture(953, [130, 119, 94], 29)); pathMap.repeat.set(3, 70);
    box(4.8, .03, 230, rough('#b7ae93', { map: pathMap }), 0, 0, -60);
    const alpha = ownTexture(leafTexture()), leafMaterials = [0, 1, 2].map(i => rough(['#536441', '#435739', '#65714b'][i], { alphaMap: alpha, alphaTest: .45, side: THREE.DoubleSide }));
    const leafGeometry = new THREE.PlaneGeometry(.9, .4); geometries.add(leafGeometry);
    const placements = [[], [], []], dummy = new THREE.Object3D();
    for (let i = 0; i < 88; i++) {
      const side = i % 2 ? -1 : 1, x = side * (4.5 + rng() * 38), z = 45 - rng() * 200, h = 12 + rng() * 14, radius = .23 + rng() * .38;
      cylinder(radius * 1.15, radius * .5, h, bark, x, 0, z, 9);
      for (let branch = 0; branch < 3; branch++) {
        const start = new THREE.Vector3(x, h * (.57 + branch * .13), z), angle = rng() * TAU;
        const end = new THREE.Vector3(x + Math.cos(angle) * 3.7, h * (.8 + branch * .04), z + Math.sin(angle) * 3.7);
        const delta = end.clone().sub(start), limb = cylinder(radius * .35, .05, delta.length(), bark, 0, 0, 0, 6);
        limb.position.copy(start.clone().add(end).multiplyScalar(.5)); limb.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
      }
      for (let j = 0; j < 700; j++) {
        const angle = rng() * TAU, rr = Math.sqrt(rng()) * 5.5;
        placements[i % 3].push([x + Math.cos(angle) * rr, h - 1.2 + rng() * 3 - (j % 5 === 0 ? h * .18 : 0), z + Math.sin(angle) * rr, rng() * TAU, rng() * TAU, .7 + rng() * .8]);
      }
    }
    for (let batch = 0; batch < 3; batch++) {
      const leaves = new THREE.InstancedMesh(leafGeometry, leafMaterials[batch], placements[batch].length);
      for (let i = 0; i < placements[batch].length; i++) { const [x, y, z, rx, ry, scale] = placements[batch][i]; dummy.position.set(x, y, z); dummy.rotation.set(rx, ry, 0); dummy.scale.setScalar(scale); dummy.updateMatrix(); leaves.setMatrixAt(i, dummy.matrix); }
      leaves.castShadow = leaves.receiveShadow = true; leaves.instanceMatrix.needsUpdate = true; group.add(leaves);
    }
  }
  group.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(group);
  const shadowFocus = ['denver', 'manhattan'].includes(id) ? [0, 28, -25] : id === 'medieval' ? [0, 15, -20] : id === 'kyoto' ? [0, 6, -15] : id === 'forest' ? [0, 7, -5] : [0, 8, -10];
  const shadowRadius = ['denver', 'manhattan', 'medieval'].includes(id) ? 140 : id === 'kyoto' || id === 'forest' ? 75 : 160;
  return {
    group, cameraPosition, cameraTarget, cameraFov, cameraAzimuth, water, bounds, shadowFocus, shadowRadius, lights: nightLights.map(entry => entry.light),
    metadata: { geometry: 'procedural-3d', surveyed: false, photograph: false, sceneId: id, description: 'Relightable architectural/landscape study inspired by the location; not a surveyed reconstruction.', shadowCasterCount: (() => { let n = 0; group.traverse(o => { if (o.isMesh && o.castShadow) n++; }); return n; })() },
    update(seconds = 0, light = {}) {
      const night = clamp(light.cityLightsVisibility ?? light.nightFactor ?? 0);
      for (const entry of illuminated) entry.material.emissiveIntensity = entry.strength * night;
      for (const entry of nightLights) entry.light.intensity = entry.intensity * night;
      if (options.motion !== false) for (const surface of water) { const normal = surface.material.normalMap; normal.offset.set((seconds * .0008) % 1, (seconds * .0003) % 1); }
    },
    dispose() { for (const geometry of geometries) geometry.dispose(); for (const m of materials) m.dispose(); for (const texture of textures) texture.dispose(); for (const { light } of nightLights) { light.shadow?.map?.dispose(); light.shadow?.mapPass?.dispose(); } group.clear(); geometries.clear(); materials.clear(); textures.clear(); facadeCache.clear(); illuminated.length = nightLights.length = water.length = 0; },
  };
}
