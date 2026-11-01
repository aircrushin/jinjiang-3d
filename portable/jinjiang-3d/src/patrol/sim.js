// 巡检模拟核心：智能体巡逻、事件发现、按角色派单、处置与回岗。
// 不依赖 three.js 和 DOM，可在 Node 里直接测试。所有数据都是模拟的，不接入真实设备。

import { AGENT_DEFS, INCIDENT_TYPES, SECTORS } from './zone.js';
import { buildLoop, loopPoint, makeRoute, straightRoute } from './route.js';

const BACK_OK = new Set(['patrol', 'idle', 'back']);
const AUTO_GAP = [28, 50]; // 自动出事件的间隔（模拟秒）
const MAX_OPEN = 3;
const FALLBACK_DETECT = 60; // 没人巡到时，视频监控兜底发现的等待时间（模拟秒）

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export class PatrolSim {
  // project: (lon, lat) → {x, z}；planRoad: (a, b) → 路线 {points, cum, length}
  constructor({ project, planRoad, seed = 7, sectors = SECTORS, defs = AGENT_DEFS, spots = {} }) {
    this.sectors = sectors.map((s) => ({ ...s, ...project(s.lon, s.lat) }));
    this.planRoad = planRoad;
    // 事件落点：{ 类别: [{ x, z, label, sector }] }，类别与 INCIDENT_TYPES 里的 spots 对应
    this.spots = { ...spots };
    this.seed = seed;
    this.defs = defs;
    this.groundLoop = buildLoop(this.sectors, (a, b) => planRoad(a, b));
    this.airLoop = buildLoop(this.sectors, (a, b) => straightRoute(a, b));
    this.env = { rain: false, night: false };
    this.onEvent = null;
    this.reset();
  }

  // 回到刚创建时的状态：时间归零、事件和统计清空、智能体回驻点，随机序列也从头开始，
  // 所以同一个种子每次重置后走出来的过程都一样。环线、落点和昼夜雨天设置保持不变。
  reset() {
    this.rand = mulberry32(this.seed);
    this.t = 0;
    this.auto = false;
    this.nextAuto = this._gap();
    this.nextId = 1;
    this.incidents = [];
    this.history = []; // 已处置事件的耗时，清出列表后统计仍然保留
    this.events = [];
    this.agents = this.defs.map((def) => this._makeAgent(def));
  }

  _gap() {
    return AUTO_GAP[0] + this.rand() * (AUTO_GAP[1] - AUTO_GAP[0]);
  }

  _loopOf(agent) {
    return agent.role === 'air' ? this.airLoop : this.groundLoop;
  }

  _makeAgent(def) {
    const sector = this.sectors.find((s) => s.id === def.home) || this.sectors[0];
    const idx = this.sectors.indexOf(sector);
    const agent = {
      ...def,
      mode: def.patrol ? 'patrol' : 'idle',
      loopS: 0,
      route: null,
      rs: 0,
      job: null,
      work: 0,
      resume: null,
      x: sector.x,
      y: 0,
      z: sector.z,
      heading: 0,
      curAlt: def.role === 'air' ? def.alt : 0,
      log: { km: 0, jobs: 0 },
    };
    if (def.patrol) agent.loopS = this._loopOf(agent).offsets[idx] || 0;
    this._place(agent);
    return agent;
  }

  agent(id) {
    return this.agents.find((a) => a.id === id) || null;
  }

  sector(id) {
    return this.sectors.find((s) => s.id === id) || null;
  }

  // kind：spawn 出现 / detect 发现 / dispatch 派出 / arrive 到场 / done 步骤完成 / resolved 事件闭环 / info 其它
  emit(text, level = 0, incident = null, kind = 'info', agentId = null) {
    const ev = { t: this.t, text, level, incident: incident?.id || null, kind, agent: agentId };
    this.events.push(ev);
    if (this.events.length > 200) this.events.shift();
    this.onEvent?.(ev);
    return ev;
  }

  setEnv(env) {
    this.env = { ...this.env, ...env };
  }

  // ---------- 事件 ----------
  // at：分区 id 或 {x, z}；缺省时随机选一个分区。位置落在巡逻环线附近，保证在路上。
  // at 也可以是 { ahead: 智能体 id, meters }：落在该智能体巡逻方向前方，演示时能稳定被它先发现。
  inject(typeId, at = null) {
    const type = INCIDENT_TYPES[typeId];
    if (!type) return null;
    let sector;
    let pos;
    let spot = null;
    if (at && typeof at === 'object' && at.ahead) {
      const a = this.agent(at.ahead);
      if (!a?.patrol) return null;
      const p = loopPoint(this._loopOf(a), a.loopS + a.dir * (at.meters ?? 60));
      // 前方 80 m 内有贴合这类事件的设施就落在设施旁，否则落在路上
      spot = this._pickSpot(type, null, p, 80);
      pos = spot ? { x: spot.x, z: spot.z } : { x: p.x, z: p.z };
      sector = (spot && this.sector(spot.sector)) || this._nearestSector(pos);
    } else if (at && typeof at === 'object' && Number.isFinite(at.x)) {
      pos = { x: at.x, z: at.z };
      sector = this._nearestSector(pos);
    } else {
      spot = this._pickSpot(type, typeof at === 'string' ? at : null);
      if (spot) {
        sector = this.sector(spot.sector) || this._nearestSector(spot);
        pos = { x: spot.x, z: spot.z };
      } else {
        sector = (at && this.sector(at)) || this.sectors[Math.floor(this.rand() * this.sectors.length)];
        const loop = this.groundLoop;
        const idx = this.sectors.indexOf(sector);
        // 落在该分区点位之后 20–80 m；分区间隔最短约 170 m，不会越到下一个分区
        const p = loopPoint(loop, (loop.offsets[idx] || 0) + 20 + this.rand() * 60);
        pos = { x: p.x, z: p.z };
      }
    }
    const inc = {
      id: `E${String(this.nextId++).padStart(3, '0')}`,
      type: typeId,
      name: type.name,
      level: type.level,
      sector: sector.id,
      sectorName: sector.name,
      place: spot ? spot.label : null,
      x: pos.x,
      z: pos.z,
      state: 'open',
      t0: this.t,
      tDetect: null,
      tFirst: null,
      tDone: null,
      by: null,
      steps: type.needs.map((n) => ({ ...n, state: 'pending', agentId: null, eta: 0 })),
    };
    this.incidents.push(inc);
    this.emit(`${sector.name}${spot ? ` ${spot.label}附近` : ''} 出现${type.name}（尚未被发现）`, 0, inc, 'spawn');
    return inc;
  }

  setSpots(kind, list) {
    this.spots[kind] = list;
  }

  // 按事件类型挑一个贴合现场的落点。sectorId 限定分区；near + radius 限定在某点附近并取最近的。
  // 没有可用落点时返回 null，且不消耗随机数，所以没有落点数据时事件序列和以前完全一致。
  _pickSpot(type, sectorId = null, near = null, radius = 0) {
    const pool = [];
    for (const kind of type.spots || []) {
      for (const s of this.spots[kind] || []) {
        if (sectorId && s.sector !== sectorId) continue;
        if (near && dist(s, near) > radius) continue;
        pool.push(s);
      }
    }
    if (!pool.length) return null;
    if (near) return pool.reduce((best, s) => (dist(s, near) < dist(best, near) ? s : best));
    return pool[Math.floor(this.rand() * pool.length)];
  }

  _nearestSector(p) {
    let best = this.sectors[0];
    let bd = Infinity;
    for (const s of this.sectors) {
      const d = dist(s, p);
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    return best;
  }

  _detect(inc, by, how) {
    if (inc.state !== 'open') return;
    inc.state = 'active';
    inc.tDetect = this.t;
    inc.by = by;
    this.emit(`${how}发现${inc.sectorName}${inc.name}，开始派单`, Math.max(1, inc.level), inc, 'detect', by === 'camera' ? null : by);
  }

  _spawnAuto() {
    const open = this.incidents.filter((i) => i.state !== 'resolved').length;
    if (open >= MAX_OPEN) return;
    const bag = [];
    for (const [id, type] of Object.entries(INCIDENT_TYPES)) {
      const w = (type.weight || 0) + (this.env.rain ? type.rain || 0 : 0) + (this.env.night ? type.night || 0 : 0);
      if (w > 0) bag.push([id, w]);
    }
    const total = bag.reduce((s, [, w]) => s + w, 0);
    if (!total) return;
    let r = this.rand() * total;
    for (const [id, w] of bag) {
      r -= w;
      if (r <= 0) {
        this.inject(id);
        return;
      }
    }
  }

  // ---------- 派单 ----------
  pickAgent(role, target) {
    let best = null;
    let bd = Infinity;
    for (const a of this.agents) {
      if (a.role !== role || a.job || !BACK_OK.has(a.mode)) continue;
      const d = dist(a, target);
      if (d < bd) {
        bd = d;
        best = a;
      }
    }
    return best;
  }

  _send(agent, target, job) {
    if (agent.mode === 'patrol') agent.resume = { s: agent.loopS };
    const from = { x: agent.x, z: agent.z };
    const route = agent.role === 'air' ? straightRoute(from, target) : this.planRoad(from, target);
    agent.route = route;
    agent.rs = 0;
    agent.mode = 'go';
    agent.job = job;
    return route.length / agent.speed;
  }

  _startStep(inc, step) {
    const agent = this.pickAgent(step.role, inc);
    if (!agent) return false;
    if (step.near && dist(agent, inc) > step.near) {
      step.state = 'done';
      step.skipped = true;
      this.emit(`${agent.name}离${inc.sectorName}较远，跳过${step.act}`, 0, inc, 'info');
      return true;
    }
    step.agentId = agent.id;
    step.state = 'enroute';
    step.eta = this._send(agent, inc, { kind: 'step', incident: inc, step, dwell: step.dwell, label: step.act });
    this.emit(`${agent.name} 前往${inc.sectorName}（${step.act}），预计 ${Math.max(1, Math.round(step.eta))} 秒`, inc.level, inc, 'dispatch', agent.id);
    return true;
  }

  _advanceIncident(inc) {
    if (inc.state !== 'active') return;
    const type = INCIDENT_TYPES[inc.type];
    for (let i = 0; i < inc.steps.length; i++) {
      const step = inc.steps[i];
      if (step.state === 'pending') {
        const ready = type.parallel || inc.steps.slice(0, i).every((s) => s.state === 'done');
        if (ready) this._startStep(inc, step);
      }
    }
    if (inc.steps.every((s) => s.state === 'done')) {
      inc.state = 'resolved';
      inc.tDone = this.t;
      this.history.push({ response: inc.tFirst != null ? inc.tFirst - inc.tDetect : 0, resolve: inc.tDone - inc.tDetect, level: inc.level });
      this.emit(`${inc.sectorName}${inc.name}已处置，用时 ${Math.round(inc.tDone - inc.tDetect)} 秒`, 0, inc, 'resolved');
    }
  }

  // 指令：让指定智能体去某个分区看一眼（自然语言指令和“一键巡查”共用）
  assignInspect(agentId, sectorId, dwell = 6) {
    const agent = this.agent(agentId);
    const sector = this.sector(sectorId);
    if (!agent || !sector) return { ok: false, reason: '找不到对应的智能体或分区' };
    if (agent.job || !BACK_OK.has(agent.mode)) return { ok: false, reason: `${agent.name}正在执行任务` };
    const eta = this._send(agent, sector, { kind: 'inspect', dwell, label: '巡查', sector });
    this.emit(`${agent.name} 受指令前往${sector.name}巡查，预计 ${Math.max(1, Math.round(eta))} 秒`, 0);
    return { ok: true, eta };
  }

  // 召回：任务结束前取消，回到岗位
  recall(agentId) {
    const agent = this.agent(agentId);
    if (!agent) return { ok: false, reason: '找不到对应的智能体' };
    if (agent.mode === 'patrol' || agent.mode === 'idle') return { ok: false, reason: `${agent.name}已在岗` };
    if (agent.job?.kind === 'step') return { ok: false, reason: `${agent.name}正在处置事件，不能召回` };
    this._goBack(agent);
    this.emit(`${agent.name} 收到召回指令，返回岗位`, 0);
    return { ok: true };
  }

  _goBack(agent) {
    agent.job = null;
    agent.work = 0;
    const target = agent.resume ? loopPoint(this._loopOf(agent), agent.resume.s) : this.sector(agent.home);
    const from = { x: agent.x, z: agent.z };
    agent.route = agent.role === 'air' ? straightRoute(from, target) : this.planRoad(from, target);
    agent.rs = 0;
    agent.mode = 'back';
  }

  // ---------- 推进 ----------
  tick(dt) {
    this.t += dt;
    if (this.auto) {
      this.nextAuto -= dt;
      if (this.nextAuto <= 0) {
        this._spawnAuto();
        this.nextAuto = this._gap();
      }
    }
    for (const a of this.agents) this._moveAgent(a, dt);
    for (const inc of this.incidents) {
      if (inc.state === 'open') {
        for (const a of this.agents) {
          if (a.detectR && dist(a, inc) <= a.detectR) {
            this._detect(inc, a.id, `${a.name}巡检时`);
            break;
          }
        }
        if (inc.state === 'open' && this.t - inc.t0 >= FALLBACK_DETECT) this._detect(inc, 'camera', '视频监控');
      }
      this._advanceIncident(inc);
    }
    // 已处置的事件留一阵子再清走，列表才不会越攒越长
    this.incidents = this.incidents.filter((i) => i.state !== 'resolved' || this.t - i.tDone < 30);
  }

  _moveAgent(a, dt) {
    const step = a.speed * dt;
    if (a.mode === 'patrol') {
      a.loopS += a.dir * step;
      const loop = this._loopOf(a);
      a.loopS = ((a.loopS % loop.length) + loop.length) % loop.length;
      this._place(a, loopPoint(loop, a.loopS), step);
    } else if (a.mode === 'go' || a.mode === 'back') {
      a.rs += step;
      const r = a.route;
      this._place(a, loopPoint(r, Math.min(a.rs, r.length)), step);
      if (a.rs >= r.length) {
        if (a.mode === 'go') this._arrive(a);
        else this._home(a);
      }
    } else if (a.mode === 'work') {
      a.work -= dt;
      if (a.work <= 0) this._finish(a);
    }
    if (a.role === 'air') {
      const hover = a.mode === 'work' || (a.mode === 'go' && a.route && a.route.length - a.rs < 90);
      const want = hover ? a.hoverAlt : a.alt;
      const d = want - a.curAlt;
      a.curAlt += Math.max(-dt * 9, Math.min(dt * 9, d));
    }
  }

  _place(a, p, step = 0) {
    if (p) {
      const dx = p.x - a.x;
      const dz = p.z - a.z;
      if (step > 0 && dx * dx + dz * dz > 1e-4) {
        const want = Math.atan2(dx, dz);
        let diff = want - a.heading;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        a.heading += diff * 0.3;
        a.log.km += Math.hypot(dx, dz) / 1000;
      }
      a.x = p.x;
      a.z = p.z;
      a.y = p.y || 0;
    }
  }

  _arrive(a) {
    const job = a.job;
    a.mode = 'work';
    a.work = job?.dwell ?? 4;
    if (job?.kind === 'step') {
      const inc = job.incident;
      job.step.state = 'working';
      if (inc.tFirst == null) {
        inc.tFirst = this.t;
        this.emit(`${a.name} 到达${inc.sectorName}，开始${job.step.act}（响应 ${Math.round(inc.tFirst - inc.tDetect)} 秒）`, inc.level, inc, 'arrive', a.id);
      } else {
        this.emit(`${a.name} 到达${inc.sectorName}，开始${job.step.act}`, inc.level, inc, 'arrive', a.id);
      }
    } else if (job?.kind === 'inspect') {
      this.emit(`${a.name} 到达${job.sector.name}，开始巡查`, 0);
    }
  }

  _finish(a) {
    const job = a.job;
    a.log.jobs += 1;
    if (job?.kind === 'step') {
      job.step.state = 'done';
      this.emit(`${a.name} 完成${job.step.act}`, 0, job.incident, 'done', a.id);
    } else if (job?.kind === 'inspect') {
      this.emit(`${a.name} 完成${job.sector.name}巡查，一切正常`, 0);
    }
    this._goBack(a);
  }

  _home(a) {
    a.route = null;
    if (a.resume) {
      a.mode = 'patrol';
      a.loopS = a.resume.s;
      a.resume = null;
    } else {
      a.mode = 'idle';
    }
  }

  // ---------- 汇总 ----------
  stats() {
    const avg = (xs) => (xs.length ? xs.reduce((sum, v) => sum + v, 0) / xs.length : 0);
    return {
      open: this.incidents.filter((i) => i.state !== 'resolved').length,
      resolved: this.history.length,
      response: avg(this.history.map((h) => h.response)),
      resolve: avg(this.history.map((h) => h.resolve)),
      km: this.agents.reduce((sum, a) => sum + a.log.km, 0),
    };
  }
}

export { makeRoute };
