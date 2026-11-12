import { createSceneGeometry } from './scene-geometry.js';

const PHASES = ['dawn', 'morning', 'noon', 'evening', 'night'];
const RAD = Math.PI / 180;
const vertexShader = `
attribute vec2 aPosition;
varying vec2 vUv;
void main(){vUv=vec2(aPosition.x*.5+.5,.5-aPosition.y*.5);gl_Position=vec4(aPosition,0.,1.);}`;
const fragmentShader = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 vUv;
uniform sampler2D uDawn,uMorning,uNoon,uEvening,uNight,uGeometry,uMaterial;
uniform vec4 uWeights;
uniform float uNightWeight,uHasPhases,uExposure,uNightFactor,uTime,uHorizon,uSunGain,uMoonGain,uMoonPhase,uMoonIllumination,uMoonAngle,uMoonRadius,uSunVisibility,uMoonVisibility,uMotion,uPhotoReal;
uniform vec2 uCrop,uTanFov;
uniform vec3 uSunDirection,uMoonDirection,uSunColor,uMoonColor,uAmbientColor;
uniform vec3 uPhotoBaseTint,uPhotoSunTint,uPhotoMoonTint;
vec2 imageUv(vec2 uv){return (uv-.5)*uCrop+.5;}
vec3 rayAt(vec2 uv){return normalize(vec3((uv.x-.5)*2.*uTanFov.x,(uHorizon-uv.y)*2.*uTanFov.y,1.));}
vec3 pointAt(vec2 uv,float z){return vec3((uv.x-.5)*2.*uTanFov.x*z,(uHorizon-uv.y)*2.*uTanFov.y*z,z);}
vec2 projectPoint(vec3 p){return vec2(.5+p.x/(2.*p.z*uTanFov.x),uHorizon-p.y/(2.*p.z*uTanFov.y));}
float contactShadow(vec3 point,vec3 light,float solid){
  if(solid<.1 || light.y<=.0)return 1.;
  float blocked=0.;
  // Screen-space rays through an authored depth field. This is an approximate
  // 2.5D contact shadow, not a recovered or measured three-dimensional scene.
  for(int i=1;i<=8;i++){
    float distance=.12+float(i)*.33;
    vec3 q=point+light*distance;
    if(q.z>.25){
      vec2 screen=projectPoint(q);
      if(screen.x>0. && screen.x<1. && screen.y>0. && screen.y<1.){
        vec2 sampleUv=imageUv(screen);
        vec4 mat=texture2D(uMaterial,sampleUv);
        float z=.8+texture2D(uGeometry,sampleUv).a*24.;
        float delta=q.z-z;
        blocked=max(blocked,(1.-mat.r)*mat.a*smoothstep(.09,.35,delta)*(1.-smoothstep(1.6,3.5,delta)));
      }
    }
  }
  return 1.-blocked*.38;
}
vec3 moonDisc(vec3 ray,vec3 direction,float sky){
  if(uMoonVisibility<=0. || sky<.2)return vec3(0.);
  vec3 right=normalize(cross(vec3(0.,1.,0.),direction));
  vec3 up=normalize(cross(direction,right));
  float radius=uMoonRadius;
  vec2 p=vec2(dot(ray,right),dot(ray,up))/radius;
  float r2=dot(p,p);
  float disc=(1.-smoothstep(.93,1.05,r2))*step(.9998,dot(ray,direction));
  float z=sqrt(max(0.,1.-min(1.,r2)));
  float lightZ=2.*uMoonIllumination-1.;
  float limb=sqrt(max(0.,1.-lightZ*lightZ));
  vec3 phaseLight=vec3(sin(uMoonAngle)*limb,cos(uMoonAngle)*limb,lightZ);
  float illumination=max(0.,dot(vec3(p,z),phaseLight));
  float detail=.92+.08*sin(p.x*19.)*cos(p.y*23.);
  return vec3(.75,.80,.88)*disc*illumination*detail*uMoonVisibility;
}
void main(){
  vec2 uv=imageUv(vUv);
  vec3 dawn=texture2D(uDawn,uv).rgb,morning=texture2D(uMorning,uv).rgb;
  vec3 noon=texture2D(uNoon,uv).rgb,evening=texture2D(uEvening,uv).rgb,night=texture2D(uNight,uv).rgb;
  vec3 source=dawn*uWeights.x+morning*uWeights.y+noon*uWeights.z+evening*uWeights.w+night*uNightWeight;
  if(uPhotoReal>.5){
    // A real photograph already contains the scene's illumination. Preserve
    // its architecture and texture; never apply another image's proxy shadows
    // or add a second photographed Sun/Moon. This gentle grade is continuous,
    // but deliberately does not claim to reconstruct unobserved geometry.
    vec3 ray=rayAt(vUv);
    float sunFacing=pow(max(0.,dot(ray,uSunDirection)),3.);
    float moonFacing=pow(max(0.,dot(ray,uMoonDirection)),3.);
    vec3 response=uPhotoBaseTint+uPhotoSunTint*sunFacing+uPhotoMoonTint*moonFacing;
    gl_FragColor=vec4(clamp(source*response,0.,1.),1.);
    return;
  }
  vec4 geom=texture2D(uGeometry,uv),mat=texture2D(uMaterial,uv);
  vec3 normal=normalize(geom.rgb*2.-1.);
  float sky=mat.r,water=mat.g,roughness=mat.b;
  // The five photos supply color, sky and lamps; lighting within every interval
  // is continuously evaluated from Sun/Moon vectors and surface orientation.
  vec3 color=pow(max(source,vec3(.001)),vec3(2.2));
  vec3 point=pointAt(vUv,.8+geom.a*24.);
  vec3 ray=rayAt(vUv);
  if(water>.1 && uMotion>.5){normal=normalize(normal+vec3(sin(uv.x*180.+uTime*.31)*.025,0.,sin(uv.y*140.+uTime*.24)*.02)*water);}
  float sunLambert=max(0.,dot(normal,uSunDirection));
  float moonLambert=max(0.,dot(normal,uMoonDirection));
  float sunShadow=contactShadow(point,uSunDirection,(1.-sky)*mat.a);
  float moonShadow=uMoonGain>.00001?contactShadow(point,uMoonDirection,(1.-sky)*mat.a):1.;
  float gain=.97+uSunGain*(sunLambert*1.45*sunShadow-.42);
  vec3 balance=mix(vec3(1.),uAmbientColor/max(.12,(uAmbientColor.r+uAmbientColor.g+uAmbientColor.b)/3.),.045);
  color*=mix(vec3(gain)*balance,vec3(.97+.05*uSunGain),sky);
  color+=(1.-sky)*color*uMoonColor*uMoonGain*7.*moonLambert*moonShadow;
  vec3 view=-normalize(point);
  float sunSpec=pow(max(0.,dot(reflect(-uSunDirection,normal),view)),mix(20.,95.,1.-roughness));
  float moonSpec=pow(max(0.,dot(reflect(-uMoonDirection,normal),view)),80.);
  float grazing=pow(1.-max(0.,dot(normal,view)),4.);
  color+=water*(.03+.13*grazing)*(sunSpec*uSunColor*uSunGain+moonSpec*uMoonColor*uMoonGain*12.);
  float lamps=smoothstep(.08,.38,dot(night,vec3(.2126,.7152,.0722))-dot(noon,vec3(.2126,.7152,.0722))*.32)*(1.-sky)*(1.-water)*uHasPhases;
  color=mix(color,pow(max(source,vec3(.001)),vec3(2.2)),lamps*uNightFactor*.85);
  float sunAlignment=max(0.,dot(ray,uSunDirection));
  float moonAlignment=max(0.,dot(ray,uMoonDirection));
  color+=sky*uSunColor*uSunGain*pow(sunAlignment,70.)*.20;
  color+=sky*uMoonColor*uMoonGain*pow(moonAlignment,250.)*.5;
  float solarDisk=smoothstep(.999983,.999992,sunAlignment)*uSunVisibility;
  color+=sky*solarDisk*vec3(1.,.88,.65)*.65;
  color+=moonDisc(ray,uMoonDirection,sky);
  // Exposure changes continuously with true solar altitude and moon phase.
  color*=uExposure;
  if(uHasPhases<.5){color*=mix(.32,1.,1.-uNightFactor);}
  gl_FragColor=vec4(pow(clamp(color,0.,1.),vec3(1./2.2)),1.);
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

/** Mild display-referred corrections; these preserve the lighting in a photo. */
export function photographicGrade(lighting) {
  const bounded = (value, min, max, fallback = min) => Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
  const daylight = bounded(lighting?.daylight, 0, 1, 1);
  const night = bounded(lighting?.nightFactor, 0, 1, 1 - daylight);
  const altitude = bounded(lighting?.sun?.altitude, -90, 90, 45);
  const warmth = Math.exp(-Math.pow((altitude + 1) / 10, 2)) * daylight * .026;
  const exposure = bounded(lighting?.exposure, .1, 4, 1);
  const gain = (.58 + .42 * daylight) * Math.pow(exposure, 1 / 2.2);
  const baseTint = [gain, gain * (1 - warmth * .4 + night * .004), gain * (1 - warmth + night * .012)];
  const sunGain = bounded(lighting?.sun?.strength, 0, 1) * .075;
  const moonGain = bounded(lighting?.moon?.strength, 0, 1) * .9;
  const tint = (color, strength) => [0, 1, 2].map((index) => bounded(color?.[index], 0, 1, 1) * strength);
  return { baseTint, sunTint: tint(lighting?.sun?.color, sunGain), moonTint: tint(lighting?.moon?.color, moonGain), daylight, night };
}

/** A local GPU compositor; its depth/normals are authored visual approximations. */
export class RelightingRenderer {
  constructor(provider) {
    this.provider = provider; this.canvas = document.createElement('canvas'); this.canvas.id = 'relighting-canvas'; this.canvas.className = 'relighting-canvas'; this.canvas.setAttribute('aria-hidden', 'true');
    this.ready = false; this.frameCount = 0; this.drawCount = 0; this.renderer = 'none'; this.contextLost = false;
    this.setupWebGL(); this.resize = this.resize.bind(this); window.addEventListener('resize', this.resize);
    document.addEventListener('visibilitychange', () => { if (document.hidden) { cancelAnimationFrame(this.frame); this.frame = null; } else { this.draw(); this.schedule(); } });
    this.resize();
  }
  setupWebGL() {
    const canvas = this.gpuCanvas || this.canvas;
    try {
      const gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: true, powerPreference: 'low-power' });
      if (!gl) { this.enableFallback('WebGL unavailable'); return; }
      this.gl = gl; this.gpuCanvas = canvas;
      const viewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS), textureLimit = gl.getParameter(gl.MAX_TEXTURE_SIZE), bufferLimit = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE);
      this.renderLimits = { maxWidth: Math.min(textureLimit, bufferLimit, viewport[0]), maxHeight: Math.min(textureLimit, bufferLimit, viewport[1]) };
      this.maxTextureSize = textureLimit;
      const compile = (type, source) => { const shader = gl.createShader(type); gl.shaderSource(shader, source); gl.compileShader(shader); if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader)); return shader; };
      this.program = gl.createProgram(); gl.attachShader(this.program, compile(gl.VERTEX_SHADER, vertexShader)); gl.attachShader(this.program, compile(gl.FRAGMENT_SHADER, fragmentShader)); gl.linkProgram(this.program);
      if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(this.program));
      gl.useProgram(this.program); this.locations = new Map();
      const buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);
      const position = gl.getAttribLocation(this.program, 'aPosition'); gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      this.textures = []; this.renderer = 'webgl'; this.contextLost = false; this.fallbackReason = null;
      if (!this.boundContextEvents) {
        canvas.addEventListener('webglcontextlost', (event) => { event.preventDefault(); this.contextLost = true; this.enableFallback('WebGL context lost'); if (this.scene) this.draw(); });
        canvas.addEventListener('webglcontextrestored', () => {
          this.setupWebGL();
          if (this.renderer === 'webgl' && this.deck) { this.canvas.replaceWith(canvas); this.canvas = canvas; this.canvas.id = 'relighting-canvas'; this.uploadSources(); this.resize(); this.draw(); this.schedule(); }
        });
        this.boundContextEvents = true;
      }
    } catch (error) { this.shaderError = String(error.message); console.error('Relighting shader initialization failed:', error.message); this.enableFallback(error.message); }
  }
  enableFallback(reason) {
    this.fallbackReason = reason;
    if (this.canvas === this.gpuCanvas || this.canvas.getContext('2d') === null) {
      const replacement = document.createElement('canvas'); replacement.className = 'relighting-canvas'; replacement.id = 'relighting-canvas'; replacement.setAttribute('aria-hidden', 'true');
      this.canvas.replaceWith(replacement); this.canvas = replacement;
    }
    this.context = this.canvas.getContext('2d'); this.renderer = 'canvas'; this.resize();
  }
  resize() {
    if (this.scene?.id === 'procedural') {
      // The separate Atmosphere canvas renders this scene. Do not retain a
      // hidden 4K photographic framebuffer while it remains selected.
      this.canvas.width = this.canvas.height = 1;
      if (this.gpuCanvas && this.gpuCanvas !== this.canvas) this.gpuCanvas.width = this.gpuCanvas.height = 1;
      this.outputSize = null;
      return;
    }
    // Real photography remains native-resolution even without WebGL. Only the
    // older per-pixel CPU relighter retains its deliberately small work buffer.
    const legacyCanvas = this.renderer === 'canvas' && !this.scene?.photoReal;
    const ratio = legacyCanvas ? Math.min(1.25, 960 / Math.max(window.innerWidth, window.innerHeight)) : window.devicePixelRatio || 1;
    const size = computeRenderSize(window.innerWidth, window.innerHeight, ratio, this.renderer === 'webgl' ? this.renderLimits : {});
    this.outputSize = size;
    if (this.canvas.width !== size.width) this.canvas.width = size.width;
    if (this.canvas.height !== size.height) this.canvas.height = size.height;
    if (this.renderer === 'webgl' && !this.contextLost) this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    if (this.ready) this.draw();
  }
  setScene(scene, deck) {
    cancelAnimationFrame(this.frame); this.frame = null;
    if (this.deck && this.canvas.parentElement === this.deck && this.ready && this.scene?.id !== 'procedural') {
      try {
        const snapshot = document.createElement('canvas'); snapshot.width = this.canvas.width; snapshot.height = this.canvas.height; snapshot.className = 'relighting-canvas'; snapshot.setAttribute('aria-hidden', 'true'); snapshot.getContext('2d').drawImage(this.canvas, 0, 0); this.deck.append(snapshot);
      } catch { /* Original image layers remain underneath every rendering fallback. */ }
    }
    this.scene = scene; this.deck = deck;
    deck.classList.toggle('photo-real', scene.photoReal === true);
    if (scene.id === 'procedural') {
      // The outgoing deck owns the independent snapshot above until SceneView
      // removes it. Its image/video elements must not be mutated here.
      this.releaseSourceResources(); this.canvas.remove(); this.resize();
      this.ready = true; this.rendererBeforeProcedural = this.renderer; return;
    }
    const phaseImages = PHASES.map((phase) => deck.querySelector(`[data-phase="${phase}"]`));
    this.hasPhases = phaseImages.every(Boolean);
    const single = deck.querySelector('img,video');
    this.sources = this.hasPhases ? phaseImages : [single];
    if (!single) { this.ready = false; return; }
    const reference = this.hasPhases ? phaseImages[2] : single;
    this.sourceWidth = reference.naturalWidth || reference.videoWidth; this.sourceHeight = reference.naturalHeight || reference.videoHeight;
    this.geometry = createSceneGeometry(scene, reference);
    this.geometryPixels = this.geometry.normalDepth.getContext('2d').getImageData(0, 0, this.geometry.width, this.geometry.height).data;
    this.materialPixels = this.geometry.material.getContext('2d').getImageData(0, 0, this.geometry.width, this.geometry.height).data;
    this.canvas.id = 'relighting-canvas'; deck.append(this.canvas); deck.classList.add('relit');
    try { this.uploadSources(); } catch (error) { this.enableFallback(String(error.message)); }
    this.ready = true; this.resize(); this.draw(); this.schedule();
  }
  releaseTextureScratch(unit) {
    const scratch = this.textureResizers?.[unit];
    if (scratch) { scratch.width = scratch.height = 1; this.textureResizers[unit] = null; }
  }
  releaseTexture(unit) {
    const texture = this.textures?.[unit];
    if (texture && this.gl && !this.contextLost) this.gl.deleteTexture(texture);
    if (this.textures) this.textures[unit] = null;
    if (this.textureSizes) this.textureSizes[unit] = null;
    this.releaseTextureScratch(unit);
  }
  releaseSourceResources() {
    for (let unit = 0; unit < 7; unit++) this.releaseTexture(unit);
    for (const map of [this.geometry?.normalDepth, this.geometry?.material]) if (map) map.width = map.height = 1;
    this.sources = []; this.sourceWidth = this.sourceHeight = 0; this.hasPhases = false;
    this.geometry = this.geometryPixels = this.materialPixels = null;
    this.textureSizes = []; this.textureResizers = []; this.validateNextFrame = false;
  }
  uploadTexture(unit, source) {
    const gl = this.gl; gl.activeTexture(gl.TEXTURE0 + unit);
    const texture = this.textures[unit] || gl.createTexture(); this.textures[unit] = texture; gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    const width = source.naturalWidth || source.videoWidth || source.width, height = source.naturalHeight || source.videoHeight || source.height;
    const scale = Math.min(1, this.maxTextureSize / width, this.maxTextureSize / height);
    let input = source;
    if (scale < 1) {
      this.textureResizers ||= [];
      input = this.textureResizers[unit] ||= document.createElement('canvas');
      const targetWidth = Math.max(1, Math.floor(width * scale)), targetHeight = Math.max(1, Math.floor(height * scale));
      if (input.width !== targetWidth) input.width = targetWidth;
      if (input.height !== targetHeight) input.height = targetHeight;
      const context = input.getContext('2d'); context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high';
      context.clearRect(0, 0, targetWidth, targetHeight);
      context.drawImage(source, 0, 0, targetWidth, targetHeight);
    } else this.releaseTextureScratch(unit);
    this.textureSizes ||= [];
    this.textureSizes[unit] = { width: scale < 1 ? input.width : width, height: scale < 1 ? input.height : height };
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, input);
  }
  uploadSources() {
    if (this.renderer !== 'webgl' || this.contextLost || !this.sources?.length) return;
    const gl = this.gl; gl.useProgram(this.program);
    for (let i = 0; i < this.sources.length; i++) this.uploadTexture(i, this.sources[i]);
    for (let i = this.sources.length; i < 5; i++) this.releaseTexture(i);
    PHASES.forEach((phase, index) => gl.uniform1i(this.location(`u${phase[0].toUpperCase()}${phase.slice(1)}`), this.hasPhases ? index : 0));
    this.uploadTexture(5, this.geometry.normalDepth); this.uploadTexture(6, this.geometry.material);
    gl.uniform1i(this.location('uGeometry'), 5); gl.uniform1i(this.location('uMaterial'), 6);
    const error = gl.getError(); if (error !== gl.NO_ERROR) throw new Error(`GPU texture upload failed (${error}); using Canvas`);
    this.validateNextFrame = true;
  }
  location(name) { if (!this.locations.has(name)) this.locations.set(name, this.gl.getUniformLocation(this.program, name)); return this.locations.get(name); }
  draw() {
    if (!this.ready || !this.scene || this.scene.id === 'procedural' || document.hidden) return;
    const state = this.provider(); if (!state?.lighting || state.visible === false) return;
    this.utcMillis = state.utcMillis; this.lastLighting = state.lighting;
    try { if (this.renderer === 'webgl' && !this.contextLost) this.drawWebGL(state); else this.drawCanvas(state); }
    catch (error) { this.enableFallback(String(error.message)); this.drawCanvas(state); }
    this.frameCount++; this.drawCount++;
  }
  drawWebGL(state) {
    const gl = this.gl, l = state.lighting;
    gl.useProgram(this.program); gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    if (this.scene.isVideo && this.sources[0].readyState >= 2 && state.motion) this.uploadTexture(0, this.sources[0]);
    const weights = this.hasPhases ? state.weights : { noon: 1 };
    gl.uniform4f(this.location('uWeights'), weights.dawn || 0, weights.morning || 0, weights.noon || 0, weights.evening || 0);
    gl.uniform1f(this.location('uNightWeight'), weights.night || 0);
    gl.uniform2fv(this.location('uCrop'), state.camera.crop);
    gl.uniform2f(this.location('uTanFov'), Math.tan(l.camera.fieldOfView * RAD / 2), Math.tan(l.camera.verticalFieldOfView * RAD / 2));
    const scalars = { uHasPhases: Number(this.hasPhases), uExposure: l.exposure, uNightFactor: l.nightFactor, uTime: performance.now() / 1000 % 3600, uHorizon: l.camera.horizon, uSunGain: l.sun.strength, uMoonGain: l.moon.strength, uMoonPhase: l.moon.phase, uMoonIllumination: l.moon.illumination, uMoonAngle: (l.moon.brightLimbAngle - l.moon.parallacticAngle) * RAD, uMoonRadius: l.moon.angularRadius * RAD, uSunVisibility: l.sun.visibility, uMoonVisibility: l.moon.visibility, uMotion: Number(state.motion), uPhotoReal: Number(this.scene.photoReal === true) };
    for (const [name, value] of Object.entries(scalars)) gl.uniform1f(this.location(name), value);
    for (const [name, value] of Object.entries({uSunDirection:l.sun.direction,uMoonDirection:l.moon.direction,uSunColor:l.sun.color,uMoonColor:l.moon.color,uAmbientColor:l.ambient.color})) gl.uniform3fv(this.location(name), value);
    const grade = photographicGrade(l);
    for (const [name, value] of Object.entries({uPhotoBaseTint:grade.baseTint,uPhotoSunTint:grade.sunTint,uPhotoMoonTint:grade.moonTint})) gl.uniform3fv(this.location(name), value);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    if (this.validateNextFrame) { this.validateNextFrame = false; const error = gl.getError(); if (error !== gl.NO_ERROR) throw new Error(`GPU drawing failed (${error}); using Canvas`); }
  }
  drawCanvas(state) {
    if (!this.context || !this.sources?.length) return;
    if (this.scene.photoReal === true) { this.drawPhotographicCanvas(state); return; }
    const c = this.context, w = this.canvas.width, h = this.canvas.height, weights = this.hasPhases ? state.weights : { noon: 1 };
    c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1; c.fillStyle = '#000'; c.fillRect(0,0,w,h); c.globalCompositeOperation = 'lighter';
    const crop = state.camera.crop, sx = (1-crop[0])/2*this.sourceWidth, sy=(1-crop[1])/2*this.sourceHeight;
    for (let i = 0; i < this.sources.length; i++) { c.globalAlpha = this.hasPhases ? weights[PHASES[i]] || 0 : 1; if (c.globalAlpha) c.drawImage(this.sources[i],sx,sy,this.sourceWidth*crop[0],this.sourceHeight*crop[1],0,0,w,h); }
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    const pixels = c.getImageData(0,0,w,h), data = pixels.data, l=state.lighting, gw=this.geometry.width, gh=this.geometry.height, normals=this.geometryPixels, material=this.materialPixels;
    const exposureGain = Math.pow(l.exposure, 1 / 2.2), sceneGain = this.hasPhases ? 1 : .55 + .45 * (1 - l.nightFactor);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const u=(x/w-.5)*crop[0]+.5,v=(y/h-.5)*crop[1]+.5;
      const k=(Math.min(gh-1,Math.floor(v*gh))*gw+Math.min(gw-1,Math.floor(u*gw)))*4, p=(y*w+x)*4;
      const nx=normals[k]/127.5-1,ny=normals[k+1]/127.5-1,nz=normals[k+2]/127.5-1,sky=material[k]/255;
      const sun=Math.max(0,nx*l.sun.direction[0]+ny*l.sun.direction[1]+nz*l.sun.direction[2]);
      const moon=Math.max(0,nx*l.moon.direction[0]+ny*l.moon.direction[1]+nz*l.moon.direction[2]);
      const gain=(.99+l.sun.strength*(sun*.66-.19)*(1-sky)+l.moon.strength*moon*2)*sceneGain*exposureGain;
      for(let ch=0;ch<3;ch++)data[p+ch]=Math.min(255,data[p+ch]*gain*(1+l.moon.color[ch]*l.moon.strength*moon*.7));
    }
    c.putImageData(pixels,0,0);
    this.drawFallbackBodies(state);
  }
  drawPhotographicCanvas(state) {
    // Native drawImage/filter/compositing keeps the original high-frequency
    // image detail without reading or iterating over a 4K framebuffer on CPU.
    const c = this.context, w = this.canvas.width, h = this.canvas.height, grade = photographicGrade(state.lighting);
    const crop = state.camera.crop, sx = (1 - crop[0]) / 2 * this.sourceWidth, sy = (1 - crop[1]) / 2 * this.sourceHeight;
    const gain = Math.max(...grade.baseTint);
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; c.filter = 'none'; c.fillStyle = '#000'; c.fillRect(0, 0, w, h);
    c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high'; c.filter = `brightness(${gain})`;
    const weights = this.hasPhases ? state.weights : { noon: 1 };
    c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < this.sources.length; i++) {
      c.globalAlpha = this.hasPhases ? weights[PHASES[i]] || 0 : 1;
      if (c.globalAlpha) c.drawImage(this.sources[i], sx, sy, this.sourceWidth * crop[0], this.sourceHeight * crop[1], 0, 0, w, h);
    }
    c.filter = 'none'; c.globalAlpha = 1; c.globalCompositeOperation = 'multiply';
    c.fillStyle = `rgb(${grade.baseTint.map((channel) => Math.round(255 * channel / gain)).join(',')})`; c.fillRect(0, 0, w, h);
    for (const [light, tint] of [[state.lighting.sun, grade.sunTint], [state.lighting.moon, grade.moonTint]]) {
      const [x, y, z] = light.direction, front = Math.max(0, Math.min(1, z + .35));
      const strength = Math.max(...tint) * front;
      if (strength <= 0) continue;
      const dx = x * w * .6, dy = -y * h * .6;
      const gradient = c.createLinearGradient(w * .5 - dx, h * .5 - dy, w * .5 + dx + .001, h * .5 + dy + .001);
      const color = tint.map((channel) => Math.round(255 * channel / Math.max(...tint))).join(',');
      gradient.addColorStop(0, `rgba(${color},0)`); gradient.addColorStop(1, `rgba(${color},${strength})`);
      c.globalCompositeOperation = 'screen'; c.fillStyle = gradient; c.fillRect(0, 0, w, h);
    }
    c.globalCompositeOperation = 'source-over';
  }
  drawFallbackBodies(state) {
    const c=this.context,w=this.canvas.width,h=this.canvas.height;
    for(const [kind,source] of [['sun',state.lighting.sun],['moon',state.lighting.moon]]) {
      if(!source.visible)continue;
      const u=(source.screenX-.5)*state.camera.crop[0]+.5,v=(source.screenY-.5)*state.camera.crop[1]+.5;
      const k=(Math.min(this.geometry.height-1,Math.max(0,Math.floor(v*this.geometry.height)))*this.geometry.width+Math.min(this.geometry.width-1,Math.max(0,Math.floor(u*this.geometry.width))))*4;
      if(this.materialPixels[k]<128)continue;
      const radius=w*source.angularRadius/state.lighting.camera.fieldOfView;
      c.save();c.globalAlpha=Math.min(1,source.visibility);c.fillStyle=kind==='sun'?'#fff0c2':'#c7d2e1';
      if(kind==='sun'){c.beginPath();c.arc(source.screenX*w,source.screenY*h,Math.max(1,radius),0,Math.PI*2);c.fill();}
      else {
        c.translate(source.screenX*w,source.screenY*h); c.rotate((source.brightLimbAngle-source.parallacticAngle)*RAD);
        // Draw only the illuminated span; never erase the photograph beneath it.
        const r=Math.max(1,radius),k=1-2*source.illumination;
        for(let y=-r;y<=r;y+=.5){const half=Math.sqrt(Math.max(0,r*r-y*y));c.fillRect(-half,y,(1-k)*half,.6);}
      }
      c.restore();
    }
  }
  update() { this.draw(); this.schedule(); }
  schedule() {
    const state=this.provider();
    if(this.frame || document.hidden || state?.visible===false || !this.ready || this.scene?.id==='procedural' || (!state?.motion&&!state?.animating))return;
    // Static photography is already refreshed by every celestial update. It
    // needs RAF only while transitioning; video still follows its frame clock.
    if(this.scene?.photoReal && !this.scene.isVideo && !state?.animating)return;
    this.frame=requestAnimationFrame((now)=>{this.frame=null;if(!this.lastFrame || now-this.lastFrame>=1000/(this.renderer==='canvas'?12:24)){this.lastFrame=now;this.draw();}this.schedule();});
  }
  diagnostics() {
    let pixels=[];
    if(this.ready && this.scene?.id!=='procedural') {
      for(const [u,v] of [[.16,.2],[.5,.2],[.84,.2],[.16,.55],[.5,.55],[.84,.55],[.3,.85],[.7,.85]]) {
        const x=Math.min(this.canvas.width-1,Math.floor(u*this.canvas.width)),y=Math.min(this.canvas.height-1,Math.floor(v*this.canvas.height));
        try {if(this.renderer==='webgl'&&!this.contextLost){const p=new Uint8Array(4);this.gl.readPixels(x,this.canvas.height-y-1,1,1,this.gl.RGBA,this.gl.UNSIGNED_BYTE,p);pixels.push(...p);}else pixels.push(...this.context.getImageData(x,y,1,1).data);}catch{pixels=[];break;}
      }
    }
    const hash=pixels.reduce((value,channel)=>Math.imul(value^channel,16777619)>>>0,2166136261).toString(16);
    return {ready:this.ready,renderer:this.scene?.id==='procedural'?'procedural':this.renderer,sceneId:this.scene?.id,frameCount:this.frameCount,drawCount:this.drawCount,utcMillis:this.utcMillis,width:this.canvas.width,height:this.canvas.height,sourceWidth:this.sourceWidth,sourceHeight:this.sourceHeight,textureWidth:this.textureSizes?.[0]?.width,textureHeight:this.textureSizes?.[0]?.height,outputScale:this.outputSize?.outputScale,devicePixelRatio:window.devicePixelRatio||1,outputLimited:this.outputSize?.limited,photoReal:this.scene?.photoReal===true,contextLost:this.contextLost,fallbackReason:this.fallbackReason,shaderError:this.shaderError,pixelHash:hash,pixels,geometryVersion:this.geometry?.version};
  }
}
