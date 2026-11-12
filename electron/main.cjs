'use strict';

const { app, BrowserWindow, Menu, ipcMain, screen, powerSaveBlocker } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL, fileURLToPath } = require('node:url');

const rendererPath = path.join(__dirname, '..', 'src', 'index.html');
const rendererURL = pathToFileURL(rendererPath).href;
const windowed = process.argv.includes('--windowed');
const smokeTest = process.argv.includes('--smoke-test');
const lightingTest = process.argv.includes('--lighting-test');
const softwareTest = process.argv.includes('--software-test');
const naturalTest = process.argv.includes('--natural-test');
const lifecycleMode = process.argv.find((argument) => argument.startsWith('--lifecycle-test='))?.split('=')[1];
const lifecycleTest = ['escape', 'alt-f4', 'menu-quit', 'native-close', 'single-instance'].includes(lifecycleMode);
const testMode = smokeTest || lightingTest || softwareTest || naturalTest || lifecycleTest;
let mainWindow = null;
let normalBounds = null;
let displaySleepBlocker = null;
let smokeTimeout = null;
const rendererErrors = [];
let quitting = false;
let quitReason = null;

app.setName('Digital Window');
if (testMode && process.argv.includes('--disable-webgl')) app.commandLine.appendSwitch('disable-webgl');
if (process.platform === 'win32') app.setAppUserModelId('com.digitalwindow.desktop');
if (testMode) {
  // Isolate the test instance from a running user's settings and single-instance lock.
  const instanceToken = lifecycleMode === 'single-instance' ? process.argv.find((argument) => argument.startsWith('--lifecycle-profile='))?.slice('--lifecycle-profile='.length) : null;
  const profile = instanceToken && /^[a-z0-9-]{1,60}$/i.test(instanceToken) ? `DigitalWindow-InstanceTest-${instanceToken}` : `DigitalWindow-Test-${process.pid}`;
  app.setPath('userData', path.join(app.getPath('temp'), profile));
}

function lifecycleLog(event, details = {}) {
  if (lifecycleTest) console.log(`DIGITAL_WINDOW_LIFECYCLE ${JSON.stringify({ case: lifecycleMode, event, pid: process.pid, ...details })}`);
}

function requestQuit(reason) {
  if (quitting) return;
  quitting = true;
  quitReason = reason;
  lifecycleLog('quit-requested', { reason });
  // Explicitly quitting this ambient app must remain reliable even if a renderer
  // has stalled or installs a beforeunload listener. Settings are saved on change.
  const fallback = setTimeout(() => {
    lifecycleLog('quit-fallback', { reason });
    app.exit(0);
  }, 1200);
  fallback.unref();
  app.quit();
}

function reportError(error) {
  const message = `[Digital Window] ${error && error.stack ? error.stack : error}`;
  console.error(message);
  try {
    fs.appendFileSync(path.join(app.getPath('userData'), 'error.log'), `${new Date().toISOString()} ${message}\n`);
  } catch { /* stderr remains available if userData is not yet writable. */ }
}

function getWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) return { fullscreen: false, platform: process.platform };
  const bounds = mainWindow.getBounds();
  return {
    fullscreen: mainWindow.isFullScreen(),
    visible: mainWindow.isVisible(),
    minimized: mainWindow.isMinimized(),
    bounds,
    displayBounds: screen.getDisplayMatching(bounds).bounds,
    platform: process.platform,
  };
}

function publishWindowState() {
  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
    mainWindow.webContents.send('digital-window:state', getWindowState());
  }
}

function setFullscreen(enabled) {
  if (!mainWindow || mainWindow.isDestroyed()) return getWindowState();
  if (enabled === mainWindow.isFullScreen()) return getWindowState();
  if (enabled) {
    normalBounds = mainWindow.getBounds();
    // Native fullscreen uses the complete display, including the taskbar area.
    // Maximizing or sizing to display.workArea would leave the taskbar visible.
    mainWindow.setFullScreen(true);
  } else {
    mainWindow.setFullScreen(false);
  }
  return getWindowState();
}

function validateSender(event) {
  if (!mainWindow || mainWindow.isDestroyed() || event.sender.id !== mainWindow.webContents.id) return false;
  const frame = event.senderFrame;
  const trustedFrame = mainWindow.webContents.mainFrame;
  // WebFrameMain wrapper identity is not a stable frame identifier. Electron
  // documents processId + routingId as identifying the underlying frame.
  if (!frame || frame.detached || frame.processId !== trustedFrame.processId || frame.routingId !== trustedFrame.routingId) return false;
  try {
    const url = new URL(frame.url);
    if (url.protocol !== 'file:') return false;
    const normalize = (filename) => process.platform === 'win32' ? path.normalize(filename).toLowerCase() : path.normalize(filename);
    return normalize(fileURLToPath(url)) === normalize(rendererPath);
  } catch {
    return false;
  }
}

function registerIPC() {
  ipcMain.handle('digital-window:get-state', (event) => {
    if (!validateSender(event)) throw new Error('Unauthorized renderer');
    return getWindowState();
  });
  ipcMain.handle('digital-window:set-fullscreen', (event, enabled) => {
    if (!validateSender(event)) throw new Error('Unauthorized renderer');
    if (typeof enabled !== 'boolean') throw new TypeError('Fullscreen must be a boolean');
    return setFullscreen(enabled);
  });
  ipcMain.handle('digital-window:quit', (event) => {
    if (!validateSender(event)) throw new Error('Unauthorized renderer');
    lifecycleLog('menu-quit-accepted');
    setImmediate(() => requestQuit('menu-quit'));
    return { accepted: true };
  });
}

function updateSleepBlocker() {
  const keepAwake = mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible() && !mainWindow.isMinimized();
  if (keepAwake && displaySleepBlocker === null) {
    displaySleepBlocker = powerSaveBlocker.start('prevent-display-sleep');
  } else if (!keepAwake && displaySleepBlocker !== null) {
    powerSaveBlocker.stop(displaySleepBlocker);
    displaySleepBlocker = null;
  }
}

