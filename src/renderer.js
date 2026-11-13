import { getSolarState, getZonedDateParts, zonedDateTimeToDate } from './solar.js';
import { getDaylightBlend, DAYLIGHT_PHASES } from './daylight.js';
import { CITIES, SCENES } from './scenes.js';
import { SceneView } from './scene-view.js';
import { Atmosphere } from './atmosphere.js';
import { getCelestialState } from './celestial.js';
import { getLightingState } from './lighting.js';
import { RelightingRenderer, cameraForScene } from './relighting.js';
import { CapturedCycleRenderer } from './captured-cycle.js';

const $ = (id) => document.getElementById(id);
const STORAGE_KEY = 'digital-window.settings.v2';
const scenes = [...SCENES];
const defaults = { scene: 'cuhk', city: 'hong-kong', custom: null, renderMode: 'daylight', photoLightingVersion: 2, sceneTimezone: true, realtime: true, previewMinute: 720, bearings: {}, motion: !matchMedia('(prefers-reduced-motion: reduce)').matches, frame: false, brightness: 100 };
function loadSettings() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const value = JSON.parse(stored || localStorage.getItem('digital-window.settings.v1') || '{}');
    const result = { ...defaults };
    // Migrate previous 3D/raw-photo preferences to the photographic daylight
    // renderer once. Subsequent explicit original-photo choices are retained.
    if (value.photoLightingVersion === 2 && ['daylight', 'photo'].includes(value.renderMode)) result.renderMode = value.renderMode;
    for (const key of ['motion', 'frame', 'realtime', 'sceneTimezone']) if (typeof value[key] === 'boolean') result[key] = value[key];
    if (!stored || value.photoLightingVersion !== 2) result.realtime = true;
    if (value.photoLightingVersion === 2 && [...scenes.map((scene) => scene.id), 'custom'].includes(value.scene)) result.scene = value.scene;
    if (CITIES.some((city) => city.id === value.city) || value.city === 'custom') result.city = value.city;
    if (Number.isFinite(value.brightness)) result.brightness = Math.max(50, Math.min(130, value.brightness));
    if (Number.isFinite(value.previewMinute)) result.previewMinute = Math.max(0, Math.min(1439.999, value.previewMinute));
    if (value.bearings && typeof value.bearings === 'object') result.bearings = Object.fromEntries(Object.entries(value.bearings).filter(([id, bearing]) => scenes.some((scene) => scene.id === id) && Number.isFinite(bearing) && bearing >= 0 && bearing < 360));
    if (value.custom && Number.isFinite(value.custom.latitude) && Math.abs(value.custom.latitude) <= 90 && Number.isFinite(value.custom.longitude) && Math.abs(value.custom.longitude) <= 180) {
      getZonedDateParts(new Date(), value.custom.zone);
      result.custom = { id: 'custom', name: value.custom.zone.replaceAll('_', ' '), zone: value.custom.zone, latitude: value.custom.latitude, longitude: value.custom.longitude };
    }
    if (result.city === 'custom' && !result.custom) result.city = 'new-york';
    return result;
  } catch { return { ...defaults }; }
}
const settings = loadSettings();
const sceneView = new SceneView($('scene-base'));
const atmosphere = new Atmosphere($('atmosphere'));
let activeScene = scenes.find((scene) => scene.id === settings.scene) || scenes[0];
let solar, blend, celestial, lighting, camera, utcMillis, currentPanel = null, currentFullscreen = false, desktopVisible = true, capturedActive = false, idleTimer, toastTimer, closeTimer, previousFocus, customURL, sceneRequest = 0;
const relighting = new RelightingRenderer(() => ({ lighting, camera, utcMillis, realtime: settings.realtime, place: currentCity(), weights: sceneView.displayWeights, originalPhoto: true, visible: desktopVisible && !capturedActive, motion: settings.motion && desktopVisible, animating: sceneView.transitioning }));
const captured = new CapturedCycleRenderer(() => ({ utcMillis, realtime: settings.realtime, place: currentCity(), visible: desktopVisible, camera }));
const presetCache = new Map();
function currentCity() {
  if (settings.sceneTimezone) return CITIES.find((city) => city.id === activeScene.location) || CITIES[0];
  return settings.city === 'custom' ? settings.custom : CITIES.find((city) => city.id === settings.city) || CITIES[0];
}
function save() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch { toast('设置暂时无法保存。'); } }
function toast(message) { clearTimeout(toastTimer); $('toast').textContent = message; $('toast').hidden = false; toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4000); }
function wake() {
  document.body.classList.remove('idle'); clearTimeout(idleTimer);
  if (!currentPanel && $('main-menu').hidden) idleTimer = setTimeout(() => document.body.classList.add('idle'), 6500);
}
function closeMenu() { $('main-menu').hidden = true; $('menu-button').setAttribute('aria-expanded', 'false'); wake(); }
function toggleMenu() {
  const opening = $('main-menu').hidden;
  closePanel(false, true); $('main-menu').hidden = !opening;
  $('menu-button').setAttribute('aria-expanded', String(opening)); wake();
  if (opening) $('main-menu').querySelector('button').focus();
}
function openPanel(panel) {
  if (!['landscapes', 'daylight', 'preferences'].includes(panel)) return;
  previousFocus = currentPanel ? previousFocus : document.activeElement?.closest('#main-menu') ? $('menu-button') : document.activeElement;
  clearTimeout(closeTimer); $('settings-panel').classList.remove('is-closing'); $('panel-backdrop').classList.remove('is-closing');
  closeMenu(); currentPanel = panel;
  $('settings-panel').hidden = false; $('panel-backdrop').hidden = false;
  $('panel-title').textContent = { landscapes: '窗外景观', daylight: '时区与日光', preferences: '显示偏好' }[panel];
  for (const name of ['landscapes', 'daylight', 'preferences']) {
    $('panel-' + name).hidden = name !== panel;
    $('tab-' + name).setAttribute('aria-selected', String(name === panel)); $('tab-' + name).tabIndex = name === panel ? 0 : -1;
  }
  updateSolar(); wake(); $('close-panel').focus();
}
function closePanel(restoreFocus = true, immediate = false) {
  const wasOpen = currentPanel; currentPanel = null; clearTimeout(closeTimer);
  const finish = () => {
    $('settings-panel').hidden = true; $('panel-backdrop').hidden = true;
    $('settings-panel').classList.remove('is-closing'); $('panel-backdrop').classList.remove('is-closing');
  };
  if (!immediate && wasOpen && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    $('settings-panel').classList.add('is-closing'); $('panel-backdrop').classList.add('is-closing'); closeTimer = setTimeout(finish, 180);
  } else finish();
  if (wasOpen && restoreFocus) (previousFocus?.isConnected ? previousFocus : $('menu-button')).focus();
  wake();
}
function buildCities() {
  $('city-select').replaceChildren();
  for (const city of settings.custom ? [...CITIES, settings.custom] : CITIES) {
    const option = document.createElement('option'); option.value = city.id; option.textContent = city.name; $('city-select').append(option);
  }
  const city = currentCity(); $('city-select').value = city.id;
  $('scene-timezone-toggle').checked = settings.sceneTimezone;
  const sceneCity = CITIES.find((item) => item.id === activeScene.location);
  $('scene-location-label').textContent = (sceneCity?.name || '所选位置') + (activeScene.locationUnspecified ? '（日光参考）' : '');
  $('city-coordinates').textContent = `${city.zone} · ${Math.abs(city.latitude).toFixed(2)}°${city.latitude >= 0 ? 'N' : 'S'} · ${Math.abs(city.longitude).toFixed(2)}°${city.longitude >= 0 ? 'E' : 'W'}`;
  $('custom-zone').value = city.zone; $('custom-lat').value = city.latitude; $('custom-lon').value = city.longitude;
}
function renderSceneCards() {
  const focusId = document.activeElement?.closest('[data-scene]')?.dataset.scene;
  $('landscape-grid').replaceChildren();
  for (const scene of scenes) {
    const card = document.createElement('button'); card.className = 'landscape-card'; card.dataset.scene = scene.id;
    card.setAttribute('aria-pressed', String(scene.id === settings.scene)); card.setAttribute('aria-label', `${scene.title}，${scene.subtitle}`);
    const wrap = document.createElement('div'); wrap.className = 'landscape-image';
    if (scene.image && !scene.isVideo) { const image = new Image(); image.src = scene.image; image.alt = ''; image.loading = 'lazy'; wrap.append(image); }
    else { const art = document.createElement('div'); art.className = 'procedural-thumb'; wrap.append(art); }
    if (scene.id === settings.scene) { const check = document.createElement('span'); check.className = 'card-check'; check.textContent = '✓'; wrap.append(check); }
    const title = document.createElement('span'); title.className = 'card-title'; title.textContent = scene.title;
    const sub = document.createElement('span'); sub.className = 'card-subtitle'; sub.textContent = scene.subtitle;
    card.append(wrap, title, sub); card.addEventListener('click', () => { void selectScene(scene.id); }); $('landscape-grid').append(card);
  }
  if (focusId) $('landscape-grid').querySelector(`[data-scene="${focusId}"]`)?.focus();
}
async function selectScene(id, persist = true) {
  const scene = scenes.find((item) => item.id === id) || scenes[0], request = ++sceneRequest;
  try {
    if (!await sceneView.show(scene) || request !== sceneRequest) return false;
    activeScene = scene; settings.scene = scene.id;
    if (scene.cycle) settings.renderMode = 'daylight';
    else if (scene.photoReal) settings.renderMode = 'photo';
    buildCities(); syncRenderMode(); updateSolar(); sceneView.setMotion(settings.motion && desktopVisible); renderSceneCards();
    if (persist) save();
    return true;
  } catch { if (request === sceneRequest) toast('这片景观未能加载，请重新选择。'); return false; }
}
function syncRenderMode() {
  capturedActive = Boolean(activeScene.cycle && settings.renderMode === 'daylight');
  captured.setActive(capturedActive);
  relighting.canvas.style.display = capturedActive ? 'none' : '';
  $('render-mode').querySelector('[value="daylight"]').disabled = !activeScene.cycle;
  $('window-view').setAttribute('aria-label', `${activeScene.title}，${activeScene.id === 'procedural' ? '二维程序景观' : capturedActive ? '真实昼夜实拍，连续时间插值' : '单张实拍或视频，原始光影'}`);
  $('render-mode').value = settings.renderMode;
  $('render-mode-description').textContent = activeScene.cycle ? `同机位密集昼夜实拍，含真实夜景和灯光。${activeScene.resolution.join(' × ')}；摄影 See-ming Lee，CC BY 3.0。` : '此景观只有一个拍摄时刻，保留原始光影。请选「香港，一天的窗景」查看真实昼夜。';
  $('preview-help').textContent = capturedActive ? '按当地日出日落映射实拍时间，相邻实拍帧逐帧插值。天气、灯光和月相来自拍摄当天。' : '当前景观为单张实拍，时间滑块只显示日照计算；不会把白天调暗冒充夜晚。';
  $('time-preview').hidden = !activeScene.cycle;
  $('realtime-toggle').closest('.setting-row').hidden = !activeScene.cycle;
  $('view-azimuth').disabled = Boolean(activeScene.photoReal);
  $('view-azimuth').closest('.brightness-setting').hidden = Boolean(activeScene.photoReal);
  if (sceneView.current) {
    if (capturedActive) {
      if (captured.scene !== activeScene || captured.deck !== sceneView.current) void captured.setScene(activeScene, sceneView.current).catch(() => toast('全天实拍未能解码，请重新选择景观。'));
      else captured.update();
    } else relighting.setScene(activeScene, sceneView.current);
  }
}
function previewDate() {
  const city = currentCity(), local = getZonedDateParts(new Date(), city.zone);
  const wholeMinute = Math.floor(settings.previewMinute), fractionMillis = (settings.previewMinute - wholeMinute) * 60000;
  const parts = { ...local, hour: Math.floor(wholeMinute / 60), minute: wholeMinute % 60, second: 0 };
  try { return new Date(+zonedDateTimeToDate(parts, city.zone) + fractionMillis); }
  catch {
    const afterGap = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute) + 3600000);
    const fallback = { year: afterGap.getUTCFullYear(), month: afterGap.getUTCMonth() + 1, day: afterGap.getUTCDate(), hour: afterGap.getUTCHours(), minute: afterGap.getUTCMinutes() };
    settings.previewMinute = fallback.hour * 60 + fallback.minute;
    toast('这个时刻因夏令时跳过，已移至下一有效时刻。'); return zonedDateTimeToDate(fallback, city.zone);
  }
}
function updateSolar() {
  const city = currentCity(), instant = settings.realtime ? new Date() : previewDate();
  solar = getSolarState(instant, { ...city, timeZone: city.zone }); blend = getDaylightBlend(solar, instant);
  utcMillis = instant.getTime(); celestial = getCelestialState(instant, city);
  const reference = sceneView.current?.querySelector('img,video');
  const aspect = reference ? (reference.naturalWidth || reference.videoWidth) / (reference.naturalHeight || reference.videoHeight) : 16 / 9;
  camera = cameraForScene(activeScene, settings.bearings[activeScene.id], window.innerWidth / window.innerHeight, Number.isFinite(aspect) && aspect > 0 ? aspect : 16 / 9);
  lighting = { ...getLightingState(celestial, camera), utcMillis };
  $('solar-phase').textContent = blend.label; $('phase-orb').dataset.phase = blend.phase;
  $('daylight-description').textContent = `${city.name}${solar.polarDay ? ' · 极昼' : solar.polarNight ? ' · 极夜' : ''}`;
  const wall = getZonedDateParts(instant, city.zone), pad = (value) => String(value).padStart(2, '0');
  $('sync-status').textContent = settings.realtime ? '实时' : '预览'; $('preview-phase').textContent = `${blend.label} · ${pad(wall.hour)}:${pad(wall.minute)}:${pad(wall.second)}`;
  $('view-azimuth').value = camera.viewAzimuth; $('view-azimuth-value').textContent = `${Math.round(camera.viewAzimuth)}°`;
  $('realtime-toggle').checked = settings.realtime;
  $('time-slider').value = settings.realtime ? wall.hour * 60 + wall.minute + wall.second / 60 + (instant.getUTCMilliseconds() / 60000) : settings.previewMinute;
  $('phase-presets').querySelectorAll('button').forEach((button) => button.setAttribute('aria-pressed', String(!settings.realtime && button.dataset.previewPhase === blend.phase)));
  document.documentElement.style.setProperty('--scene-brightness', String(.25 + solar.daylight * .75));
  document.documentElement.style.setProperty('--scene-saturation', String(.48 + solar.daylight * .52));
  const warmth = solar.twilight * .17, night = (1 - solar.daylight) * .4;
  document.documentElement.style.setProperty('--light-overlay', warmth > .07 ? `rgba(199,136,104,${warmth})` : `rgba(38,63,112,${night})`);
  sceneView.setWeights(blend.weights);
  atmosphere.update({ scene: activeScene.id, solar, celestial, lighting, photoReal: Boolean(activeScene.photoReal), motion: settings.motion && desktopVisible && activeScene.kind !== '静态' });
  const frameLight = .30 + solar.daylight * .70 + lighting.moon.strength * .35;
  document.documentElement.style.setProperty('--office-frame-light', String(frameLight));
  document.documentElement.style.setProperty('--office-light-side', `${50 + lighting.sun.direction[0] * 30}%`);
  relighting.update();
  captured.update();
}
function presetMinutes() {
  const city = currentCity(), local = getZonedDateParts(new Date(), city.zone);
  const key = `${city.zone}|${city.latitude}|${city.longitude}|${local.dateKey}`;
  if (presetCache.has(key)) return presetCache.get(key);
  const targets = {}, best = {}, typical = { dawn: 360, morning: 480, noon: 720, evening: 1080, night: 1320 };
  for (let minute = 0; minute < 1440; minute += 5) {
    let instant;
    try { instant = zonedDateTimeToDate({ ...local, hour: Math.floor(minute / 60), minute: minute % 60, second: 0 }, city.zone); } catch { continue; }
    const state = getSolarState(instant, { ...city, timeZone: city.zone }), candidate = getDaylightBlend(state, instant);
    for (const { id } of DAYLIGHT_PHASES) {
      const score = candidate.weights[id] - Math.abs(minute - typical[id]) * .000001;
      if (best[id] === undefined || score > best[id]) { best[id] = score; targets[id] = minute; }
    }
  }
  if (presetCache.size > 24) presetCache.clear(); presetCache.set(key, targets); return targets;
}
function applyPreferences() {
  $('motion-toggle').checked = settings.motion; $('frame-toggle').checked = settings.frame; $('window-frame').hidden = !settings.frame;
  $('brightness-slider').value = settings.brightness; $('brightness-value').textContent = `${settings.brightness}%`;
  document.documentElement.style.setProperty('--user-brightness', String(settings.brightness / 100));
  sceneView.setMotion(settings.motion && desktopVisible); updateSolar(); wake();
}
function setFullscreenState(state) {
  const leaving = currentFullscreen && !state.fullscreen; currentFullscreen = Boolean(state.fullscreen);
  const wasVisible = desktopVisible;
  desktopVisible = state.visible !== false && state.minimized !== true;
  sceneView.setMotion(settings.motion && desktopVisible);
  if (!desktopVisible) atmosphere.update({ motion: false });
  else if (!wasVisible) updateSolar();
  document.body.classList.toggle('fullscreen', currentFullscreen);
  $('fullscreen-label').textContent = currentFullscreen ? '退出全屏' : '进入全屏';
  if (leaving) { closePanel(false); closeMenu(); $('menu-button').focus(); }
}
async function setFullscreen(enabled) {
  try {
    if (window.digitalWindow) setFullscreenState(await window.digitalWindow.setFullscreen(enabled));
    else {
      if (enabled) await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      else if (document.fullscreenElement) await document.exitFullscreen();
      setFullscreenState({ fullscreen: Boolean(document.fullscreenElement) });
    }
    closeMenu(); wake();
  } catch { toast('全屏切换失败，请按 F11 重试。'); }
}
function openMediaDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('digital-window-media', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('media');
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
}
async function mediaStorage(mode, value) {
  const db = await openMediaDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('media', mode), store = transaction.objectStore('media');
    const request = mode === 'readonly' ? store.get('custom') : store.put(value, 'custom');
    transaction.oncomplete = () => { resolve(request.result); db.close(); };
    transaction.onerror = transaction.onabort = () => { reject(transaction.error); db.close(); };
  });
}
function registerCustomMedia(file) {
  if (customURL) URL.revokeObjectURL(customURL); customURL = URL.createObjectURL(file);
  const index = scenes.findIndex((scene) => scene.id === 'custom'); if (index >= 0) scenes.splice(index, 1);
  scenes.push({ id: 'custom', title: file.name.replace(/\.[^.]+$/, '').slice(0, 20) || '自己的风景', subtitle: file.type.startsWith('video/') ? '本地视频 · 循环播放' : '本地图片', kind: file.type.startsWith('video/') ? '动态' : '静态', photoReal: true, image: customURL, isVideo: file.type.startsWith('video/'), alt: file.name, location: 'beijing' });
}
async function importMedia(file) {
  if (!file) return;
  if (!/^(image\/(jpeg|png|webp|avif)|video\/(mp4|webm))$/.test(file.type)) { toast('请选择支持的图片，或 MP4 / WebM 视频。'); return; }
  if (file.size > 250 * 1024 * 1024) { toast('请选择小于 250 MB 的文件。'); return; }
  try {
    const url = URL.createObjectURL(file);
    try {
      await new Promise((resolve, reject) => {
        const probe = file.type.startsWith('image/') ? new Image() : document.createElement('video');
        const timer = setTimeout(() => { probe.removeAttribute('src'); reject(new Error('decode timeout')); }, 12000);
        probe.onload = probe.onloadedmetadata = () => { clearTimeout(timer); probe.removeAttribute('src'); resolve(); };
        probe.onerror = () => { clearTimeout(timer); reject(new Error('decode failed')); }; probe.src = url;
      });
    } finally { URL.revokeObjectURL(url); }
    await mediaStorage('readwrite', file); registerCustomMedia(file);
    if (await selectScene('custom')) toast('这片风景已保存在本机。');
  } catch { toast('未能导入，请检查格式或可用空间。'); }
  $('media-input').value = '';
}

