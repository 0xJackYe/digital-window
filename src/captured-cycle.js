import { getSolarState, getZonedDateParts, zonedDateTimeToDate } from './solar.js';

const DAY_SECONDS = 86400;
const modulo = (value, period) => ((value % period) + period) % period;
const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value));
const solarMaps = new Map();

function cycleInfo(cycle) {
  const count = cycle?.frameCount;
  const interval = cycle?.intervalSeconds;
  const duration = cycle?.captureDurationSeconds ?? (count - 1) * interval;
  if (!Number.isInteger(count) || count < 2 || !Number.isFinite(interval) || interval <= 0 || !Number.isFinite(duration) || duration <= 0 || duration > DAY_SECONDS) throw new RangeError('Captured cycle requires at least two frames covering up to 24 hours');
  if (Math.abs(duration - (count - 1) * interval) > interval * .01) throw new RangeError('Captured frame count and timestamps disagree');
  return { count, interval, duration, start: modulo(cycle.startLocalSecond ?? 0, DAY_SECONDS) };
}

/** Bracket two actual captured frames, including the explicitly identified seam. */
export function getCycleSample(cycle, sourceSecond) {
  const { count, interval, duration, start } = cycleInfo(cycle);
  if (!Number.isFinite(sourceSecond)) throw new RangeError('Source time must be finite');
  const elapsed = modulo(sourceSecond - start, DAY_SECONDS);
  if (elapsed >= duration) return { frameA: count - 1, frameB: 0, fraction: (elapsed - duration) / (DAY_SECONDS - duration), sourceSecond: modulo(sourceSecond, DAY_SECONDS), elapsed, seam: true, gapSeconds: DAY_SECONDS - duration };
  const index = Math.floor(elapsed / interval);
  return { frameA: index, frameB: index + 1, fraction: (elapsed - index * interval) / interval, sourceSecond: modulo(sourceSecond, DAY_SECONDS), elapsed, seam: false, gapSeconds: DAY_SECONDS - duration };
}

export function capturedFrameURL(cycle, index) {
  const { count } = cycleInfo(cycle);
  if (!Number.isInteger(index) || index < 0 || index >= count) throw new RangeError('Captured frame index out of range');
  return `${cycle.directory.replace(/\/$/, '')}/${cycle.prefix ?? 'frame'}${String(index).padStart(cycle.digits ?? 4, '0')}.${cycle.extension ?? 'jpg'}`;
}

function localDate(parts, delta = 0) {
  const value = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + delta));
  return { year: value.getUTCFullYear(), month: value.getUTCMonth() + 1, day: value.getUTCDate() };
}

function midnight(parts, zone) {
  // Some historical zones skip midnight. Try the first valid civil hour; the
  // mapping still uses real UTC durations instead of assuming a 24-hour DST day.
  for (let hour = 0; hour < 4; hour++) {
    try { return +zonedDateTimeToDate({ ...parts, hour, minute: 0, second: 0 }, zone) - hour * 3600000; } catch { /* Try the next valid hour. */ }
  }
  throw new RangeError('Cannot determine the selected civil date');
}

function eventsFor(parts, place) {
  const zone = place.zone ?? place.timeZone;
  const instant = zonedDateTimeToDate({ ...parts, hour: 12, minute: 0, second: 0 }, zone);
  return getSolarState(instant, { ...place, timeZone: zone });
}

function clockSecond(instant, zone) {
  const local = getZonedDateParts(instant, zone);
  return local.hour * 3600 + local.minute * 60 + local.second + new Date(instant).getUTCMilliseconds() / 1000;
}

/** Monotone cubic interpolation keeps solar-time speed continuous at anchors. */
function interpolateMonotone(x, xs, ys) {
  const n = xs.length;
  const secants = xs.slice(1).map((value, i) => (ys[i + 1] - ys[i]) / (value - xs[i]));
  const slopes = secants.map((value, i) => i === 0 ? value : value * secants[i - 1] <= 0 ? 0 : 2 / (1 / value + 1 / secants[i - 1]));
  slopes.push(secants.at(-1));
  let i = 0;
  while (i < n - 2 && x > xs[i + 1]) i++;
  const width = xs[i + 1] - xs[i], t = clamp((x - xs[i]) / width), square = t * t, cube = square * t;
  return (2 * cube - 3 * square + 1) * ys[i] + (cube - 2 * square + t) * width * slopes[i] + (-2 * cube + 3 * square) * ys[i + 1] + (cube - square) * width * slopes[i + 1];
}

