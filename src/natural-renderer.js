import * as THREE from '../vendor/three.module.js';
import { getCelestialState } from './celestial.js';
import { evaluateNaturalLight } from './natural-light.js';
import { buildNaturalScene } from './natural-scenes.js';
import { createNaturalSky } from './natural-sky.js';

const RAD = Math.PI / 180;
const UP = new THREE.Vector3(0, 1, 0);
const color = (rgb) => new THREE.Color().setRGB(...rgb, THREE.LinearSRGBColorSpace);
// Representative urban skyglow, not measured local weather or fictitious Sun.
// Units are horizontal illuminance in lux; natural locations retain airglow.
const CITY_SKYGLOW_LUX = { manhattan: .14, denver: .09, medieval: .065, kyoto: .035 };
const ENVIRONMENT_ANGLE_RADIANS = .10 * RAD;
const vectorAngle = (a, b) => Math.acos(Math.max(-1, Math.min(1, a.reduce((sum, value, index) => sum + value * b[index], 0))));

function illuminate(light, direction, intensity, rgb, center, distance = 800) {
  light.position.copy(center).addScaledVector(new THREE.Vector3(...direction), distance);
  light.target.position.copy(center);
  light.intensity = Math.max(0, intensity);
  light.color.copy(color(rgb));
  light.visible = intensity > 0;
  light.target.updateMatrixWorld();
}

