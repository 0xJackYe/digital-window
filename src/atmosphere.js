const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const rgb = (v, alpha = 1) => `rgba(${v.join(',')},${alpha})`;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));

/** All animation is local, with a capped frame rate and a single canvas. */
export class Atmosphere {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: true });
    this.scene = 'lake';
    this.motion = true;
    this.solar = { daylight: 1, twilight: 0, altitude: 40, phase: 'day' };
    this.celestial = null; this.lighting = null; this.lastDraw = null;
    this.stars = Array.from({ length: 100 }, (_, i) => ({ x: this.random(i * 5 + 1), y: this.random(i * 5 + 2) * .4, r: .4 + this.random(i * 5 + 3) * 1.1, phase: this.random(i * 5 + 4) * 6 }));
    this.ready = false;
    this.resize = this.resize.bind(this);
    this.loop = this.loop.bind(this);
    window.addEventListener('resize', this.resize);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { cancelAnimationFrame(this.frame); this.frame = null; }
      else this.schedule();
    });
    this.resize();
  }
  random(n) { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    const scale = Math.min(window.devicePixelRatio || 1, 1.5);
    this.canvas.width = Math.round(this.width * scale);
    this.canvas.height = Math.round(this.height * scale);
    this.ctx.setTransform(scale, 0, 0, scale, 0, 0);
    this.draw(this.lastTime || 0);
  }
  update({ scene = this.scene, solar = this.solar, motion = this.motion, celestial = this.celestial, lighting = this.lighting } = {}) {
    this.scene = scene;
    this.solar = solar;
    this.celestial = celestial; this.lighting = lighting;
    this.motion = motion;
    if (!motion) { cancelAnimationFrame(this.frame); this.frame = null; this.draw(0); }
    else this.schedule();
  }
  schedule() {
    if (!this.frame && this.motion && !document.hidden) this.frame = requestAnimationFrame(this.loop);
  }
  loop(now) {
    this.frame = null;
    if (document.hidden || !this.motion) return;
    if (!this.lastFrame || now - this.lastFrame >= 1000 / 24) {
      this.lastFrame = now;
      this.lastTime = now / 1000;
      this.draw(this.lastTime);
    }
    this.schedule();
  }
  draw(time) {
    const c = this.ctx, w = this.width, h = this.height;
    this.lastDraw = { scene: this.scene, time, sunDrawn: false, moonDrawn: false, glintSources: [], terrainLight: [] };
    c.clearRect(0, 0, w, h);
    if (this.scene === 'procedural') this.drawLandscape(time);
    else this.drawPhotoAtmosphere(time);
    this.ready = true;
  }
  drawStars(time, maxY = .36) {
    const { ctx: c, width: w, height: h } = this;
    const night = 1 - clamp((this.solar.altitude + 14) / 9);
    if (!night) return;
    for (const star of this.stars) {
      if (star.y > maxY) continue;
      const a = night * (.35 + .35 * Math.sin(time * .35 + star.phase));
      c.beginPath(); c.arc(star.x * w, star.y * h, star.r, 0, Math.PI * 2); c.fillStyle = `rgba(230,239,244,${a})`; c.fill();
    }
  }
  drawPhotoAtmosphere(time) {
    const { ctx: c, width: w, height: h, solar: s } = this;
    if (['manhattan', 'medieval', 'kyoto', 'fuji'].includes(this.scene)) {
      // Registered photographic light states supply their own lamps, stars and
      // shadows. Keep the animated atmosphere restrained and out of the city.
      if (!this.motion) return;
      for (let i = 0; i < 3; i++) {
        const x = ((i * w * .6 + time * (1 + i * .25)) % (w * 1.8)) - w * .4;
        c.save(); c.translate(x, h * .07); c.scale(1, .065);
        const haze = c.createRadialGradient(0, 0, 0, 0, 0, w * .42);
        haze.addColorStop(0, `rgba(226,234,235,${.012 + s.daylight * .012})`);
        haze.addColorStop(1, 'rgba(226,234,235,0)');
        c.fillStyle = haze; c.fillRect(-w * .42, -w * .42, w * .84, w * .84); c.restore();
      }
      if (this.scene === 'fuji') {
        for (let i = 0; i < 18; i++) {
          const y = h * (.65 + i * .017), x = this.random(i + 321) * w + Math.sin(time * .24 + i) * 8;
          c.beginPath(); c.moveTo(x, y); c.lineTo(x + 13 + i * 1.5, y);
          c.strokeStyle = `rgba(227,237,235,${.009 + s.daylight * .017})`; c.lineWidth = .7; c.stroke();
        }
      }
      return;
    }
    if (this.scene === 'forest' || this.scene === 'custom') return;
    this.drawStars(time, this.scene === 'lake' ? .14 : .3);
    const source = this.lighting?.sun;
    if (source?.visible && source.inFrame && source.aboveHorizon) {
      const x = source.screenX * w, y = source.screenY * h;
      const glare = c.createRadialGradient(x, y, 0, x, y, w * .42);
      const gain = Math.max(0, source.strength || 0);
      glare.addColorStop(0, rgb([255, 222, 166], gain * .27));
      glare.addColorStop(.35, rgb([255, 221, 173], gain * .07));
      glare.addColorStop(1, 'rgba(255,230,190,0)');
      c.fillStyle = glare; c.fillRect(0, 0, w, h);
    }
    if (!this.motion) return;
    // Soft low mist moves independently of the photograph, without moving the interface.
    const fogY = this.scene === 'lake' ? .63 : .69;
    for (let i = 0; i < 5; i++) {
      const cx = ((this.random(i + 17) * w + time * (1.7 + i * .4)) % (w * 1.7)) - w * .35;
      const cy = h * (fogY + Math.sin(time * .023 + i) * .025);
      c.save(); c.translate(cx, cy); c.scale(1, .11);
      const r = w * .36;
      const fog = c.createRadialGradient(0, 0, 0, 0, 0, r);
      fog.addColorStop(0, `rgba(216,232,224,${(.035 + s.twilight * .025) * (.3 + s.daylight * .7)})`);
      fog.addColorStop(1, 'rgba(216,232,224,0)');
      c.fillStyle = fog; c.fillRect(-r, -r, r * 2, r * 2); c.restore();
    }
    if (s.daylight > .3) this.drawBirds(time, .24, .45);
    if (this.scene === 'coast') {
      for (let i = 0; i < 10; i++) {
        const py = h * (.62 + i * .033);
        c.beginPath();
        for (let k = 0; k <= 35; k++) {
          const px = w * k / 35;
          const yy = py + Math.sin(k * .4 + time * .7 + i) * (2 + i * .5);
          if (!k) c.moveTo(px, yy); else c.lineTo(px, yy);
        }
        c.strokeStyle = `rgba(245,255,247,${.016 * s.daylight})`; c.lineWidth = 1; c.stroke();
      }
    }
  }
  drawBirds(time, top, alpha) {
    const { ctx: c, width: w, height: h } = this;
    for (let i = 0; i < 4; i++) {
      const x = ((time * 11 + i * 21) % (w + 300)) - 150;
      const y = h * top + i * 11 + Math.sin(time * .35 + i) * 7;
      const wing = Math.sin(time * 3.1 + i * .7) * 2.2;
      c.beginPath(); c.moveTo(x - 4, y - wing); c.quadraticCurveTo(x - 1, y - 3, x, y); c.quadraticCurveTo(x + 1, y - 3, x + 4, y - wing);
      c.strokeStyle = `rgba(20,43,44,${alpha})`; c.lineWidth = 1; c.stroke();
    }
  }
  shadeSurface(base, normal) {
    const length = Math.hypot(...normal) || 1, n = normal.map((value) => value / length);
    const ambient = this.lighting?.ambient;
    const ambientGain = ambient ? .5 + ambient.intensity * .7 : .65;
    const color = base.map((value, index) => value * ambientGain * (ambient ? .65 + ambient.color[index] * .35 : 1));
    for (const name of ['sun', 'moon']) {
      const source = this.lighting?.[name];
      if (!source?.direction || !(source.strength > 0) || !(source.altitude > 0)) continue;
      const lambert = Math.max(0, n.reduce((sum, value, index) => sum + value * source.direction[index], 0));
      const gain = source.strength * lambert;
      for (let channel = 0; channel < 3; channel++) color[channel] += 255 * gain * (source.color?.[channel] ?? 1);
    }
    return color.map((value) => Math.round(clamp(value, 0, 255)));
  }
  drawCelestialBodies(horizon) {
    const { ctx: c, width: w, height: h } = this;
    const camera = this.lighting?.camera;
    if (!camera) return;
    for (const name of ['sun', 'moon']) {
      const source = this.lighting[name];
      if (!source?.visible || !source.inFrame || !source.aboveHorizon || !(source.altitude > 0)) continue;
      const opacity = clamp(source.visibility ?? 1);
      if (opacity <= .000001) continue;
      const x = source.screenX * w, y = source.screenY * h;
      const angularRadius = name === 'moon' ? this.celestial?.moon?.angularRadius ?? source.angularRadius ?? .25 : source.angularRadius ?? .2666;
      const radius = Math.max(1.2, Math.min(w * .012, w * Math.tan(angularRadius * Math.PI / 180) /
        (2 * Math.tan(camera.fieldOfView * Math.PI / 360) * Math.max(.15, source.direction[2]))));
      const glowRadius = name === 'sun' ? w * .15 : radius * 6;
      const glow = c.createRadialGradient(x, y, radius * .7, x, y, glowRadius);
      glow.addColorStop(0, rgb(name === 'sun' ? [255, 220, 161] : [194, 216, 244], (name === 'sun' ? .16 : .08) * opacity));
      glow.addColorStop(1, 'rgba(220,230,240,0)');
      c.fillStyle = glow; c.fillRect(0, 0, w, horizon);
      c.save(); c.translate(x, y); c.globalAlpha = opacity;
      if (name === 'sun') {
        c.beginPath(); c.arc(0, 0, radius, 0, Math.PI * 2);
        c.fillStyle = rgb(mix([255, 176, 108], [255, 246, 215], this.solar.daylight)); c.fill();
        this.lastDraw.sunDrawn = true;
      } else {
        const moon = this.celestial?.moon || source, illumination = clamp(moon.illumination ?? source.illumination ?? 0);
        if (illumination > .00001) {
          // A lit spherical disk: outer limb is a semicircle, terminator is an
          // ellipse scaled by (1 - 2f), giving exactly f of the disk's area.
          const tilt = (moon.brightLimbAngle ?? source.brightLimbAngle ?? 0) - (moon.parallacticAngle ?? source.parallacticAngle ?? 0);
          c.rotate((tilt - 90) * Math.PI / 180);
          const terminator = 1 - 2 * illumination;
          c.beginPath();
          for (let i = 0; i <= 40; i++) {
            const py = -radius + i / 40 * radius * 2, px = Math.sqrt(Math.max(0, radius * radius - py * py));
            if (!i) c.moveTo(px, py); else c.lineTo(px, py);
          }
          for (let i = 40; i >= 0; i--) {
            const py = -radius + i / 40 * radius * 2;
            c.lineTo(terminator * Math.sqrt(Math.max(0, radius * radius - py * py)), py);
          }
          c.closePath(); c.fillStyle = '#dfe8f2'; c.fill();
          this.lastDraw.moonDrawn = true; this.lastDraw.moonIllumination = illumination; this.lastDraw.moonTilt = tilt;
        }
      }
      c.restore();
    }
  }
  drawWaterReflections(time, horizon) {
    const { ctx: c, width: w, height: h } = this, camera = this.lighting?.camera;
    if (!camera) return;
    const tanH = Math.tan(camera.fieldOfView * Math.PI / 360), tanV = Math.tan(camera.verticalFieldOfView * Math.PI / 360);
    for (const name of ['sun', 'moon']) {
      const source = this.lighting[name];
      if (!source?.visible || !source.inFrame || !source.aboveHorizon || !(source.altitude > 0) || !(source.specular > 0)) continue;
      const [lx, ly, lz] = source.direction;
      // Reflect incoming rays off a horizontal water normal [0,1,0].
      const reflection = [-lx, ly, -lz];
      let drawn = false;
      for (let i = 0; i < 76; i++) {
        const p = (i + .5) / 76, py = horizon + p * (h - horizon);
        const jitter = this.motion ? Math.sin(i * 2.1 + time * .8) * (1 + p * 7) : 0;
        const px = source.screenX * w + jitter;
        const ray = [(px / w - .5) * 2 * tanH, (camera.horizon - py / h) * 2 * tanV, 1];
        const length = Math.hypot(...ray);
        const alignment = Math.max(0, reflection.reduce((sum, value, index) => sum - value * ray[index] / length, 0));
        const specular = Math.pow(alignment, 56) * source.specular;
        const alpha = clamp(specular * 1.8 * (1 - p * .4));
        if (alpha < .0003) continue;
        const halfLength = (2 + this.random(i + 740) * w * .025) * (.2 + p);
        c.beginPath(); c.moveTo(px - halfLength, py); c.lineTo(px + halfLength, py);
        c.strokeStyle = rgb(name === 'sun' ? [255, 222, 166] : [194, 215, 244], alpha); c.lineWidth = .6 + p; c.stroke(); drawn = true;
      }
      if (drawn) this.lastDraw.glintSources.push(name);
    }
  }
  drawLandscape(time) {
    const { ctx: c, width: w, height: h, solar: s } = this;
    const d = s.daylight, twilight = s.twilight, horizon = h * .53;
    const top = mix([10, 19, 40], [105, 160, 185], d);
    const low = mix(mix([37, 48, 70], [224, 177, 141], twilight * .72), [203, 220, 209], d);
    const sky = c.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, rgb(top)); sky.addColorStop(1, rgb(low));
    c.fillStyle = sky; c.fillRect(0, 0, w, h);
    this.drawStars(time); this.drawCelestialBodies(horizon);
    for (let i = 0; i < 6; i++) {
      const x = ((i * w * .27 + time * (1.3 + i * .14)) % (w * 1.6)) - w * .3;
      const y = h * (.12 + this.random(i + 50) * .19);
      c.save(); c.translate(x, y); c.scale(1, .085);
      const cloud = c.createRadialGradient(0, 0, 0, 0, 0, w * .25);
      cloud.addColorStop(0, rgb([233, 236, 222], .04 + .11 * d)); cloud.addColorStop(1, 'rgba(233,236,222,0)');
      c.fillStyle = cloud; c.fillRect(-w * .25, -w * .25, w * .5, w * .5); c.restore();
    }
    const triangle = (points, color, alpha = 1) => {
      c.beginPath(); points.forEach(([x, y], i) => i ? c.lineTo(x * w, y * h) : c.moveTo(x * w, y * h));
      c.closePath(); c.fillStyle = rgb(color, alpha); c.fill();
    };
    const drawMountains = (reflection = false) => {
      for (let layer = 0; layer < 4; layer++) {
        const ridge = [[-.05, .52], [.04, .37], [.13, .4], [.23, .23], [.31, .34], [.39, .28], [.47, .4], [.57, .32], [.68, .19], [.77, .32], [.85, .29], [.95, .42], [1.05, .36]]
          .map(([x, y], i) => [x, y + layer * .065 + Math.sin(i * 2.3 + layer) * layer * .021]);
        const base = mix([18 + layer * 2, 28 + layer * 3, 40 + layer * 2], [125 - layer * 23, 153 - layer * 23, 148 - layer * 20], d);
        const centerColor = this.shadeSurface(base, [0, .6, -.8]);
        c.beginPath(); c.moveTo(-10, horizon); ridge.forEach(([x, y]) => c.lineTo(x * w, y * h));
        c.lineTo(w + 10, horizon + 5); c.lineTo(-10, horizon + 5); c.closePath(); c.fillStyle = rgb(centerColor, reflection ? .42 : 1); c.fill();
        const leftColor = this.shadeSurface(base, [-.68, .58, -.45]), rightColor = this.shadeSurface(base, [.68, .58, -.45]);
        if (!reflection) this.lastDraw.terrainLight.push({ layer, left: leftColor, right: rightColor });
        for (let i = 1; i < ridge.length - 1; i++) {
          const peak = ridge[i], left = ridge[i - 1], right = ridge[i + 1];
          if (peak[1] >= left[1] || peak[1] >= right[1] || peak[1] >= .53) continue;
          const foot = [peak[0] + .015, .53];
          triangle([left, peak, foot], leftColor, reflection ? .42 : .9);
          triangle([peak, right, foot], rightColor, reflection ? .42 : .9);
        }
        if (layer === 0) {
          for (const [px, py] of [[.23, .23], [.68, .19]]) {
            const snow = mix([63, 76, 91], [218, 226, 212], d), foot = [px + .008, py + .068];
            triangle([[px - .043, py + .065], [px, py], foot], this.shadeSurface(snow, [-.6, .75, -.28]), reflection ? .3 : 1);
            triangle([[px, py], [px + .06, py + .081], foot], this.shadeSurface(snow, [.6, .75, -.28]), reflection ? .3 : 1);
          }
        }
      }
    };
    drawMountains();
    const water = c.createLinearGradient(0, horizon, 0, h);
    water.addColorStop(0, rgb(this.shadeSurface(mix([22, 40, 57], [100, 143, 139], d), [0, 1, 0])));
    water.addColorStop(1, rgb(this.shadeSurface(mix([8, 25, 36], [42, 90, 96], d), [0, 1, 0])));
    c.fillStyle = water; c.fillRect(0, horizon, w, h - horizon);
    c.save(); c.translate(0, horizon * 2); c.scale(1, -1); drawMountains(true); c.restore();
    for (let i = 0; i < 150; i++) {
      const p = this.random(i + 110), y = horizon + p * (h - horizon);
      const x = this.random(i + 310) * w + Math.sin(time * .3 + i) * (2 + p * 8);
      const length = (3 + this.random(i + 510) * 30) * (.2 + p);
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + length, y);
      c.strokeStyle = rgb([209, 226, 215], (.035 + .06 * d) * p); c.lineWidth = .5 + p; c.stroke();
    }
    this.drawWaterReflections(time, horizon);
    c.fillStyle = rgb(this.shadeSurface(mix([8, 20, 26], [30, 66, 61], d), [0, .7, -.7]));
    c.beginPath(); c.moveTo(0, h * .82); c.quadraticCurveTo(w * .1, h * .87, w * .29, h); c.lineTo(0, h); c.closePath(); c.fill();
    for (let i = 0; i < 22; i++) {
      const x = this.random(i + 900) * w * .16, y = h * (.84 + this.random(i + 930) * .15), size = h * (.045 + this.random(i + 960) * .13);
      c.fillRect(x - 1, y - size, 2, size);
      for (let b = 0; b < 4; b++) {
        c.beginPath(); c.moveTo(x, y - size * (1.3 - b * .21)); c.lineTo(x - size * (.13 + b * .055), y - size * (.75 - b * .19)); c.lineTo(x + size * (.13 + b * .055), y - size * (.75 - b * .19)); c.closePath(); c.fill();
      }
    }
    if (this.motion && d > .3) this.drawBirds(time, .34, .6);
  }
}
