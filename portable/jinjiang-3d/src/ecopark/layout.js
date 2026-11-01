// 白鹭湾科技生态园 A–E 区的设施布局：围界与大门、停车区、配套设施（垃圾收集站、电动车充电棚、
// 配电房、装卸区）以及巡检事件的落点。纯数据，不依赖 three.js，输出一组方盒描述符交给 emit.js 渲染。
//
// 位置规则都来自这片区域的真实几何：分区轮廓、建筑占地和道路。设施的种类和摆法是按产业园常见配置
// 示意的，不对应具体的现场设备。

import { BLD, LAMP, POOL, TREE_REC } from '../world/schema.js';
import { RNG, hash32 } from '../core/rng.js';
import { ZONE_AREAS, DRAIN_POINTS } from '../patrol/zone.js';
import { inRing, nearestOnRing, projectRing, ringBounds } from './geom.js';

const GATE_HALF = 4.2; // 大门通行宽度的一半
const FENCE_STEP = 4.5; // 围界立柱间距
const STALL_W = 2.6;
const STALL_L = 5.2;
const CAR_COLORS = ['#e9ebec', '#c3c8cb', '#2b2f33', '#8e969b', '#a8322d', '#27456d', '#e9ebec', '#3b3f44'];
const EBIKE_COLORS = ['#2b2f33', '#3f6f9f', '#a8322d', '#6d7f8a', '#e0b22e'];

// ---------- 几何工具 ----------
const obb = (cx, cz, ux, uz, hw, hd) => ({ cx, cz, ux, uz, hw, hd });

// 两个有向矩形是否相距不足 m（分离轴法）
function overlap(a, b, m = 0) {
  const dx = b.cx - a.cx;
  const dz = b.cz - a.cz;
  for (const [ax, az] of [[a.ux, a.uz], [-a.uz, a.ux], [b.ux, b.uz], [-b.uz, b.ux]]) {
    const ra = a.hw * Math.abs(ax * a.ux + az * a.uz) + a.hd * Math.abs(-ax * a.uz + az * a.ux);
    const rb = b.hw * Math.abs(ax * b.ux + az * b.uz) + b.hd * Math.abs(-ax * b.uz + az * b.ux);
    if (Math.abs(dx * ax + dz * az) > ra + rb + m) return false;
  }
  return true;
}

export function insideRect(r, x, z, m = 0) {
  const dx = x - r.cx;
  const dz = z - r.cz;
  return Math.abs(dx * r.ux + dz * r.uz) < r.hw + m && Math.abs(-dx * r.uz + dz * r.ux) < r.hd + m;
}

function samplePoints(r, step = 3) {
  const nu = Math.max(1, Math.ceil((2 * r.hw) / step));
  const nv = Math.max(1, Math.ceil((2 * r.hd) / step));
  const out = [];
  for (let i = 0; i <= nu; i++) {
    for (let j = 0; j <= nv; j++) {
      const a = -r.hw + (2 * r.hw * i) / nu;
      const b = -r.hd + (2 * r.hd * j) / nv;
      out.push([r.cx + r.ux * a - r.uz * b, r.cz + r.uz * a + r.ux * b]);
    }
  }
  return out;
}

function outwardNormal(ring, a, b) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dz) || 1;
  let nx = dz / len;
  let nz = -dx / len;
  if (inRing((a.x + b.x) / 2 + nx * 1.5, (a.z + b.z) / 2 + nz * 1.5, ring)) {
    nx = -nx;
    nz = -nz;
  }
  return { nx, nz, tx: dx / len, tz: dz / len, len };
}

// 在 c 处放一个方盒：dir 是它的“前向”（局部 z），a 沿前向偏移，b 沿右手侧偏移
function piece(items, c, dir, a, b, y, w, h, l, style, ca) {
  items.push({
    x: c.x + dir.x * a + dir.z * b,
    y,
    z: c.z + dir.z * a - dir.x * b,
    rot: Math.atan2(dir.x, dir.z),
    sx: w,
    sy: h,
    sz: l,
    style,
    ca,
  });
}

// ---------- 输入整理 ----------
function buildingRects(bm, bounds) {
  const out = [];
  for (let i = 0; i < bm.length; i += BLD.N) {
    const cx = bm[i + BLD.CX];
    const cz = bm[i + BLD.CZ];
    if (cx < bounds.x0 || cx > bounds.x1 || cz < bounds.z0 || cz > bounds.z1) continue;
    out.push(obb(cx, cz, bm[i + BLD.UX], bm[i + BLD.UZ], bm[i + BLD.W] / 2, bm[i + BLD.D] / 2));
  }
  return out;
}