async function runLifecycleTest() {
  const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
  try {
    let ui;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      ui = await mainWindow.webContents.executeJavaScript(`typeof window.__digitalWindowSmoke === 'function' ? window.__digitalWindowSmoke() : null`);
      if (ui?.ready) break;
      await delay(100);
    }
    if (!ui?.ready) throw new Error('Renderer did not initialize for lifecycle test');
    if (rendererErrors.length) throw new Error('Renderer errors occurred before lifecycle action');
    mainWindow.focus();
    mainWindow.webContents.focus();
    lifecycleLog('ready', { state: getWindowState(), ui });
    const press = (keyCode, modifiers = []) => {
      mainWindow.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers });
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers });
    };
    if (lifecycleMode === 'single-instance') {
      lifecycleLog('single-instance-waiting');
    } else if (lifecycleMode === 'escape') {
      const settingsOpen = await mainWindow.webContents.executeJavaScript(`(() => {
        document.getElementById('menu-button').click();
        document.querySelector('#main-menu [data-panel="preferences"]').click();
        return !document.getElementById('settings-panel').hidden;
      })()`, true);
      if (!settingsOpen || !mainWindow.isFullScreen()) throw new Error('Escape precondition requires open settings in fullscreen');
      lifecycleLog('trigger', { action: 'escape', settingsOpen });
      press('Escape');
      for (let attempt = 0; attempt < 40; attempt += 1) {
        if (!mainWindow.isFullScreen()) break;
        await delay(100);
      }
      await delay(150);
      const state = getWindowState();
      const coversDisplay = Object.keys(state.displayBounds).every((key) => state.bounds[key] === state.displayBounds[key]);
      const passed = !state.fullscreen && !coversDisplay && rendererErrors.length === 0;
      lifecycleLog('result', { passed, state, rendererErrors });
      if (!passed) return app.exit(1);
      requestQuit('lifecycle-harness');
    } else if (lifecycleMode === 'alt-f4') {
      lifecycleLog('trigger', { action: 'alt-f4' });
      press('F4', ['alt']);
    } else if (lifecycleMode === 'native-close') {
      lifecycleLog('trigger', { action: 'native-close' });
      mainWindow.close();
    } else {
      lifecycleLog('trigger', { action: 'menu-quit' });
      await mainWindow.webContents.executeJavaScript(`(() => {
        document.getElementById('menu-button').click();
        const menu = document.getElementById('main-menu');
        if (menu.hidden) throw new Error('Quit menu failed to open');
        document.getElementById('quit-button').click();
      })()`, true).catch((error) => { if (!quitting) throw error; });
    }
  } catch (error) {
    lifecycleLog('result', { passed: false, error: error.message, rendererErrors });
    reportError(error);
    app.exit(1);
  }
}

async function runSmokeTest() {
  try {
    await usePhotographicTestMode();
    // Wait for local assets, the astronomy model and the first canvas frame.
    let ui = null;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      ui = await mainWindow.webContents.executeJavaScript(`typeof window.__digitalWindowSmoke === 'function' ? window.__digitalWindowSmoke() : null`);
      if (ui?.ready && ui.imageLoaded && ui.hasSolar && ui.canvasReady) break;
    }
    const state = getWindowState();
    const renderer = await mainWindow.webContents.executeJavaScript(`(async () => ({
      title: document.title,
      ready: document.readyState,
      bridge: typeof window.digitalWindow?.getWindowState === 'function',
      bridgeUsable: typeof (await window.digitalWindow.getWindowState()).fullscreen === 'boolean',
      isolated: typeof window.require === 'undefined',
      width: window.innerWidth,
      height: window.innerHeight,
      images: [...document.images].filter(image => image.complete && image.naturalWidth > 0).length,
      controls: ['scene-image', 'atmosphere', 'menu-button', 'quit-button', 'settings-panel'].every(id => !!document.getElementById(id))
    }))()`, true);
    const coverage = Object.keys(state.displayBounds).every((key) => state.bounds[key] === state.displayBounds[key]);
    const integration = renderer.controls && ui?.ready ? await runRendererIntegration() : [];
    const finalState = getWindowState();
    const passed = renderer.ready === 'complete' && renderer.bridge && renderer.bridgeUsable && renderer.isolated && renderer.controls &&
      ui?.ready && ui.imageLoaded && ui.hasSolar && ui.canvasReady && ui.sceneCount >= 8 &&
      integration.length >= 40 && integration.every((result) => result.passed) &&
      rendererErrors.length === 0 && (windowed || (state.fullscreen && coverage));
    console.log(`DIGITAL_WINDOW_SMOKE ${JSON.stringify({ passed: Boolean(passed), state, finalState, renderer, ui, coverage, integration, rendererErrors })}`);
    clearTimeout(smokeTimeout);
    app.exit(passed ? 0 : 1);
  } catch (error) {
    reportError(error);
    app.exit(1);
  }
}

const testDelay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function usePhotographicTestMode() {
  await waitRendererReady();
  await mainWindow.webContents.executeJavaScript(`(() => { const select=document.getElementById('render-mode'); select.value='photo'; select.dispatchEvent(new Event('change',{bubbles:true})); })()`, true);
  await testDelay(200);
}

async function waitRendererReady(expectedScene) {
  let ui = null;
  for (let attempt = 0; attempt < 150; attempt += 1) {
    ui = await mainWindow.webContents.executeJavaScript(`typeof window.__digitalWindowSmoke === 'function' ? window.__digitalWindowSmoke() : null`);
    if (ui?.ready && ui.imageLoaded && ui.canvasReady && (!expectedScene || ui.sceneId === expectedScene)) return ui;
    await testDelay(100);
  }
  throw new Error(`Renderer did not become ready${expectedScene ? ` for ${expectedScene}` : ''}: ${JSON.stringify(ui)}`);
}

async function reloadForTest(expectedScene) {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Test renderer reload timed out')), 12000);
    mainWindow.webContents.once('did-finish-load', () => { clearTimeout(timer); resolve(); });
    mainWindow.webContents.reload();
  });
  return waitRendererReady(expectedScene);
}

function finishInstrumentedTest(marker, checks, error) {
  const passed = !error && checks.length > 0 && checks.every((check) => check.passed) && rendererErrors.length === 0;
  console.log(`${marker} ${JSON.stringify({ passed, checks, rendererErrors, state: getWindowState(), ...(error ? { error: error.stack || error.message } : {}) })}`);
  app.exit(passed ? 0 : 1);
}

async function runLightingTest() {
  const checks = [];
  try {
    await usePhotographicTestMode();
    await waitRendererReady();
    checks.push(...await mainWindow.webContents.executeJavaScript(`(${lightingBrowserFlows.toString()})()`, true));
    checks.push(...await verifyPhotographicQuality());
    if (process.argv.includes('--disable-webgl')) {
      const renderer = await mainWindow.webContents.executeJavaScript(`window.__digitalWindowSmoke().relighting?.renderer`);
      checks.push({ name: 'forced WebGL-disabled launch uses the Canvas fallback', passed: renderer === 'canvas', renderer });
    }
    setFullscreen(false); await testDelay(300);
    const display = screen.getDisplayMatching(mainWindow.getBounds()).bounds;
    mainWindow.setSize(Math.min(900, display.width - 100), Math.min(600, display.height - 100));
    await testDelay(550);
    const resized = await mainWindow.webContents.executeJavaScript(`({ relighting: window.__digitalWindowSmoke().relighting, width: innerWidth, height: innerHeight })`);
    checks.push({ name: 'native window resize updates light-canvas aspect ratio', passed: resized.relighting.ready && Math.abs(resized.relighting.width / resized.relighting.height - resized.width / resized.height) < 0.006, relighting: resized.relighting });
    setFullscreen(true); await testDelay(400);
    const restored = getWindowState();
    checks.push({ name: 'lighting tests restore complete native fullscreen coverage', passed: restored.fullscreen && Object.keys(restored.displayBounds).every((key) => restored.bounds[key] === restored.displayBounds[key]) });
    finishInstrumentedTest('DIGITAL_WINDOW_LIGHTING', checks);
  } catch (error) { finishInstrumentedTest('DIGITAL_WINDOW_LIGHTING', checks, error); }
}

