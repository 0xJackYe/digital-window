'use strict';
const fs = require('node:fs');
const path = require('node:path');

async function runNaturalTests(mainWindow, { finish, delay, outputDirectory } = {}) {
  const checks = [];
  const pause = delay || ((ms) => new Promise(resolve => setTimeout(resolve, ms)));
  const evaluate = script => mainWindow.webContents.executeJavaScript(script, true);
  const folder = path.resolve(outputDirectory || '.test-results/captured');
  fs.mkdirSync(folder, { recursive: true });
  try {
    let ui;
    for (let i = 0; i < 250; i++) {
      ui = await evaluate('window.__digitalWindowSmoke?.()');
      if (ui?.ready && ui.captured?.pairReady) break;
      await pause(80);
    }
    if (!ui?.ready || !ui.captured?.pairReady) throw new Error(`Captured cycle did not initialize: ${JSON.stringify(ui)}`);
    checks.push({ name: 'default scene uses actual captured day and night rather than a graded daytime JPEG', passed: ui.sceneId === 'cuhk' && ui.captured.renderer === 'captured-cycle' && ui.captured.noSyntheticLighting && ui.renderMode === 'daylight' });
    checks.push(...await evaluate(`(${capturedBrowserChecks.toString()})()`));
    for (let hour = 0; hour < 24; hour++) {
      const sample = await evaluate(`(${prepareHour.toString()})(${hour})`);
      const name = `cuhk-${String(hour).padStart(2, '0')}.jpg`;
      fs.writeFileSync(path.join(folder, name), (await mainWindow.webContents.capturePage()).toJPEG(85));
      checks.push({ name: `hour ${hour}: actual recorded frame pair is decoded and displayed`, passed: sample.ready && sample.pairReady && sample.noSyntheticLighting && sample.sourceWidth === 1280 && sample.sourceHeight === 720 && sample.cachedFrames <= 6 && sample.sourceFrameA !== sample.sourceFrameB, frameA: sample.sourceFrameA, frameB: sample.sourceFrameB, fraction: sample.fraction, sourceSecond: sample.sourceSecond, mapping: sample.mapping, image: name });
    }
    checks.push(...await evaluate(`(${compareNightAndDay.toString()})()`));
    mainWindow.webContents.enableDeviceEmulation({ screenPosition: 'desktop', screenSize: { width: 1920, height: 1080 }, viewPosition: { x: 0, y: 0 }, viewSize: { width: 1920, height: 1080 }, deviceScaleFactor: 2, scale: 1 });
    await pause(300);
    const physical = await evaluate('window.__digitalWindowSmoke().captured');
    checks.push({ name: '4K output preserves honest 720p capture provenance instead of claiming native 4K detail', passed: physical.width === 3840 && physical.height === 2160 && physical.sourceWidth === 1280 && physical.sourceHeight === 720, width: physical.width, height: physical.height, sourceWidth: physical.sourceWidth, sourceHeight: physical.sourceHeight });
    mainWindow.webContents.disableDeviceEmulation(); await pause(250);
    await evaluate(`(() => { const key='digital-window.settings.v2'; const saved=JSON.parse(localStorage.getItem(key)||'{}'); saved.scene='denver'; saved.renderMode='daylight'; saved.photoLightingVersion=1; localStorage.setItem(key,JSON.stringify(saved)); })()`);
    const reloaded = new Promise(resolve => mainWindow.webContents.once('did-finish-load', resolve));
    mainWindow.webContents.reload(); await reloaded;
    let migrated;
    for (let attempt=0;attempt<180;attempt++) { migrated=await evaluate('window.__digitalWindowSmoke?.()'); if(migrated?.ready&&migrated.captured?.pairReady)break;await pause(60); }
    checks.push({ name: 'previous single-photo grading preferences migrate to a working captured cycle', passed: migrated?.sceneId==='cuhk' && migrated.renderMode==='daylight' && migrated.captured?.pairReady && migrated.captured.noSyntheticLighting });
    const state = await evaluate('window.digitalWindow.getWindowState()');
    checks.push({ name: 'native fullscreen covers the entire monitor including taskbar bounds', passed: state.fullscreen && ['x', 'y', 'width', 'height'].every(key => state.bounds[key] === state.displayBounds[key]), bounds: state.bounds, displayBounds: state.displayBounds });
    const images = Array.from({ length: 24 }, (_, hour) => `<figure><img src="cuhk-${String(hour).padStart(2, '0')}.jpg"><figcaption>${String(hour).padStart(2, '0')}:00</figcaption></figure>`).join('');
    fs.writeFileSync(path.join(folder, '24-hours.html'), `<!doctype html><meta charset="utf-8"><title>真实昼夜 · 24 小时检查</title><style>body{background:#13171c;color:white;font:16px system-ui}main{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}figure{margin:0}img{width:100%}</style><h1>香港实拍 · 24 小时实际窗口截图</h1><p>原片1280×720，真实摄影帧连续插值；按所选日期日出日落映射拍摄时间。不是任意日期的物理重光照。</p><main>${images}</main>`);
    finish('DIGITAL_WINDOW_NATURAL', checks);
  } catch (error) { finish('DIGITAL_WINDOW_NATURAL', checks, error); }
}

