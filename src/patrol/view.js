// 巡检的三维表现：智能体模型、事件标记、巡逻路线与覆盖圈。只读取模拟状态，不改状态。
// 材质用 MeshBasicMaterial，不参与光照与阴影，所以白天夜里都清楚，也不增加阴影开销。

import * as THREE from 'three';
import { ZONE_AREAS } from './zone.js';

const COLORS = { ground: 0x5fd0a4, air: 0x6fb4ff, human: 0xf2b84b };
const LEVEL_COLORS = [0x9fb2c4, 0xf2d06b, 0xff9a4d, 0xff5a4d];

function box(w, h, d, x, y, z) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}

function merge(parts) {
  const pos = [];
  const idx = [];
  let base = 0;
  for (const g of parts) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) pos.push(p.getX(i), p.getY(i), p.getZ(i));
    for (const i of g.index.array) idx.push(base + i);
    base += p.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setIndex(idx);
  return out;
}

// 模型朝 +Z；尺寸按真实设备放大约 1.6 倍，航拍距离下才看得清
function dogGeometry() {
  const parts = [box(0.7, 0.55, 1.5, 0, 1.0, 0), box(0.4, 0.4, 0.5, 0, 1.25, 0.95)];
  for (const sx of [-0.3, 0.3]) for (const sz of [-0.55, 0.55]) parts.push(box(0.16, 0.8, 0.16, sx, 0.4, sz));
  return merge(parts);
}

function droneGeometry() {
  const parts = [box(1.3, 0.45, 1.3, 0, 0, 0)];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    parts.push(box(0.12, 0.12, 0.12, sx * 1.1, 0, sz * 1.1));
    parts.push(box(1.2, 0.06, 0.18, sx * 1.1, 0.12, sz * 1.1));
    parts.push(box(0.18, 0.06, 1.2, sx * 1.1, 0.12, sz * 1.1));
  }
  const g = merge(parts);
  g.scale(1.7, 1.7, 1.7);
  return g;
}

function carGeometry() {
  return merge([box(1.8, 0.9, 4.2, 0, 0.8, 0), box(1.6, 0.7, 2.0, 0, 1.55, -0.2), box(1.9, 0.12, 0.5, 0, 2.0, -0.2)]);
}

function ringGeometry(r, w = 0.5) {
  const g = new THREE.RingGeometry(r - w, r, 72);
  g.rotateX(-Math.PI / 2);
  return g;
}