async function verifyPhotographicQuality() {
  const checks = [];
  // Exercise a real high-DPI Chromium framebuffer, not only a size helper.
  const emulate4K = () => mainWindow.webContents.enableDeviceEmulation({ screenPosition: 'desktop', screenSize: { width: 1920, height: 1080 }, viewPosition: { x: 0, y: 0 }, viewSize: { width: 1920, height: 1080 }, deviceScaleFactor: 2, scale: 1 });
  emulate4K();
  await testDelay(400);
  try {
    for (const sceneId of ['denver', 'manhattan', 'medieval', 'kyoto', 'fuji', 'lake', 'coast', 'forest']) {
      const details = await mainWindow.webContents.executeJavaScript(`(${inspectPhotographicScene.toString()})(${JSON.stringify(sceneId)})`, true);
      checks.push({ name: `${sceneId} preserves real photo detail at 4K without legacy proxy shadows or duplicate filters`, passed: details.ready && details.photoReal && details.sourceWidth >= 3840 && details.outputWidth === 3840 && details.outputHeight === 2160 && Math.abs(details.dpr - 2) < .001 && details.layers === 0 && details.filter === 'none' && details.animation === 'none' && details.geometryVersion === 'photographic-preserved-1.0' && details.noAtmosphereOverlay, ...details });
      if (sceneId === 'denver') checks.push({ name: 'Denver displays an office-window foreground and follows Mountain Time', passed: details.officeForeground && details.timeZone === 'America/Denver', officeForeground: details.officeForeground, timeZone: details.timeZone });
      if (!process.argv.includes('--disable-webgl')) {
        const output = path.resolve(process.cwd(), '.test-results', `${app.isPackaged ? 'packaged' : 'source'}-quality-${sceneId}.png`);
        fs.mkdirSync(path.dirname(output), { recursive: true });
        // Pixel dimensions above are verified on the actual 4K framebuffer.
        // Separately capture the complete native UI, including the foreground,
        // at this monitor's own dimensions for visual inspection.
        mainWindow.webContents.disableDeviceEmulation();
        await testDelay(250);
        fs.writeFileSync(output, (await mainWindow.webContents.capturePage()).toPNG());
        emulate4K();
        await testDelay(250);
      }
    }
  } finally {
    mainWindow.webContents.disableDeviceEmulation();
    await testDelay(300);
  }
  return checks;
}

async function inspectPhotographicScene(sceneId) {
  const byId = (id) => document.getElementById(id), ui = () => window.__digitalWindowSmoke();
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  byId('tab-landscapes').click();
  document.querySelector(`.landscape-card[data-scene="${sceneId}"]`).click();
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline && (ui().sceneId !== sceneId || !ui().imageLoaded || ui().transitioning)) await delay(80);
  byId('tab-daylight').click();
  byId('scene-timezone-toggle').checked = true; byId('scene-timezone-toggle').dispatchEvent(new Event('change', { bubbles: true }));
  byId('time-slider').value = 720; byId('time-slider').dispatchEvent(new Event('input', { bubbles: true }));
  byId('close-panel').click();
  await delay(350);
  const state = ui(), deck = document.querySelector(`.scene-deck[data-scene="${sceneId}"].is-visible`), photo = deck?.querySelector('.scene-photo');
  return { ready: state.ready && state.sceneId === sceneId, photoReal: state.photoReal, sourceWidth: state.relighting.sourceWidth, sourceHeight: state.relighting.sourceHeight, outputWidth: state.relighting.width, outputHeight: state.relighting.height, dpr: devicePixelRatio, renderer: state.relighting.renderer, layers: state.layerImages.length, filter: photo && getComputedStyle(photo).filter, animation: photo && getComputedStyle(photo).animationName, geometryVersion: state.relighting.geometryVersion, noAtmosphereOverlay: state.atmosphere.photoReal && !state.atmosphere.sunDrawn && !state.atmosphere.moonDrawn && state.atmosphere.glintSources.length === 0, officeForeground: Boolean(deck?.querySelector('.office-interior .office-sill') && deck?.querySelector('.office-interior .office-mullion')), timeZone: state.timeZone };
}

