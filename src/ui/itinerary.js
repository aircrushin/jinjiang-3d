// 兴趣行程：选类型、沿街道生成路线、看每站预览，出发前可以用人眼高度走一遍。

import * as THREE from 'three';
import { INTERESTS, PLACES } from '../tour/catalog.js';
import { formatMeters, formatMinutes, planItinerary, pointAt } from '../tour/planner.js';
import { RouteView } from '../tour/routeView.js';

const NAMES = Object.fromEntries(INTERESTS.map((item) => [item.id, item.name]));

const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

export class Itinerary {
  constructor(opts) {
    this.opts = opts;
    this.view = new RouteView();
    opts.scene.add(this.view.group);
    this.body = document.getElementById('route-body');
    this.pinsEl = document.getElementById('route-pins');
    this.selected = new Set();
    this.route = null;
    this.samples = null;
    this.mode = 'plan';
    this.activeId = null;
    this.navIndex = 0;
    this.token = 0;
    this.planning = false;
    this.pinList = [];
    this._v = new THREE.Vector3();
    this.body.innerHTML = `
      <p class="route-lead">选出想逛的类型，沿街道排一条能走的路线。出发前可以先用人眼高度看一遍。</p>
      <div class="interest-row" id="route-interests"></div>
      <button type="button" class="act primary" id="route-go" disabled>生成路线</button>
      <div id="route-result" hidden></div>
    `;
    const row = document.getElementById('route-interests');
    row.innerHTML = INTERESTS.map((item) => `<button type="button" class="interest" data-interest="${item.id}" aria-pressed="false">${item.name}</button>`).join('');
    this.body.addEventListener('click', (e) => this.onClick(e));
    document.getElementById('tab-scenes').onclick = () => this.showTab('scenes');
    document.getElementById('tab-route').onclick = () => this.showTab('route');
    this.syncGo();
  }

  get hasRoute() {
    return !!this.route;
  }

  showTab(which) {
    const route = which === 'route';
    document.getElementById('panel-body').hidden = route;
    document.getElementById('route-body').hidden = !route;
    const scenes = document.getElementById('tab-scenes');
    const tab = document.getElementById('tab-route');
    scenes.classList.toggle('on', !route);
    tab.classList.toggle('on', route);
    scenes.setAttribute('aria-selected', String(!route));
    tab.setAttribute('aria-selected', String(route));
    document.getElementById('panel-kicker').textContent = route ? 'ROUTE' : 'SCENES';
    document.getElementById('panel-title').textContent = route ? '兴趣步行路线' : '锦江区实景场景';
  }

  interestParam() {
    return this.route ? [...this.selected].join(',') : '';
  }

  knownInterest(id) {
    return INTERESTS.some((item) => item.id === id);
  }

  restore(ids, opts = {}) {
    const next = ids.filter((id) => this.knownInterest(id));
    if (!next.length) return;
    this.selected = new Set(next);
    this.syncInterests();
    this.showTab('route');
    const route = this.planNow();
    if (!route) return;
    this.commit(route, opts);
  }

  async generate(opts = {}) {
    if (this.planning) return;
    if (!this.selected.size) {
      this.opts.onToast('先选一个兴趣');
      return;
    }
    if (!this.opts.getCity()?.roads) {
      this.opts.onToast('城市还在载入');
      return;
    }
    this.planning = true;
    this.syncGo();
    this.opts.onStatus('正在沿街道排路线…');
    await new Promise((resolve) => setTimeout(resolve, 32));
    let route = null;
    try {
      route = this.planNow();
    } catch (err) {
      console.warn(err);
    } finally {
      this.planning = false;
      this.opts.onStatus(null);
      this.syncGo();
    }
    if (!route) {
      this.opts.onToast('这些兴趣在锦江还没有可排的点');
      return;
    }
    this.commit(route, { frame: true, announce: true, ...opts });
  }

  planNow() {
    const city = this.opts.getCity();
    return planItinerary({
      places: PLACES,
      interests: [...this.selected],
      roads: city.roads,
      project: (lon, lat) => this.opts.project(lon, lat),
    });
  }

