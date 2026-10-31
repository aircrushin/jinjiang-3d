// 巡检面板：智能体状态、事件与处置进度、指令输入、事件日志，以及三维视口上的标签。
// 只负责显示和转发操作，状态都来自 PatrolSim。

import * as THREE from 'three';
import { INCIDENT_TYPES, LEVEL_NAME, ROLE_NAME, ZONE } from './zone.js';
import { EXAMPLES, parseCommand, runCommand } from './command.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const clock = (t) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const MODE_TEXT = { patrol: '巡逻中', idle: '待命', go: '前往中', work: '处置中', back: '返回中' };
const STEP_TEXT = { pending: '待派', enroute: '在途', working: '处置', done: '完成' };
const SPEEDS = [1, 2, 4];

export class PatrolUi {
  constructor({ sim, view, hud, focus, onToggle }) {
    this.sim = sim;
    this.view = view;
    this.hud = hud;
    this.focus = focus;
    this.onToggle = onToggle;
    this.speed = 1;
    this.running = true;
    this.active = false;
    this.selected = null;
    this.logCount = 0;
    this.lastRender = -1;
    this.tags = new Map();
    this.areaTags = [];
    this.body = document.getElementById('patrol-body');
    this.tagsEl = document.getElementById('patrol-tags');
    this._v = new THREE.Vector3();
    this.body.innerHTML = `
      <p class="route-lead">${esc(ZONE.name)}的孪生巡检演示。地面、空中和现场三类智能体沿道路自动巡逻，发现异常后自动派单。<b>所有设备与事件均为模拟。</b></p>
      <div class="pt-bar">
        <button type="button" class="act" id="pt-run" aria-pressed="false">暂停</button>
        <button type="button" class="act" id="pt-speed">倍速 1×</button>
        <button type="button" class="act" id="pt-auto" aria-pressed="false">自动出事件</button>
      </div>
      <div class="pt-stats" id="pt-stats"></div>
      <div class="pt-title">指令</div>
      <form class="pt-cmd" id="pt-cmd" autocomplete="off">
        <input id="pt-input" type="text" placeholder="例如：让机器狗去 C 区巡查" aria-label="巡检指令" maxlength="40" />
        <button type="submit" class="act primary">下达</button>
      </form>
      <div class="pt-examples" id="pt-examples"></div>
      <div class="pt-reply" id="pt-reply" role="status" aria-live="polite"></div>
      <div class="pt-title">模拟事件</div>
      <div class="pt-inject" id="pt-inject"></div>
      <div class="pt-title">事件</div>
      <div id="pt-incidents" class="pt-list"></div>
      <div class="pt-title">智能体</div>
      <div id="pt-agents" class="pt-list"></div>
      <div class="pt-title">日志</div>
      <ol id="pt-log" class="pt-log" aria-live="off"></ol>
    `;
    document.getElementById('pt-examples').innerHTML = EXAMPLES.map((e) => `<button type="button" class="chip" data-ex="${esc(e)}">${esc(e)}</button>`).join('');
    document.getElementById('pt-inject').innerHTML = Object.entries(INCIDENT_TYPES).map(([id, t]) => `<button type="button" class="chip lv${t.level}" data-inject="${id}">${esc(t.name)}</button>`).join('');
    this.body.addEventListener('click', (e) => this.onClick(e));
    document.getElementById('pt-cmd').addEventListener('submit', (e) => {
      e.preventDefault();
      const input = document.getElementById('pt-input');
      this.command(input.value);
      input.value = '';
    });
    document.getElementById('tab-patrol').onclick = () => this.show(true);
    document.getElementById('tab-scenes').addEventListener('click', () => this.show(false));
    document.getElementById('tab-route').addEventListener('click', () => this.show(false));
    sim.onEvent = (ev) => this.onSimEvent(ev);
    this.renderStatic();
  }

  // 面板切换：进入时显示三维层并推进模拟，离开时隐藏三维层、模拟暂停
  show(on) {
    if (this.active === on) return;
    this.active = on;
    document.getElementById('patrol-body').hidden = !on;
    document.getElementById('tab-patrol').classList.toggle('on', on);
    document.getElementById('tab-patrol').setAttribute('aria-selected', String(on));
    if (on) {
      document.getElementById('panel-body').hidden = true;
      document.getElementById('route-body').hidden = true;
      document.getElementById('tab-scenes').classList.remove('on');
      document.getElementById('tab-route').classList.remove('on');
      document.getElementById('panel-kicker').textContent = 'PATROL';
      document.getElementById('panel-title').textContent = '白鹭湾巡检孪生';
    }
    this.view.show(on);
    this.tagsEl.hidden = !on;
    this.onToggle?.(on);
    this.render(true);
  }

