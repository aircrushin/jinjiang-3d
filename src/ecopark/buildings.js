// 白鹭湾科技生态园办公楼的建筑细节：勒脚、檐口压顶、入口雨棚与玻璃门厅、玻璃楼梯筒、竖向遮阳翅片、
// 屋面的设备机房、冷却塔、空调外机、光伏板和避雷针。
// OSM 里这片建筑只有轮廓，墙面由全城共用的立面着色器画窗洞。这里在轮廓外沿补构件，让体量有层次。
// 位置全部取自建筑轮廓和最近的道路，细节是示意的，不对应具体楼宇。
//
// 着色器里所有朝上的面都按“屋面”着色（深灰），只有 METAL 等少数风格取构件自身的颜色，
// 所以勒脚、压顶、雨棚这类要看见顶面颜色的构件一律用 METAL。

import { BLD } from '../world/schema.js';
import { ST } from '../world/parts.js';
import { RNG, hash32, lin } from '../core/rng.js';
import { inRing, nearestOnRing } from './geom.js';
import { roadDist, sampleRoads } from './layout.js';

const ACCENTS = ['#2f6db3', '#2a8a7a', '#c9822a', '#566b7a'];
const TRIM = '#e6e3dc';
const PLINTH = '#8d9296';
const CORE = '#e8e6e0';
const GLASS = '#2d4a5c';
const MULLION = '#c7ccd0';
const UNIT = '#aeb3b5';

const ENTRANCE_W = 9.5;
const LOBBY_H = 4.4;
const LOBBY_DEPTH = 1.6;
const CANOPY_DEPTH = 3.6;
const CORE_W = 5.5;
const MIN_FIN_EDGE = 18;

const colors = new Map();
const col = (hex) => {
  let c = colors.get(hex);
  if (!c) colors.set(hex, (c = lin(hex)));
  return c;
};

const box = (P, x, z, rot, y, sx, sy, sz, style, ca, cb = ca, fh = 3, cw = 3, lit = 0) =>
  P.add('box', x, y, z, rot, sx, sy, sz, style, col(ca), col(cb), fh, cw, lit);

// ---------- 轮廓 ----------
function ringOf(S, k) {
  const ri = S.bldMeta[k * BLD.N + BLD.RING0];
  const p0 = S.bldRings[ri * 2];
  const n = S.bldRings[ri * 2 + 1];
  const ring = [];
  for (let i = 0; i < n; i++) ring.push({ x: S.bldPts[(p0 + i) * 2], z: S.bldPts[(p0 + i) * 2 + 1] });
  return ring;
}

// 每条边：切向 t、朝外的法向 n，以及这条边在立面纹理里的起点 u0（和 buildings.js 里累加 u 的方式一致）
function edgesOf(ring) {
  const out = [];
  let u = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (len < 1e-3) continue;
    const tx = (b.x - a.x) / len;
    const tz = (b.z - a.z) / len;
    let nx = tz;
    let nz = -tx;
    if (inRing((a.x + b.x) / 2 + nx * 0.8, (a.z + b.z) / 2 + nz * 0.8, ring)) {
      nx = -nx;
      nz = -nz;
    }
    out.push({ a, b, len, tx, tz, nx, nz, u0: u, rot: Math.atan2(nx, nz) });
    u += len;
  }
  return out;
}

// 边上 t 处、向外 off 米的点
const at = (e, t, off = 0) => ({ x: e.a.x + e.tx * t + e.nx * off, z: e.a.z + e.tz * t + e.nz * off });

// 在边上放一个方盒：沿边宽 w，向外进深 depth，中心离墙面 off
function onEdge(P, e, t, off, y, w, h, depth, style, ca, cb, fh, cw, lit) {
  const p = at(e, t, off);
  box(P, p.x, p.z, e.rot, y, w, h, depth, style, ca, cb, fh, cw, lit);
}

// ---------- 立面 ----------
function plinthAndCoping(P, edges, top, parapet) {
  for (const e of edges) {
    if (e.len < 3) continue;
    const mid = e.len / 2;
    onEdge(P, e, mid, 0.1, 0, e.len + 0.4, 0.9, 0.2, ST.METAL, PLINTH);
    if (parapet) onEdge(P, e, mid, -0.1, top + parapet - 0.05, e.len + 0.8, 0.3, 0.8, ST.METAL, TRIM);
  }
}

function entrance(P, e, t, accent, hgt) {
  onEdge(P, e, t, LOBBY_DEPTH / 2, 0, ENTRANCE_W, LOBBY_H, LOBBY_DEPTH, ST.CURTAIN, GLASS, MULLION, 3, 2.6, 0.5);
  onEdge(P, e, t, CANOPY_DEPTH / 2, LOBBY_H + 0.15, ENTRANCE_W + 3, 0.3, CANOPY_DEPTH, ST.METAL, accent);
  for (const s of [-1, 1]) onEdge(P, e, t + s * (ENTRANCE_W / 2 + 1), CANOPY_DEPTH - 0.4, 0, 0.35, LOBBY_H + 0.15, 0.35, ST.METAL, TRIM);
  onEdge(P, e, t, 2.8, 0, ENTRANCE_W + 4, 0.12, 5.6, ST.METAL, '#c9c6bd');
  if (hgt >= 8) onEdge(P, e, t, 0.13, LOBBY_H + 0.7, Math.min(ENTRANCE_W - 1, 8), 1.1, 0.26, ST.SIGN, accent, '#ffffff', 1, 1, 1);
}