export function sampleRoads(roads, bounds) {
  const out = [];
  for (const r of roads) {
    if (r.cls === 7) continue;
    for (let i = 0; i < r.pts.length - 1; i++) {
      const a = r.pts[i];
      const b = r.pts[i + 1];
      const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 8));
      for (let k = 0; k <= n; k++) {
        const x = a[0] + ((b[0] - a[0]) * k) / n;
        const z = a[1] + ((b[1] - a[1]) * k) / n;
        if (x > bounds.x0 && x < bounds.x1 && z > bounds.z0 && z < bounds.z1) out.push({ x, z });
      }
    }
  }
  return out;
}

export const roadDist = (roadPts, x, z) => roadPts.reduce((m, p) => Math.min(m, Math.hypot(p.x - x, p.z - z)), Infinity);

// ---------- 大门与围界 ----------
function pickGates(zone, roadPts) {
  const cands = [];
  for (const rp of roadPts) {
    const q = nearestOnRing(zone.ring, rp.x, rp.z);
    if (q.d > 38) continue;
    const a = zone.ring[q.seg];
    const b = zone.ring[(q.seg + 1) % zone.ring.length];
    const e = outwardNormal(zone.ring, a, b);
    if (e.len < 50) continue;
    const along = Math.max(16, Math.min(e.len - 16, q.t * e.len));
    cands.push({ d: q.d, seg: q.seg, along, a, e });
  }
  cands.sort((p, q) => p.d - q.d);
  const gates = [];
  for (const c of cands) {
    const g = { x: c.a.x + c.e.tx * c.along, z: c.a.z + c.e.tz * c.along, nx: c.e.nx, nz: c.e.nz, tx: c.e.tx, tz: c.e.tz, seg: c.seg, along: c.along, zone: zone.id };
    if (gates.every((h) => Math.hypot(h.x - g.x, h.z - g.z) > 75)) gates.push(g);
    if (gates.length >= 2) break;
  }
  return gates;
}

function fenceFor(zone, gates, blds) {
  const posts = [];
  const rails = [];
  const ring = zone.ring;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const e = outwardNormal(ring, a, ring[(i + 1) % ring.length]);
    const cuts = gates.filter((g) => g.seg === i).map((g) => [g.along - GATE_HALF - 0.8, g.along + GATE_HALF + 0.8]);
    const ts = [];
    for (let t = 0; t <= e.len; t += 0.5) ts.push(t);
    ts.push(e.len);
    const on = ts.map((t) => !cuts.some(([c0, c1]) => t > c0 && t < c1) && !blds.some((r) => insideRect(r, a.x + e.tx * t, a.z + e.tz * t, 1.2)));
    let start = null;
    for (let k = 0; k < ts.length; k++) {
      if (on[k] && start === null) start = ts[k];
      const last = k === ts.length - 1;
      if (start !== null && (!on[k] || last)) {
        const end = on[k] ? ts[k] : ts[k - 1];
        if (end - start >= 1) {
          const mid = (start + end) / 2;
          rails.push({ x: a.x + e.tx * mid, z: a.z + e.tz * mid, tx: e.tx, tz: e.tz, len: end - start });
          const n = Math.max(1, Math.ceil((end - start) / FENCE_STEP));
          for (let j = 0; j <= n; j++) posts.push({ x: a.x + e.tx * (start + ((end - start) * j) / n), z: a.z + e.tz * (start + ((end - start) * j) / n) });
        }
        start = null;
      }
    }
  }
  return { posts, rails };
}

