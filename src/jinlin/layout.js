// 锦邻公寓地块的示意楼栋布局。纯数据，不依赖 three.js。
//
// OSM way 1346656240 只给出了 landuse=construction 的地块轮廓，没有楼栋轮廓、层数或户型。
// 这里按地块的真实形状摆放板式住宅楼，层高与外观参照周边已有的 OSM 公寓楼（约 3.0 m/层、
// 暖灰外墙）。楼栋位置、朝向与层数是示意，不对应实际规划或施工进度。

import { projectRing, inRing } from '../ecopark/geom.js';

export const JINLIN_WAY = 1346656240;
// 地块轮廓（经度, 纬度），首尾不重复
export const JINLIN_RING = [
  [104.1038171, 30.5999334],
  [104.1063915, 30.6001644],
  [104.1064626, 30.5995767],
  [104.1061484, 30.5991418],
  [104.1039372, 30.598943],
];
export const JINLIN_CENTER = [104.10535, 30.59955];

const FLOOR_H = 3.0;
const SETBACK = 9; // 楼栋外沿离地块边界的最小距离
const WALLS = [0xd8d1c3, 0xd2cabb, 0xdcd5c8, 0xcfc8ba];
const TRIM = 0x8a7b6b;

// 楼栋规格：fu 沿地块长边的位置比例，fv 垂直方向偏移（米，相对地块中线）
const TOWERS = [
  { fu: 0.15, fv: -21, w: 40, d: 17, floors: 33 },
  { fu: 0.46, fv: -21, w: 40, d: 17, floors: 30 },
  { fu: 0.78, fv: -21, w: 38, d: 17, floors: 34 },
  { fu: 0.3, fv: 22, w: 36, d: 17, floors: 28 },
  { fu: 0.64, fv: 22, w: 36, d: 17, floors: 31 },
];
const CLUB = { fu: 0.86, fv: 12, w: 18, d: 12, floors: 2 };
const GAP = 6; // 楼栋之间的最小净距

const corners = (b) => {
  const out = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const a = (sx * b.w) / 2;
    const c = (sz * b.d) / 2;
    out.push([b.x + b.ux * a - b.uz * c, b.z + b.uz * a + b.ux * c]);
  }
  return out;
};

// 点到环的最近距离
function distToRing(ring, x, z) {
  let best = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1)));
    best = Math.min(best, Math.hypot(a.x + dx * t - x, a.z + dz * t - z));
  }
  return best;
}

// 两个有向矩形是否相距不足 m（分离轴法）
function near(a, b, m) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  for (const [ax, az] of [[a.ux, a.uz], [-a.uz, a.ux]]) {
    const ra = (a.w / 2) * Math.abs(ax * a.ux + az * a.uz) + (a.d / 2) * Math.abs(-ax * a.uz + az * a.ux);
    const rb = (b.w / 2) * Math.abs(ax * b.ux + az * b.uz) + (b.d / 2) * Math.abs(-ax * b.uz + az * b.ux);
    if (Math.abs(dx * ax + dz * az) > ra + rb + m) return false;
  }
  return true;
}

export const fitsParcel = (ring, b, margin = SETBACK) => corners(b).every(([x, z]) => inRing(x, z, ring) && distToRing(ring, x, z) >= margin);

export function buildJinlin(D, ring = JINLIN_RING) {
  const R = projectRing(ring, D.meta.origin);
  // 长边方向：取最长的一条边
  let li = 0;
  let ll = 0;
  R.forEach((a, i) => {
    const b = R[(i + 1) % R.length];
    const l = Math.hypot(b.x - a.x, b.z - a.z);
    if (l > ll) [li, ll] = [i, l];
  });
  const A = R[li];
  const B = R[(li + 1) % R.length];
  const ux = (B.x - A.x) / ll;
  const uz = (B.z - A.z) / ll;
  const vx = -uz;
  const vz = ux;
  const cx = R.reduce((s, p) => s + p.x, 0) / R.length;
  const cz = R.reduce((s, p) => s + p.z, 0) / R.length;
  // 地块在 (u, v) 坐标下的范围，楼栋按比例落在 u 范围内
  let u0 = Infinity;
  let u1 = -Infinity;
  for (const p of R) {
    const u = (p.x - cx) * ux + (p.z - cz) * uz;
    u0 = Math.min(u0, u);
    u1 = Math.max(u1, u);
  }
  const items = [];
  const skipped = [];
  const place = (spec, kind, i) => {
    let { fv } = spec;
    const u = u0 + (u1 - u0) * spec.fu;
    // 放不下时向地块中线收拢，最多收 12 m
    for (let k = 0; k < 13; k++) {
      const b = { x: cx + ux * u + vx * fv, z: cz + uz * u + vz * fv, ux, uz, w: spec.w, d: spec.d };
      if (fitsParcel(R, b) && !items.some((o) => near(o, b, GAP))) {
        items.push({ kind, ...b, h: spec.floors * FLOOR_H + (kind === 'tower' ? 1.2 : 0.4), floors: spec.floors, wall: WALLS[i % WALLS.length], trim: TRIM });
        return;
      }
      fv -= Math.sign(fv) || 1;
    }
    skipped.push(`${kind}${i}`);
  };
  TOWERS.forEach((t, i) => place(t, 'tower', i));
  place(CLUB, 'club', 0);
  return { ring: R, items, skipped, frame: { cx, cz, ux, uz, u0, u1 } };
}