async function lightingBrowserFlows() {
  const checks = [], check = (name, passed, details = {}) => checks.push({ name, passed: Boolean(passed), ...details });
  const byId = (id) => document.getElementById(id), ui = () => window.__digitalWindowSmoke();
  const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
  const waitFor = async (predicate, timeout = 5000) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) { if (predicate()) return true; await delay(80); }
    return predicate();
  };
  const change = (id, value) => {
    const element = byId(id); if (element.type === 'checkbox') element.checked = value; else element.value = value;
    element.dispatchEvent(new Event('input', { bubbles: true })); element.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const preview = async (minute) => { change('time-slider', minute); await delay(1150); return ui(); };
  const unitVector = (vector) => {
    const values = Array.isArray(vector) ? vector : vector && [vector.x, vector.y, vector.z];
    return values?.length === 3 && values.every(Number.isFinite) && Math.abs(Math.hypot(...values) - 1) < 0.005;
  };
  const angleDifference = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
  await waitFor(() => ui().relighting?.ready && ui().lighting && ui().imageLoaded, 12000);
  const initial = ui();
  check('photographic relighting initializes a real rendering path', initial.relighting?.ready && ['webgl', 'canvas'].includes(initial.relighting.renderer) && initial.relighting.width > 0 && initial.relighting.height > 0, { relighting: initial.relighting });
  check('solar ephemeris and normalized light direction are finite', Number.isFinite(initial.lighting?.sun?.altitude) && Number.isFinite(initial.lighting?.sun?.azimuth) && unitVector(initial.lighting?.sun?.direction), { sun: initial.lighting?.sun });
  check('lunar ephemeris and illuminated fraction are finite', Number.isFinite(initial.lighting?.moon?.altitude) && Number.isFinite(initial.lighting?.moon?.azimuth) && initial.lighting?.moon?.illumination >= 0 && initial.lighting?.moon?.illumination <= 1 && unitVector(initial.lighting?.moon?.direction), { moon: initial.lighting?.moon });

  byId('menu-button').click(); document.querySelector('#main-menu [data-panel="daylight"]').click();
  const morning = await preview(480), afternoon = await preview(960);
  check('manual morning to afternoon changes the actual Sun direction', angleDifference(morning.lighting.sun.azimuth, afternoon.lighting.sun.azimuth) > 15, { morning: morning.lighting.sun, afternoon: afternoon.lighting.sun });
  const midnight = await preview(0);
  check('Sun below the horizon contributes no direct light', midnight.lighting.sun.altitude < 0 && midnight.lighting.sun.visible === false && midnight.lighting.sun.strength <= 0.00001, { sun: midnight.lighting.sun });
  const noon = await preview(720);
  check('local noon produces direct daylight even outside the camera view', noon.lighting.sun.altitude > 0 && noon.lighting.sun.strength > 0, { sun: noon.lighting.sun });
  const shadow = noon.lighting.shadow, solarDirection = noon.lighting.sun.direction;
  check('ground shadows point away from the direct Sun', shadow?.source === 'sun' && shadow.length > 0 && shadow.direction[0] * solarDirection[0] - shadow.direction[1] * solarDirection[2] < -0.1, { shadow });

  change('view-azimuth', 90); await delay(650); const eastView = ui();
  change('view-azimuth', 270); await delay(650); const westView = ui();
  check('camera bearing changes projected sunlight', JSON.stringify(eastView.lighting.sun.direction) !== JSON.stringify(westView.lighting.sun.direction) || Math.abs(eastView.lighting.sun.screenX - westView.lighting.sun.screenX) > 0.05, { east: eastView.lighting.sun, west: westView.lighting.sun });
  check('original-photo mode preserves photographic pixels instead of pretending to recast shadows', eastView.relighting.pixelHash === westView.relighting.pixelHash && eastView.relighting.pixels?.length > 0, { eastHash: eastView.relighting.pixelHash, westHash: westView.relighting.pixelHash });

  const celestialModule = await import(new URL('./celestial.js', location.href).href);
  const lightingModule = await import(new URL('./lighting.js', location.href).href);
  const place = { latitude: 40.7484, longitude: -73.9857, timeZone: 'America/New_York' };
  // Independent primary references: NASA UTC phase table / US Naval Observatory.
  // https://eclipse.gsfc.nasa.gov/phase/phase2001gmt.html
  // https://aa.usno.navy.mil/calculated/moon/phases?date=2024-4-08&format=p&nump=5&submit=Get+Data
  const full = celestialModule.getCelestialState(new Date('2024-03-25T07:00:00Z'), place);
  const fresh = celestialModule.getCelestialState(new Date('2024-04-08T18:21:00Z'), place);
  check('known NASA full Moon is nearly fully illuminated', full.moon.illumination > 0.97, { illumination: full.moon.illumination });
  check('known USNO new Moon is nearly unilluminated', fresh.moon.illumination < 0.03, { illumination: fresh.moon.illumination });
  let belowMoon;
  for (let hour = 0; hour < 24; hour += 1) {
    const celestial = celestialModule.getCelestialState(new Date(Date.UTC(2024, 2, 25, hour)), place);
    if (celestial.moon.altitude < -5) { belowMoon = lightingModule.getLightingState(celestial, { viewAzimuth: 90 }); break; }
  }
  check('Moon below the horizon contributes no moonlight', belowMoon?.moon?.visible === false && belowMoon.moon.strength <= 0.00001, { moon: belowMoon?.moon });
  const moonA = celestialModule.getCelestialState(new Date('2024-03-25T00:00:00Z'), place).moon;
  const moonB = celestialModule.getCelestialState(new Date('2024-03-25T06:00:00Z'), place).moon;
  check('lunar direction evolves during the night', angleDifference(moonA.azimuth, moonB.azimuth) > 15 && Math.abs(moonA.altitude - moonB.altitude) > 5, { start: moonA, end: moonB });

  byId('tab-preferences').click(); change('motion-toggle', false);
  byId('tab-daylight').click(); change('realtime-toggle', true);
  const beforeTick = ui(); await delay(2300); const afterTick = ui();
  check('realtime astronomy keeps ticking with landscape motion off', !byId('motion-toggle').checked && afterTick.lighting.utcMillis - beforeTick.lighting.utcMillis >= 1200 && angleDifference(afterTick.lighting.sun.azimuth, beforeTick.lighting.sun.azimuth) > 0.000001, { beforeUtc: beforeTick.lighting.utcMillis, afterUtc: afterTick.lighting.utcMillis });
  check('light renderer repaints with landscape motion off', afterTick.relighting.frameCount > beforeTick.relighting.frameCount && afterTick.relighting.utcMillis > beforeTick.relighting.utcMillis, { before: beforeTick.relighting.frameCount, after: afterTick.relighting.frameCount, renderer: afterTick.relighting.renderer });
  const frozen = await preview(720); await delay(1350); const stillFrozen = ui();
  check('manual preview remains at the selected instant', frozen.lighting.utcMillis === stillFrozen.lighting.utcMillis && !byId('realtime-toggle').checked);

  if (ui().relighting.renderer === 'webgl') {
    const canvas = byId('relighting-canvas');
    const context = canvas.getContext('webgl') || canvas.getContext('webgl2');
    const extension = context?.getExtension('WEBGL_lose_context');
    if (extension) {
      extension.loseContext();
      await waitFor(() => ui().relighting.contextLost || ui().relighting.renderer === 'canvas', 4000);
      const lost = ui().relighting;
      check('WebGL context loss retains a working light renderer', lost.ready && lost.contextLost && lost.renderer === 'canvas' && lost.pixels?.length > 0, { relighting: lost });
      extension.restoreContext();
      await waitFor(() => ui().relighting.ready && !ui().relighting.contextLost, 6000);
      const recovered = ui().relighting;
      check('light rendering recovers after context restoration', recovered.ready && !recovered.contextLost && recovered.renderer === 'webgl' && recovered.drawCount > lost.drawCount && recovered.pixels?.length > 0, { relighting: recovered });
    } else check('WebGL context-loss exercise', true, { skipped: true, reason: 'WEBGL_lose_context extension is unavailable' });
  } else check('WebGL context-loss exercise', true, { skipped: true, reason: 'This launch is exercising the Canvas renderer' });
  return checks;
}

async function runSoftwareTest() {
  const checks = [];
  try {
    await usePhotographicTestMode();
    await waitRendererReady();
    const browserChecks = await mainWindow.webContents.executeJavaScript(`(${softwareBrowserFlows.toString()})()`, true);
    checks.push(...browserChecks);
    if (checks.some((check) => ['local video imports and decodes', 'recorded WebM fixture independently decodes in Chromium'].includes(check.name) && !check.passed)) return finishInstrumentedTest('DIGITAL_WINDOW_SOFTWARE', checks);
    await reloadForTest('custom');
    checks.push(...await mainWindow.webContents.executeJavaScript(`(async () => {
      const checks = [], ui = window.__digitalWindowSmoke();
      const stored = JSON.parse(localStorage.getItem('digital-window.settings.v2') || '{}');
      checks.push({ name: 'video and full preferences survive reload', passed: ui.sceneId === 'custom' && ui.imageLoaded && ui.timeZone === 'Europe/London' && ui.locationSource === 'override' && stored.realtime === false && stored.previewMinute === 540 && stored.brightness === 80 && stored.frame === true });
      document.getElementById('menu-button').click(); document.querySelector('#main-menu [data-panel="preferences"]').click();
      const motion = document.getElementById('motion-toggle'); motion.checked = true; motion.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 700));
      const video = document.getElementById('scene-video');
      checks.push({ name: 'persisted video decodes and plays after reload', passed: !!video && video.readyState >= 2 && !video.paused });
      return checks;
    })()`, true));
    mainWindow.minimize();
    let pauseState;
    for (let attempt = 0; attempt < 30; attempt++) {
      await testDelay(100);
      pauseState = await mainWindow.webContents.executeJavaScript(`({ hidden: document.hidden, paused: document.getElementById('scene-video').paused })`);
      if (mainWindow.isMinimized() && pauseState.paused) break;
    }
    checks.push({ name: 'minimizing pauses video', passed: mainWindow.isMinimized() && pauseState.paused, ...pauseState, minimized: mainWindow.isMinimized() });
    mainWindow.restore(); mainWindow.show(); mainWindow.focus();
    let resumeState;
    for (let attempt = 0; attempt < 30; attempt++) {
      await testDelay(100);
      resumeState = await mainWindow.webContents.executeJavaScript(`({ hidden: document.hidden, paused: document.getElementById('scene-video').paused })`);
      if (!resumeState.hidden && !resumeState.paused) break;
    }
    checks.push({ name: 'restoring resumes enabled video', passed: !resumeState.hidden && !resumeState.paused, ...resumeState });
    await mainWindow.webContents.executeJavaScript(`localStorage.setItem('digital-window.settings.v2', '{broken-json')`);
    const recoveredSettings = await reloadForTest('manhattan');
    checks.push({ name: 'corrupt saved preferences recover to a working default scene', passed: recoveredSettings.imageLoaded && recoveredSettings.timeZone === 'America/New_York' });
    await mainWindow.webContents.executeJavaScript(`(async () => {
      localStorage.removeItem('digital-window.settings.v2'); localStorage.removeItem('digital-window.settings.v1');
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Media database did not close within 6 seconds')), 6000);
        const request = indexedDB.deleteDatabase('digital-window-media');
        request.onsuccess = () => { clearTimeout(timer); resolve(); };
        request.onerror = () => { clearTimeout(timer); reject(request.error); };
        // onblocked can be transient while startup's optional read transaction
        // completes. The application closes that connection on completion.
      });
    })()`, true);
    const defaults = await reloadForTest('manhattan');
    checks.push({ name: 'software tests restore first-launch defaults', passed: defaults.timeZone === 'America/New_York' && defaults.visibleMainButtons?.length === 1 && defaults.visibleMainButtons[0] === 'menu-button' });
    finishInstrumentedTest('DIGITAL_WINDOW_SOFTWARE', checks);
  } catch (error) { finishInstrumentedTest('DIGITAL_WINDOW_SOFTWARE', checks, error); }
}

