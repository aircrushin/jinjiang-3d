// 镜头：OrbitControls（旋转 / 平移 / 缩放）+ 预设视角平滑飞行 + 电影漫游路径 + 沿路线行走。

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);


export class CameraRig {
  constructor(camera, dom) {
    this.camera = camera;
    const c = (this.controls = new OrbitControls(camera, dom));
    c.enableDamping = true;
    c.dampingFactor = 0.08;
    c.screenSpacePanning = false;
    // 允许略微仰视（街景仰望高楼），相机本身由主循环限制在地面以上
    c.maxPolarAngle = Math.PI * 0.56;
    c.minDistance = 4;
    c.maxDistance = 16000;
    c.zoomToCursor = true;
    c.rotateSpeed = 0.55;
    c.panSpeed = 1.0;
    c.zoomSpeed = 1.15;
    c.autoRotateSpeed = 0.35;
    c.addEventListener('start', () => {
      if (this.tween || this.cine || this.path || c.autoRotate) this.onInterrupt?.();
      this.tween = null;
      this.cine = null;
      this._dropPath();
      c.autoRotate = false;
    });
    this.tween = null;
    this.cine = null;
    this.path = null;
    this._p = new THREE.Vector3();
    this._q = new THREE.Vector3();
    this._r = new THREE.Vector3();
  }
  flyTo(pos, target, dur = 1.9, after = null) {
    this.cine = null;
    this._dropPath();
    this.controls.autoRotate = false;
    const d = this.camera.position.distanceTo(pos);
    this.tween = { t: 0, dur: dur * Math.min(1.25, 0.7 + d / 4000), p0: this.camera.position.clone(), p1: pos.clone(), q0: this.controls.target.clone(), q1: target.clone(), lift: Math.min(900, d * 0.18), after };
  }
  orbit(target, pos) {
    this.flyTo(pos, target, 1.6, () => {
      this.controls.autoRotate = true;
    });
  }
  cinematic(points, looks, duration) {
    this.tween = null;
    this._dropPath();
    this.controls.autoRotate = false;
    this.cine = { t: 0, duration, path: new THREE.CatmullRomCurve3(points, true, 'centripetal'), look: new THREE.CatmullRomCurve3(looks, true, 'centripetal') };
  }
  // 沿折线走一段。from/to 是水平里程，holds 在站点处暂停。拖动画面会取消。
  followPath(samples, opts = {}) {
    if (!samples || samples.length < 2) {
      opts.after?.();
      return;
    }
    this.tween = null;
    this.cine = null;
    this.controls.autoRotate = false;
    this.controls.minDistance = 1;
    const cum = [0];
    for (let i = 1; i < samples.length; i++) cum.push(cum[i - 1] + Math.hypot(samples[i].x - samples[i - 1].x, samples[i].z - samples[i - 1].z));
    const total = cum[cum.length - 1] || 1;
    const from = opts.from ?? 0;
    const to = opts.to ?? total;
    const holds = (opts.holds || []).filter((h) => h.dist > from + 0.4 && h.dist <= to + 0.4).sort((a, b) => a.dist - b.dist);
    this.path = {
      samples,
      cum,
      total,
      from,
      to,
      dist: from,
      duration: Math.max(0.4, opts.duration || 1),
      holds,
      hi: 0,
      hold: opts.holdStart || 0,
      onEvent: opts.onEvent,
      after: opts.after,
      eye: opts.eye ?? 2.05,
      ahead: opts.ahead ?? 18,
    };
    if (opts.startId) opts.onEvent?.({ type: 'stop', id: opts.startId });
    this._placeOnPath(this.path);
  }
  _dropPath() {
    this.path = null;
    this.controls.minDistance = 4;
  }
  _sample(cum, samples, dist, out) {
    const total = cum[cum.length - 1] || 0;
    const d = Math.max(0, Math.min(total, dist));
    if (d <= 0) {
      out.copy(samples[0]);
      return;
    }
    let lo = 1;
    let hi = cum.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] < d) lo = mid + 1;
      else hi = mid;
    }
    const span = cum[lo] - cum[lo - 1] || 1;
    const t = (d - cum[lo - 1]) / span;
    out.lerpVectors(samples[lo - 1], samples[lo], t);
  }
  _placeOnPath(p) {
    this._sample(p.cum, p.samples, p.dist, this._p);
    this._sample(p.cum, p.samples, Math.min(p.total, p.dist + p.ahead), this._q);
    if (this._p.distanceTo(this._q) < p.ahead * 0.85) {
      this._sample(p.cum, p.samples, Math.max(0, p.dist - 6), this._r);
      const dx = this._p.x - this._r.x;
      const dz = this._p.z - this._r.z;
      const len = Math.hypot(dx, dz) || 1;
      this._q.set(this._p.x + (dx / len) * p.ahead, this._p.y, this._p.z + (dz / len) * p.ahead);
    }
    this._p.y += p.eye;
    this._q.y += p.eye;
    this.camera.position.copy(this._p);
    this.controls.target.copy(this._q);
  }
  get busy() {
    return !!(this.tween || this.cine || this.path);
  }
  update(dt) {
    const c = this.controls;
    if (this.tween) {
      const tw = this.tween;
      tw.t += dt;
      const k = ease(Math.min(1, tw.t / tw.dur));
      this._p.lerpVectors(tw.p0, tw.p1, k);
      this._p.y += Math.sin(Math.PI * k) * tw.lift;
      this._q.lerpVectors(tw.q0, tw.q1, k);
      this.camera.position.copy(this._p);
      c.target.copy(this._q);
      if (k >= 1) {
        this.tween = null;
        tw.after?.();
      }
    } else if (this.path) {
      const p = this.path;
      let finished = false;
      if (p.hold > 0) {
        p.hold = Math.max(0, p.hold - dt);
        if (p.hold === 0 && p.dist >= p.to - 0.05) finished = true;
      } else {
        p.dist += ((p.to - p.from) / p.duration) * dt;
        if (p.hi < p.holds.length && p.dist >= p.holds[p.hi].dist) {
          p.dist = p.holds[p.hi].dist;
          p.hold = p.holds[p.hi].time;
          const id = p.holds[p.hi].id;
          p.hi += 1;
          p.onEvent?.({ type: 'stop', id });
          if (p.hold <= 0 && p.dist >= p.to - 0.05) finished = true;
        } else if (p.dist >= p.to) {
          p.dist = p.to;
          finished = true;
        }
      }
      this._placeOnPath(p);
      if (finished) {
        const after = p.after;
        this._dropPath();
        after?.();
      }
    } else if (this.cine) {
      const cn = this.cine;
      cn.t = (cn.t + dt / cn.duration) % 1;
      cn.path.getPointAt(cn.t, this._p);
      cn.look.getPointAt(cn.t, this._q);
      this.camera.position.copy(this._p);
      c.target.copy(this._q);
    }
    c.update(dt);
    if (c.target.y < 0) c.target.y = 0;
    if (this.camera.position.y < 1.4) this.camera.position.y = 1.4;
  }
}