function gateItems(items, g) {
  const dir = { x: g.nx, z: g.nz };
  const c = { x: g.x, z: g.z };
  for (const s of [-1, 1]) piece(items, c, dir, 0, s * GATE_HALF, 0, 0.7, 3.1, 0.7, 'PLAIN', '#d9d7cf');
  piece(items, c, dir, 0, 0, 3.1, GATE_HALF * 2 + 0.7, 0.9, 0.5, 'SIGN', '#2f6db3');
  // 道闸：立柱旁的机箱 + 红白两节栏杆
  piece(items, c, dir, 0.5, -GATE_HALF + 0.9, 0, 0.5, 1.0, 0.5, 'METAL', '#5d6b73');
  piece(items, c, dir, 0.5, -GATE_HALF + 1.9, 1.0, 1.9, 0.14, 0.14, 'METAL', '#c3281e');
  piece(items, c, dir, 0.5, -GATE_HALF + 3.8, 1.0, 1.9, 0.14, 0.14, 'METAL', '#ecebe6');
  // 岗亭在围界内侧、通道一旁
  const booth = { x: c.x - dir.x * 3.4 + dir.z * (GATE_HALF + 2.3), z: c.z - dir.z * 3.4 - dir.x * (GATE_HALF + 2.3) };
  piece(items, booth, dir, 0, 0, 0, 2.4, 2.6, 3.0, 'PLAIN', '#ebe9e2');
  piece(items, booth, dir, 0, 0, 2.6, 3.0, 0.14, 3.6, 'METAL', '#7a8588');
  piece(items, booth, dir, 1.52, 0, 1.0, 1.9, 0.9, 0.06, 'METAL', '#2a3944');
}

// ---------- 配套设施 ----------
const FACILITY = {
  garbage: { w: 6, l: 4.4, label: '垃圾收集站' },
  ebike: { w: 11, l: 4.2, label: '电动车充电棚' },
  substation: { w: 8, l: 6, label: '配电房' },
  loading: { w: 14, l: 11, label: '装卸区' },
};

function facilityItems(items, kind, c, dir, rng) {
  if (kind === 'garbage') {
    piece(items, c, dir, -0.6, 0, 0, 4.6, 2.8, 2.8, 'PLAIN', '#9aa79c');
    piece(items, c, dir, 0.85, 0, 0, 2.4, 2.0, 0.1, 'METAL', '#4a5b52');
    ['#2f6f4a', '#c0392b', '#2c5aa0', '#2f6f4a'].forEach((col, k) => piece(items, c, dir, 1.9, -2.1 + k * 1.4, 0, 1.1, 0.95, 0.9, 'METAL', col));
  } else if (kind === 'ebike') {
    piece(items, c, dir, 0, 0, 2.6, 11, 0.16, 4.2, 'METAL', '#7ea4bf');
    for (const sa of [-1.9, 1.9]) for (const sb of [-5.2, 5.2]) piece(items, c, dir, sa, sb, 0, 0.14, 2.6, 0.14, 'METAL', '#5d6b73');
    piece(items, c, dir, -1.95, 0, 0.9, 9.6, 0.9, 0.25, 'METAL', '#6c7f89');
    for (let k = 0; k < 13; k++) {
      if (rng.chance(0.2)) continue;
      piece(items, c, dir, rng.chance(0.5) ? -0.7 : 0.5, -4.5 + k * 0.75, 0, 0.55, 1.0, 1.75, 'METAL', rng.pick(EBIKE_COLORS));
    }
  } else if (kind === 'substation') {
    piece(items, c, dir, -0.4, 0, 0, 6.2, 3.6, 4.4, 'PLAIN', '#b7bbb6');
    piece(items, c, dir, -0.4, 0, 3.6, 6.6, 0.2, 4.8, 'METAL', '#8d9496');
    piece(items, c, dir, 1.85, -1.2, 0, 1.4, 2.2, 0.1, 'METAL', '#3d4a52');
    piece(items, c, dir, 1.85, 1.5, 0.6, 1.6, 0.9, 0.08, 'METAL', '#5d6b73');
    piece(items, c, dir, 1.0, 3.7, 0, 1.8, 1.7, 1.3, 'METAL', '#6f7f86');
  } else if (kind === 'loading') {
    piece(items, c, dir, -4, 0, 0, 13, 1.1, 3, 'PLAIN', '#a9acab');
    piece(items, c, dir, 0, 0, 4.6, 14, 0.2, 11, 'METAL', '#9fb0b8');
    for (const sa of [-5, 5]) for (const sb of [-6.6, 6.6]) piece(items, c, dir, sa, sb, 0, 0.25, 4.6, 0.25, 'METAL', '#6c7a82');
    piece(items, c, dir, 0.5, 2.5, 0.3, 2.5, 2.8, 6.0, 'METAL', '#e9ebec');
    piece(items, c, dir, 4.4, 2.5, 0.3, 2.4, 2.1, 1.7, 'METAL', '#2c5aa0');
    for (let k = 0; k < 3; k++) piece(items, c, dir, -4, -3.5 + k * 1.6, 1.1, 1.2, 1.1, 0.9, 'METAL', '#b89868');
  }
}