/**
 * Match captured sunrise/noon/sunset to the selected date/location. This changes
 * the playback clock, not the captured weather, geometry, Moon or light rays.
 */
export function mapCycleTime(value, place, cycle) {
  cycleInfo(cycle);
  const instant = new Date(value);
  if (!Number.isFinite(+instant)) throw new RangeError('Target time must be finite');
  const targetZone = place?.zone ?? place?.timeZone ?? cycle.sourcePlace?.zone;
  const local = getZonedDateParts(instant, targetZone);
  if (cycle.mapping === 'clock' || !cycle.sourcePlace || !cycle.sourceDate) return { sourceSecond: clockSecond(instant, targetZone), mapping: 'recorded-clock', targetDate: local.dateKey };
  const sourcePlace = cycle.sourcePlace, sourceZone = sourcePlace.zone ?? sourcePlace.timeZone;
  const key = `${local.dateKey}|${targetZone}|${place.latitude}|${place.longitude}|${cycle.sourceDate}|${sourceZone}|${sourcePlace.latitude}|${sourcePlace.longitude}|${cycle.startLocalSecond}`;
  let map = solarMaps.get(key);
  if (!map) {
    const parts = cycle.sourceDate.split('-').map(Number);
    const sourceDate = localDate({ year: parts[0], month: parts[1], day: parts[2] }, cycle.startLocalSecond > 43200 ? 1 : 0);
    const source = eventsFor(sourceDate, sourcePlace), target = eventsFor(local, place);
    const start = midnight(localDate(local), targetZone), end = midnight(localDate(local, 1), targetZone);
    const sourceRise = source.sunrise ? clockSecond(source.sunrise, sourceZone) : 21600;
    const sourceSet = source.sunset ? clockSecond(source.sunset, sourceZone) : 64800;
    const sourceNoon = clockSecond(source.solarNoon, sourceZone);
    map = { start, end, target, sourceRise, sourceSet, sourceNoon };
    if (target.sunrise && target.sunset && +target.sunrise > start && +target.sunset < end) {
      map.xs = [start, +target.sunrise, +target.solarNoon, +target.sunset, end];
      map.ys = [0, sourceRise, sourceNoon, sourceSet, DAY_SECONDS];
    }
    solarMaps.set(key, map);
    if (solarMaps.size > 20) solarMaps.delete(solarMaps.keys().next().value);
  }
  let sourceSecond, mapping;
  if (map.xs) { sourceSecond = interpolateMonotone(+instant, map.xs, map.ys); mapping = 'solar-anchors'; }
  else {
    // A normal-day recording cannot reproduce polar astronomy. Keep polar-day
    // output inside captured daylight, and polar-night output inside its night.
    const dayFraction = clamp((+instant - map.start) / (map.end - map.start));
    const wave = .5 - .5 * Math.cos(dayFraction * Math.PI * 2);
    if (map.target.polarDay) { sourceSecond = map.sourceRise + (map.sourceSet - map.sourceRise) * (.12 + .76 * wave); mapping = 'polar-day-recording'; }
    else { sourceSecond = modulo(map.sourceSet + (DAY_SECONDS - map.sourceSet + map.sourceRise) * (.12 + .76 * wave), DAY_SECONDS); mapping = 'polar-night-recording'; }
  }
  return { sourceSecond: modulo(sourceSecond, DAY_SECONDS), mapping, targetDate: local.dateKey };
}

function eventPromise(element, event, timeout = 12000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => done(new Error(`Captured video ${event} timed out`)), timeout);
    const success = () => done(), failed = () => done(new Error('Captured video could not be decoded'));
    function done(error) { clearTimeout(timer); element.removeEventListener(event, success); element.removeEventListener('error', failed); error ? reject(error) : resolve(); }
    element.addEventListener(event, success, { once: true }); element.addEventListener('error', failed, { once: true });
  });
}

