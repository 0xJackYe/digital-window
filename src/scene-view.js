const PHASES = ['dawn', 'morning', 'noon', 'evening', 'night'];

export function normalizeWeights(weights = {}) {
  const result = Object.fromEntries(PHASES.map((phase) => [phase, Number.isFinite(weights[phase]) ? Math.max(0, weights[phase]) : 0]));
  const total = Object.values(result).reduce((sum, value) => sum + value, 0);
  if (!total) return { dawn: 0, morning: 0, noon: 1, evening: 0, night: 0 };
  for (const phase of PHASES) result[phase] /= total;
  return result;
}

/** Source-over opacities with visible contributions equal to normalized weights. */
export function weightsToAlphas(weights) {
  const normalized = normalizeWeights(weights), alphas = {};
  let accumulated = 0;
  for (const phase of PHASES) {
    accumulated += normalized[phase];
    alphas[phase] = phase === 'dawn' ? 1 : accumulated > 0 ? normalized[phase] / accumulated : 0;
  }
  return alphas;
}

export function interpolateWeights(from, to, progress) {
  const start = normalizeWeights(from), end = normalizeWeights(to), t = Math.max(0, Math.min(1, progress));
  return Object.fromEntries(PHASES.map((phase) => [phase, start[phase] + (end[phase] - start[phase]) * t]));
}

function releaseVideo(video) {
  if (video) { video.pause(); video.removeAttribute('src'); video.load(); }
}