// ---------- 停车区 ----------
function carItems(items, c, dir, rng) {
  const col = rng.pick(CAR_COLORS);
  piece(items, c, dir, 0, 0, 0.28, 1.8, 0.78, 4.4, 'METAL', col);
  piece(items, c, dir, -0.15, 0, 0.95, 1.62, 0.65, 2.3, 'METAL', col);
  piece(items, c, dir, -0.15, 0, 1.0, 1.66, 0.4, 2.5, 'METAL', '#1f2a33');
}

function parkingItems(items, block, rng) {
  const u = { x: block.ux, z: block.uz };
  const v = { x: -block.uz, z: block.ux };
  const len = block.hw * 2;
  const m = Math.round(len / STALL_W);
  const at = (a, b) => ({ x: block.cx + u.x * a + v.x * b, z: block.cz + u.z * a + v.z * b });
  for (let k = 0; k <= m; k++) piece(items, at(-block.hw + k * STALL_W, 0), v, 0, 0, 0.04, 0.1, 0.03, STALL_L * 2, 'METAL', '#e8e8e4');
  piece(items, at(0, 0), u, 0, 0, 0.04, 0.1, 0.03, len, 'METAL', '#e8e8e4');
  for (let k = 0; k < m; k++) {
    for (const row of [-1, 1]) {
      if (!rng.chance(0.62)) continue;
      // 车头朝向过道，车尾靠中线
      carItems(items, at(-block.hw + (k + 0.5) * STALL_W, row * STALL_L * 0.5), { x: v.x * row, z: v.z * row }, rng);
    }
  }
}