  command(text) {
    const parsed = parseCommand(text);
    const reply = runCommand(this.sim, parsed);
    document.getElementById('pt-reply').textContent = reply;
    this.render(true);
  }

  onClick(e) {
    const ex = e.target.closest('[data-ex]');
    if (ex) {
      this.command(ex.dataset.ex);
      return;
    }
    const inj = e.target.closest('[data-inject]');
    if (inj) {
      const type = inj.dataset.inject;
      // 落在无人机或巡检犬前方，保证演示时能被先发现；没有可用者时随机落点
      const lead = this.sim.agents.find((a) => a.patrol && a.mode === 'patrol');
      const inc = this.sim.inject(type, lead ? { ahead: lead.id, meters: 90 } : null);
      if (inc) this.hud.toast(`已模拟：${inc.sectorName}${inc.name}`);
      this.render(true);
      return;
    }
    const focus = e.target.closest('[data-focus]');
    if (focus) {
      this.focus(focus.dataset.focus, focus.dataset.kind);
      return;
    }
    const recall = e.target.closest('[data-recall]');
    if (recall) {
      const r = this.sim.recall(recall.dataset.recall);
      if (!r.ok) this.hud.toast(r.reason);
      this.render(true);
      return;
    }
    const id = e.target.closest('button')?.id;
    if (id === 'pt-run') {
      this.running = !this.running;
      this.render(true);
    } else if (id === 'pt-speed') {
      this.speed = SPEEDS[(SPEEDS.indexOf(this.speed) + 1) % SPEEDS.length];
      this.render(true);
    } else if (id === 'pt-auto') {
      this.sim.auto = !this.sim.auto;
      this.render(true);
    }
  }

  onSimEvent(ev) {
    if (ev.kind === 'detect') this.hud.toast(ev.text);
    else if (ev.kind === 'resolved') this.hud.toast(ev.text);
  }

  select(id) {
    this.selected = id;
    this.view.select(id);
    this.render(true);
  }