// 玻璃楼梯筒：凸出墙面，比屋面高出一层机房
function stairCore(P, e, t, accent, top) {
  onEdge(P, e, t, 0.7, 0, CORE_W, top + 2.6, 1.4, ST.CURTAIN, GLASS, accent, 3.2, 2.7, 0.5);
}

// 竖向遮阳翅片：落在窗格的分隔线上，避开入口和楼梯筒
function fins(P, e, cellW, fh, top, parapet, skip) {
  const m0 = Math.ceil((e.u0 + 1) / cellW);
  for (let m = m0; m * cellW - e.u0 < e.len - 1; m++) {
    const t = m * cellW - e.u0;
    if (skip.some(([c, half]) => Math.abs(t - c) < half)) continue;
    onEdge(P, e, t, 0.25, fh, 0.2, top + parapet - fh, 0.5, ST.PLAIN, TRIM);
  }
}

// ---------- 屋面 ----------
function roofPlacer(ring, F, top, rng) {
  const placed = [];
  const rot = Math.atan2(-F.uz, F.ux);
  const local = (a, b) => ({ x: F.cx + F.ux * a - F.uz * b, z: F.cz + F.uz * a + F.ux * b });
  const free = (p, rad) =>
    inRing(p.x, p.z, ring) && nearestOnRing(ring, p.x, p.z).d >= 3.5 + rad && placed.every((q) => Math.hypot(q.x - p.x, q.z - p.z) >= q.rad + rad + 1);
  // 随机找一处放得下半径 rad 的空位
  const find = (rad, ok = () => true) => {
    for (let n = 0; n < 80; n++) {
      const p = local(rng.float(-0.45, 0.45) * F.w, rng.float(-0.45, 0.45) * F.d);
      if (free(p, rad) && ok(p)) {
        placed.push({ x: p.x, z: p.z, rad });
        return p;
      }
    }
    return null;
  };
  return { find, local, rot, top };
}

function roofEquipment(P, ring, F, top, rng, accent, big) {
  const R = roofPlacer(ring, F, top, rng);
  const { rot } = R;
  const vz = F.ux; // 局部 z 轴 v = (-uz, ux) 的世界 z 分量

  // 设备机房（百叶围护）
  for (let n = 0; n < (big ? 2 : 1); n++) {
    const p = R.find(5.6);
    if (!p) break;
    box(P, p.x, p.z, rot, top, 9, 2.6, 5, ST.METAL, '#b5babc');
    box(P, p.x, p.z, rot, top + 2.6, 9.4, 0.25, 5.4, ST.METAL, TRIM);
  }
  // 电梯机房 / 楼梯间
  for (let n = 0; n < (big ? 2 : 1); n++) {
    const p = R.find(3.4);
    if (!p) break;
    box(P, p.x, p.z, rot, top, 4.5, 3.3, 4.5, ST.PLAIN, CORE);
    box(P, p.x, p.z, rot, top + 3.3, 4.9, 0.25, 4.9, ST.METAL, accent);
  }
  // 冷却塔：平台上并排两三座
  const ct = R.find(6.5);
  if (ct) {
    const k = rng.int(2, 3);
    box(P, ct.x, ct.z, rot, top, 3.9 * k + 0.6, 0.5, 4.4, ST.PLAIN, '#9a9d9c');
    for (let i = 0; i < k; i++) {
      const dx = (i - (k - 1) / 2) * 3.9;
      const x = ct.x + Math.cos(rot) * dx;
      const z = ct.z - Math.sin(rot) * dx;
      P.add('cyl', x, top + 0.5, z, 0, 3.4, 3.0, 3.4, ST.METAL, col('#c4c8ca'), col('#ffffff'), 3, 1, 0);
      box(P, x, z, rot, top + 3.5, 2.6, 0.25, 2.6, ST.METAL, '#6c7a82');
    }
  }
  // 空调外机：一排压在低矮的基座上
  for (let n = 0; n < (big ? 2 : 1); n++) {
    const cnt = rng.int(4, 7);
    const p = R.find(2.2 * cnt * 0.5 + 1);
    if (!p) break;
    box(P, p.x, p.z, rot, top, cnt * 2.2 + 0.4, 0.3, 1.6, ST.PLAIN, '#9a9d9c');
    for (let i = 0; i < cnt; i++) {
      const dx = (i - (cnt - 1) / 2) * 2.2;
      box(P, p.x + Math.cos(rot) * dx, p.z - Math.sin(rot) * dx, rot, top + 0.3, 1.8, 1.3, 1.0, ST.METAL, UNIT);
    }
  }
  // 光伏板：朝南（世界 +z）倾斜，两排各若干块，四角都要落在屋面内
  if (big) {
    const rotS = rot + (vz > 0 ? Math.PI : 0);
    const cols = 5;
    const rows = 2;
    const hw = (cols * 3.4) / 2;
    const hd = (rows * 3.6) / 2;
    const p = R.find(11, (q) => [[hw, hd], [-hw, hd], [hw, -hd], [-hw, -hd]].every(([a, b]) => {
      const c = { x: q.x + F.ux * a - F.uz * b, z: q.z + F.uz * a + F.ux * b };
      return inRing(c.x, c.z, ring) && nearestOnRing(ring, c.x, c.z).d >= 3.5;
    }));
    if (p) {
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const a = (c + 0.5) * 3.4 - hw;
          const b = (r + 0.5) * 3.6 - hd;
          P.add('wedge', p.x + F.ux * a - F.uz * b, top + 0.3, p.z + F.uz * a + F.ux * b, rotS, 3.2, 1.0, 1.8, ST.METAL, col('#223a57'), col('#223a57'), 3, 1, 0);
        }
      }
    }
  }
  // 避雷针
  const m = R.find(1);
  if (m) P.add('cyl', m.x, top, m.z, 0, 0.25, 7, 0.25, ST.METAL, col('#b8bcc0'), col('#ffffff'), 3, 1, 0);
}