// ---------- 总装 ----------
export function buildEcoPark(D, areas = ZONE_AREAS, drains = DRAIN_POINTS) {
  const origin = D.meta.origin;
  const zones = areas.map((a) => {
    const ring = projectRing(a.ring, origin);
    const b = ringBounds(ring);
    return { id: a.id, name: a.name, ring, bounds: b, cx: (b.x0 + b.x1) / 2, cz: (b.z0 + b.z1) / 2 };
  });
  const pad = 80;
  const bounds = {
    x0: Math.min(...zones.map((z) => z.bounds.x0)) - pad,
    x1: Math.max(...zones.map((z) => z.bounds.x1)) + pad,
    z0: Math.min(...zones.map((z) => z.bounds.z0)) - pad,
    z1: Math.max(...zones.map((z) => z.bounds.z1)) + pad,
  };
  const blds = buildingRects(D.S.bldMeta, bounds);
  const roadPts = sampleRoads(D.roads, bounds);
  const items = [];
  const pois = [];
  const spots = { gate: [], fence: [], loading: [], drain: [], garbage: [], ebike: [], substation: [] };
  const stats = { posts: 0, rails: 0, gates: 0, blocks: 0, cars: 0, facilities: 0 };
  const placed = [];
  const clearOnly = [];
  const zoneOf = (x, z) => zones.find((q) => inRing(x, z, q.ring)) || zones.reduce((best, q) => (Math.hypot(q.cx - x, q.cz - z) < Math.hypot(best.cx - x, best.cz - z) ? q : best), zones[0]);
  const rngOf = (zone, salt) => new RNG(hash32(zone.id.charCodeAt(0), salt));

  const fits = (zone, r, { inset = 5, bm = 4, pm = 3 } = {}) =>
    samplePoints(r).every(([x, z]) => inRing(x, z, zone.ring) && nearestOnRing(zone.ring, x, z).d >= inset) &&
    !blds.some((b) => overlap(b, r, bm)) &&
    !placed.some((p) => overlap(p, r, pm));

  // 1) 大门、围界
  const gatesOf = new Map();
  for (const zone of zones) {
    const gates = pickGates(zone, roadPts);
    gatesOf.set(zone.id, gates);
    for (const g of gates) {
      gateItems(items, g);
      // 大门内侧留出通行区，不放别的东西；门外一段人行道只清树，不挡别的布置
      placed.push(obb(g.x - g.nx * 6, g.z - g.nz * 6, g.tx, g.tz, GATE_HALF + 5, 7));
      clearOnly.push(obb(g.x + g.nx * 3, g.z + g.nz * 3, g.tx, g.tz, GATE_HALF + 2, 5));
      const name = `${zone.id}区大门`;
      spots.gate.push({ x: g.x + g.nx * 6, z: g.z + g.nz * 6, label: '大门', sector: zone.id });
      pois.push({ name, kind: 'gate', x: g.x, z: g.z });
      stats.gates++;
    }
    const fence = fenceFor(zone, gates, blds);
    for (const p of fence.posts) piece(items, p, { x: 0, z: 1 }, 0, 0, 0, 0.14, 1.8, 0.14, 'METAL', '#4d575c');
    for (const r of fence.rails) {
      const dir = { x: r.tx, z: r.tz };
      piece(items, r, dir, 0, 0, 1.6, 0.06, 0.08, r.len, 'METAL', '#4d575c');
      piece(items, r, dir, 0, 0, 0.8, 0.06, 0.08, r.len, 'METAL', '#4d575c');
    }
    stats.posts += fence.posts.length;
    stats.rails += fence.rails.length * 2;
  }

  // 2) 配套设施：优先放在指定分区，放不下再换别的分区；越靠近道路越好，方便处置人员到达
  const plan = [['garbage', 'A'], ['ebike', 'B'], ['substation', 'C'], ['loading', 'D'], ['garbage', 'D'], ['ebike', 'E'], ['substation', 'E'], ['loading', 'C']];
  plan.forEach(([kind, pref], n) => {
    const spec = FACILITY[kind];
    const order = [zones.find((q) => q.id === pref), ...zones.filter((q) => q.id !== pref)];
    for (const zone of order) {
      const gates = gatesOf.get(zone.id);
      let best = null;
      for (let i = 0; i < zone.ring.length; i++) {
        const a = zone.ring[i];
        const e = outwardNormal(zone.ring, a, zone.ring[(i + 1) % zone.ring.length]);
        for (let t = spec.w / 2 + 6; t <= e.len - spec.w / 2 - 6; t += 3) {
          const inset = 6 + spec.l / 2;
          const c = { x: a.x + e.tx * t - e.nx * inset, z: a.z + e.tz * t - e.nz * inset };
          const r = obb(c.x, c.z, e.tx, e.tz, spec.w / 2, spec.l / 2);
          if (!fits(zone, r, { inset: 4.5, bm: 3.5, pm: 3 })) continue;
          if (gates.some((g) => Math.hypot(g.x - c.x, g.z - c.z) < 22)) continue;
          const score = roadDist(roadPts, c.x, c.z);
          if (score > 55) continue;
          if (!best || score < best.score) best = { score, c, r, dir: { x: -e.nx, z: -e.nz } };
        }
      }
      if (!best) continue;
      placed.push(best.r);
      facilityItems(items, kind, best.c, best.dir, rngOf(zone, 300 + n));
      spots[kind].push({ x: best.c.x, z: best.c.z, label: spec.label, sector: zone.id });
      pois.push({ name: spec.label, kind, x: best.c.x, z: best.c.z });
      stats.facilities++;
      return;
    }
  });

  // 3) 停车区：在剩下的空地里随机找，每个分区最多 3 块
  for (const zone of zones) {
    const rng = rngOf(zone, 77);
    let made = 0;
    for (let attempt = 0; attempt < 160 && made < 3; attempt++) {
      const alongX = rng.chance(0.5);
      const hw = (rng.int(6, 12) * STALL_W) / 2;
      const c = { x: rng.float(zone.bounds.x0, zone.bounds.x1), z: rng.float(zone.bounds.z0, zone.bounds.z1) };
      const r = alongX ? obb(c.x, c.z, 1, 0, hw, STALL_L) : obb(c.x, c.z, 0, 1, hw, STALL_L);
      if (!fits(zone, r, { inset: 6, bm: 5.5, pm: 3 })) continue;
      const before = items.length;
      parkingItems(items, r, rng);
      stats.cars += items.slice(before).filter((it) => it.sy === 0.78).length;
      placed.push(r);
      made++;
      stats.blocks++;
    }
  }

  // 4) 围界事件落点：每个分区挑两处离大门最远的围界，在围界外 1.5 m
  for (const zone of zones) {
    const gates = gatesOf.get(zone.id);
    const found = [];
    for (let i = 0; i < zone.ring.length; i++) {
      const a = zone.ring[i];
      const e = outwardNormal(zone.ring, a, zone.ring[(i + 1) % zone.ring.length]);
      for (let t = 20; t <= e.len - 20; t += 5) {
        const x = a.x + e.tx * t;
        const z = a.z + e.tz * t;
        if (blds.some((r) => insideRect(r, x, z, 3))) continue;
        found.push({ x: x + e.nx * 1.5, z: z + e.nz * 1.5, far: gates.reduce((m, g) => Math.min(m, Math.hypot(g.x - x, g.z - z)), 999) });
      }
    }
    found.sort((p, q) => q.far - p.far);
    const picked = [];
    for (const f of found) {
      if (picked.every((p) => Math.hypot(p.x - f.x, p.z - f.z) > 60)) picked.push(f);
      if (picked.length >= 2) break;
    }
    for (const f of picked) spots.fence.push({ x: f.x, z: f.z, label: '围界', sector: zone.id });
  }
  // 装卸区的“大门口占道”也算占道障碍的落点
  for (const s of spots.loading) spots.gate.push({ ...s, label: '装卸区' });

  // 5) 路口排水口
  for (const d of drains) {
    const x = (d.lon - origin.lon) * origin.kx;
    const z = -(d.lat - origin.lat) * origin.kz;
    spots.drain.push({ x, z, label: '路口排水口', sector: zoneOf(x, z).id });
  }

  return { zones, items, pois, spots, stats, buildings: blds, gates: Object.fromEntries(gatesOf), zoneOf, clear: [...placed, ...clearOnly] };
}