async function softwareBrowserFlows() {
  const byId = (id) => document.getElementById(id), ui = () => window.__digitalWindowSmoke();
  const checks = [], check = (name, passed, details = {}) => checks.push({ name, passed: Boolean(passed), ...details });
  const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
  const waitFor = async (predicate, timeout = 8000) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) { if (predicate()) return true; await delay(80); }
    return predicate();
  };
  const change = (id, value) => {
    const element = byId(id); if (element.type === 'checkbox') element.checked = value; else element.value = value;
    element.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const importFile = (file) => {
    const transfer = new DataTransfer(); transfer.items.add(file); byId('media-input').files = transfer.files;
    byId('media-input').dispatchEvent(new Event('change', { bubbles: true }));
  };
  const sceneSettled = (sceneId) => {
    const deck = [...byId('scene-base').querySelectorAll(':scope > .scene-deck')].at(-1);
    return ui().sceneId === sceneId && ui().imageLoaded && deck?.dataset.scene === sceneId && Number(getComputedStyle(deck).opacity) > 0.99;
  };
  byId('menu-button').click(); document.querySelector('#main-menu [data-panel="landscapes"]').click();
  for (const sceneId of ['manhattan', 'denver', 'medieval', 'kyoto', 'fuji', 'lake', 'coast', 'forest', 'procedural']) {
    document.querySelector('.landscape-card[data-scene="' + sceneId + '"]').click();
    const loaded = await waitFor(() => sceneSettled(sceneId), 12000);
    check('all-scenes: ' + sceneId + ' loads', loaded && ui().canvasReady && ui().hasSolar, { sceneId: ui().sceneId });
  }
  for (const sceneId of ['lake', 'manhattan', 'forest', 'fuji', 'kyoto']) document.querySelector('.landscape-card[data-scene="' + sceneId + '"]').click();
  await waitFor(() => sceneSettled('kyoto'), 12000); await delay(300);
  check('rapid scene switches keep the final request', ui().sceneId === 'kyoto' && document.querySelectorAll('#scene-image').length === 1 && document.querySelectorAll('#scene-layers').length === 0 && document.querySelectorAll('.scene-deck').length === 1);

  const { SceneView } = await import(new URL('./scene-view.js', location.href).href);
  const host = document.createElement('div'); host.style.cssText = 'position:fixed;left:-20000px;width:128px;height:80px'; document.body.append(host);
  const isolated = new SceneView(host);
  await isolated.show({ id: 'test-valid', image: '../assets/landscapes/photos/forest.jpg', kind: '静态' });
  const retained = isolated.current;
  let rejected = false;
  try { await isolated.show({ id: 'test-corrupt', image: 'data:image/png;base64,YmFk', kind: '静态' }); } catch { rejected = true; }
  check('failed scene decode retains the previous visible scene', rejected && isolated.current === retained && retained.isConnected && isolated.ready && !isolated.transitioning);
  host.remove();

  byId('tab-daylight').click();
  const originalZone = ui().timeZone;
  byId('custom-zone').value = 'Missing/Invalid'; byId('custom-lat').value = '51.5'; byId('custom-lon').value = '0';
  byId('custom-location-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  check('invalid custom time zone preserves the active location', ui().timeZone === originalZone && byId('location-error').textContent.length > 0);
  byId('custom-zone').value = 'Europe/London'; byId('custom-lat').value = '91';
  byId('custom-location-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  check('invalid custom coordinates preserve the active location', ui().timeZone === originalZone && byId('location-error').textContent.length > 0);
  byId('custom-zone').value = 'Europe/London'; byId('custom-lat').value = '51.5074'; byId('custom-lon').value = '-0.1278';
  byId('custom-location-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  check('valid custom location applies', ui().timeZone === 'Europe/London' && ui().locationSource === 'override' && !byId('location-error').textContent);
  const beforeCorrupt = ui().sceneId;
  importFile(new File([new Uint8Array([0, 1, 2, 3, 4])], 'corrupt.png', { type: 'image/png' }));
  await waitFor(() => byId('toast').textContent.includes('导入') && !byId('toast').hidden, 3000);
  check('corrupt image import preserves the current scene', ui().sceneId === beforeCorrupt && ui().imageLoaded && !byId('toast').hidden);
  importFile(new File(['unsupported'], 'unsupported.txt', { type: 'text/plain' })); await delay(50);
  check('unsupported media is rejected without replacing scenery', ui().sceneId === beforeCorrupt && byId('toast').textContent.includes('支持'));

  byId('tab-preferences').click(); change('motion-toggle', true);
  const canvas = document.createElement('canvas'); canvas.width = 160; canvas.height = 90;
  canvas.style.cssText = 'position:fixed;left:0;top:0;width:160px;height:90px;opacity:.001;pointer-events:none;z-index:9999';
  document.body.append(canvas);
  const context = canvas.getContext('2d'); let frame = 0;
  const draw = () => { context.fillStyle = frame++ % 2 ? '#234f70' : '#92bba9'; context.fillRect(0, 0, 160, 90); context.fillStyle = '#f6e7c5'; context.fillRect((frame * 6) % 150, 30, 10, 10); };
  draw();
  const supported = typeof MediaRecorder === 'function' && MediaRecorder.isTypeSupported('video/webm;codecs=vp8');
  check('browser supports an actual WebM import fixture', supported);
  if (!supported) return checks;
  const stream = canvas.captureStream(0), track = stream.getVideoTracks()[0], chunks = [], recordingErrors = [], recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' });
  const recorded = new Promise((resolve) => { recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); }; recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' })); });
  const recorderStarted = new Promise((resolve) => { recorder.onstart = resolve; recorder.onerror = (event) => { recordingErrors.push(String(event.error?.message || event.error)); resolve(); }; });
  recorder.start(100); await Promise.race([recorderStarted, delay(2000)]);
  const recordingStart = performance.now();
  do { draw(); track.requestFrame?.(); await delay(80); } while ((chunks.length === 0 || performance.now() - recordingStart < 900) && performance.now() - recordingStart < 2500);
  if (recorder.state !== 'inactive') recorder.stop();
  const blob = await recorded;
  const capture = { trackState: track.readyState, muted: track.muted, settings: track.getSettings(), errors: recordingErrors, documentHidden: document.hidden };
  stream.getTracks().forEach((item) => item.stop()); canvas.remove();
  const fixtureURL = URL.createObjectURL(blob), probe = document.createElement('video');
  probe.muted = true; probe.preload = 'auto';
  const fixtureEvents = [];
  const fixture = await new Promise((resolve) => {
    const finish = (event) => resolve({ event, bytes: blob.size, mime: blob.type, chunks: chunks.length, capture, readyState: probe.readyState, width: probe.videoWidth, height: probe.videoHeight, duration: Number.isFinite(probe.duration) ? probe.duration : String(probe.duration), events: fixtureEvents, error: probe.error?.code });
    const timer = setTimeout(() => finish('timeout'), 5000);
    probe.onloadedmetadata = () => fixtureEvents.push('loadedmetadata');
    probe.onloadeddata = () => { clearTimeout(timer); finish('loadeddata'); }; probe.onerror = () => { clearTimeout(timer); finish('error'); };
    probe.src = fixtureURL; probe.load();
  });
  probe.removeAttribute('src'); probe.load(); URL.revokeObjectURL(fixtureURL);
  check('recorded WebM fixture independently decodes in Chromium', fixture.event === 'loadeddata' && fixture.width === 160 && fixture.height === 90, { fixture });
  if (fixture.event !== 'loadeddata' || blob.size === 0) return checks;
  importFile(new File([blob], 'software-test-video.webm', { type: 'video/webm' }));
  const loadedVideo = await waitFor(() => ui().sceneId === 'custom' && ui().imageLoaded && !!byId('scene-video'), 15000);
  await delay(250);
  const video = byId('scene-video');
  const storedMedia = await new Promise((resolve) => {
    const request = indexedDB.open('digital-window-media', 1);
    request.onerror = () => resolve({ error: String(request.error) });
    request.onsuccess = () => { const db = request.result, transaction = db.transaction('media', 'readonly'), get = transaction.objectStore('media').get('custom'); get.onsuccess = () => resolve(get.result ? { name: get.result.name, mime: get.result.type, bytes: get.result.size } : null); get.onerror = () => resolve({ error: String(get.error) }); transaction.oncomplete = () => db.close(); };
  });
  check('local video imports and decodes', loadedVideo && video.readyState >= 2 && video.muted && video.loop, { fixture, storedMedia, toast: byId('toast').textContent, sceneId: ui().sceneId, mediaCards: document.querySelectorAll('.landscape-card').length });
  if (!loadedVideo) return checks;
  check('enabled video actually starts playback', !!video && !video.paused);
  change('motion-toggle', false); await delay(100);
  check('motion off pauses imported video', !!video && video.paused);
  change('motion-toggle', true); await delay(200);
  check('motion on resumes imported video', !!video && !video.paused);
  byId('tab-daylight').click(); change('city-select', 'london'); change('realtime-toggle', false);
  byId('time-slider').value = 540; byId('time-slider').dispatchEvent(new Event('input', { bubbles: true })); byId('time-slider').dispatchEvent(new Event('change', { bubbles: true }));
  byId('tab-preferences').click(); change('frame-toggle', true);
  byId('brightness-slider').value = 80; byId('brightness-slider').dispatchEvent(new Event('input', { bubbles: true })); byId('brightness-slider').dispatchEvent(new Event('change', { bubbles: true }));
  const stored = JSON.parse(localStorage.getItem('digital-window.settings.v2') || '{}');
  check('video and preference configuration persist before reload', stored.scene === 'custom' && stored.city === 'london' && stored.sceneTimezone === false && stored.previewMinute === 540 && stored.frame === true && stored.brightness === 80);
  return checks;
}

async function runRendererIntegration() {
  // These actions run only in --smoke-test, through the same handlers as the UI.
  const results = await mainWindow.webContents.executeJavaScript(`(async () => {
    const byId = (id) => document.getElementById(id);
    const results = [];
    const check = (name, passed, detail = {}) => results.push({ name, passed: Boolean(passed), ...detail });
    const diagnostic = () => window.__digitalWindowSmoke();
    const waitFor = async (condition, timeout = 6000) => {
      const deadline = Date.now() + timeout;
      while (Date.now() < deadline) {
        if (condition()) return true;
        await new Promise(resolve => setTimeout(resolve, 80));
      }
      return condition();
    };
    const change = (id, value) => {
      const element = byId(id);
      if (element.type === 'checkbox') element.checked = value; else element.value = value;
      element.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const preview = (minute) => {
      const slider = byId('time-slider'); slider.value = minute;
      slider.dispatchEvent(new Event('input', { bubbles: true }));
      slider.dispatchEvent(new Event('change', { bubbles: true }));
      return diagnostic();
    };
    const initialButtons = diagnostic().visibleMainButtons;
    check('scenery shows only the three-dot control', Array.isArray(initialButtons) && initialButtons.length === 1 && initialButtons[0] === 'menu-button' && !byId('window-view').querySelector('time'), { visibleMainButtons: initialButtons });
    byId('menu-button').click();
    check('three-dot menu opens', !byId('main-menu').hidden && byId('menu-button').getAttribute('aria-expanded') === 'true');
    document.querySelector('#main-menu [data-panel="landscapes"]').click();
    check('settings opens while dots remain available', !byId('settings-panel').hidden && !byId('panel-landscapes').hidden && !byId('window-view').inert && byId('menu-button').getClientRects().length > 0);
    const phases = ['dawn', 'morning', 'noon', 'evening', 'night'];
    const sceneZones = { manhattan: 'America/New_York', denver: 'America/Denver', medieval: 'Europe/Prague', kyoto: 'Asia/Tokyo', fuji: 'Asia/Tokyo' };
    for (const [sceneId, zone] of Object.entries(sceneZones)) {
      byId('tab-landscapes').click();
      document.querySelector('.landscape-card[data-scene="' + sceneId + '"]').click();
      await waitFor(() => {
        const deck = byId('scene-image')?.closest('.scene-deck');
        return diagnostic().sceneId === sceneId && diagnostic().imageLoaded && deck?.dataset.scene === sceneId && Number(getComputedStyle(deck).opacity) > 0.99;
      }, 10000);
      const scene = diagnostic();
      check(sceneId + ' follows its own time zone', scene.sceneId === sceneId && scene.timeZone === zone && byId('scene-timezone-toggle').checked, { timeZone: scene.timeZone });
      check(sceneId + ' decodes its full-resolution real photograph', scene.photoReal && scene.imageLoaded && scene.layerImages?.length === 0 && scene.relighting?.sourceWidth >= 3840, { sourceWidth: scene.relighting?.sourceWidth, sourceHeight: scene.relighting?.sourceHeight });
      byId('tab-daylight').click();
      for (const phase of phases) {
        document.querySelector('#phase-presets [data-preview-phase="' + phase + '"]').click();
        await waitFor(() => !diagnostic().transitioning, 3000);
        // SceneView completes its normalized-weight interpolation before clearing
        // this flag; derived phase alphas have no independent CSS transition.
        await new Promise(resolve => setTimeout(resolve, 80));
        const current = diagnostic();
        const weight = Number(current.weights?.[phase] || 0);
        check(sceneId + ' ' + phase + ' preset updates astronomy while retaining the original photograph', !byId('realtime-toggle').checked && weight > 0.8 && current.imageLoaded && current.relighting.ready && current.relighting.utcMillis === current.lighting.utcMillis && current.relighting.pixelHash === scene.relighting.pixelHash, { weight, phase: current.phase, pixelHash: current.relighting.pixelHash });
      }
      change('realtime-toggle', true);
      check(sceneId + ' returns to live solar lighting', byId('realtime-toggle').checked && diagnostic().timeZone === zone);
    }
    change('city-select', 'london');
    check('London overrides the scene time zone', diagnostic().timeZone === 'Europe/London' && byId('city-select').value === 'london' && !byId('scene-timezone-toggle').checked, { timeZone: diagnostic().timeZone });
    change('realtime-toggle', false);
    const noon = preview(720), midnight = preview(0);
    check('manual slider evaluates noon and midnight astronomy independently of the original photograph', Number(noon.weights?.noon) > Number(noon.weights?.night) && Number(midnight.weights?.night) > Number(midnight.weights?.noon), { noon: noon.weights, midnight: midnight.weights });
    change('realtime-toggle', true);
    check('realtime preference restores and saves', byId('realtime-toggle').checked && JSON.parse(localStorage.getItem('digital-window.settings.v2') || '{}').realtime === true);
    change('scene-timezone-toggle', true);
    check('scene time zone can be restored', diagnostic().timeZone === 'Asia/Tokyo' && byId('scene-timezone-toggle').checked);
    byId('tab-landscapes').click(); document.querySelector('.landscape-card[data-scene="procedural"]').click();
    await waitFor(() => diagnostic().sceneId === 'procedural' && diagnostic().canvasReady);
    check('procedural scene renders', diagnostic().sceneId === 'procedural' && diagnostic().canvasReady && Boolean(document.querySelector('.scene-deck[data-scene="procedural"].is-visible.procedural-deck')));
    document.querySelector('.landscape-card[data-scene="forest"]').click();
    await waitFor(() => diagnostic().sceneId === 'forest' && diagnostic().imageLoaded);
    const forestDeck = byId('scene-image')?.closest('.scene-deck');
    check('static forest loads', diagnostic().sceneId === 'forest' && diagnostic().imageLoaded && forestDeck?.dataset.scene === 'forest' && !forestDeck.classList.contains('motion') && document.querySelector('.landscape-card[data-scene="forest"]').getAttribute('aria-pressed') === 'true');
    byId('tab-preferences').click(); change('motion-toggle', false);
    check('motion switch disables animation and saves', !byId('motion-toggle').checked && JSON.parse(localStorage.getItem('digital-window.settings.v2') || '{}').motion === false);
    byId('brightness-slider').value = 70; byId('brightness-slider').dispatchEvent(new Event('input', { bubbles: true }));
    check('brightness control changes scenery', Number(getComputedStyle(document.documentElement).getPropertyValue('--user-brightness')) === 0.7);
    return results;
  })()`, true);

  const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
  const press = (keyCode) => {
    mainWindow.webContents.sendInputEvent({ type: 'keyDown', keyCode });
    mainWindow.webContents.sendInputEvent({ type: 'keyUp', keyCode });
  };
  const waitFullscreen = async (enabled) => {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const state = getWindowState();
      const coversDisplay = Object.keys(state.displayBounds).every((key) => state.bounds[key] === state.displayBounds[key]);
      if (state.fullscreen === enabled && (enabled ? coversDisplay : !coversDisplay)) return state;
      await delay(100);
    }
    return getWindowState();
  };
  if (!getWindowState().fullscreen) { press('F11'); await waitFullscreen(true); }
  const drawerOpen = await mainWindow.webContents.executeJavaScript(`!document.getElementById('settings-panel').hidden`);
  press('Escape');
  const escapeState = await waitFullscreen(false);
  results.push({ name: 'native Escape leaves fullscreen with settings open', passed: drawerOpen && !escapeState.fullscreen, state: escapeState });
  await mainWindow.webContents.executeJavaScript(`document.getElementById('close-panel').click()`);
  if (!getWindowState().fullscreen) { press('F11'); await waitFullscreen(true); }
  press('F11');
  const windowedState = await waitFullscreen(false);
  const windowedCoverage = Object.keys(windowedState.displayBounds).every((key) => windowedState.bounds[key] === windowedState.displayBounds[key]);
  results.push({ name: 'F11 leaves native fullscreen', passed: !windowedState.fullscreen && !windowedCoverage && windowedState.bounds.width > 0 && windowedState.bounds.height > 0, state: windowedState });
  press('F11');
  const fullState = await waitFullscreen(true);
  const coversDisplay = Object.keys(fullState.displayBounds).every((key) => fullState.bounds[key] === fullState.displayBounds[key]);
  results.push({ name: 'F11 restores full display coverage', passed: fullState.fullscreen && coversDisplay, state: fullState });

  const imported = await mainWindow.webContents.executeJavaScript(`(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 96; canvas.height = 64;
    const context = canvas.getContext('2d'); context.fillStyle = '#629d9b'; context.fillRect(0, 0, 96, 64);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    const file = new File([blob], 'smoke-local-landscape.png', { type: 'image/png' });
    const transfer = new DataTransfer(); transfer.items.add(file);
    const input = document.getElementById('media-input'); input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    for (let attempt = 0; attempt < 50; attempt++) {
      const ui = window.__digitalWindowSmoke();
      if (ui.sceneId === 'custom' && ui.imageLoaded) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    const ui = window.__digitalWindowSmoke();
    const stored = JSON.parse(localStorage.getItem('digital-window.settings.v2') || '{}');
    return { passed: ui.sceneId === 'custom' && ui.imageLoaded && stored.scene === 'custom', sceneId: ui.sceneId, imageLoaded: ui.imageLoaded, storedScene: stored.scene };
  })()`, true);
  results.push({ name: 'local image import decodes and saves', ...imported });

  const reloadRenderer = async () => {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Smoke renderer reload timed out')), 8000);
      mainWindow.webContents.once('did-finish-load', () => { clearTimeout(timer); resolve(); });
      mainWindow.webContents.reload();
    });
  };
  await reloadRenderer();
  let restored = null;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    restored = await mainWindow.webContents.executeJavaScript(`typeof window.__digitalWindowSmoke === 'function' ? window.__digitalWindowSmoke() : null`);
    if (restored?.sceneId === 'custom' && restored.imageLoaded && restored.canvasReady) break;
    await delay(100);
  }
  results.push({ name: 'imported image survives reload through IndexedDB', passed: restored?.sceneId === 'custom' && restored.imageLoaded && restored.canvasReady, ui: restored });

  // Return even the isolated test profile to the same defaults as first launch.
  await mainWindow.webContents.executeJavaScript(`(async () => {
    localStorage.removeItem('digital-window.settings.v2');
    localStorage.removeItem('digital-window.settings.v1');
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Test media database did not close within 6 seconds')), 6000);
      const request = indexedDB.deleteDatabase('digital-window-media');
      request.onsuccess = () => { clearTimeout(timer); resolve(); };
      request.onerror = () => { clearTimeout(timer); reject(request.error); };
    });
  })()`, true);
  await reloadRenderer();
  let defaultsRestored = null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    defaultsRestored = await mainWindow.webContents.executeJavaScript(`typeof window.__digitalWindowSmoke === 'function' ? window.__digitalWindowSmoke() : null`);
    if (defaultsRestored?.ready && defaultsRestored.imageLoaded && defaultsRestored.canvasReady) break;
    await delay(100);
  }
  results.push({ name: 'default scene and time zone restored', passed: defaultsRestored?.sceneId === 'manhattan' && defaultsRestored.timeZone === 'America/New_York' && defaultsRestored.imageLoaded && defaultsRestored.visibleMainButtons?.length === 1 && defaultsRestored.visibleMainButtons[0] === 'menu-button', ui: defaultsRestored });
  return results;
}

