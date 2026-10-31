// 镜头：方向键移动地图，左键旋转、右键平移、滚轮缩放，外加预设视角飞行、电影漫游、沿路线行走和第一人称游览。

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// 与 OrbitControls 的方向键一致：上键朝画面上方移动，左右键横向移动。
const ARROWS = { ArrowUp: [0, 1], ArrowDown: [0, -1], ArrowLeft: [1, 0], ArrowRight: [-1, 0] };
const WALK_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD']);
export const WALK_EYE = 1.65;
const WALK_SPEED = 4.6;
const WALK_SPRINT = 12;

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
    this._keys = new Set();
    this._onKeyDown = (e) => this._key(e, true);
    this._onKeyUp = (e) => this._key(e, false);
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', () => {
      this._keys.clear();
      this._lookDrag = false;
    });
    this.walking = false;
    this.walkProbe = null;
    this._yaw = 0;
    this._pitch = -0.08;
    this._lookDrag = false;
    this._fwd = new THREE.Vector3();
    this._onPointerDown = (e) => {
      if (!this.walking || e.button !== 0) return;
      this._lookDrag = true;
      dom.setPointerCapture?.(e.pointerId);
    };
    this._onPointerMove = (e) => {
      if (!this._lookDrag) return;
      this._yaw += e.movementX * 0.0022;
      this._pitch = Math.max(-1.02, Math.min(0.75, this._pitch - e.movementY * 0.0016));
    };
    this._onPointerUp = () => {
      this._lookDrag = false;
    };
    dom.addEventListener('pointerdown', this._onPointerDown);
    window.addEventListener('pointermove', this._onPointerMove);
    window.addEventListener('pointerup', this._onPointerUp);
    window.addEventListener('pointercancel', this._onPointerUp);
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
    this.releaseWalk();
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
    this.releaseWalk();
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
    this.releaseWalk();
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
  // 落到注视点附近的人眼高度。找不到落脚点时保持当前视角。
  setWalk(on) {
    if (!!on === this.walking) return this.walking;
    if (!on) {
      this.releaseWalk();
      return false;
    }
    const spot = this._findStand(this.controls.target.x, this.controls.target.z) || this._findStand(this.camera.position.x, this.camera.position.z);
    if (!spot) return false;
    const dx = this.controls.target.x - this.camera.position.x;
    const dz = this.controls.target.z - this.camera.position.z;
    this.tween = null;
    this.cine = null;
    this._dropPath();
    this.controls.autoRotate = false;
    this.onInterrupt?.();
    this._yaw = Math.hypot(dx, dz) > 1 ? Math.atan2(dx, dz) : 0;
    this._pitch = -0.08;
    this.camera.position.set(spot.x, spot.y + WALK_EYE, spot.z);
    this.walking = true;
    this.controls.enabled = false;
    this._clearOrbitDelta();
    this._aim();
    this.onWalkChange?.(true);
    return true;
  }
  releaseWalk() {
    if (!this.walking) return;
    this.walking = false;
    this._lookDrag = false;
    this.controls.enabled = true;
    this._clearOrbitDelta();
    this._aim();
    this.controls.update();
    this.onWalkChange?.(false);
  }
  _clearOrbitDelta() {
    this.controls._sphericalDelta?.set(0, 0, 0);
    this.controls._panOffset?.set(0, 0, 0);
  }
  _findStand(x, z) {
    const probe = this.walkProbe;
    if (!probe) return null;
    const direct = probe(x, z);
    if (direct != null) return { x, z, y: direct };
    for (let k = 1; k <= 1100; k++) {
      const a = k * 2.399;
      const r = Math.sqrt(k) * 4.2;
      const nx = x + Math.cos(a) * r;
      const nz = z + Math.sin(a) * r;
      const y = probe(nx, nz);
      if (y != null) return { x: nx, z: nz, y };
    }
    return null;
  }
  _aim() {
    const cp = Math.cos(this._pitch);
    this._fwd.set(Math.sin(this._yaw) * cp, Math.sin(this._pitch), Math.cos(this._yaw) * cp);
    this.controls.target.copy(this.camera.position).addScaledVector(this._fwd, 8);
    this.camera.lookAt(this.controls.target);
  }
  _stand(x, z) {
    const y = this.walkProbe?.(x, z);
    if (y == null) return false;
    this.camera.position.x = x;
    this.camera.position.z = z;
    this.camera.position.y = y + WALK_EYE;
    return true;
  }
  _step(sx, sz) {
    const p = this.camera.position;
    if (this._stand(p.x + sx, p.z + sz)) return;
    const z = p.z;
    this._stand(p.x + sx, z);
    this._stand(p.x, z + sz);
  }
  _walk(dt) {
    const turn = (this._keys.has('ArrowRight') ? 1 : 0) - (this._keys.has('ArrowLeft') ? 1 : 0);
    this._yaw += turn * 1.7 * dt;
    const sin = Math.sin(this._yaw);
    const cos = Math.cos(this._yaw);
    let x = 0;
    let z = 0;
    if (this._keys.has('ArrowUp') || this._keys.has('KeyW')) {
      x += sin;
      z += cos;
    }
    if (this._keys.has('ArrowDown') || this._keys.has('KeyS')) {
      x -= sin;
      z -= cos;
    }
    if (this._keys.has('KeyD')) {
      x += cos;
      z -= sin;
    }
    if (this._keys.has('KeyA')) {
      x -= cos;
      z += sin;
    }
    const len = Math.hypot(x, z);
    if (len > 0) {
      const sprint = this._keys.has('ShiftLeft') || this._keys.has('ShiftRight');
      const dist = (sprint ? WALK_SPRINT : WALK_SPEED) * dt;
      const steps = Math.max(1, Math.ceil(dist / 0.3));
      const sx = (x / len) * (dist / steps);
      const sz = (z / len) * (dist / steps);
      for (let i = 0; i < steps; i++) this._step(sx, sz);
    }
    const y = this.walkProbe?.(this.camera.position.x, this.camera.position.z);
    if (y != null) this.camera.position.y = y + WALK_EYE;
    this._aim();
  }
  _key(e, down) {
    const el = e.target;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.isContentEditable)) return;
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
      if (down) this._keys.add(e.code);
      else this._keys.delete(e.code);
      return;
    }
    if (!WALK_KEYS.has(e.code)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (!this.walking && (e.shiftKey || !ARROWS[e.code])) return;
    e.preventDefault();
    if (down) this._keys.add(e.code);
    else this._keys.delete(e.code);
  }
  _moveKeys(dt) {
    if (!this._keys.size || this.walking) return;
    let x = 0;
    let y = 0;
    for (const code of this._keys) {
      const d = ARROWS[code];
      if (!d) continue;
      x += d[0];
      y += d[1];
    }
    if (!x && !y) return;
    const c = this.controls;
    if (this.tween || this.cine || this.path || c.autoRotate) {
      this.onInterrupt?.();
      this.tween = null;
      this.cine = null;
      this._dropPath();
      c.autoRotate = false;
    }
    const len = Math.hypot(x, y) || 1;
    const px = (c.domElement?.clientHeight || 800) * 0.85 * dt;
    c._pan((x / len) * px, (y / len) * px);
  }
  update(dt) {
    if (this.walking) {
      this._walk(dt);
      return;
    }
    this._moveKeys(dt);
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