// 路灯数据跟植被一起晚到：到齐后挑出园区周边的路灯作为“路灯故障”的落点
export function lampSpots(D, eco, count = 14) {
  const L = D.lamps;
  if (!L) return [];
  const rng = new RNG(hash32(515, 9));
  const near = [];
  for (let i = 0; i < L.length; i += 6) {
    if (L[i + 5] !== 0) continue;
    const x = L[i];
    const z = L[i + 2];
    if (eco.zones.some((q) => nearestOnRing(q.ring, x, z).d < 18)) near.push({ x, z });
  }
  const out = [];
  while (near.length && out.length < count) {
    const p = near.splice(Math.floor(rng.next() * near.length), 1)[0];
    out.push({ x: p.x, z: p.z, label: '路灯', sector: eco.zoneOf(p.x, p.z).id });
  }
  return out;
}

// 行道树和园区布置重叠的要拿掉（挡大门、压停车位、长在设施里）。树数据在植被加载后才有，
// 所以单独成一步；只重建被改动的那几类树的数组。
export function clearEcoTrees(D, eco) {
  let removed = 0;
  D.trees.forEach((T, kind) => {
    if (!T || !T.length) return;
    const keep = [];
    for (let i = 0; i < T.length; i += TREE_REC.N) {
      if (eco.clear.some((r) => insideRect(r, T[i + TREE_REC.X], T[i + TREE_REC.Z], 1.5))) removed++;
      else keep.push(i);
    }
    if (keep.length === T.length / TREE_REC.N) return;
    const out = new T.constructor(keep.length * TREE_REC.N);
    keep.forEach((src, n) => out.set(T.subarray(src, src + TREE_REC.N), n * TREE_REC.N));
    D.trees[kind] = out;
  });
  return removed;
}

// 大门通行区、停车位和设施里的路灯（连同它在地面上的光斑）也要拿掉，否则灯杆会立在车道中间。
// 只清路灯和普通灯光投影（POOL.KIND === 0）；骑楼廊下、桥洞等其他光斑不动。
export function clearEcoLamps(D, eco) {
  const hit = (x, z) => eco.clear.some((r) => insideRect(r, x, z, 1.2));
  const strip = (arr, N, xi, zi, skip) => {
    const keep = [];
    for (let i = 0; i < arr.length; i += N) if (skip(i) || !hit(arr[i + xi], arr[i + zi])) keep.push(i);
    if (keep.length === arr.length / N) return arr;
    const out = new arr.constructor(keep.length * N);
    keep.forEach((src, n) => out.set(arr.subarray(src, src + N), n * N));
    return out;
  };
  const lamps0 = D.lamps.length / LAMP.N;
  const pools0 = D.pools.length / POOL.N;
  D.lamps = strip(D.lamps, LAMP.N, LAMP.X, LAMP.Z, () => false);
  D.pools = strip(D.pools, POOL.N, POOL.X, POOL.Z, (i) => D.pools[i + POOL.KIND] !== 0);
  return { lamps: lamps0 - D.lamps.length / LAMP.N, pools: pools0 - D.pools.length / POOL.N };
}