  commit(route, { frame = false, instant = false, keepScene = false, announce = false } = {}) {
    const city = this.opts.getCity();
    const geo = city.geo;
    for (const p of route.points) p.groundY = Math.max(p.y || 0, geo?.height?.(p.x, p.z) || 0);
    for (const s of route.stops) s.groundY = Math.max(s.y || 0, geo?.height?.(s.x, s.z) || 0);
    this.route = route;
    this.samples = route.points.map((p) => new THREE.Vector3(p.x, p.groundY || 0, p.z));
    this.mode = 'plan';
    this.navIndex = 0;
    this.activeId = route.stops[0].id;
    route.activeId = this.activeId;
    this.token += 1;
    this.view.setMotion(!this.opts.reduceMotion());
    this.view.setPath(route.points);
    this.view.setStops(route.stops);
    this.view.setActive(this.activeId);
    this.opts.hud.setRoute(route);
    this.renderResult();
    this.renderPins();
    this.highlight(this.activeId);
    this.syncGo();
    this.sync();
    console.info(`行程 ${route.stops.length} 站 / ${Math.round(route.walkMeters)} m / 路网 ${route.stats.nodes} 点 / ${Math.round(route.stats.graphMs)} ms${route.stats.directLegs ? ` / 直线 ${route.stats.directLegs}` : ''}`);
    if (!keepScene) this.opts.onLeaveScene();
    let extra = '';
    if (!keepScene && this.selected.has('night') && this.opts.getTime() < 19) {
      this.opts.setTime(19.8);
      extra = ' · 已调到傍晚';
    }
    this.opts.onHash({ keepScene });
    if (frame) this.frameRoute(instant);
    if (announce) this.opts.onToast(`已排好 ${route.stops.length} 站，合计约 ${formatMinutes(route.totalMin)}${extra}`);
  }

  clear() {
    this.token += 1;
    this.route = null;
    this.samples = null;
    this.mode = 'plan';
    this.activeId = null;
    this.navIndex = 0;
    this.opts.stopMotion();
    this.view.clear();
    this.opts.hud.setRoute(null);
    this.pinsEl.replaceChildren();
    this.pinList = [];
    const result = document.getElementById('route-result');
    result.hidden = true;
    result.innerHTML = '';
    this.syncGo();
    this.opts.onHash();
  }

  onUserInterrupt() {
    if (this.mode !== 'preview' && this.mode !== 'navigate') return;
    this.token += 1;
    this.mode = 'plan';
    this.sync();
    this.opts.onToast('已停下，路线还留在街上');
  }