function createWindow() {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const area = display.workArea;
  const width = Math.min(1280, Math.max(640, area.width - 100));
  const height = Math.min(800, Math.max(480, area.height - 100));
  normalBounds = {
    x: area.x + Math.round((area.width - width) / 2),
    y: area.y + Math.round((area.height - height) / 2),
    width,
    height,
  };

  mainWindow = new BrowserWindow({
    ...(windowed ? normalBounds : display.bounds),
    title: 'Digital Window · 数字窗户',
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    backgroundColor: '#0b171d',
    frame: false,
    show: false,
    fullscreen: !windowed,
    fullscreenable: true,
    autoHideMenuBar: true,
    minWidth: Math.min(640, area.width),
    minHeight: Math.min(420, area.height),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      spellcheck: false,
      webgl: !(testMode && process.argv.includes('--disable-webgl')),
    },
  });

  mainWindow.setMenu(null);
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== rendererURL) event.preventDefault();
  });
  mainWindow.webContents.on('will-attach-webview', (event) => event.preventDefault());
  mainWindow.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  mainWindow.webContents.session.setPermissionCheckHandler(() => false);

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || input.isAutoRepeat) return;
    const key = input.key.toLowerCase();
    if (key === 'f4' && input.alt) {
      event.preventDefault();
      lifecycleLog('native-alt-f4');
      requestQuit('alt-f4');
    } else if ((key === 'escape' || key === 'esc') && mainWindow.isFullScreen()) {
      event.preventDefault();
      lifecycleLog('native-escape');
      setFullscreen(false);
    } else if (key === 'f11') {
      event.preventDefault();
      setFullscreen(!mainWindow.isFullScreen());
    }
  });

  mainWindow.webContents.on('console-message', ({ level, message, lineNumber, sourceId }) => {
    if (level === 'error') rendererErrors.push({ message, lineNumber, sourceId });
  });
  mainWindow.webContents.on('preload-error', (_event, preloadPath, error) => {
    rendererErrors.push({ message: error.message, preloadPath });
    reportError(error);
  });

  mainWindow.on('enter-full-screen', publishWindowState);
  mainWindow.on('leave-full-screen', () => {
    if (normalBounds && mainWindow && !mainWindow.isDestroyed()) mainWindow.setBounds(normalBounds);
    publishWindowState();
  });
  mainWindow.on('resize', publishWindowState);
  for (const event of ['show', 'hide', 'minimize', 'restore']) mainWindow.on(event, () => {
    updateSleepBlocker(); publishWindowState();
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
    updateSleepBlocker();
  });
  mainWindow.on('close', () => lifecycleLog('native-window-close'));
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    reportError(`Renderer process exited: ${JSON.stringify(details)}`);
    if (testMode) app.exit(1);
  });
  mainWindow.webContents.on('did-fail-load', (_event, code, description) => {
    reportError(`Page failed to load: ${code} ${description}`);
    if (testMode) app.exit(1);
  });
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
    publishWindowState();
    if (smokeTest) runSmokeTest();
    if (lightingTest) runLightingTest();
    if (softwareTest) runSoftwareTest();
    if (naturalTest) require('./natural-tests.cjs').runNaturalTests(mainWindow, { finish: finishInstrumentedTest, delay: testDelay, outputDirectory: path.resolve(process.cwd(), '.test-results', app.isPackaged ? 'packaged-natural' : 'source-natural') });
    if (lifecycleTest) runLifecycleTest();
  });
  mainWindow.loadFile(rendererPath).catch(reportError);
}