async function capturedBrowserChecks() {
  const checks = [], check = (name, passed, details = {}) => checks.push({ name, passed: Boolean(passed), ...details });
  const byId = id => document.getElementById(id), state = () => window.__digitalWindowSmoke().captured;
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const wait = async predicate => { for (let i = 0; i < 180; i++) { if (predicate()) return true; await pause(60); } return false; };
  const toggle = (id, checked) => { byId(id).checked = checked; byId(id).dispatchEvent(new Event('change', { bubbles: true })); };
  toggle('motion-toggle', false);
  const before = state(); await pause(1200); const after = state();
  check('recorded light continues advancing every frame with decorative motion disabled', after.frameCount > before.frameCount + 8 && after.utcMillis > before.utcMillis + 900 && (after.fraction !== before.fraction || after.sourceFrameA !== before.sourceFrameA), { frames: after.frameCount - before.frameCount, elapsedMs: after.utcMillis - before.utcMillis });
  const handoff = Date.now(); toggle('realtime-toggle', false); await pause(400);
  check('realtime to preview retains seconds instead of snapping to a minute', Math.abs(state().targetUtcMillis - handoff) < 1000);
  const source = state().sourceVideo;
  for (const minute of [100, 900, 450, 1250]) { byId('time-slider').value = minute; byId('time-slider').dispatchEvent(new Event('input', { bubbles: true })); }
  const settled = await wait(() => state().pairReady && !state().transitioningTime && Math.abs(state().utcMillis - state().targetUtcMillis) < 2);
  check('rapid time scrubbing shows the latest complete real frame pair without losing the source', settled && state().sourceVideo === source && state().cachedFrames <= 6 && !state().lastError, { state: state() });
  const scene = document.querySelector('.landscape-card[data-scene="denver"]'); scene.click();
  await wait(() => window.__digitalWindowSmoke().sceneId === 'denver');
  check('a single Denver photograph is explicitly original-only and no longer advertised as a true night view', window.__digitalWindowSmoke().renderMode === 'photo' && byId('time-preview').hidden && byId('render-mode').querySelector('[value="daylight"]').disabled && window.__digitalWindowSmoke().relighting.originalPhoto);
  document.querySelector('.landscape-card[data-scene="cuhk"]').click();
  check('returning to the captured scene restores actual day/night playback', await wait(() => window.__digitalWindowSmoke().sceneId === 'cuhk' && state().pairReady && window.__digitalWindowSmoke().ready));
  return checks;
}

async function prepareHour(hour) {
  const slider = document.getElementById('time-slider');
  const toggle = document.getElementById('realtime-toggle'); toggle.checked = false; toggle.dispatchEvent(new Event('change', { bubbles: true }));
  slider.value = hour * 60; slider.dispatchEvent(new Event('input', { bubbles: true }));
  for (let i = 0; i < 200; i++) {
    const state = window.__digitalWindowSmoke().captured;
    if (state.ready && state.pairReady && !state.transitioningTime && Math.abs(state.utcMillis - state.targetUtcMillis) < 2) break;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  const canvas = document.createElement('canvas'); canvas.width = 160; canvas.height = 90;
  const c = canvas.getContext('2d', { willReadFrequently: true }); c.drawImage(document.getElementById('captured-cycle-canvas'), 0, 0, 160, 90);
  window.__capturedSamples ||= {};
  window.__capturedSamples[hour] = c.getImageData(0, 0, 160, 90).data;
  return window.__digitalWindowSmoke().captured;
}

function compareNightAndDay() {
  const night = window.__capturedSamples[0], day = window.__capturedSamples[12];
  const luma = (pixels, offset) => pixels[offset] * .2126 + pixels[offset + 1] * .7152 + pixels[offset + 2] * .0722;
  let darkBackground = 0, dayBackground = 0, count = 0, actualNightLights = 0;
  for (let y = 0; y < 90; y++) for (let x = 0; x < 160; x++) {
    const i = (y * 160 + x) * 4, n = luma(night, i), d = luma(day, i);
    if (y < 22) { darkBackground += n; dayBackground += d; count++; }
    if (n > d + 25 && night[i] > night[i + 2] * 1.25 && night[i + 1] > night[i + 2] * 1.15) actualNightLights++;
  }
  return [
    { name: 'night has genuinely dark recorded background rather than the bright daytime background', passed: darkBackground < dayBackground * .55, nightBackground: darkBackground / count, dayBackground: dayBackground / count },
    { name: 'night contains localized warm lamps and reflections brighter than those same locations by day, impossible with global dimming', passed: actualNightLights > 40, actualNightLightPixels: actualNightLights, measuredResolution: '160x90' },
  ];
}

module.exports = { runNaturalTests };