  renderStatic() {
    this.tagsEl.innerHTML = '';
    this.tagsEl.hidden = true;
    for (const area of this.view.areas || []) {
      const el = document.createElement('div');
      el.className = 'pt-area';
      el.textContent = area.name;
      this.tagsEl.appendChild(el);
      this.areaTags.push({ el, x: area.x, z: area.z });
    }
    for (const a of this.sim.agents) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = `pt-tag ${a.role}`;
      el.dataset.agent = a.id;
      el.innerHTML = `<b>${esc(a.badge)}</b><span>${esc(a.name)}</span>`;
      el.addEventListener('click', () => this.focus(a.id, 'agent'));
      this.tagsEl.appendChild(el);
      this.tags.set(a.id, { el, x: 0, z: 0, h: 0 });
    }
  }

  // 每帧：推进模拟（仅当面板打开时）+ 刷新屏幕标签 + 低频刷新列表
  tick(dt, now) {
    if (!this.active) return;
    if (this.running) {
      const step = dt * this.speed;
      // 一帧里太长会让寻路小段跳变，拆成 ≤0.1 s 的小步
      const n = Math.max(1, Math.ceil(step / 0.1));
      for (let i = 0; i < n; i++) this.sim.tick(step / n);
    }
    if (now - this.lastRender > 0.25) {
      this.lastRender = now;
      this.render(false);
    }
  }

  updateTags(camera, w, h) {
    if (!this.active) return;
    for (const t of this.areaTags) {
      const y = this.view.groundY(t.x, t.z) + 4;
      const dist = Math.hypot(camera.position.x - t.x, camera.position.y - y, camera.position.z - t.z);
      this._v.set(t.x, y, t.z).project(camera);
      const visible = this._v.z < 1 && Math.abs(this._v.x) < 1.1 && Math.abs(this._v.y) < 1.1 && dist < 1400;
      t.el.style.opacity = visible ? '1' : '0';
      if (visible) t.el.style.transform = `translate(${((this._v.x * 0.5 + 0.5) * w).toFixed(1)}px, ${((-this._v.y * 0.5 + 0.5) * h).toFixed(1)}px) translate(-50%, -50%)`;
    }
    for (const a of this.sim.agents) {
      const tag = this.tags.get(a.id);
      const lift = a.role === 'air' ? a.curAlt + 10 : 12;
      this._v.set(a.x, this.view.groundY(a.x, a.z) + lift, a.z).project(camera);
      if (this._v.z > 1 || Math.abs(this._v.x) > 1.1 || Math.abs(this._v.y) > 1.1) {
        tag.el.style.opacity = '0';
        tag.el.style.pointerEvents = 'none';
        continue;
      }
      tag.el.style.transform = `translate(${((this._v.x * 0.5 + 0.5) * w).toFixed(1)}px, ${((-this._v.y * 0.5 + 0.5) * h).toFixed(1)}px) translate(-50%, -100%)`;
      tag.el.style.opacity = '1';
      tag.el.style.pointerEvents = 'auto';
      tag.el.classList.toggle('on', a.id === this.selected);
    }
  }

  render(force) {
    if (!this.active && !force) return;
    const sim = this.sim;
    const q = (id) => document.getElementById(id);
    q('pt-run').textContent = this.running ? '暂停' : '继续';
    q('pt-run').setAttribute('aria-pressed', String(!this.running));
    q('pt-speed').textContent = `倍速 ${this.speed}×`;
    q('pt-auto').setAttribute('aria-pressed', String(sim.auto));
    q('pt-auto').classList.toggle('on', sim.auto);
    const st = sim.stats();
    q('pt-stats').innerHTML = [
      ['运行', clock(sim.t)],
      ['待处理', st.open],
      ['已处置', st.resolved],
      ['平均响应', st.resolved ? `${Math.round(st.response)}s` : '—'],
      ['平均闭环', st.resolved ? `${Math.round(st.resolve)}s` : '—'],
      ['累计里程', `${st.km.toFixed(1)}km`],
    ].map(([k, v]) => `<div><i>${k}</i><b>${v}</b></div>`).join('');
    // 事件
    const list = sim.incidents.slice().sort((a, b) => (a.state === 'resolved') - (b.state === 'resolved') || b.level - a.level || a.t0 - b.t0);
    q('pt-incidents').innerHTML = list.length
      ? list.map((inc) => this.incidentHtml(inc)).join('')
      : '<div class="pt-empty">暂无事件。点“模拟事件”或打开“自动出事件”。</div>';
    // 智能体
    q('pt-agents').innerHTML = sim.agents.map((a) => this.agentHtml(a)).join('');
    // 日志（只追加新增行）
    const log = q('pt-log');
    const evs = sim.events;
    if (this.logCount > evs.length) {
      log.innerHTML = '';
      this.logCount = 0;
    }
    const fresh = evs.slice(this.logCount);
    if (fresh.length) {
      const frag = document.createDocumentFragment();
      for (const ev of fresh) {
        const li = document.createElement('li');
        li.className = `lv${ev.level}`;
        li.innerHTML = `<i>${clock(ev.t)}</i><span>${esc(ev.text)}</span>`;
        frag.prepend(li);
      }
      log.prepend(frag);
      while (log.children.length > 60) log.lastChild.remove();
      this.logCount = evs.length;
    }
  }

  incidentHtml(inc) {
    const resolved = inc.state === 'resolved';
    const state = inc.state === 'open' ? '未发现' : resolved ? '已处置' : '处置中';
    const steps = inc.steps.map((s) => `<span class="step ${s.state}" title="${esc(s.act)}">${esc(s.act)} · ${STEP_TEXT[s.state]}${s.agentId ? ` · ${esc(this.sim.agent(s.agentId).name.replace(/ 0?/, ' '))}` : ''}</span>`).join('');
    return `<div class="pt-item lv${inc.level}${resolved ? ' done' : ''}">
      <button type="button" class="pt-hit" data-focus="${inc.id}" data-kind="incident">
        <b>${esc(inc.id)} ${esc(inc.name)}</b><em>${esc(LEVEL_NAME[inc.level])}</em><small>${esc(inc.sectorName)} · ${state}${inc.tDetect != null ? ` · ${clock(inc.tDetect)} 发现` : ''}</small>
      </button>
      <div class="steps">${steps}</div>
    </div>`;
  }

  agentHtml(a) {
    const sel = a.id === this.selected;
    const job = a.job ? (a.job.kind === 'step' ? `${a.job.step.act} · ${a.job.incident.id}` : a.job.label) : '';
    const recallable = a.job?.kind === 'inspect' || a.mode === 'back';
    return `<div class="pt-item agent ${a.role}${sel ? ' on' : ''}">
      <button type="button" class="pt-hit" data-focus="${a.id}" data-kind="agent">
        <b><u>${esc(a.badge)}</u>${esc(a.name)}</b><em>${esc(MODE_TEXT[a.mode])}</em>
        <small>${esc(ROLE_NAME[a.role])} · ${esc(a.kind)}${job ? ` · ${esc(job)}` : ''}</small>
      </button>
      ${recallable && a.mode !== 'back' ? `<button type="button" class="chip" data-recall="${a.id}">召回</button>` : ''}
    </div>`;
  }
}