if (!app.requestSingleInstanceLock()) {
  lifecycleLog('single-instance-rejected');
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    if (lifecycleMode === 'single-instance') {
      lifecycleLog('second-instance-received', { windowCount: BrowserWindow.getAllWindows().length });
      requestQuit('single-instance-test');
    }
  });
  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    registerIPC();
    createWindow();
    if (smokeTest) {
      smokeTimeout = setTimeout(() => {
        reportError('Smoke test timed out after 90 seconds');
        app.exit(1);
      }, 90000);
    }
    if (lifecycleTest) {
      setTimeout(() => {
        lifecycleLog('result', { passed: false, error: 'Lifecycle test timed out', rendererErrors });
        app.exit(2);
      }, 20000).unref();
    }
    if (lightingTest || softwareTest) {
      setTimeout(() => {
        console.log(`${lightingTest ? 'DIGITAL_WINDOW_LIGHTING' : 'DIGITAL_WINDOW_SOFTWARE'} ${JSON.stringify({ passed: false, error: 'Test mode timed out', rendererErrors })}`);
        app.exit(2);
      }, 90000).unref();
    }
    if (naturalTest) setTimeout(() => { finishInstrumentedTest('DIGITAL_WINDOW_NATURAL', [], new Error('Natural-light integration timed out')); }, 240000).unref();
  }).catch((error) => {
    reportError(error);
    app.exit(1);
  });
  app.on('window-all-closed', () => app.quit());
  app.on('will-quit', () => lifecycleLog('will-quit', { reason: quitReason }));
  app.on('quit', (_event, code) => lifecycleLog('quit', { code, reason: quitReason }));
  app.on('before-quit', () => {
    if (displaySleepBlocker !== null) powerSaveBlocker.stop(displaySleepBlocker);
  });
}

process.on('uncaughtException', (error) => {
  reportError(error);
  if (testMode) app.exit(1);
});
process.on('unhandledRejection', reportError);