/** Decode before revealing; retain the old scene through every scene transition. */
export class SceneView {
  constructor(host) {
    this.host = host; this.token = 0; this.weights = normalizeWeights({ noon: 1 });
    this.displayWeights = { ...this.weights }; this.ready = false;
    this.sceneTransitioning = false; this.phaseAnimating = false; this.phaseFrame = null;
  }
  get transitioning() { return this.sceneTransitioning || this.phaseAnimating; }
  async show(scene) {
    const token = ++this.token;
    this.pendingVideo?.abort();
    clearTimeout(this.transitionTimer); this.sceneTransitioning = true;
    const deck = document.createElement('div'); deck.className = 'scene-deck'; deck.dataset.scene = scene.id;
    if (scene.photoReal) deck.classList.add('photographic-scene');
    const photo = document.createElement('div'); photo.className = 'scene-photo'; deck.append(photo);
    if (scene.interior === 'office') {
      // The real city photograph is unchanged; the separately rendered window
      // foreground supplies the requested view from inside an office.
      const interior = document.createElement('div'); interior.className = 'office-interior'; interior.setAttribute('aria-hidden', 'true');
      for (const part of ['office-reveal', 'office-mullion', 'office-sill', 'office-glass']) {
        const element = document.createElement('div'); element.className = part; interior.append(element);
      }
      deck.append(interior);
    }
    const images = [];
    try {
      if (scene.variants) {
        deck.classList.add('has-phases');
        const layers = document.createElement('div'); layers.className = 'phase-layers';
        for (const phase of PHASES) {
          const image = new Image(); image.src = scene.variants[phase]; image.alt = scene.alt; image.dataset.phase = phase; image.className = 'phase-image';
          // Interpolate weights, never independently interpolate derived alphas:
          // doing so exposes unrelated lower photographs during a phase change.
          image.style.transition = 'none';
          if (phase !== 'noon') image.setAttribute('aria-hidden', 'true');
          layers.append(image); images.push(image);
        }
        photo.append(layers);
      } else if (scene.isVideo) {
        const video = document.createElement('video'); video.muted = true; video.loop = true; video.playsInline = true; video.preload = 'auto'; video.className = 'scene-video';
        photo.append(video);
        await new Promise((resolve, reject) => {
          let settled = false;
          const finish = (error) => {
            if (settled) return; settled = true;
            clearTimeout(timer); video.onloadeddata = null; video.onerror = null;
            if (this.pendingVideo?.token === token) this.pendingVideo = null;
            if (error) reject(error); else resolve();
          };
          const timer = setTimeout(() => finish(new Error('Video loading timed out')), 12000);
          this.pendingVideo = { token, abort: () => finish(new Error('Scene request superseded')) };
          video.onloadeddata = () => finish();
          video.onerror = () => finish(new Error('Video could not be decoded'));
          video.src = scene.image;
        });
      } else if (scene.image) {
        const image = new Image(); image.src = scene.image; image.alt = scene.alt; image.className = 'scene-image'; photo.append(image); images.push(image); deck.classList.add('graded-scene');
      } else deck.classList.add('procedural-deck');
      await Promise.all(images.map((image) => image.decode()));
    } catch (error) {
      releaseVideo(deck.querySelector('video'));
      if (token !== this.token) return false;
      this.sceneTransitioning = false; throw error;
    }
    if (token !== this.token) { releaseVideo(deck.querySelector('video')); return false; }
    const old = this.current;
    if (old) {
      // Preserve an outgoing procedural landscape before the shared live canvas
      // changes to a photographic scene. Snapshotting is optional.
      if (old.classList.contains('procedural-deck')) {
        const source = document.getElementById('atmosphere');
        if (source?.width && source?.height) {
          try {
            const snapshot = document.createElement('canvas'); snapshot.width = source.width; snapshot.height = source.height;
            snapshot.getContext('2d').drawImage(source, 0, 0);
            Object.assign(snapshot.style, { position: 'absolute', inset: '0', width: '100%', height: '100%' });
            snapshot.setAttribute('aria-hidden', 'true'); old.querySelector('.scene-photo').append(snapshot);
          } catch { /* A snapshot failure must never block a scene change. */ }
        }
      }
      old.querySelectorAll('[id]').forEach((element) => element.removeAttribute('id')); old.setAttribute('aria-hidden', 'true');
    }
    const mainImage = deck.querySelector('[data-phase="noon"], .scene-image'); if (mainImage) mainImage.id = 'scene-image';
    const layers = deck.querySelector('.phase-layers'); if (layers) layers.id = 'scene-layers';
    const video = deck.querySelector('video'); if (video) video.id = 'scene-video';
    this.current = deck; this.scene = scene; this.ready = true;
    this.host.append(deck); this.applyWeights(this.displayWeights);
    // Only the incoming deck fades. Its predecessor stays opaque underneath,
    // including when another scene is selected before the prior fade finishes.
    deck.getBoundingClientRect(); deck.classList.add('is-visible');
    if (old) {
      old.querySelector('video')?.pause();
      setTimeout(() => { old.remove(); releaseVideo(old.querySelector('video')); }, 1100);
    }
    this.transitionTimer = setTimeout(() => { if (token === this.token) this.sceneTransitioning = false; }, 1000);
    return true;
  }
  applyWeights(weights) {
    if (!this.current) return;
    const alphas = weightsToAlphas(weights);
    for (const phase of PHASES) {
      const image = this.current.querySelector('[data-phase="' + phase + '"]'); if (!image) continue;
      image.style.opacity = String(alphas[phase]); image.dataset.weight = String(weights[phase] || 0);
    }
  }
  setWeights(weights) {
    const target = normalizeWeights(weights);
    const unchanged = PHASES.every((phase) => Math.abs(target[phase] - this.weights[phase]) < 0.000001);
    this.weights = target;
    if (!this.current?.classList.contains('has-phases')) {
      cancelAnimationFrame(this.phaseFrame); this.phaseFrame = null; this.phaseAnimating = false;
      this.displayWeights = { ...target }; this.applyWeights(target); return;
    }
    if (unchanged) { this.applyWeights(this.displayWeights); return; }
    cancelAnimationFrame(this.phaseFrame); this.phaseFrame = null;
    const duration = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : document.body.classList.contains('scrubbing') ? 100 : 800;
    if (!duration) {
      this.displayWeights = { ...target }; this.phaseAnimating = false; this.applyWeights(target); return;
    }
    const start = { ...this.displayWeights }, started = performance.now();
    this.phaseAnimating = true;
    const step = (now) => {
      const progress = Math.min(1, Math.max(0, (now - started) / duration));
      const eased = progress * progress * (3 - 2 * progress);
      this.displayWeights = interpolateWeights(start, target, eased); this.applyWeights(this.displayWeights);
      if (progress < 1) this.phaseFrame = requestAnimationFrame(step);
      else { this.phaseFrame = null; this.phaseAnimating = false; }
    };
    this.phaseFrame = requestAnimationFrame(step);
  }
  setMotion(enabled) {
    this.motion = enabled;
    this.current?.classList.toggle('motion', enabled && this.scene.kind === '动态' && !this.scene.photoReal && !this.scene.variants && !this.scene.isVideo);
    const video = this.current?.querySelector('video');
    if (video) {
      if (enabled && !document.hidden) video.play().catch(() => {}); else video.pause();
    }
  }
  diagnostics() {
    const layers = [...(this.current?.querySelectorAll('[data-phase]') || [])].map((image) => ({ phase: image.dataset.phase, loaded: image.complete && image.naturalWidth > 0, opacity: Number(image.style.opacity), weight: Number(image.dataset.weight) }));
    const image = this.current?.querySelector('img'), video = this.current?.querySelector('video');
    return { imageLoaded: this.ready && (layers.length ? layers.every((layer) => layer.loaded) : image ? image.complete && image.naturalWidth > 0 : video ? video.readyState >= 2 : true), layerImages: layers, transitioning: this.transitioning, phaseAnimating: this.phaseAnimating };
  }
}
