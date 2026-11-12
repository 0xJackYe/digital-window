'use strict';

const fs = require('node:fs');
const path = require('node:path');

/** Actual-window checks for the geometry/irradiance renderer, not photo filters. */
async function runNaturalTests(mainWindow, { finish, delay, outputDirectory } = {}) {
  const checks = [];
  const pause = delay || ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const complete = (error) => finish('DIGITAL_WINDOW_NATURAL', checks, error);
  try {
    let initial;
    const deadline = Date.now() + 30000;
    do {
      initial = await mainWindow.webContents.executeJavaScript(`({ ui: window.__digitalWindowSmoke?.(), natural: window.__digitalWindowNatural?.(), mode: document.getElementById('render-mode')?.value })`);
      if (initial.ui?.ready && initial.natural) break;
      await pause(100);
    } while (Date.now() < deadline);
    if (!initial?.ui?.ready || !initial.natural) throw new Error(`Natural-light renderer did not initialize: ${JSON.stringify(initial)}`);
    if (!initial.natural.available) {
      checks.push({ name: 'unavailable WebGL2 is explicitly reported and a working photographic fallback remains', passed: initial.mode === 'photo' && initial.ui.imageLoaded && !initial.natural.active && Boolean(initial.natural.failureReason), skipped: true, reason: initial.natural.failureReason || 'WebGL2 unavailable', mode: initial.mode });
      return complete();
    }
    checks.push(...await mainWindow.webContents.executeJavaScript(`(${naturalBrowserChecks.toString()})()`, true));

    mainWindow.webContents.enableDeviceEmulation({ screenPosition: 'desktop', screenSize: { width: 1920, height: 1080 }, viewPosition: { x: 0, y: 0 }, viewSize: { width: 1920, height: 1080 }, deviceScaleFactor: 2, scale: 1 });
    try {
      await pause(450);
      const physical = await mainWindow.webContents.executeJavaScript('window.__digitalWindowNatural()');
      checks.push({ name: 'natural geometry and HDR atmosphere render into a real 3840x2160 framebuffer', passed: physical.active && physical.width === 3840 && physical.height === 2160 && physical.pixels.length > 0, width: physical.width, height: physical.height, triangles: physical.triangles });
    } finally { mainWindow.webContents.disableDeviceEmulation(); await pause(250); }

    const folder = path.resolve(outputDirectory || path.join(process.cwd(), '.test-results'));
    fs.mkdirSync(folder, { recursive: true });
    const snapshots = [];
    for (const [period, minute] of [['morning', 480], ['noon', 720], ['evening', 1020], ['night', 1320]]) {
      const state = await mainWindow.webContents.executeJavaScript(`(${prepareNaturalCapture.toString()})(${minute})`, true);
      const filename = path.join(folder, `natural-denver-${period}.png`);
      fs.writeFileSync(filename, (await mainWindow.webContents.capturePage()).toPNG());
      snapshots.push({ period, minute, sceneId: state.sceneId, sunAltitude: state.sun?.altitude, sunIlluminanceLux: state.sunIlluminanceLux, moonIlluminanceLux: state.moonIlluminanceLux, pixels: state.pixels, skyIrradianceLux: state.skyIrradianceLux, bearing: state.bearing, surveyed: state.surveyed, filename: path.basename(filename) });
    }
    checks.push({ name: 'same-camera Denver morning, noon, evening and night are independently rendered and captured', passed: snapshots.length === 4 && snapshots.every((sample) => sample.sceneId === 'denver' && sample.pixels.length >= 12) && snapshots[1].sunIlluminanceLux > 1000 && snapshots[3].sunIlluminanceLux === 0, snapshots });
    const chroma = (pixels) => {
      const rgb = [0, 0, 0];
      for (let i = 0; i < Math.min(12, pixels.length); i += 4) for (let c = 0; c < 3; c++) rgb[c] += pixels[i + c];
      const total = rgb.reduce((sum, value) => sum + value, 0);
      return { total, color: rgb.map((value) => value / Math.max(1, total)) };
    };
    const noonSky = chroma(snapshots[1].pixels), eveningSky = chroma(snapshots[2].pixels);
    const chromaDifference = Math.hypot(...noonSky.color.map((value, index) => value - eveningSky.color[index]));
    checks.push({ name: 'visible noon versus twilight samples change color response as well as brightness', passed: noonSky.total > 3 && eveningSky.total > 3 && chromaDifference > .01, noonChroma: noonSky.color, eveningChroma: eveningSky.color, chromaDifference, note: 'Screen-sample appearance check; the independent shadow-transport fixture is the decisive non-brightness-only lighting check.' });
    checks.push(...await mainWindow.webContents.executeJavaScript(`(async () => {
      const checks=[], pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
      const natural=()=>window.__digitalWindowNatural();
      const gl=document.getElementById('natural-light-canvas').getContext('webgl2');
      const extension=gl.getExtension('WEBGL_lose_context');
      if(!extension)return [{name:'natural context loss exercise',passed:true,skipped:true,reason:'WEBGL_lose_context unavailable'}];
      extension.loseContext();
      for(let attempt=0;attempt<60&&!natural().contextLost;attempt++)await pause(100);
      const fallback=window.__digitalWindowSmoke();
      checks.push({name:'lost 3D context explicitly falls back to original photography',passed:fallback.renderMode==='photo'&&fallback.imageLoaded&&fallback.relighting.ready&&natural().contextLost&&!natural().active});
      extension.restoreContext();
      for(let attempt=0;attempt<80&&natural().contextLost;attempt++)await pause(100);
      const select=document.getElementById('render-mode');select.value='natural';select.dispatchEvent(new Event('change',{bubbles:true}));
      for(let attempt=0;attempt<80&&(!natural().active||natural().contextLost||!natural().pixels.length);attempt++)await pause(100);
      const recovered=natural();
      checks.push({name:'restored 3D context rebuilds the physical scene and sky environment',passed:recovered.active&&!recovered.contextLost&&recovered.ready&&recovered.environmentAvailable&&recovered.pixels.length>0});
      return checks;
    })()`, true));
    await mainWindow.webContents.executeJavaScript(`(() => { const toggle = document.getElementById('realtime-toggle'); toggle.checked = true; toggle.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    complete();
  } catch (error) { complete(error); }
}

async function naturalBrowserChecks() {
  const checks = [], check = (name, passed, details = {}) => checks.push({ name, passed: Boolean(passed), ...details });
  const byId = (id) => document.getElementById(id), natural = () => window.__digitalWindowNatural(), ui = () => window.__digitalWindowSmoke();
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
  const preview = async (minute) => { change('time-slider', minute); await pause(250); return natural(); };
  const vectorDistance = (a = [], b = []) => Math.hypot(...a.map((value, index) => value - b[index]));
  const vectorIsUnit = (vector) => Array.isArray(vector) && vector.length === 3 && vector.every(Number.isFinite) && Math.abs(Math.hypot(...vector) - 1) < 1e-6;
  byId('tab-preferences').click(); change('render-mode', 'natural');
  await wait(() => natural().active && natural().ready);
  const initial = natural();
  check('natural mode uses the real WebGL2 mesh renderer', initial.available && initial.active && initial.ready && initial.renderer === 'webgl2' && initial.meshCount > 0 && initial.drawCalls > 0 && initial.triangles > 0, { natural: initial });
  check('independent Sun and Moon directions are normalized world-space vectors', vectorIsUnit(initial.sunDirection) && vectorIsUnit(initial.moonDirection), { sunDirection: initial.sunDirection, moonDirection: initial.moonDirection });
  change('realtime-toggle', true);
  await pause(100);
  const beforeHandoff = Date.now();
  change('realtime-toggle', false);
  const handoff = natural().utcMillis;
  check('switching from realtime to preview retains seconds and milliseconds', Math.abs(handoff - beforeHandoff) < 1000, { beforeHandoff, previewUtcMillis: handoff, differenceMs: handoff - beforeHandoff });
  check('rendering is openly described as an unsurveyed 3D approximation', initial.surveyed === false);

  // This calls real shadow-map draws of a cube and receiver at identical
  // irradiance, exposure and color; it cannot pass by changing a global grade.
  if (typeof window.__digitalWindowVerifyTransport !== 'function') throw new Error('The physical shadow transport verifier is unavailable');
  const transport = await window.__digitalWindowVerifyTransport();
  check('constant-intensity illumination moves an actual occluder shadow across the receiver', transport.passed === true && transport.leftLight?.count > 100 && transport.rightLight?.count > 100 && transport.centroidShift > 35, { transport });

  for (const sceneId of ['manhattan', 'denver', 'medieval', 'kyoto', 'fuji', 'lake', 'coast', 'forest', 'procedural']) {
    byId('tab-landscapes').click();
    document.querySelector(`.landscape-card[data-scene="${sceneId}"]`).click();
    const ready = await wait(() => natural().sceneId === sceneId && natural().ready && natural().active && ui().sceneId === sceneId);
    const state = natural();
    check(`${sceneId} has actual 3D surfaces, shadow casters and receivers`, ready && state.meshCount > 0 && state.casterCount > 0 && state.receiverCount > 0 && state.triangles > 0, { sceneId: state.sceneId, meshes: state.meshCount, casters: state.casterCount, receivers: state.receiverCount, triangles: state.triangles });
  }

  byId('tab-landscapes').click(); document.querySelector('.landscape-card[data-scene="denver"]').click();
  await wait(() => natural().sceneId === 'denver' && natural().active && natural().ready);
  byId('tab-daylight').click(); change('scene-timezone-toggle', true);
  const beforePreview = await preview(720), afterPreview = await preview(720.01);
  check('fractional-minute preview evaluates real sub-second astronomical instants', Number(byId('time-slider').step) <= .01 && Math.abs(afterPreview.utcMillis - beforePreview.utcMillis - 600) < 2 && vectorDistance(beforePreview.sunDirection, afterPreview.sunDirection) > 1e-8, { beforeUtc: beforePreview.utcMillis, afterUtc: afterPreview.utcMillis, sliderStep: byId('time-slider').step });
  const frozen = natural(); await pause(450); const stillFrozen = natural();
  check('manual preview holds one actual instant instead of continuing a clock animation', stillFrozen.utcMillis === frozen.utcMillis && vectorDistance(stillFrozen.sunDirection, frozen.sunDirection) < 1e-12);
  change('view-azimuth', 80); await pause(250); const east = natural();
  change('view-azimuth', 260); await pause(250); const west = natural();
  check('changing camera bearing changes actual shadow projection without moving the physical Sun', Array.isArray(east.shadowMatrix) && east.shadowMatrix.length === 16 && east.shadowMatrix.some((value, index) => Math.abs(value - west.shadowMatrix[index]) > 1e-5) && vectorDistance(east.sunDirection, west.sunDirection) < 1e-8, { eastShadowMatrix: east.shadowMatrix, westShadowMatrix: west.shadowMatrix });
  change('view-azimuth', 120);

  const noon = await preview(720), midnight = await preview(0);
  check('real daytime solar energy exceeds lunar energy by several orders of magnitude', noon.sunIlluminanceLux > 1000 && midnight.moonIlluminanceLux >= 0 && midnight.moonIlluminanceLux < .5 && (midnight.moonIlluminanceLux === 0 || noon.sunIlluminanceLux / midnight.moonIlluminanceLux > 10000), { noonLux: noon.sunIlluminanceLux, moonLux: midnight.moonIlluminanceLux });
  check('midnight direct solar illumination is zero while the 3D scene remains active', midnight.sun?.altitude < -5 && midnight.sunIlluminanceLux === 0 && midnight.active && midnight.meshCount > 0, { altitude: midnight.sun?.altitude, lux: midnight.sunIlluminanceLux });
  if (Number.isFinite(midnight.emissiveEnergy)) check('nighttime city windows emit actual material radiance', midnight.emissiveCount > 0 && midnight.emissiveEnergy > 0 && midnight.cityLightsVisibility > .9, { emissiveCount: midnight.emissiveCount, emissiveEnergy: midnight.emissiveEnergy, cityLightsVisibility: midnight.cityLightsVisibility });

  byId('tab-preferences').click(); change('motion-toggle', false);
  byId('tab-daylight').click(); change('realtime-toggle', true);
  const beforeTick = natural(); await pause(1300); const afterTick = natural();
  check('turning off decorative motion never freezes per-frame natural illumination', afterTick.utcMillis - beforeTick.utcMillis > 700 && afterTick.frameCount > beforeTick.frameCount + 1 && vectorDistance(afterTick.sunDirection, beforeTick.sunDirection) > 1e-7, { beforeUtc: beforeTick.utcMillis, afterUtc: afterTick.utcMillis, beforeFrames: beforeTick.frameCount, afterFrames: afterTick.frameCount });

  byId('tab-preferences').click(); change('render-mode', 'photo');
  await wait(() => !natural().active && ui().imageLoaded);
  const photoLabel = byId('render-mode').selectedOptions?.[0]?.textContent || '';
  check('photographic mode is a separately labeled mode rather than pretending to be natural transport', !natural().active && byId('render-mode').value === 'photo' && ui().imageLoaded && /实拍|照片|摄影/.test(photoLabel), { label: photoLabel });
  change('render-mode', 'natural');
  const restored = await wait(() => natural().active && natural().ready && natural().sceneId === 'denver');
  check('returning from photography restores the actual natural-light scene', restored && natural().meshCount > 0 && natural().casterCount > 0 && natural().receiverCount > 0);
  return checks;
}

async function prepareNaturalCapture(minute) {
  const byId = (id) => document.getElementById(id), natural = () => window.__digitalWindowNatural();
  byId('tab-daylight').click();
  const slider = byId('time-slider'); slider.value = minute;
  slider.dispatchEvent(new Event('input', { bubbles: true })); slider.dispatchEvent(new Event('change', { bubbles: true }));
  byId('close-panel').click();
  document.activeElement?.blur();
  await new Promise((resolve) => setTimeout(resolve, 350));
  return { ...natural(), bearing: Number(byId('view-azimuth').value) };
}

module.exports = { runNaturalTests };
