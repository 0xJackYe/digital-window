import { IMAGE_PHASES, normalizeWeights } from './scene-view.js';
import { getCelestialState } from './celestial.js';
import { getLightingState } from './lighting.js';
// Kept as a utility export for historical model comparisons. Image rendering
// below does not apply this grade, source reconstruction, or synthetic light.
export { photographicGrade } from './photo-light.js';

const RAD = Math.PI / 180;
const vertexShader = `attribute vec2 aPosition;varying vec2 vUv;void main(){vUv=vec2(aPosition.x*.5+.5,.5-aPosition.y*.5);gl_Position=vec4(aPosition,0.,1.);}`;
const fragmentShader = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 vUv;
uniform sampler2D uDawn,uMorning,uNoon,uAfternoon,uEvening,uNight;
uniform vec4 uWeightsA;
uniform vec2 uWeightsB,uCrop;
void main(){
  vec2 uv=(vUv-.5)*uCrop+.5;
  vec3 color=texture2D(uDawn,uv).rgb*uWeightsA.x
    +texture2D(uMorning,uv).rgb*uWeightsA.y
    +texture2D(uNoon,uv).rgb*uWeightsA.z
    +texture2D(uAfternoon,uv).rgb*uWeightsA.w
    +texture2D(uEvening,uv).rgb*uWeightsB.x
    +texture2D(uNight,uv).rgb*uWeightsB.y;
  gl_FragColor=vec4(color,1.);
}`;

export function cameraForScene(scene, bearing, aspect = window.innerWidth / window.innerHeight, sourceAspect = 16 / 9) {
  const nativeHorizontal = (scene.camera?.fieldOfView || 80) * RAD;
  const nativeVertical = 2 * Math.atan(Math.tan(nativeHorizontal / 2) / sourceAspect);
  const crop = aspect > sourceAspect ? [1, sourceAspect / aspect] : [aspect / sourceAspect, 1];
  const vertical = 2 * Math.atan(Math.tan(nativeVertical / 2) * crop[1]);
  const horizontal = 2 * Math.atan(Math.tan(nativeHorizontal / 2) * crop[0]);
  return { viewAzimuth: bearing ?? scene.camera?.azimuth ?? 0, fieldOfView: horizontal / RAD, verticalFieldOfView: vertical / RAD, horizon: Math.max(0, Math.min(1, .5 + ((scene.camera?.horizon ?? .5) - .5) / crop[1])), crop };
}

/** Physical output pixels, limited only by the renderer's supported dimensions. */
export function computeRenderSize(cssWidth, cssHeight, devicePixelRatio = 1, limits = {}) {
  if (!(Number.isFinite(cssWidth) && cssWidth > 0 && Number.isFinite(cssHeight) && cssHeight > 0)) throw new RangeError('Render dimensions must be positive finite numbers');
  const dpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  const maxWidth = Number.isFinite(limits.maxWidth) && limits.maxWidth >= 1 ? Math.floor(limits.maxWidth) : 16384;
  const maxHeight = Number.isFinite(limits.maxHeight) && limits.maxHeight >= 1 ? Math.floor(limits.maxHeight) : 16384;
  const requestedWidth = Math.max(1, Math.round(cssWidth * dpr)), requestedHeight = Math.max(1, Math.round(cssHeight * dpr));
  const scale = Math.min(1, maxWidth / requestedWidth, maxHeight / requestedHeight);
  const width = Math.max(1, Math.min(maxWidth, Math.round(requestedWidth * scale)));
  const height = Math.max(1, Math.min(maxHeight, Math.round(requestedHeight * scale)));
  return { width, height, outputScale: width / cssWidth, devicePixelRatio: dpr, limited: scale < 1, requestedWidth, requestedHeight };
}

/** Six source images are the lighting states: no RGB night filter or fake city. */
export class RelightingRenderer {
  constructor(provider) {
    this.provider = provider; this.canvas = this.makeCanvas(); this.ready = false;
    this.renderer = 'none'; this.frameCount = 0; this.drawCount = 0; this.contextLost = false;
    this.setupWebGL(); this.resize = this.resize.bind(this); window.addEventListener('resize', this.resize);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { cancelAnimationFrame(this.frame); this.frame = null; }
      else this.update();
    });
    this.resize();
  }
  makeCanvas() {
    const canvas = document.createElement('canvas'); canvas.id = 'relighting-canvas';
    canvas.className = 'relighting-canvas'; canvas.setAttribute('aria-hidden', 'true'); return canvas;
  }
  setupWebGL() {
    const canvas = this.gpuCanvas || this.canvas;
    try {
      const gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: true, powerPreference: 'low-power' });
      if (!gl) { this.enableFallback('WebGL unavailable'); return; }
      if (gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS) < IMAGE_PHASES.length) throw new Error('Six texture units are required');
      this.gl = gl; this.gpuCanvas = canvas;
      const textureLimit = gl.getParameter(gl.MAX_TEXTURE_SIZE), viewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS), bufferLimit = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE);
      this.maxTextureSize = textureLimit;
      this.renderLimits = { maxWidth: Math.min(textureLimit, bufferLimit, viewport[0]), maxHeight: Math.min(textureLimit, bufferLimit, viewport[1]) };
      const compile = (type, source) => { const shader = gl.createShader(type); gl.shaderSource(shader, source); gl.compileShader(shader); if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader)); return shader; };
      this.program = gl.createProgram(); gl.attachShader(this.program, compile(gl.VERTEX_SHADER, vertexShader)); gl.attachShader(this.program, compile(gl.FRAGMENT_SHADER, fragmentShader)); gl.linkProgram(this.program);
      if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(this.program));
      gl.useProgram(this.program); this.locations = new Map();
      const buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);
      const position = gl.getAttribLocation(this.program, 'aPosition'); gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      this.textures = []; this.renderer = 'webgl'; this.contextLost = false; this.fallbackReason = null;
      if (!this.boundContextEvents) {
        canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); this.contextLost = true; this.enableFallback('WebGL context lost'); this.update(); });
        canvas.addEventListener('webglcontextrestored', () => {
          this.setupWebGL();
          if (this.renderer === 'webgl') {
            this.releasePhotoBase(); this.canvas.replaceWith(canvas); this.canvas = canvas; this.canvas.id = 'relighting-canvas';
            this.uploadSources(); this.resize(); this.update();
          }
        });
        this.boundContextEvents = true;
      }
    } catch (error) { this.shaderError = String(error.message); this.enableFallback(error.message); }
  }
  enableFallback(reason) {
    this.fallbackReason = String(reason);
    if (this.canvas === this.gpuCanvas || this.canvas.getContext('2d') === null) { const next = this.makeCanvas(); this.canvas.replaceWith(next); this.canvas = next; }
    this.context = this.canvas.getContext('2d', { alpha: false }); this.renderer = 'canvas'; this.resize();
  }
  resize() {
    if (this.scene?.id === 'procedural') {
      this.canvas.width = this.canvas.height = 1;
      if (this.gpuCanvas !== this.canvas && this.gpuCanvas) this.gpuCanvas.width = this.gpuCanvas.height = 1;
      this.outputSize = null; return;
    }
    const size = computeRenderSize(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1, this.renderer === 'webgl' ? this.renderLimits : {});
    this.outputSize = size;
    if (this.canvas.width !== size.width || this.canvas.height !== size.height) {
      this.canvas.width = size.width; this.canvas.height = size.height; this.releasePhotoBase();
    }
    if (this.renderer === 'webgl' && !this.contextLost) this.gl.viewport(0, 0, size.width, size.height);
    if (this.ready) this.draw();
  }
  setScene(scene, deck) {
    cancelAnimationFrame(this.frame); this.frame = null;
    if (this.ready && this.deck && this.deck !== deck && this.canvas.parentElement === this.deck && this.scene?.id !== 'procedural') {
      try { const snapshot = this.makeCanvas(); snapshot.removeAttribute('id'); snapshot.width = this.canvas.width; snapshot.height = this.canvas.height; snapshot.getContext('2d').drawImage(this.canvas, 0, 0); this.deck.append(snapshot); } catch { /* The decoded source layers remain available underneath. */ }
    }
    this.scene = scene; this.deck = deck; this.ready = false; this.releasePhotoBase();
    deck.classList.toggle('photo-real', Boolean(scene.photoReal || scene.generated || scene.variants));
    if (scene.id === 'procedural') { this.releaseSourceResources(); this.canvas.remove(); this.resize(); this.ready = true; return; }
    const phaseImages = IMAGE_PHASES.map(phase => deck.querySelector(`[data-phase="${phase}"]`));
    this.hasPhases = phaseImages.every(Boolean);
    if (scene.variants && !this.hasPhases) throw new Error('All six generated time-of-day images must be decoded before display');
    const single = deck.querySelector('img,video'); this.sources = this.hasPhases ? phaseImages : single ? [single] : [];
    const reference = this.hasPhases ? phaseImages[IMAGE_PHASES.indexOf('noon')] : single;
    if (!reference) return;
    this.sourceWidth = reference.naturalWidth || reference.videoWidth; this.sourceHeight = reference.naturalHeight || reference.videoHeight;
    this.canvas.id = 'relighting-canvas'; deck.append(this.canvas); deck.classList.add('relit');
    try { this.uploadSources(); } catch (error) { this.enableFallback(error.message); }
    this.ready = true; this.resize(); this.update();
  }
  releasePhotoBase() {
    if (this.photoBase) this.photoBase.width = this.photoBase.height = 1;
    this.photoBase = this.photoBaseKey = this.photoBaseSource = null;
  }
  releaseTexture(unit) {
    if (this.textures?.[unit] && this.gl && !this.contextLost) this.gl.deleteTexture(this.textures[unit]);
    if (this.textures) this.textures[unit] = null;
    if (this.textureSizes) this.textureSizes[unit] = null;
    const scratch = this.textureResizers?.[unit]; if (scratch) scratch.width = scratch.height = 1;
    if (this.textureResizers) this.textureResizers[unit] = null;
  }
  releaseSourceResources() {
    for (let unit = 0; unit < IMAGE_PHASES.length; unit++) this.releaseTexture(unit);
    this.releasePhotoBase(); this.sources = []; this.hasPhases = false; this.sourceWidth = this.sourceHeight = 0;
  }
  uploadTexture(unit, source) {
    const gl = this.gl; gl.activeTexture(gl.TEXTURE0 + unit);
    const texture = this.textures[unit] || gl.createTexture(); this.textures[unit] = texture; gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    const width = source.naturalWidth || source.videoWidth || source.width, height = source.naturalHeight || source.videoHeight || source.height;
    const scale = Math.min(1, this.maxTextureSize / width, this.maxTextureSize / height); let input = source;
    if (scale < 1) {
      this.textureResizers ||= []; input = this.textureResizers[unit] ||= document.createElement('canvas');
      input.width = Math.max(1, Math.floor(width * scale)); input.height = Math.max(1, Math.floor(height * scale));
      const c = input.getContext('2d'); c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high'; c.drawImage(source, 0, 0, input.width, input.height);
    } else if (this.textureResizers?.[unit]) { this.textureResizers[unit].width = this.textureResizers[unit].height = 1; this.textureResizers[unit] = null; }
    this.textureSizes ||= []; this.textureSizes[unit] = { width: input.naturalWidth || input.videoWidth || input.width, height: input.naturalHeight || input.videoHeight || input.height };
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, input);
  }
  uploadSources() {
    if (this.renderer !== 'webgl' || this.contextLost || !this.sources?.length) return;
    const gl = this.gl; gl.useProgram(this.program);
    this.sources.forEach((source, index) => this.uploadTexture(index, source));
    for (let index = this.sources.length; index < IMAGE_PHASES.length; index++) this.releaseTexture(index);
    IMAGE_PHASES.forEach((phase, index) => gl.uniform1i(this.location(`u${phase[0].toUpperCase()}${phase.slice(1)}`), this.hasPhases ? index : 0));
    const error = gl.getError(); if (error !== gl.NO_ERROR) throw new Error(`GPU texture upload failed (${error})`); this.validateNextFrame = true;
  }
  location(name) { if (!this.locations.has(name)) this.locations.set(name, this.gl.getUniformLocation(this.program, name)); return this.locations.get(name); }
  // Retains the historical clock evaluator for comparisons; it is not used to
  // alter generated image content in this source-only compositor.
  resolveState(state) {
    const now = performance.now(), target = state.realtime ? Date.now() : (Number.isFinite(state.utcMillis) ? state.utcMillis : Date.now());
    let instant = target;
    if (!state.realtime && !state.originalPhoto) {
      if (this.manualTarget !== target || this.wasRealtime || this.wasOriginalPhoto || !Number.isFinite(this.manualStart) || !Number.isFinite(this.manualFrom)) { this.manualFrom = this.renderUtcMillis ?? target; this.manualTarget = target; this.manualStart = now; }
      const t = Math.max(0, Math.min(1, (now - this.manualStart) / 220)); instant = this.manualFrom + (target - this.manualFrom) * t * t * (3 - 2 * t); this.transitioningTime = t < 1 && Math.abs(target - this.manualFrom) > .001;
    } else { this.manualTarget = target; this.transitioningTime = false; }
    this.wasRealtime = Boolean(state.realtime); this.wasOriginalPhoto = Boolean(state.originalPhoto); this.renderUtcMillis = instant; this.targetUtcMillis = target;
    const lighting = !state.originalPhoto && state.place && state.camera ? { ...getLightingState(getCelestialState(new Date(instant), state.place), state.camera), utcMillis: instant } : state.lighting;
    return { ...state, utcMillis: instant, lighting };
  }
  draw() {
    if (!this.ready || !this.scene || this.scene.id === 'procedural' || document.hidden) return;
    const state = this.provider(); if (!state || state.visible === false) return;
    this.utcMillis = Number.isFinite(state.utcMillis) ? state.utcMillis : Date.now(); this.lastLighting = state.lighting;
    this.lastOriginalPhoto = true; this.lastRealtime = Boolean(state.realtime);
    this.weights = normalizeWeights(this.hasPhases ? state.weights : { noon: 1 });
    this.crop = state.camera?.crop || [1, 1];
    try { if (this.renderer === 'webgl' && !this.contextLost) this.drawWebGL(state); else this.drawCanvas(state); }
    catch (error) { this.enableFallback(error.message); this.drawCanvas(state); }
    this.frameCount++; this.drawCount++;
  }
  drawWebGL(state) {
    const gl = this.gl, weights = this.weights; gl.useProgram(this.program); gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    if (this.scene.isVideo && this.sources[0].readyState >= 2 && state.motion) this.uploadTexture(0, this.sources[0]);
    gl.uniform2fv(this.location('uCrop'), this.crop);
    gl.uniform4f(this.location('uWeightsA'), weights.dawn, weights.morning, weights.noon, weights.afternoon);
    gl.uniform2f(this.location('uWeightsB'), weights.evening, weights.night); gl.drawArrays(gl.TRIANGLES, 0, 6);
    if (this.validateNextFrame) { this.validateNextFrame = false; const error = gl.getError(); if (error !== gl.NO_ERROR) throw new Error(`GPU drawing failed (${error})`); }
  }
  drawCanvas() {
    if (!this.context || !this.sources?.length) return;
    const c = this.context, w = this.canvas.width, h = this.canvas.height, crop = this.crop;
    const sx = (1 - crop[0]) / 2 * this.sourceWidth, sy = (1 - crop[1]) / 2 * this.sourceHeight;
    c.filter = 'none'; c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; c.fillStyle = '#000'; c.fillRect(0, 0, w, h);
    c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
    if (!this.hasPhases && !this.scene.isVideo) {
      const key = `${w}:${h}:${this.sourceWidth}:${this.sourceHeight}:${crop.join(',')}`;
      if (this.photoBaseKey !== key || this.photoBaseSource !== this.sources[0]) {
        this.releasePhotoBase(); this.photoBase = document.createElement('canvas'); this.photoBase.width = w; this.photoBase.height = h;
        const base = this.photoBase.getContext('2d', { alpha: false }); base.imageSmoothingEnabled = true; base.imageSmoothingQuality = 'high';
        base.drawImage(this.sources[0], sx, sy, this.sourceWidth * crop[0], this.sourceHeight * crop[1], 0, 0, w, h); this.photoBaseKey = key; this.photoBaseSource = this.sources[0];
      }
      c.drawImage(this.photoBase, 0, 0); return;
    }
    c.globalCompositeOperation = 'lighter';
    this.sources.forEach((source, index) => {
      c.globalAlpha = this.hasPhases ? this.weights[IMAGE_PHASES[index]] : 1;
      if (c.globalAlpha <= 0) return;
      const width = source.naturalWidth || source.videoWidth;
      const height = source.naturalHeight || source.videoHeight;
      c.drawImage(source, (1 - crop[0]) / 2 * width, (1 - crop[1]) / 2 * height, width * crop[0], height * crop[1], 0, 0, w, h);
    });
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  }
  update() { this.draw(); this.schedule(); }
  schedule() {
    const state = this.provider();
    if (this.frame || document.hidden || state?.visible === false || !this.ready || this.scene?.id === 'procedural') return;
    const movingVideo = this.scene?.isVideo && state?.motion;
    if (!state?.animating && !movingVideo && !(this.hasPhases && state?.realtime)) return;
    this.frame = requestAnimationFrame(now => { this.frame = null; if (!this.lastFrame || now - this.lastFrame >= 1000 / (this.renderer === 'canvas' ? 12 : 30)) { this.lastFrame = now; this.draw(); } this.schedule(); });
  }
  diagnostics() {
    const pixels = [];
    if (this.ready && this.scene?.id !== 'procedural') for (const [u,v] of [[.16,.2],[.5,.2],[.84,.2],[.16,.55],[.5,.55],[.84,.55],[.3,.85],[.7,.85]]) {
      const x = Math.min(this.canvas.width - 1, Math.floor(u * this.canvas.width)), y = Math.min(this.canvas.height - 1, Math.floor(v * this.canvas.height));
      try { if (this.renderer === 'webgl' && !this.contextLost) { const data = new Uint8Array(4); this.gl.readPixels(x, this.canvas.height - y - 1, 1, 1, this.gl.RGBA, this.gl.UNSIGNED_BYTE, data); pixels.push(...data); } else pixels.push(...this.context.getImageData(x, y, 1, 1).data); } catch { pixels.length = 0; break; }
    }
    const sources = (this.sources || []).map((source, index) => ({ phase: this.hasPhases ? IMAGE_PHASES[index] : 'original', width: source.naturalWidth || source.videoWidth, height: source.naturalHeight || source.videoHeight }));
    return { ready: this.ready, renderer: this.scene?.id === 'procedural' ? 'procedural' : this.renderer, sceneId: this.scene?.id, frameCount: this.frameCount, drawCount: this.drawCount, utcMillis: this.utcMillis, targetUtcMillis: this.utcMillis, transitioningTime: false, realtime: this.lastRealtime, originalPhoto: true, lighting: this.lastLighting, lightModel: 'six-phase-image-blend-1.0', noSyntheticLighting: true, phaseCount: this.hasPhases ? IMAGE_PHASES.length : 1, phases: this.hasPhases ? IMAGE_PHASES : [], weights: this.weights, sources, width: this.canvas.width, height: this.canvas.height, sourceWidth: this.sourceWidth, sourceHeight: this.sourceHeight, textureWidth: this.textureSizes?.[0]?.width, textureHeight: this.textureSizes?.[0]?.height, outputScale: this.outputSize?.outputScale, outputLimited: this.outputSize?.limited, devicePixelRatio: window.devicePixelRatio || 1, generated: Boolean(this.scene?.generated || this.hasPhases), photoReal: this.scene?.photoReal === true, contextLost: this.contextLost, fallbackReason: this.fallbackReason, shaderError: this.shaderError, pixels, pixelHash: pixels.reduce((value, channel) => Math.imul(value ^ channel, 16777619) >>> 0, 2166136261).toString(16) };
  }
}
