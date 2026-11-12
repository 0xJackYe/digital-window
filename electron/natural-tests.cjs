'use strict';

const fs = require('node:fs');
const path = require('node:path');

/** Actual-window checks for continuous illumination of original photographs. */
async function runNaturalTests(mainWindow, { finish, delay, outputDirectory } = {}) {
  const checks = [];
  const pause = delay || ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const complete = (error) => finish('DIGITAL_WINDOW_NATURAL', checks, error);
  const ready = async () => {
    let state;
    const deadline = Date.now() + 30000;
    do {
      state = await mainWindow.webContents.executeJavaScript('window.__digitalWindowSmoke?.()');
      if (state?.ready && state.relighting?.ready) return state;
      await pause(100);
    } while (Date.now() < deadline);
    throw new Error(`Photographic daylight did not initialize: ${JSON.stringify(state)}`);
  };
  const reload = async () => {
    const loaded = new Promise((resolve) => mainWindow.webContents.once('did-finish-load', resolve));
    mainWindow.webContents.reload(); await loaded; return ready();
  };
  try {
    const initial = await ready();
    checks.push({ name: 'continuous photographic daylight is the default', passed: initial.renderMode === 'daylight' && initial.photoReal && initial.relighting.photoReal, mode: initial.renderMode, sceneId: initial.sceneId });
    if (process.argv.includes('--disable-webgl')) checks.push({ name: 'devices without WebGL run photographic Canvas illumination', passed: initial.relighting.renderer === 'canvas', renderer: initial.relighting.renderer });
    checks.push(...await mainWindow.webContents.executeJavaScript(`(${photographicBrowserChecks.toString()})()`, true));

    mainWindow.webContents.enableDeviceEmulation({ screenPosition: 'desktop', screenSize: { width: 1920, height: 1080 }, viewPosition: { x: 0, y: 0 }, viewSize: { width: 1920, height: 1080 }, deviceScaleFactor: 2, scale: 1 });
    try {
      await pause(550);
      const physical = await mainWindow.webContents.executeJavaScript('window.__digitalWindowSmoke().relighting');
      checks.push({ name: 'photographic daylight retains a real 3840x2160 framebuffer', passed: physical.ready && physical.width === 3840 && physical.height === 2160 && physical.sourceWidth >= 3840 && physical.pixels.length === 32, width: physical.width, height: physical.height, sourceWidth: physical.sourceWidth, renderer: physical.renderer });
    } finally { mainWindow.webContents.disableDeviceEmulation(); await pause(300); }

    const folder = path.resolve(outputDirectory || path.join(process.cwd(), '.test-results'));
    fs.mkdirSync(folder, { recursive: true });
    const snapshots = [];
    for (const [period, minute] of [['morning', 450], ['noon', 720], ['evening', 1010], ['night', 1320]]) {
      const state = await mainWindow.webContents.executeJavaScript(`(${preparePhotographicCapture.toString()})(${minute})`, true);
      const filename = path.join(folder, `photo-denver-${period}.png`);
      fs.writeFileSync(filename, (await mainWindow.webContents.capturePage()).toPNG());
      snapshots.push({ period, minute, sceneId: state.sceneId, utcMillis: state.utcMillis, sunAltitude: state.lighting?.sun?.altitude, moonAltitude: state.lighting?.moon?.altitude, pixels: state.pixels, photoGrade: state.photoGrade, filename: path.basename(filename) });
    }
    checks.push({ name: 'Denver morning, noon, evening and night retain the same original photograph', passed: snapshots.every((sample) => sample.sceneId === 'denver' && sample.pixels.length === 32) && snapshots[1].sunAltitude > 15 && snapshots[3].sunAltitude < -10 && new Set(snapshots.map((sample) => sample.pixels.join(','))).size >= 3, snapshots });
    checks.push(...await mainWindow.webContents.executeJavaScript(`(${photographicContextChecks.toString()})()`, true));

    await mainWindow.webContents.executeJavaScript(`(() => { const key='digital-window.settings.v2',saved=JSON.parse(localStorage.getItem(key)||'{}');delete saved.photoLightingVersion;saved.renderMode='natural';localStorage.setItem(key,JSON.stringify(saved)); })()`);
    const migrated = await reload();
    checks.push({ name: 'saved v1.4 3D preferences migrate to continuous photographic daylight', passed: migrated.renderMode === 'daylight' && migrated.photoReal && migrated.relighting.photoReal });
    await mainWindow.webContents.executeJavaScript(`(() => {const select=document.getElementById('render-mode');select.value='photo';select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    const original = await reload();
    checks.push({ name: 'a newly chosen original-photo preference survives application reload', passed: original.renderMode === 'photo' && original.relighting.originalPhoto === true });
    await mainWindow.webContents.executeJavaScript(`(() => { const toggle=document.getElementById('realtime-toggle');toggle.checked=false;toggle.dispatchEvent(new Event('change',{bubbles:true})); })()`);
    const manualOriginal = await reload();
    await mainWindow.webContents.executeJavaScript(`(() => { const select=document.getElementById('render-mode');select.value='daylight';select.dispatchEvent(new Event('change',{bubbles:true})); })()`);
    await pause(450);
    const resumed = await mainWindow.webContents.executeJavaScript('window.__digitalWindowSmoke()');
    checks.push({ name: 'original-photo manual preview resumes continuous lighting at the same finite instant after reload', passed: resumed.renderMode === 'daylight' && Number.isFinite(resumed.relighting.utcMillis) && Math.abs(resumed.relighting.utcMillis - manualOriginal.relighting.utcMillis) < 2 && resumed.relighting.pixels.length === 32, originalUtcMillis: manualOriginal.relighting.utcMillis, resumedUtcMillis: resumed.relighting.utcMillis });
    await mainWindow.webContents.executeJavaScript(`(() => { const toggle=document.getElementById('realtime-toggle');toggle.checked=true;toggle.dispatchEvent(new Event('change',{bubbles:true})); })()`);
    complete();
  } catch (error) { complete(error); }
}

async function photographicBrowserChecks() {
  const checks = [], check = (name, passed, details = {}) => checks.push({ name, passed: Boolean(passed), ...details });
  const byId = (id) => document.getElementById(id), ui = () => window.__digitalWindowSmoke(), photo = () => ui().relighting;
  const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
  const wait = async (predicate, timeout = 15000) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) { if (predicate()) return true; await pause(80); }
    return predicate();
  };
  const change = (id, value) => {
    const element = byId(id);
    if (!element) throw new Error(`Missing control: ${id}`);
    if (element.type === 'checkbox') element.checked = value; else element.value = value;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const preview = async (minute) => { change('time-slider', minute); await pause(500); return photo(); };
  const vectorDistance = (a = [], b = []) => Math.hypot(...a.map((value, index) => value - b[index]));
  const vectorIsUnit = (vector) => Array.isArray(vector) && vector.length === 3 && vector.every(Number.isFinite) && Math.abs(Math.hypot(...vector) - 1) < 1e-6;
  const photoSource = () => [...document.querySelectorAll('.scene-photo')].at(-1)?.getAttribute('src');
  check('the view contains photographs without a reconstructed 3D city', !byId('natural-stage') && !byId('natural-light-canvas') && !document.body.classList.contains('natural-mode') && ![...byId('render-mode').options].some((option) => option.value === 'natural'));
  check('the photographic renderer exposes continuous directional illumination', photo().lightModel === 'continuous-photo-field-1.0' && photo().lighting && vectorIsUnit(photo().lighting.sun.direction) && vectorIsUnit(photo().lighting.moon.direction), { lightModel: photo().lightModel });

  // Evaluate actual second-resolution astronomical instants independently of
  // display quantization. An 8-bit pixel need not change at every tiny step.
  const [{ getCelestialState }, { getLightingState }, { photographicGrade, samplePhotographicLight }] = await Promise.all([import('./celestial.js'), import('./lighting.js'), import('./photo-light.js')]);
  const place = { latitude: 39.748, longitude: -104.996, zone: 'America/Denver' };
  const camera = { viewAzimuth: 120, fieldOfView: 80, verticalFieldOfView: 60, horizon: .5 };
  const start = Date.parse('2026-06-21T11:30:00Z');
  const samples = Array.from({ length: 61 }, (_, second) => {
    const lighting = getLightingState(getCelestialState(new Date(start + second * 1000), place), camera);
    return { sun: lighting.sun.direction, moon: lighting.moon.direction, field: samplePhotographicLight(photographicGrade(lighting), lighting, .2, .3, .6) };
  });
  const changes = samples.slice(1).map((sample, index) => ({ sun: vectorDistance(sample.sun, samples[index].sun), moon: vectorDistance(sample.moon, samples[index].moon), field: vectorDistance(sample.field, samples[index].field) }));
  check('Sun, Moon and photographic light evaluate every second without clock buckets', changes.every((delta) => delta.sun > 1e-7 && delta.sun < .001 && delta.moon > 1e-7 && delta.moon < .001 && delta.field > 1e-12 && delta.field < .005), { seconds: changes.length, minimumSunStep: Math.min(...changes.map((delta) => delta.sun)), maximumFieldStep: Math.max(...changes.map((delta) => delta.field)) });
  const continuous = [-18, -12, -6, 0, 2.5, 6, 12, 30].map((altitude) => {
    const field = (offset) => { const light = getLightingState({ sun: { altitude: altitude + offset, azimuth: 110 }, moon: { altitude: 30, azimuth: 250, illumination: .8 } }, camera); return samplePhotographicLight(photographicGrade(light), light, .25, .25, .7); };
    return vectorDistance(field(-.0001), field(.0001));
  });
  check('dawn, horizon and twilight boundaries have no discrete light jumps', continuous.every((distance) => Number.isFinite(distance) && distance < .001), { boundaryDifferences: continuous });
  const moonField = (azimuth) => { const light = getLightingState({ sun: { altitude: -30, azimuth: 100 }, moon: { altitude: 40, azimuth, illumination: 1 } }, camera); return samplePhotographicLight(photographicGrade(light), light, .15, .35, .5); };
  check('moonlight has its own changing illumination direction', vectorDistance(moonField(30), moonField(210)) > 1e-5);

  byId('tab-landscapes').click(); change('render-mode', 'daylight');
  for (const sceneId of ['manhattan', 'denver', 'medieval', 'kyoto', 'fuji', 'lake', 'coast', 'forest']) {
    document.querySelector(`.landscape-card[data-scene="${sceneId}"]`).click();
    const ready = await wait(() => ui().sceneId === sceneId && photo().sceneId === sceneId && photo().ready && !ui().transitioning);
    const state = photo();
    check(`${sceneId} lights its original high-resolution photograph`, ready && ui().photoReal && ui().imageLoaded && ui().layerImages.length === 0 && state.photoReal && state.sourceWidth >= 3840 && state.geometryVersion === 'photographic-preserved-1.0' && state.lightModel === 'continuous-photo-field-1.0', { sceneId, sourceWidth: state.sourceWidth, renderer: state.renderer });
  }

  document.querySelector('.landscape-card[data-scene="denver"]').click();
  await wait(() => ui().sceneId === 'denver' && photo().sceneId === 'denver' && !ui().transitioning);
  byId('tab-daylight').click(); change('scene-timezone-toggle', true);
  check('Denver uses its real Mountain Time location and office foreground', ui().timeZone === 'America/Denver' && Boolean(document.querySelector('.office-interior')));
  const beforePreview = await preview(720), afterPreview = await preview(720.017);
  check('fractional-minute preview reaches individual seconds rather than time-of-day nodes', Number(byId('time-slider').step) <= .001 && Math.abs(afterPreview.utcMillis - beforePreview.utcMillis - 1020) <= 2 && vectorDistance(beforePreview.lighting.sun.direction, afterPreview.lighting.sun.direction) > 1e-8, { beforeUtc: beforePreview.utcMillis, afterUtc: afterPreview.utcMillis, sliderStep: byId('time-slider').step });
  const frozen = photo(); await pause(450); const stillFrozen = photo();
  check('a settled manual preview holds the selected instant', Math.abs(stillFrozen.utcMillis - frozen.utcMillis) < 1 && vectorDistance(stillFrozen.lighting.sun.direction, frozen.lighting.sun.direction) < 1e-12);

  const source = photoSource();
  change('view-azimuth', 80); await pause(350); const east = photo();
  change('view-azimuth', 260); await pause(350); const west = photo();
  check('camera bearing changes directional illumination across the unchanged photo', photoSource() === source && vectorDistance(east.lighting.sun.direction, west.lighting.sun.direction) > .1 && east.pixelHash !== west.pixelHash && JSON.stringify(east.lightFieldSamples) !== JSON.stringify(west.lightFieldSamples), { eastHash: east.pixelHash, westHash: west.pixelHash });
  change('view-azimuth', 120);

  byId('tab-preferences').click(); change('motion-toggle', false);
  byId('tab-daylight').click(); change('realtime-toggle', true); await pause(350);
  const beforeTick = photo(); await pause(1300); const afterTick = photo();
  check('turning off decorative motion never freezes continuous natural illumination', afterTick.utcMillis - beforeTick.utcMillis > 900 && afterTick.frameCount > beforeTick.frameCount + 5 && vectorDistance(afterTick.lighting.sun.direction, beforeTick.lighting.sun.direction) > 1e-7, { renderer: afterTick.renderer, elapsedMs: afterTick.utcMillis - beforeTick.utcMillis, frames: afterTick.frameCount - beforeTick.frameCount });
  const beforeHandoff = Date.now(); change('realtime-toggle', false); await pause(350);
  const handoff = photo();
  check('switching from realtime to manual preview preserves seconds and milliseconds', Math.abs(handoff.utcMillis - beforeHandoff) < 1000, { previewUtcMillis: handoff.utcMillis, differenceMs: handoff.utcMillis - beforeHandoff });

  const noon = await preview(720), night = await preview(1320);
  const ratio = (state) => { const rgb = state.pixels.reduce((total, channel, index) => { if (index % 4 < 3) total[index % 4] += channel; return total; }, [0, 0, 0]); const total = rgb.reduce((sum, channel) => sum + channel, 0); return rgb.map((channel) => channel / Math.max(total, 1)); };
  check('photographic night changes color and local lighting as well as brightness', noon.pixelHash !== night.pixelHash && vectorDistance(ratio(noon), ratio(night)) > .005 && JSON.stringify(noon.lightFieldSamples) !== JSON.stringify(night.lightFieldSamples), { noonChroma: ratio(noon), nightChroma: ratio(night) });
  check('time changes never swap a phase image or replace the original photo', photoSource() === source && ui().layerImages.length === 0 && photo().sourceWidth === beforePreview.sourceWidth);

  byId('tab-landscapes').click(); change('render-mode', 'photo');
  const originalNoon = await preview(720), sameNoon = await preview(720), originalNight = await preview(1320), sameNight = await preview(1320);
  const rawEvidence = (state) => ({ originalPhoto: state.originalPhoto, utcMillis: state.utcMillis, targetUtcMillis: state.targetUtcMillis, frameCount: state.frameCount, width: state.width, height: state.height, pixelHash: state.pixelHash, pixels: state.pixels });
  const rawSamples = [originalNoon, sameNoon, originalNight, sameNight];
  check('original-photo mode remains available without modifying its source lighting', rawSamples.every((sample) => sample.originalPhoto === true) && new Set(rawSamples.map((sample) => sample.pixelHash)).size === 1 && ui().imageLoaded && photoSource() === source, { originalNoon: rawEvidence(originalNoon), sameNoon: rawEvidence(sameNoon), originalNight: rawEvidence(originalNight), sameNight: rawEvidence(sameNight), imageLoaded: ui().imageLoaded, sameSource: photoSource() === source });
  change('render-mode', 'daylight'); await pause(450);
  check('returning to continuous illumination keeps the real photograph visible', ui().renderMode === 'daylight' && photo().ready && !photo().originalPhoto && photoSource() === source);
  const desktop = await window.digitalWindow.getWindowState();
  check('native fullscreen covers the complete monitor including taskbar bounds', desktop.fullscreen && ['x', 'y', 'width', 'height'].every((key) => desktop.bounds[key] === desktop.displayBounds[key]), { bounds: desktop.bounds, displayBounds: desktop.displayBounds });
  return checks;
}

async function preparePhotographicCapture(minute) {
  const byId = (id) => document.getElementById(id);
  byId('tab-daylight').click();
  const slider = byId('time-slider'); slider.value = minute;
  slider.dispatchEvent(new Event('input', { bubbles: true })); slider.dispatchEvent(new Event('change', { bubbles: true }));
  byId('close-panel').click(); document.activeElement?.blur();
  await new Promise((resolve) => setTimeout(resolve, 550));
  return window.__digitalWindowSmoke().relighting;
}

async function photographicContextChecks() {
  const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const state = () => window.__digitalWindowSmoke().relighting;
  if (state().renderer !== 'webgl') return [{ name: 'continuous photographic illumination is active in Canvas fallback', passed: state().renderer === 'canvas' && state().ready && !state().originalPhoto && state().lightModel === 'continuous-photo-field-1.0' }];
  const canvas = document.getElementById('relighting-canvas'), gl = canvas.getContext('webgl'), extension = gl.getExtension('WEBGL_lose_context');
  if (!extension) return [{ name: 'photographic context-loss exercise', passed: true, skipped: true, reason: 'WEBGL_lose_context unavailable' }];
  extension.loseContext();
  for (let attempt = 0; attempt < 60 && state().renderer !== 'canvas'; attempt++) await pause(100);
  const fallback = state();
  const checks = [{ name: 'lost WebGL context keeps the photograph and continuous Canvas illumination visible', passed: fallback.renderer === 'canvas' && fallback.ready && !fallback.originalPhoto && fallback.photoReal && fallback.pixels.length === 32 && fallback.lightModel === 'continuous-photo-field-1.0', fallbackReason: fallback.fallbackReason }];
  extension.restoreContext();
  for (let attempt = 0; attempt < 80 && (state().renderer !== 'webgl' || state().contextLost); attempt++) await pause(100);
  const recovered = state();
  checks.push({ name: 'restored WebGL context resumes the same photograph and lighting model', passed: recovered.renderer === 'webgl' && !recovered.contextLost && recovered.ready && recovered.photoReal && recovered.pixels.length === 32 && recovered.lightModel === 'continuous-photo-field-1.0' });
  return checks;
}

module.exports = { runNaturalTests };