  update(camera, w, h, time) {
    this.view.update(time);
    if (!this.pinList.length) return;
    for (const pin of this.pinList) {
      this._v.set(pin.x, pin.y + 14, pin.z).project(camera);
      if (this._v.z > 1 || Math.abs(this._v.x) > 1.15 || Math.abs(this._v.y) > 1.15) {
        pin.el.style.opacity = '0';
        continue;
      }
      const sx = (this._v.x * 0.5 + 0.5) * w;
      const sy = (-this._v.y * 0.5 + 0.5) * h;
      pin.el.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) translate(-50%, -120%)`;
      pin.el.style.opacity = '1';
    }
  }

  onClick(e) {
    const interest = e.target.closest('.interest');
    if (interest) {
      const id = interest.dataset.interest;
      if (this.selected.has(id)) this.selected.delete(id);
      else this.selected.add(id);
      this.syncInterests();
      this.syncGo();
      return;
    }
    if (e.target.closest('#route-go')) {
      this.generate();
      return;
    }
    const stop = e.target.closest('.stop-hit');
    if (stop) {
      this.focusStop(stop.dataset.id);
      return;
    }
    if (e.target.closest('#route-preview')) this.preview();
    else if (e.target.closest('#route-depart')) this.depart();
    else if (e.target.closest('#route-clear')) this.clear();
  }

  preview() {
    if (!this.route) return;
    if (this.mode === 'preview') {
      this.token += 1;
      this.mode = 'plan';
      this.opts.stopMotion();
      this.sync();
      return;
    }
    const stops = this.route.stops;
    if (stops.length < 2 || this.route.walkMeters < 20) {
      this.mode = 'plan';
      this.opts.stopMotion();
      const pose = this.fpvPose(stops[0].dist || 0);
      this.opts.onView(pose.pos, pose.tgt, this.opts.reduceMotion() ? 0 : 1.2);
      this.highlight(stops[0].id);
      this.sync();
      this.opts.onToast('只有这一站，已落到人眼高度');
      return;
    }
    if (this.opts.reduceMotion()) {
      this.hopStops();
      return;
    }
    const token = ++this.token;
    this.mode = 'preview';
    this.highlight(stops[0].id);
    this.sync();
    const total = this.route.cum[this.route.cum.length - 1] || 1;
    this.opts.follow({
      samples: this.samples,
      from: 0,
      to: total,
      duration: Math.min(48, Math.max(14, this.route.walkMeters / 70)),
      holdStart: 0.45,
      startId: stops[0].id,
      holds: stops.slice(1).map((s) => ({ dist: s.dist, time: 0.7, id: s.id })),
      eye: 2.05,
      ahead: 18,
      onEvent: (ev) => {
        if (this.token === token) this.highlight(ev.id);
      },
      after: () => {
        if (this.token !== token) return;
        this.mode = 'plan';
        this.sync();
        this.opts.onToast('预览结束，可以出发，或点某一站再看');
      },
    });
  }

  hopStops() {
    const token = ++this.token;
    this.mode = 'preview';
    this.sync();
    const stops = this.route.stops;
    const step = (i) => {
      if (this.token !== token || this.mode !== 'preview') return;
      const stop = stops[i];
      this.highlight(stop.id);
      const pose = this.fpvPose(stop.dist || 0);
      this.opts.onView(pose.pos, pose.tgt, 0);
      if (i >= stops.length - 1) {
        this.mode = 'plan';
        this.sync();
        return;
      }
      setTimeout(() => step(i + 1), 1100);
    };
    step(0);
  }

  depart() {
    if (!this.route) return;
    const stops = this.route.stops;
    if (this.mode === 'navigate') {
      if (this.navIndex >= stops.length - 1) {
        this.token += 1;
        this.mode = 'plan';
        this.opts.stopMotion();
        this.sync();
        this.opts.onToast('这一段先走到这里');
        return;
      }
      this.walkTo(this.navIndex + 1);
      return;
    }
    const idx = Math.max(0, stops.findIndex((s) => s.id === this.activeId));
    this.navIndex = idx;
    this.token += 1;
    this.mode = 'navigate';
    this.opts.stopMotion();
    const pose = this.fpvPose(stops[idx].dist || 0);
    this.opts.onView(pose.pos, pose.tgt, this.opts.reduceMotion() ? 0 : 1.45);
    this.highlight(stops[idx].id);
    this.sync();
  }

  walkTo(index) {
    const stops = this.route.stops;
    const prev = stops[this.navIndex];
    const next = stops[index];
    const token = ++this.token;
    this.mode = 'navigate';
    const gap = Math.max(0, (next.dist || 0) - (prev.dist || 0));
    if (this.opts.reduceMotion() || gap < 8) {
      this.navIndex = index;
      this.highlight(next.id);
      const pose = this.fpvPose(next.dist || 0);
      this.opts.onView(pose.pos, pose.tgt, 0);
      this.sync();
      return;
    }
    this.sync();
    this.opts.follow({
      samples: this.samples,
      from: prev.dist || 0,
      to: next.dist || 0,
      duration: Math.min(14, Math.max(4, gap / 18)),
      holds: [{ dist: next.dist, time: 0.3, id: next.id }],
      eye: 2.05,
      ahead: 16,
      onEvent: (ev) => {
        if (this.token === token) this.highlight(ev.id);
      },
      after: () => {
        if (this.token !== token) return;
        this.navIndex = index;
        this.mode = 'navigate';
        this.highlight(next.id);
        this.sync();
      },
    });
  }

  focusStop(id) {
    const stop = this.route?.stops.find((s) => s.id === id);
    if (!stop) return;
    this.token += 1;
    this.mode = 'plan';
    this.navIndex = this.route.stops.indexOf(stop);
    this.opts.stopMotion();
    this.highlight(id);
    const y = stop.groundY || 0;
    this.opts.onView(new THREE.Vector3(stop.x + 48, y + 38, stop.z + 64), new THREE.Vector3(stop.x, y + 4, stop.z), this.opts.reduceMotion() ? 0 : 1.15);
    this.sync();
  }

  frameRoute(instant) {
    const pts = this.route.points;
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const p of pts) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z);
      maxZ = Math.max(maxZ, p.z);
    }
    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;
    const span = Math.max(maxX - minX, maxZ - minZ, 160);
    const dist = Math.min(2200, Math.max(280, span * 0.95));
    const y = Math.min(820, Math.max(140, dist * 0.55));
    this.mode = 'plan';
    this.opts.onView(new THREE.Vector3(cx - dist * 0.12, y, cz + dist * 0.72), new THREE.Vector3(cx, 8, cz), instant || this.opts.reduceMotion() ? 0 : 1.8);
  }

  fpvPose(dist) {
    const points = this.route.points;
    const cum = this.route.cum;
    const total = cum[cum.length - 1] || 0;
    const p = pointAt(points, cum, dist);
    let q = pointAt(points, cum, Math.min(total, dist + 18));
    if (Math.hypot(q.x - p.x, q.z - p.z) < 4) {
      const back = pointAt(points, cum, Math.max(0, dist - 18));
      q = { x: p.x + (p.x - back.x), z: p.z + (p.z - back.z), groundY: p.groundY };
    }
    const y = (p.groundY || 0) + 2.05;
    return {
      pos: new THREE.Vector3(p.x, y, p.z),
      tgt: new THREE.Vector3(q.x, (q.groundY || p.groundY || 0) + 2.05, q.z),
    };
  }

  highlight(id) {
    this.activeId = id;
    if (this.route) this.route.activeId = id;
    this.view.setActive(id);
    for (const el of this.body.querySelectorAll('.stop, .route-pin')) el.classList.toggle('on', el.dataset.id === id);
    for (const el of this.pinsEl.querySelectorAll('.route-pin')) el.classList.toggle('on', el.dataset.id === id);
    this.body.querySelector(`.stop[data-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'nearest' });
  }

  syncInterests() {
    for (const btn of this.body.querySelectorAll('.interest')) {
      const on = this.selected.has(btn.dataset.interest);
      btn.classList.toggle('on', on);
      btn.setAttribute('aria-pressed', String(on));
    }
  }

  syncGo() {
    const btn = document.getElementById('route-go');
    if (!btn) return;
    btn.disabled = this.planning || this.selected.size === 0;
    btn.classList.toggle('primary', !this.route);
    btn.textContent = this.planning ? '正在排路线…' : this.route ? '按当前兴趣重算' : '生成路线';
  }

  sync() {
    if (!this.route) return;
    const previewBtn = document.getElementById('route-preview');
    const departBtn = document.getElementById('route-depart');
    const live = document.getElementById('route-live');
    if (!previewBtn || !departBtn || !live) return;
    previewBtn.textContent = this.mode === 'preview' ? '停止预览' : '第一人称预览';
    if (this.mode === 'navigate') departBtn.textContent = this.navIndex >= this.route.stops.length - 1 ? '结束行走' : '下一站';
    else {
      const idx = this.route.stops.findIndex((s) => s.id === this.activeId);
      departBtn.textContent = idx > 0 ? `从第 ${idx + 1} 站出发` : '从起点出发';
    }
    const stop = this.route.stops[this.navIndex] || this.route.stops[0];
    if (this.mode === 'preview') live.textContent = '人眼高度预览中 · 拖动画面即可停下';
    else if (this.mode === 'navigate') {
      const remain = Math.max(0, this.route.totalMin - stop.arriveMin);
      live.textContent = `第 ${this.navIndex + 1} / ${this.route.stops.length} 站 · ${stop.name} · 剩余约 ${formatMinutes(remain)}`;
    } else live.textContent = '';
    live.hidden = !live.textContent;
  }

  renderResult() {
    const route = this.route;
    const note = route.stats.directLegs ? '有一段街道没连上，暂时按直线补上。' : '按每小时 4.5 公里估算，含在每一站停留的时间。';
    const result = document.getElementById('route-result');
    result.hidden = false;
    result.innerHTML = `
      <p class="route-summary">${route.stops.length} 站 · 步行 ${formatMeters(route.walkMeters)} · 合计约 ${formatMinutes(route.totalMin)}</p>
      <p class="route-note">走路 ${formatMinutes(route.walkMin)}，停留 ${formatMinutes(route.dwellMin)}。${note}</p>
      <p class="route-live" id="route-live" hidden></p>
      <div class="stop-list">
        ${route.stops.map((s, i) => this.stopHtml(s, i)).join('')}
      </div>
      <div class="route-actions">
        <button type="button" class="act" id="route-preview">第一人称预览</button>
        <button type="button" class="act primary" id="route-depart">从起点出发</button>
        <button type="button" class="act" id="route-clear">清除路线</button>
      </div>
    `;
  }

  stopHtml(stop, index) {
    const tags = stop.matched.map((id) => NAMES[id] || id).join('、');
    const leg = index === 0 ? '起点' : `从上一站步行 ${formatMinutes(stop.walkMin)}`;
    const booking = stop.links.booking?.url ? `<a href="${esc(stop.links.booking.url)}" target="_blank" rel="noopener noreferrer">预订</a>` : '';
    return `
      <article class="stop" data-id="${esc(stop.id)}">
        <button type="button" class="stop-hit" data-id="${esc(stop.id)}">
          <span class="stop-idx">${index + 1}</span>
          <span>
            <span class="stop-name">${esc(stop.name)}</span>
            <span class="stop-meta">${esc(tags)} · 停留 ${stop.dwellMin} 分钟 · ${leg}</span>
            <span class="stop-preview">${esc(stop.preview)}</span>
          </span>
        </button>
        <div class="stop-links">
          <a href="${esc(stop.links.map)}" target="_blank" rel="noopener noreferrer">在地图中查看</a>
          ${booking}
        </div>
      </article>
    `;
  }

  renderPins() {
    this.pinsEl.replaceChildren();
    this.pinList = this.route.stops.map((s, i) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'route-pin';
      el.dataset.id = s.id;
      el.textContent = String(i + 1);
      el.title = s.name;
      el.addEventListener('click', () => this.focusStop(s.id));
      this.pinsEl.appendChild(el);
      return { id: s.id, x: s.x, y: s.groundY || 0, z: s.z, el };
    });
  }
}