$('menu-button').addEventListener('click', toggleMenu);
$('close-panel').addEventListener('click', () => closePanel()); $('panel-backdrop').addEventListener('click', () => closePanel());
document.querySelectorAll('[data-panel]').forEach((button) => button.addEventListener('click', () => openPanel(button.dataset.panel)));
document.querySelectorAll('[data-tab]').forEach((button) => button.addEventListener('click', () => openPanel(button.dataset.tab)));
$('menu-fullscreen').addEventListener('click', () => { void setFullscreen(!currentFullscreen); });
$('quit-button').addEventListener('click', async () => {
  try {
    if (window.digitalWindow) await window.digitalWindow.quit();
    else { closeMenu(); if (document.fullscreenElement) await document.exitFullscreen(); toast('请关闭此浏览器标签页，或使用桌面程序退出。'); }
  } catch { toast('退出未完成，请按 Alt + F4。'); }
});
$('city-select').addEventListener('change', (event) => { settings.city = event.target.value; settings.sceneTimezone = false; buildCities(); updateSolar(); save(); });
$('scene-timezone-toggle').addEventListener('change', (event) => { settings.sceneTimezone = event.target.checked; buildCities(); updateSolar(); save(); });
$('custom-location-form').addEventListener('submit', (event) => {
  event.preventDefault();
  try {
    const zone = $('custom-zone').value.trim(); getZonedDateParts(new Date(), zone);
    const latitude = Number($('custom-lat').value), longitude = Number($('custom-lon').value);
    if (!Number.isFinite(latitude) || Math.abs(latitude) > 90 || !Number.isFinite(longitude) || Math.abs(longitude) > 180) throw new Error();
    settings.custom = { id: 'custom', name: zone.replaceAll('_', ' '), zone, latitude, longitude }; settings.city = 'custom'; settings.sceneTimezone = false;
    $('location-error').textContent = ''; buildCities(); updateSolar(); save();
  } catch { $('location-error').textContent = '请填写有效的 IANA 时区、纬度与经度。'; }
});
$('realtime-toggle').addEventListener('change', (event) => {
  settings.realtime = event.target.checked;
  if (!settings.realtime) {
    const instant = new Date(), wall = getZonedDateParts(instant, currentCity().zone);
    settings.previewMinute = wall.hour * 60 + wall.minute + wall.second / 60 + instant.getUTCMilliseconds() / 60000;
  }
  updateSolar(); save();
});
$('time-slider').addEventListener('input', (event) => { settings.realtime = false; settings.previewMinute = Number(event.target.value); document.body.classList.add('scrubbing'); updateSolar(); });
$('time-slider').addEventListener('change', () => { save(); setTimeout(() => document.body.classList.remove('scrubbing'), 150); });
$('phase-presets').querySelectorAll('button').forEach((button) => button.addEventListener('click', () => { settings.realtime = false; settings.previewMinute = presetMinutes()[button.dataset.previewPhase]; updateSolar(); save(); }));
for (const [key, id] of [['motion', 'motion-toggle'], ['frame', 'frame-toggle']]) $(id).addEventListener('change', (event) => { settings[key] = event.target.checked; applyPreferences(); save(); });
$('brightness-slider').addEventListener('input', (event) => { settings.brightness = Number(event.target.value); applyPreferences(); }); $('brightness-slider').addEventListener('change', save);
$('view-azimuth').addEventListener('input', (event) => { settings.bearings[activeScene.id] = Number(event.target.value); updateSolar(); }); $('view-azimuth').addEventListener('change', save);
$('import-button').addEventListener('click', () => $('media-input').click()); $('media-input').addEventListener('change', (event) => { void importMedia(event.target.files[0]); });
document.addEventListener('visibilitychange', () => sceneView.setMotion(settings.motion && desktopVisible));
$('render-mode').addEventListener('change', () => { settings.renderMode = $('render-mode').value; syncRenderMode(); updateSolar(); save(); renderSceneCards(); });
document.addEventListener('pointermove', wake, { passive: true }); document.addEventListener('pointerdown', wake, { passive: true });
document.addEventListener('click', (event) => { if (!$('main-menu').hidden && !event.target.closest('#main-menu, #menu-button')) closeMenu(); });
document.addEventListener('fullscreenchange', () => { if (!window.digitalWindow) setFullscreenState({ fullscreen: Boolean(document.fullscreenElement) }); });
document.addEventListener('keydown', (event) => {
  wake();
  if (event.key === 'Escape') {
    event.preventDefault(); closePanel(); closeMenu();
    // Desktop Escape is intercepted natively, independent of renderer health.
    if (!window.digitalWindow && currentFullscreen) void setFullscreen(false); return;
  }
  if (event.key === 'Tab' && currentPanel) {
    const focusables = [...$('settings-panel').querySelectorAll('button,input,select,summary')].filter((element) => element.getClientRects().length && !element.disabled && element.tabIndex !== -1);
    const first = focusables[0], last = focusables.at(-1);
    if (event.shiftKey && document.activeElement === first) { last.focus(); event.preventDefault(); }
    else if (!event.shiftKey && document.activeElement === last) { first.focus(); event.preventDefault(); }
  }
  if (event.target.closest('input,select,textarea') || event.ctrlKey || event.altKey || event.metaKey) return;
  if (event.key.toLowerCase() === 'l') openPanel('landscapes'); if (event.key.toLowerCase() === 't') openPanel('daylight');
  if (event.key === 'F11' && !window.digitalWindow) { event.preventDefault(); void setFullscreen(!currentFullscreen); }
  if (event.target.matches('[data-tab]') && ['ArrowRight', 'ArrowLeft'].includes(event.key)) {
    const names = ['landscapes', 'daylight', 'preferences'], index = names.indexOf(currentPanel), next = names[(index + (event.key === 'ArrowRight' ? 1 : 2)) % 3];
    openPanel(next); $('tab-' + next).focus(); event.preventDefault();
  }
  if (!$('main-menu').hidden && ['ArrowDown', 'ArrowUp'].includes(event.key)) {
    const buttons = [...$('main-menu').querySelectorAll('button')], index = buttons.indexOf(document.activeElement);
    buttons[(index + (event.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length].focus(); event.preventDefault();
  }
});

buildCities(); renderSceneCards(); applyPreferences();
const initiallyCustom = settings.scene === 'custom';
void (async () => {
  if (initiallyCustom) {
    try { const file = await mediaStorage('readonly'); if (file) { registerCustomMedia(file); if (await selectScene('custom', false)) return; } } catch { /* Fall back to the first built-in view. */ }
  }
  await selectScene(initiallyCustom ? defaults.scene : settings.scene, false);
  if (!initiallyCustom) { try { const file = await mediaStorage('readonly'); if (file) { registerCustomMedia(file); renderSceneCards(); } } catch { /* Optional local import does not block the window. */ } }
})();
if (window.digitalWindow) {
  window.digitalWindow.getWindowState().then(setFullscreenState).catch(() => {}); window.digitalWindow.onWindowState(setFullscreenState);
}
window.addEventListener('resize', updateSolar);
setInterval(() => { if (!document.hidden && desktopVisible) updateSolar(); }, 250);
document.addEventListener('visibilitychange', () => { if (!document.hidden) updateSolar(); });
window.__digitalWindowSmoke = () => ({ ready: Boolean(sceneView.ready && solar && (capturedActive ? captured.ready : relighting.ready)), sceneId: activeScene.id, timeZone: currentCity().zone, sceneCount: scenes.length, renderMode: settings.renderMode, photoReal: Boolean(activeScene.photoReal), hasSolar: Number.isFinite(solar?.altitude), canvasReady: atmosphere.ready, phase: blend?.phase, weights: blend?.weights, lighting, celestial, relighting: capturedActive ? captured.diagnostics() : relighting.diagnostics(), captured: captured.diagnostics(), atmosphere: atmosphere.lastDraw, locationSource: settings.sceneTimezone ? 'scene' : 'override', visibleMainButtons: [...$('window-view').querySelectorAll('button')].filter((button) => button.getClientRects().length).map((button) => button.id), ...sceneView.diagnostics() });
wake();