/** Actual geometry, shadow maps and linear HDR transport. No image-phase inputs. */
export class NaturalLightRenderer {
  constructor(host, provider, onFailure = () => {}) {
    this.host = host; this.provider = provider; this.onFailure = onFailure;
    this.ready = false; this.active = false; this.frames = 0; this.available = false;
    this.canvas = document.createElement('canvas'); this.canvas.id = 'natural-light-canvas'; this.canvas.className = 'natural-light-canvas';
    this.canvas.setAttribute('aria-hidden', 'true'); host.append(this.canvas);
    try {
      const context = this.canvas.getContext('webgl2', { antialias: true, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
      if (!context) throw new Error('WebGL2 is unavailable');
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, context, antialias: true, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFShadowMap;
      this.renderer.setClearColor(0x000000);
      this.available = true;
      this.scene = new THREE.Scene(); this.camera = new THREE.PerspectiveCamera(48, 1, .15, 14000);
      this.sky = createNaturalSky(); this.scene.add(this.sky.mesh);
      this.setupEnvironment();
      this.sun = new THREE.DirectionalLight(0xffffff, 0); this.moon = new THREE.DirectionalLight(0xffffff, 0);
      for (const light of [this.sun, this.moon]) {
        light.castShadow = true;
        light.shadow.mapSize.set(2048, 2048);
        light.shadow.bias = -.00004; light.shadow.normalBias = .045; light.shadow.radius = 2;
        light.shadow.camera.near = .5; light.shadow.camera.far = 1800;
        this.scene.add(light, light.target);
      }
      this.hemisphere = new THREE.HemisphereLight(0xffffff, 0x424039, 0); this.scene.add(this.hemisphere);
      this.center = new THREE.Vector3(); this.shadowCenter = new THREE.Vector3(); this.frame = null;
      this.canvas.addEventListener('webglcontextlost', (event) => {
        event.preventDefault(); this.contextLost = true; this.stop(); this.releaseEnvironment();
        if (this.active) this.onFailure('三维渲染暂时中断，已切换到原始实拍。');
      });
      this.canvas.addEventListener('webglcontextrestored', () => { this.contextLost = false; this.environmentDirty = true; this.resize(); });
    } catch (error) { this.failureReason = String(error.message || error); this.canvas.hidden = true; }
    this.onResize = () => this.resize();
    this.onVisibility = () => { if (document.hidden) { this.stop(); this.releaseEnvironment(); } else this.update(); };
    window.addEventListener('resize', this.onResize);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.resize();
  }
  setActive(active) {
    this.active = Boolean(active && this.available && !this.contextLost);
    this.canvas.hidden = !this.active; this.host.classList.toggle('natural-active', this.active);
    if (this.active) { this.resize(); this.update(); } else { this.stop(); this.releaseEnvironment(); }
    return this.active;
  }
  setScene(scene) {
    if (!this.available) return false;
    if (this.definition?.id === scene.id && this.world) return true;
    this.stop();
    if (this.world) { this.scene.remove(this.world.group); this.world.dispose(); }
    this.definition = scene;
    this.world = buildNaturalScene(scene.id);
    this.scene.add(this.world.group);
    this.camera.fov = this.world.cameraFov || 48;
    const extent = this.world.shadowRadius || 140;
    for (const light of [this.sun, this.moon]) {
      Object.assign(light.shadow.camera, { left: -extent, right: extent, top: extent, bottom: -extent });
      light.shadow.camera.updateProjectionMatrix();
    }
    this.meshCount = 0; this.casterCount = 0; this.receiverCount = 0;
    const materials = new Set();
    this.world.group.traverse((object) => { if (object.isMesh) { this.meshCount++; this.casterCount += Number(object.castShadow); this.receiverCount += Number(object.receiveShadow); for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material); } });
    this.materials = [...materials];
    this.environmentDirty = true;
    this.ready = true; this.resize(); this.update(); return true;
  }
  setupEnvironment() {
    this.environmentScene = new THREE.Scene();
    this.environmentMesh = this.sky.mesh.clone();
    this.environmentMesh.position.set(0, 0, 0);
    // Keep one physical atmosphere/uniform state, but omit source discs from
    // its IBL capture: direct lights already provide those sources, and the
    // solar disc exceeds the finite range of a half-float cubemap.
    const material = this.sky.mesh.material.clone();
    material.name = 'NaturalAtmosphereIBLLinearHDR';
    material.uniforms = this.sky.mesh.material.uniforms;
    const sunDisc = 'sky+=uSunColor*(uSunLux/(PI*uSunRadius*uSunRadius))*solarDisc;';
    const moonDisc = 'sky+=moonSurface(d);';
    if (!material.fragmentShader.includes(sunDisc) || !material.fragmentShader.includes(moonDisc)) throw new Error('Atmosphere IBL disc exclusion no longer matches the sky shader');
    material.fragmentShader = material.fragmentShader.replace(sunDisc, '/* Direct solar disc excluded from indirect environment. */').replace(moonDisc, '/* Direct lunar disc excluded from indirect environment. */');
    material.toneMapped = false;
    this.environmentMaterial = material;
    this.environmentMesh.material = material;
    this.environmentScene.add(this.environmentMesh);
    this.environmentDirty = true; this.environmentRefreshes = 0;
  }
  releaseEnvironment() {
    if (this.scene) { this.scene.environment = null; this.scene.environmentIntensity = 1; }
    this.environmentTarget?.dispose(); this.environmentTarget = null;
    this.pmrem?.dispose(); this.pmrem = null;
    this.environmentSample = null; this.environmentDirty = true;
  }
  updateEnvironment(model, seconds, state) {
    const previous = this.environmentSample;
    const angularChange = previous ? Math.max(vectorAngle(model.sunDirection, previous.sunDirection), vectorAngle(model.moonDirection, previous.moonDirection)) : Infinity;
    const colorChange = previous ? Math.max(...model.ambientSkyLinear.map((value, index) => Math.abs(value - previous.skyColor[index]))) : Infinity;
    const energyChange = previous ? Math.abs(Math.log(Math.max(1e-8, model.skyIrradianceLux) / Math.max(1e-8, previous.skyLux))) : Infinity;
    const previewChanged = previous && !state.realtime && Math.abs(model.utcMillis - previous.utcMillis) > 1000;
    const movingClouds = previous && state.motion && model.cloudCoverage > 0 && Math.abs(seconds - previous.animationSeconds) > 8;
    const needsCapture = !this.environmentTarget || this.environmentDirty || angularChange > ENVIRONMENT_ANGLE_RADIANS || colorChange > .008 || energyChange > .025 || previewChanged || movingClouds;
    if (needsCapture) {
      const renderer = this.renderer;
      const oldTarget = renderer.getRenderTarget(), oldFace = renderer.getActiveCubeFace(), oldMip = renderer.getActiveMipmapLevel();
      const oldToneMapping = renderer.toneMapping, oldExposure = renderer.toneMappingExposure, oldShadowEnabled = renderer.shadowMap.enabled;
      const oldClear = [renderer.autoClear, renderer.autoClearColor, renderer.autoClearDepth, renderer.autoClearStencil];
      let capture;
      try {
        this.pmrem ||= new THREE.PMREMGenerator(renderer);
        renderer.toneMapping = THREE.NoToneMapping; renderer.toneMappingExposure = 1;
        renderer.shadowMap.enabled = false;
        // r187's minimum PMREM face size is 256. This fixed small convolution
        // is independent of the final 4K output, and is never rebuilt per frame.
        capture = this.pmrem.fromScene(this.environmentScene, 0, .1, 14000, { size: 256 });
        capture.texture.colorSpace = THREE.LinearSRGBColorSpace;
        const obsolete = this.environmentTarget;
        this.environmentTarget = capture; this.scene.environment = capture.texture;
        this.environmentSample = { sunDirection: model.sunDirection.slice(), moonDirection: model.moonDirection.slice(), skyColor: model.ambientSkyLinear.slice(), skyLux: model.skyIrradianceLux, utcMillis: model.utcMillis, animationSeconds: seconds };
        this.environmentDirty = false; this.environmentRefreshes++; this.environmentError = null;
        obsolete?.dispose();
      } catch (error) {
        if (capture && capture !== this.environmentTarget) capture.dispose();
        this.environmentError = String(error.message || error);
        this.environmentDirty = false;
      } finally {
        renderer.toneMapping = oldToneMapping; renderer.toneMappingExposure = oldExposure;
        renderer.shadowMap.enabled = oldShadowEnabled;
        [renderer.autoClear, renderer.autoClearColor, renderer.autoClearDepth, renderer.autoClearStencil] = oldClear;
        renderer.setRenderTarget(oldTarget, oldFace, oldMip);
      }
    }
    // The cached convolution stores angular structure. Its photometric energy
    // follows the current continuous model every frame, between tiny-angle
    // convolution refreshes; daylight is never quantized to these refreshes.
    this.scene.environmentIntensity = this.environmentTarget && this.environmentSample
      ? model.skyIrradianceLux / Math.max(1e-8, this.environmentSample.skyLux) : 1;
    this.hemisphere.intensity = this.environmentTarget ? 0 : model.skyIrradianceLux;
  }
  resize() {
    if (!this.available) return;
    const ratio = window.devicePixelRatio || 1, gl = this.renderer.getContext();
    const viewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS), maximum = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE);
    const scale = Math.min(ratio, maximum / innerWidth, maximum / innerHeight, viewport[0] / innerWidth, viewport[1] / innerHeight);
    this.renderer.setPixelRatio(scale); this.renderer.setSize(innerWidth, innerHeight, false);
    if (this.camera) { this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix(); }
    this.draw();
  }
  evaluate(state) {
    const instant = state.realtime ? new Date() : new Date(state.utcMillis);
    const celestial = getCelestialState(instant, state.place);
    const skyglow = CITY_SKYGLOW_LUX[this.definition?.id] || 0;
    const model = evaluateNaturalLight(celestial, { turbidity: 2.4, groundAlbedo: .2, cloudCoverage: .18, lightPollutionLux: skyglow, minExposureEV100: skyglow > 0 ? -3.3 : -2 });
    model.utcMillis = +instant;
    model.moonIllumination = celestial.moon.illumination; model.moonPhase = celestial.moon.phase;
    model.moonBrightLimbAngle = (celestial.moon.brightLimbAngle || 0) * RAD;
    return { model, celestial };
  }
  draw() {
    if (!this.available || !this.active || !this.world || document.hidden || this.contextLost) return;
    const state = this.provider(); if (state.visible === false) { this.releaseEnvironment(); return; }
    if (!state.place || !Number.isFinite(state.utcMillis)) return;
    const { model, celestial } = this.evaluate(state);
    const heading = -(state.bearing ?? this.definition.camera.azimuth ?? 0) * RAD;
    this.world.group.rotation.y = heading;
    this.camera.position.fromArray(this.world.cameraPosition).applyAxisAngle(UP, heading);
    this.center.fromArray(this.world.cameraTarget).applyAxisAngle(UP, heading);
    this.camera.lookAt(this.center);
    this.sky.mesh.position.copy(this.camera.position);
    const animationSeconds = state.motion ? performance.now() / 1000 : 0;
    this.sky.update(model, animationSeconds);
    this.shadowCenter.fromArray(this.world.shadowFocus || this.world.cameraTarget).applyAxisAngle(UP, heading);
    illuminate(this.sun, model.sunDirection, model.sunIlluminanceLux, model.sunColorLinear, this.shadowCenter);
    illuminate(this.moon, model.moonDirection, model.moonIlluminanceLux, model.moonColorLinear, this.shadowCenter);
    // Omit only visually negligible daytime lunar shadow-map work; lunar
    // direction and its physical direct illuminance still enter the shader.
    this.moon.castShadow = model.moonIlluminanceLux > model.sunIlluminanceLux * .00001;
    this.hemisphere.color.copy(color(model.ambientSkyLinear)); this.hemisphere.groundColor.copy(color(model.groundBounceLinear));
    this.updateEnvironment(model, animationSeconds, state);
    this.renderer.toneMappingExposure = model.exposure;
    const fogColor = color(model.ambientSkyLinear).multiplyScalar(Math.max(.00001, model.skyLuminanceCdM2) * .24);
    this.scene.fog ||= new THREE.FogExp2(fogColor, .0005);
    this.scene.fog.color.copy(fogColor); this.scene.fog.density = this.definition.id === 'forest' ? .003 : .00045;
    this.world.update(animationSeconds, model);
    this.renderer.render(this.scene, this.camera);
    this.frames++; this.lastModel = model; this.lastCelestial = celestial;
    this.lastShadowMatrix = this.sun.shadow.matrix.elements.slice();
  }
  update() { this.draw(); this.schedule(); }
  schedule() {
    const state = this.provider();
    if (this.frame || !this.active || !this.ready || document.hidden || state.visible === false || (!state.realtime && !state.motion)) return;
    this.frame = requestAnimationFrame((now) => {
      this.frame = null;
      if (!this.lastFrame || now - this.lastFrame >= 1000 / 30) { this.lastFrame = now; this.draw(); }
      this.schedule();
    });
  }
  stop() { cancelAnimationFrame(this.frame); this.frame = null; }
  dispose() {
    this.stop(); this.releaseEnvironment(); this.active = false; this.available = false;
    window.removeEventListener('resize', this.onResize); document.removeEventListener('visibilitychange', this.onVisibility);
    this.world?.dispose(); this.world = null;
    this.environmentMaterial?.dispose(); this.environmentScene?.clear();
    this.sky?.dispose(); this.sun?.dispose(); this.moon?.dispose();
    this.renderer?.dispose(); this.scene?.clear(); this.canvas.remove();
  }
  diagnostics() {
    const gl = this.available ? this.renderer.getContext() : null, pixels = [];
    if (this.active && this.frames && gl && !this.contextLost) for (const [u, v] of [[.2,.2],[.5,.2],[.8,.2],[.2,.6],[.5,.6],[.8,.6],[.3,.9],[.7,.9]]) {
      const p = new Uint8Array(4); gl.readPixels(Math.floor(u * this.canvas.width), Math.floor((1-v) * this.canvas.height), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, p); pixels.push(...p);
    }
    let emissiveCount = 0, emissiveEnergy = 0;
    for (const material of this.materials || []) {
      if (!material.emissive) continue;
      const power = (.2126 * material.emissive.r + .7152 * material.emissive.g + .0722 * material.emissive.b) * material.emissiveIntensity;
      if (power > 0) { emissiveCount++; emissiveEnergy += power; }
    }
    return { available: this.available, active: this.active, ready: this.ready && this.frames > 0, mode: 'natural-3d', renderer: 'webgl2', failureReason: this.failureReason, contextLost: Boolean(this.contextLost), sceneId: this.definition?.id, frameCount: this.frames, width: this.canvas.width, height: this.canvas.height, meshCount: this.meshCount, casterCount: this.casterCount, receiverCount: this.receiverCount, surveyed: false, bearing: this.provider().bearing, emissiveCount, emissiveEnergy, cityLightsVisibility: this.lastModel?.cityLightsVisibility, utcMillis: this.lastModel?.utcMillis, sun: this.lastCelestial?.sun, moon: this.lastCelestial?.moon, sunIlluminanceLux: this.lastModel?.sunIlluminanceLux, moonIlluminanceLux: this.lastModel?.moonIlluminanceLux, skyIrradianceLux: this.lastModel?.skyIrradianceLux, lightPollutionLux: this.lastModel?.lightPollutionLux, environmentAvailable: Boolean(this.environmentTarget), environmentRefreshCount: this.environmentRefreshes, environmentIntensity: this.scene?.environmentIntensity, environmentError: this.environmentError, environmentPhotometry: 'linear HDR analytic atmosphere, source discs excluded; indirect diffuse and specular only', hemisphereFallbackLux: this.hemisphere?.intensity, exposureEV100: this.lastModel?.exposureEV100, sunDirection: this.lastModel?.sunDirection, moonDirection: this.lastModel?.moonDirection, shadowMatrix: this.lastShadowMatrix, drawCalls: this.renderer?.info.render.calls, triangles: this.renderer?.info.render.triangles, pixels, pixelHash: pixels.reduce((h,v) => Math.imul(h^v,16777619)>>>0,2166136261).toString(16) };
  }
  /** Independent receiver/caster fixture: changing a uniform cannot move this mask. */
  verifyShadowTransport() {
    if (!this.available) throw new Error('WebGL2 is unavailable');
    const renderer = this.renderer, oldExposure = renderer.toneMappingExposure;
    const fixture = new THREE.Scene(), target = new THREE.WebGLRenderTarget(256, 256);
    const camera = new THREE.OrthographicCamera(-8,8,8,-8,.1,40); camera.position.set(0,20,0); camera.up.set(0,0,-1); camera.lookAt(0,0,0);
    const material = new THREE.MeshStandardMaterial({color:.6,roughness:1}); material.color.setRGB(.6,.6,.6);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(30,30), material); floor.rotation.x=-Math.PI/2; floor.receiveShadow=true; fixture.add(floor);
    const box = new THREE.Mesh(new THREE.BoxGeometry(2,3,2),material); box.position.y=1.5; box.castShadow=true; fixture.add(box);
    const light = new THREE.DirectionalLight(0xffffff,1000); light.castShadow=true; light.shadow.mapSize.set(1024,1024);
    Object.assign(light.shadow.camera,{left:-10,right:10,top:10,bottom:-10,near:.1,far:60}); light.shadow.normalBias=.015;
    light.shadow.camera.updateProjectionMatrix();
    fixture.add(light,light.target); renderer.toneMappingExposure=.001;
    const capture = (direction, casts) => {
      illuminate(light, direction, 1000, [1,1,1], new THREE.Vector3(), 20); box.castShadow=casts;
      renderer.setRenderTarget(target); renderer.render(fixture,camera);
      const pixels=new Uint8Array(256*256*4); renderer.readRenderTargetPixels(target,0,0,256,256,pixels); return pixels;
    };
    const mask = (shadow, reference) => {
      let count=0,sumX=0,sumY=0,contrast=0;
      for(let y=0;y<256;y++)for(let x=0;x<256;x++){
        if(Math.abs(x-128)<20&&Math.abs(y-128)<20)continue;
        const p=(y*256+x)*4,d=(reference[p]+reference[p+1]+reference[p+2]-shadow[p]-shadow[p+1]-shadow[p+2])/3;
        if(d>12){count++;sumX+=x;sumY+=y;contrast+=d;}
      }
      return {count,x:sumX/(count||1),y:sumY/(count||1),contrast:contrast/(count||1)};
    };
    try {
      const left = [-.75,.6,.25],right=[.75,.6,.25];
      const a=mask(capture(left,true),capture(left,false));
      const b=mask(capture(right,true),capture(right,false));
      return { passed:a.count>100&&b.count>100&&a.x>145&&b.x<111&&a.x-b.x>35,leftLight:a,rightLight:b,centroidShift:a.x-b.x,fixture:'real cube + horizontal receiver; same irradiance, color and exposure; shadow enabled minus shadow disabled' };
    } finally {
      renderer.setRenderTarget(null); renderer.toneMappingExposure=oldExposure; target.dispose();
      floor.geometry.dispose();box.geometry.dispose();material.dispose(); light.shadow.map?.dispose(); this.draw();
    }
  }
}