export class PatrolView {
  constructor(sim, { groundY, project }) {
    this.sim = sim;
    this.groundY = groundY;
    this.group = new THREE.Group();
    this.group.name = 'patrol';
    this.group.visible = false;
    this.agentMeshes = new Map();
    this.incidentMeshes = new Map();
    this.pickables = [];
    this.selected = null;
    this._v = new THREE.Vector3();
    this.geo = {
      ground: dogGeometry(),
      air: droneGeometry(),
      human: carGeometry(),
      pin: new THREE.CylinderGeometry(0.5, 0.5, 26, 6).translate(0, 13, 0),
      cone: new THREE.ConeGeometry(4, 9, 6).rotateX(Math.PI).translate(0, 31, 0),
      disc: new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2),
      ring: ringGeometry(1, 0.016),
      pulse: ringGeometry(1, 0.1),
    };
    this._buildAgents();
    this._buildRoutes();
    this._buildAreas(project);
  }

  _mat(color, opacity = 1) {
    return new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1, side: THREE.DoubleSide, fog: false });
  }

  _buildAgents() {
    for (const a of this.sim.agents) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(this.geo[a.role], this._mat(COLORS[a.role]));
      body.scale.setScalar(a.role === 'air' ? 2 : 2.6);
      body.userData.agentId = a.id;
      g.add(body);
      // 小范围光柱和地面圈，让远景也能找到它
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 60, 5).translate(0, 30, 0), this._mat(COLORS[a.role], 0.55));
      g.add(beam);
      const halo = new THREE.Mesh(this.geo.disc, this._mat(COLORS[a.role], 0.28));
      halo.scale.setScalar(a.role === 'air' ? 6 : 4);
      halo.position.y = 0.4;
      g.add(halo);
      if (a.detectR) {
        const ring = new THREE.Mesh(this.geo.ring, this._mat(COLORS[a.role], 0.5));
        ring.scale.setScalar(a.detectR);
        ring.position.y = 0.5;
        ring.userData.detect = true;
        g.add(ring);
      }
      g.userData.body = body;
      g.userData.halo = halo;
      g.userData.beam = beam;
      this.group.add(g);
      this.agentMeshes.set(a.id, g);
      this.pickables.push(body);
    }
  }

  // 贴地色带比 1 像素的线在航拍高度下清楚得多；空中航线用细线，只示意
  _ribbon(loop, color, half, lift, opacity) {
    const pos = [];
    const idx = [];
    const P = loop.points;
    for (let i = 0; i < P.length; i++) {
      const a = P[Math.max(0, i - 1)];
      const b = P[Math.min(P.length - 1, i + 1)];
      const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      const nx = -(b.z - a.z) / len * half;
      const nz = (b.x - a.x) / len * half;
      const y = this.groundY(P[i].x, P[i].z) + lift;
      pos.push(P[i].x + nx, y, P[i].z + nz, P[i].x - nx, y, P[i].z - nz);
      if (i) {
        const k = i * 2;
        idx.push(k - 2, k - 1, k, k - 1, k + 1, k);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    const m = this._mat(color, opacity);
    m.polygonOffset = true;
    m.polygonOffsetFactor = -2;
    m.polygonOffsetUnits = -2;
    const mesh = new THREE.Mesh(g, m);
    mesh.renderOrder = 3;
    return mesh;
  }

  _buildRoutes() {
    this.groundRoute = this._ribbon(this.sim.groundLoop, COLORS.ground, 1.8, 1.2, 0.7);
    const air = this.sim.airLoop.points.map((p) => new THREE.Vector3(p.x, this.groundY(p.x, p.z) + 42, p.z));
    this.airRoute = new THREE.Line(new THREE.BufferGeometry().setFromPoints(air), new THREE.LineBasicMaterial({ color: COLORS.air, transparent: true, opacity: 0.6, fog: false }));
    this.group.add(this.groundRoute, this.airRoute);
    // 分区点位
    this.sectorPins = this.sim.sectors.map((s) => {
      const m = new THREE.Mesh(this.geo.disc, this._mat(0xffffff, 0.16));
      m.scale.setScalar(16);
      m.position.set(s.x, this.groundY(s.x, s.z) + 0.6, s.z);
      this.group.add(m);
      return m;
    });
  }

  // 五个分区的真实轮廓：半透明地面填充 + 描边，让观众一眼看出功能区范围
  _buildAreas(project) {
    this.areas = [];
    this.areaFills = [];
    this.areaGroup = new THREE.Group();
    for (const area of ZONE_AREAS) {
      const pts = area.ring.map(([lon, lat]) => project(lon, lat));
      const shape = new THREE.Shape(pts.map((p) => new THREE.Vector2(p.x, p.z)));
      const fillGeo = new THREE.ShapeGeometry(shape);
      fillGeo.rotateX(Math.PI / 2);
      const pos = fillGeo.attributes.position;
      for (let i = 0; i < pos.count; i++) pos.setY(i, this.groundY(pos.getX(i), pos.getZ(i)) + 0.35);
      const fill = new THREE.Mesh(fillGeo, this._mat(0xe4b15a, 0.12));
      fill.renderOrder = 2;
      const edge = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(pts.map((p) => new THREE.Vector3(p.x, this.groundY(p.x, p.z) + 0.5, p.z))),
        new THREE.LineBasicMaterial({ color: 0xe4b15a, transparent: true, opacity: 0.85, fog: false }),
      );
      this.areaFills.push(fill);
      this.areaGroup.add(fill, edge);
      const c = pts.reduce((a, p) => ({ x: a.x + p.x / pts.length, z: a.z + p.z / pts.length }), { x: 0, z: 0 });
      this.areas.push({ id: area.id, name: area.name, x: c.x, z: c.z });
    }
    this.group.add(this.areaGroup);
  }

  // 填充不受光照影响，夜里要压低，否则会盖住灯光
  setNight(night) {
    if (this.night === night) return;
    this.night = night;
    for (const f of this.areaFills) f.material.opacity = night ? 0.025 : 0.12;
  }

  show(on) {
    this.group.visible = !!on;
  }

  setRouteVisible(on) {
    this.groundRoute.visible = on;
    this.airRoute.visible = on;
    for (const m of this.sectorPins) m.visible = on;
  }

  select(id) {
    this.selected = id;
  }

  _incidentMesh(inc) {
    const g = new THREE.Group();
    const color = LEVEL_COLORS[inc.level] ?? LEVEL_COLORS[1];
    const pin = new THREE.Mesh(this.geo.pin, this._mat(color));
    const cone = new THREE.Mesh(this.geo.cone, this._mat(color));
    const area = new THREE.Mesh(this.geo.disc, this._mat(color, 0.3));
    area.scale.setScalar(9);
    area.position.y = 0.7;
    const ring = new THREE.Mesh(this.geo.pulse, this._mat(color, 0.9));
    ring.position.y = 0.8;
    g.add(pin, cone, area, ring);
    g.userData = { pin, cone, area, ring, color };
    g.position.set(inc.x, this.groundY(inc.x, inc.z), inc.z);
    this.group.add(g);
    return g;
  }

  update(time) {
    if (!this.group.visible) return;
    for (const a of this.sim.agents) {
      const g = this.agentMeshes.get(a.id);
      const gy = this.groundY(a.x, a.z);
      const lift = a.role === 'air' ? a.curAlt : 0;
      g.position.set(a.x, gy + lift, a.z);
      g.userData.body.rotation.y = a.heading;
      if (a.role === 'air') {
        g.userData.halo.position.y = -lift + 0.4;
        // 光柱从机身垂到地面
        g.userData.beam.scale.y = Math.max(0.05, lift / 60);
        g.userData.beam.position.y = -lift;
        g.userData.body.position.y = Math.sin(time * 5 + a.x) * 0.25;
      }
      const sel = a.id === this.selected;
      g.userData.halo.material.opacity = sel ? 0.55 : 0.28;
      for (const c of g.children) if (c.userData.detect) c.visible = a.mode === 'patrol' || sel;
      const working = a.mode === 'work';
      const base = a.role === 'air' ? 2 : 2.6;
      g.userData.body.scale.setScalar(working ? base * (1 + Math.sin(time * 9) * 0.06) : base);
    }
    const seen = new Set();
    for (const inc of this.sim.incidents) {
      seen.add(inc.id);
      let g = this.incidentMeshes.get(inc.id);
      if (!g) {
        g = this._incidentMesh(inc);
        this.incidentMeshes.set(inc.id, g);
      }
      const u = g.userData;
      const hidden = inc.state === 'open';
      const resolved = inc.state === 'resolved';
      // 未被发现的事件在三维里只画一圈淡淡的“问号区”，被发现后才亮起红色标记
      u.pin.visible = !hidden;
      u.cone.visible = !hidden && !resolved;
      u.cone.position.y = Math.sin(time * 3) * 1.2;
      u.cone.rotation.y = time * 1.6;
      const col = resolved ? 0x59d68e : hidden ? 0x7f8fa0 : (LEVEL_COLORS[inc.level] ?? LEVEL_COLORS[1]);
      for (const m of [u.pin, u.cone, u.area, u.ring]) m.material.color.setHex(col);
      u.area.material.opacity = hidden ? 0.12 : 0.3;
      const pulse = 1 + ((time * 0.8) % 1) * 2.2;
      u.ring.scale.setScalar(hidden ? 10 : 9 * pulse);
      u.ring.material.opacity = hidden ? 0.35 : 0.9 * (1 - ((time * 0.8) % 1));
    }
    for (const [id, g] of this.incidentMeshes) {
      if (seen.has(id)) continue;
      this.group.remove(g);
      g.traverse((o) => o.material?.dispose());
      this.incidentMeshes.delete(id);
    }
  }

  // 屏幕上的点击命中哪个智能体
  pick(ray) {
    const hits = ray.intersectObjects(this.pickables, false);
    return hits.length ? hits[0].object.userData.agentId : null;
  }
}