// ---------- 总装 ----------
export function emitEcoBuildings(P, D, styled) {
  if (!styled || !styled.length) return { offices: 0, utility: 0 };
  const S = D.S;
  const bm = S.bldMeta;
  const xs = styled.map((k) => bm[k * BLD.N + BLD.CX]);
  const zs = styled.map((k) => bm[k * BLD.N + BLD.CZ]);
  const roads = sampleRoads(D.roads, {
    x0: Math.min(...xs) - 150,
    x1: Math.max(...xs) + 150,
    z0: Math.min(...zs) - 150,
    z1: Math.max(...zs) + 150,
  });
  const stats = { offices: 0, utility: 0 };
  for (const k of styled) {
    const o = k * BLD.N;
    const rng = new RNG(hash32(k, 909));
    const base = bm[o + BLD.BASE];
    const top = bm[o + BLD.TOP];
    const hgt = top - base;
    const ring = ringOf(S, k);
    const edges = edgesOf(ring);
    const F = { cx: bm[o + BLD.CX], cz: bm[o + BLD.CZ], ux: bm[o + BLD.UX], uz: bm[o + BLD.UZ], w: bm[o + BLD.W], d: bm[o + BLD.D] };
    const accent = rng.pick(ACCENTS);
    const flat = bm[o + BLD.ROOF] === 0;
    // 与 buildings.js 里的女儿墙高度保持一致
    const parapet = flat && hgt >= 6 && ring.length <= 64 ? (hgt > 25 ? 1.1 : 0.9) : 0;
    if (hgt < 6) {
      // 配套用房：只补一组屋面设备
      roofEquipment(P, ring, F, top, rng, accent, false);
      stats.utility++;
      continue;
    }
    stats.offices++;
    plinthAndCoping(P, edges, top, parapet);

    // 入口：选离道路最近的长边；大体量再开第二个入口
    const long = edges.filter((e) => e.len >= 20);
    const byRoad = long
      .map((e) => {
        const m = at(e, e.len / 2, 6);
        return { e, score: roadDist(roads, m.x, m.z) };
      })
      .sort((p, q) => p.score - q.score);
    const perim = edges.reduce((s, e) => s + e.len, 0);
    const doors = [];
    for (const { e } of byRoad.slice(0, perim > 450 ? 2 : 1)) {
      const lo = ENTRANCE_W / 2 + 4;
      const t = Math.max(lo, Math.min(e.len - lo, e.len * (0.5 + rng.float(-0.15, 0.15))));
      entrance(P, e, t, accent, hgt);
      doors.push({ e, t });
    }

    // 玻璃楼梯筒：放在没有入口的最长边上
    const coreEdge = long.filter((e) => !doors.some((d) => d.e === e)).sort((p, q) => q.len - p.len)[0];
    const core = coreEdge && { e: coreEdge, t: coreEdge.len * (rng.chance(0.5) ? 0.3 : 0.7) };
    if (core) stairCore(P, core.e, core.t, accent, top);

    // 遮阳翅片：只给窗洞立面的楼，最多两条边
    if (bm[o + BLD.STYLE] === ST.PUNCHED && rng.chance(0.65)) {
      const cw = bm[o + BLD.CELL_W];
      const fh = bm[o + BLD.FLOOR_H];
      let used = 0;
      for (const e of long.slice().sort((p, q) => q.len - p.len)) {
        if (used >= 2 || e.len < MIN_FIN_EDGE) break;
        const skip = [];
        for (const d of doors) if (d.e === e) skip.push([d.t, ENTRANCE_W / 2 + 2]);
        if (core && core.e === e) skip.push([core.t, CORE_W / 2 + 1]);
        fins(P, e, cw, fh, top, parapet, skip);
        used++;
      }
    }

    roofEquipment(P, ring, F, top, rng, accent, bm[o + BLD.AREA] > 2500);
  }
  return stats;
}