export class CapturedCycleRenderer {
  constructor(provider) {
    this.provider = provider; this.canvas = document.createElement('canvas');
    this.canvas.className = 'relighting-canvas captured-cycle-canvas'; this.canvas.id = 'captured-cycle-canvas'; this.canvas.setAttribute('aria-hidden', 'true');
    this.context = this.canvas.getContext('2d', { alpha: false }); this.cache = new Map(); this.token = 0; this.active = true; this.ready = false; this.frameCount = 0;
    this.resize = this.resize.bind(this); window.addEventListener('resize', this.resize);
    this.onVisibility = () => { if (document.hidden) { cancelAnimationFrame(this.frame); this.frame = null; } else this.update(); };
    document.addEventListener('visibilitychange', this.onVisibility); this.resize();
  }
  resize() {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(1, Math.round(innerWidth * dpr)); this.canvas.height = Math.max(1, Math.round(innerHeight * dpr));
    this.paint();
  }
  async setScene(scene, deck) {
    if (!scene?.cycle) throw new TypeError('A captured cycle manifest is required');
    if (this.scene === scene && this.deck === deck) { this.setActive(true); this.update(); return this.ready; }
    this.release(); const token = this.token; this.scene = scene; this.deck = deck; this.active = true; this.ready = false; this.lastError = null;
    this.utcMillis = this.manualTarget = this.manualStart = this.manualFrom = undefined;
    this.canvas.id = 'captured-cycle-canvas'; this.canvas.style.visibility = 'hidden'; deck.append(this.canvas);
    if (scene.cycle.video) {
      this.decoders = [0, 1].map(() => {
        const video = document.createElement('video'); video.muted = true; video.playsInline = true; video.preload = 'auto';
        const loaded = eventPromise(video, 'loadeddata'); video.src = scene.cycle.video; video.load();
        return { video, loaded, queue: Promise.resolve() };
      });
      try { await Promise.all(this.decoders.map(({ loaded }) => loaded)); } catch (error) { if (token === this.token) this.lastError = error.message; return false; }
    }
    if (token !== this.token) return false;
    await this.update(); return this.ready;
  }
  setActive(active) {
    this.active = Boolean(active); this.canvas.hidden = !this.active;
    if (!this.active) { cancelAnimationFrame(this.frame); this.frame = null; } else this.update();
  }
  async frameAt(index) {
    const cached = this.cache.get(index);
    if (cached) { this.cache.delete(index); this.cache.set(index, cached); return cached; }
    const token = this.token, cycle = this.scene.cycle;
    let source;
    if (cycle.video) {
      const decoder = this.decoders[index % 2];
      source = await (decoder.queue = decoder.queue.catch(() => {}).then(async () => {
        await decoder.loaded;
        if (token !== this.token) throw new Error('Captured frame request superseded');
        const video = decoder.video, time = Math.min(video.duration - .001, (index + .25) / cycle.fps);
        if (Math.abs(video.currentTime - time) > .000001 || video.readyState < 2) { const seeked = eventPromise(video, 'seeked'); video.currentTime = time; await seeked; }
        const frame = document.createElement('canvas'); frame.width = video.videoWidth; frame.height = video.videoHeight;
        frame.getContext('2d', { alpha: false }).drawImage(video, 0, 0); return frame;
      }));
    } else {
      source = new Image(); source.src = capturedFrameURL(cycle, index); await source.decode();
    }
    if (token !== this.token) { if (source instanceof HTMLCanvasElement) source.width = source.height = 1; throw new Error('Captured frame request superseded'); }
    this.cache.set(index, source); this.prune(); return source;
  }
  prune() {
    while (this.cache.size > 6) {
      const key = [...this.cache.keys()].find(index => index !== this.pair?.frameA && index !== this.pair?.frameB);
      if (key === undefined) break;
      const source = this.cache.get(key); this.cache.delete(key); if (source instanceof HTMLCanvasElement) source.width = source.height = 1;
    }
  }
  clock() {
    const state = this.provider(), target = state.realtime ? Date.now() : state.utcMillis;
    const now = performance.now();
    if (!state.realtime && !state.immediate) {
      if (this.manualTarget !== target || this.wasRealtime || !Number.isFinite(this.manualStart)) { this.manualFrom = this.utcMillis ?? target; this.manualStart = now; this.manualTarget = target; }
      const t = clamp((now - this.manualStart) / 260); this.utcMillis = this.manualFrom + (target - this.manualFrom) * t * t * (3 - 2 * t); this.transitioning = t < 1;
    } else { this.utcMillis = target; this.transitioning = false; }
    this.wasRealtime = state.realtime; this.targetUtcMillis = target;
    const mapped = mapCycleTime(this.utcMillis, state.place ?? this.scene.cycle.sourcePlace, this.scene.cycle);
    return { ...getCycleSample(this.scene.cycle, mapped.sourceSecond), mapping: mapped.mapping };
  }
  async update() {
    if (!this.scene || !this.active || document.hidden || this.provider()?.visible === false) return;
    const sample = this.clock(); this.desired = sample;
    if (this.pair?.frameA === sample.frameA && this.pair?.frameB === sample.frameB) { this.pair.fraction = sample.fraction; this.pair.mapping = sample.mapping; this.paint(); this.schedule(); return; }
    if (this.loading) { this.schedule(); return this.loading; }
    const token = this.token;
    this.loading = (async () => {
      try {
        const [a, b] = await Promise.all([this.frameAt(sample.frameA), this.frameAt(sample.frameB)]);
        if (token !== this.token) return;
        if (this.desired.frameA !== sample.frameA || this.desired.frameB !== sample.frameB) return;
        this.pair = { ...this.desired, a, b }; this.ready = true; this.lastError = null; this.canvas.style.visibility = ''; this.paint();
      } catch (error) { if (token === this.token) this.lastError = error.message; /* Keep the last complete pair or the poster visible. */ }
      finally { if (token === this.token) { this.loading = null; this.schedule(); } }
    })();
    this.schedule(); return this.loading;
  }
  draw() { return this.update(); }
  paint() {
    if (!this.pair || !this.active) return;
    const { a, b, fraction } = this.pair, c = this.context, w = this.canvas.width, h = this.canvas.height;
    const draw = (image) => {
      const sw = image.naturalWidth || image.width, sh = image.naturalHeight || image.height;
      const scale = Math.max(w / sw, h / sh), cw = w / scale, ch = h / scale;
      c.drawImage(image, (sw - cw) / 2, (sh - ch) / 2, cw, ch, 0, 0, w, h);
    };
    c.filter = 'none'; c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1; c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
    draw(a); c.globalAlpha = clamp(fraction); draw(b); c.globalAlpha = 1; this.frameCount++;
  }
  schedule() {
    if (this.frame || !this.active || !this.scene || document.hidden || this.provider()?.visible === false) return;
    const state = this.provider(); if (!state.realtime && !this.transitioning && !this.loading && this.pair?.frameA === this.desired?.frameA && this.pair?.frameB === this.desired?.frameB) return;
    this.frame = requestAnimationFrame((now) => { this.frame = null; if (!this.lastFrame || now - this.lastFrame >= 1000 / 30) { this.lastFrame = now; void this.update(); } else this.schedule(); });
  }
  diagnostics() {
    const pixels = [];
    if (this.ready) for (const [u, v] of [[.2, .2], [.5, .2], [.8, .2], [.2, .7], [.5, .7], [.8, .7]]) {
      try { pixels.push(...this.context.getImageData(Math.min(this.canvas.width - 1, Math.floor(u * this.canvas.width)), Math.min(this.canvas.height - 1, Math.floor(v * this.canvas.height)), 1, 1).data); } catch { break; }
    }
    return { ready: this.ready, pairReady: Boolean(this.pair && this.desired && this.pair.frameA === this.desired.frameA && this.pair.frameB === this.desired.frameB), renderer: 'captured-cycle', mode: 'captured', sceneId: this.scene?.id, frameCount: this.frameCount, utcMillis: this.utcMillis, targetUtcMillis: this.targetUtcMillis, realtime: Boolean(this.wasRealtime), transitioningTime: this.transitioning, sourceFrameA: this.pair?.frameA, sourceFrameB: this.pair?.frameB, fraction: this.pair?.fraction, sourceSecond: this.desired?.sourceSecond, seam: this.desired?.seam, mapping: this.pair?.mapping, sourceVideo: this.scene?.cycle.video, sourceCaptureDate: this.scene?.cycle.sourceDate, sourceCaptureLocation: this.scene?.cycle.sourcePlace, sourceWidth: this.scene?.cycle.width, sourceHeight: this.scene?.cycle.height, width: this.canvas.width, height: this.canvas.height, cachedFrames: this.cache.size, pixels, pixelHash: pixels.reduce((hash, channel) => Math.imul(hash ^ channel, 16777619) >>> 0, 2166136261).toString(16), lastError: this.lastError, noSyntheticLighting: true };
  }
  release() {
    this.token++; cancelAnimationFrame(this.frame); this.frame = null; this.loading = null;
    for (const { video } of this.decoders ?? []) { video.pause(); video.removeAttribute('src'); video.load(); }
    this.decoders = [];
    for (const source of this.cache.values()) if (source instanceof HTMLCanvasElement) source.width = source.height = 1;
    this.cache.clear(); this.pair = this.desired = null; this.ready = false;
  }
  destroy() { this.release(); this.canvas.remove(); window.removeEventListener('resize', this.resize); document.removeEventListener('visibilitychange', this.onVisibility); }
}
