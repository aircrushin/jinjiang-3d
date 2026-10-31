// 第一人称可走区域：真实建筑与补全地块的占地挡住脚步，架空构筑物不挡地面。

import { BLD, FILL } from '../world/schema.js';

const CELL = 48;
const PAD = 0.45;

function put(grid, cx, cz, ux, uz, w, d) {
  const len = Math.hypot(ux, uz) || 1;
  const box = { cx, cz, ux: ux / len, uz: uz / len, hw: w * 0.5 + PAD, hd: d * 0.5 + PAD };
  const reach = Math.hypot(box.hw, box.hd);
  const i0 = Math.floor((cx - reach) / CELL);
  const i1 = Math.floor((cx + reach) / CELL);
  const j0 = Math.floor((cz - reach) / CELL);
  const j1 = Math.floor((cz + reach) / CELL);
  for (let i = i0; i <= i1; i++) {
    for (let j = j0; j <= j1; j++) {
      const key = `${i},${j}`;
      let list = grid.get(key);
      if (!list) grid.set(key, (list = []));
      list.push(box);
    }
  }
}

export function buildWalkBlockers(S) {
  const grid = new Map();
  const bm = S?.bldMeta;
  if (bm) {
    for (let i = 0; i < bm.length; i += BLD.N) {
      if (bm[i + BLD.BASE] > 2.5) continue;
      if (bm[i + BLD.TOP] - bm[i + BLD.BASE] < 1.2) continue;
      put(grid, bm[i + BLD.CX], bm[i + BLD.CZ], bm[i + BLD.UX], bm[i + BLD.UZ], bm[i + BLD.W], bm[i + BLD.D]);
    }
  }
  const fill = S?.fill;
  if (fill) {
    for (let i = 0; i < fill.length; i += FILL.N) {
      if (fill[i + FILL.H] < 1.6) continue;
      put(grid, fill[i + FILL.X], fill[i + FILL.Z], fill[i + FILL.UX], fill[i + FILL.UZ], fill[i + FILL.W], fill[i + FILL.D]);
    }
  }
  return {
    blocked(x, z) {
      const list = grid.get(`${Math.floor(x / CELL)},${Math.floor(z / CELL)}`);
      if (!list) return false;
      for (let i = 0; i < list.length; i++) {
        const b = list[i];
        const dx = x - b.cx;
        const dz = z - b.cz;
        const along = dx * b.ux + dz * b.uz;
        const across = -dx * b.uz + dz * b.ux;
        if (Math.abs(along) < b.hw && Math.abs(across) < b.hd) return true;
      }
      return false;
    },
  };
}

// 返回可站立处的地面高度；水里、城外或墙里为 null。
export function makeWalkProbe(D) {
  const blockers = buildWalkBlockers(D.S);
  return (x, z) => {
    const geo = D.geo;
    if (!geo?.inCity(x, z, -2)) return null;
    if (geo.sdAll(x, z) < 1.8) return null;
    if (blockers.blocked(x, z)) return null;
    return geo.height(x, z);
  };
}
