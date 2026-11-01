// 白鹭湾科技生态园 A–E 区的建筑外观。
// OSM 里这片建筑只有轮廓（building=yes，没有高度和用途），通用规则会把它们当成多层住宅。
// 这里按产业园常见的样式覆盖外观：浅色铝板 + 窗洞的办公楼，大体量做绿色屋面，
// 小体量当配套用房。屋面保持平屋顶：全城共用的“绿色屋面”着色器直接取立面颜色，
// 套在浅色铝板上会发白，所以这里不用。高度仍是数据里的估计值，外观是示意，不对应具体楼宇。

import { BLD } from '../world/schema.js';
import { ST } from '../world/parts.js';
import { RNG, hash32 } from '../core/rng.js';
import { ZONE_AREAS } from '../patrol/zone.js';
import { inRing, projectRing } from './geom.js';

// 铝板色取中浅灰，近乎纯白的颜色在日光下会过曝成一片白
const PANEL = ['#cfd1cc', '#c5cacb', '#d5cfc3', '#bcc4c8', '#cbc5b7', '#c9cdd0'];
const GLASS = ['#5b7a86', '#4c6975', '#56707e', '#667a86'];
const UTILITY = ['#b9c0c3', '#aab3b7', '#c4c9c9'];
const hexInt = (s) => parseInt(s.slice(1), 16);

// 低于这个高度的体量按配套用房处理（岗亭、设备间、连廊棚）
const UTILITY_H = 6;

export function applyEcoParkStyle(D, areas = ZONE_AREAS) {
  if (D.ecoParkStyled) return D.ecoParkStyled;
  const rings = areas.map((a) => projectRing(a.ring, D.meta.origin));
  const bm = D.S.bldMeta;
  const styled = [];
  for (let i = 0, k = 0; i < bm.length; i += BLD.N, k++) {
    const x = bm[i + BLD.CX];
    const z = bm[i + BLD.CZ];
    if (!rings.some((r) => inRing(x, z, r))) continue;
    const r = new RNG(hash32(k, 515));
    const hgt = bm[i + BLD.TOP] - bm[i + BLD.BASE];
    if (hgt < UTILITY_H) {
      const c = hexInt(r.pick(UTILITY));
      bm[i + BLD.STYLE] = ST.PLAIN;
      bm[i + BLD.COL_A] = c;
      bm[i + BLD.COL_B] = c;
      bm[i + BLD.FLOOR_H] = hgt;
      bm[i + BLD.LIT] = 0.2;
    } else {
      // 层高取整：让窗户行数是整数，顶上不留半层
      const floors = Math.max(2, Math.round(hgt / 3.6));
      bm[i + BLD.STYLE] = ST.PUNCHED;
      bm[i + BLD.COL_A] = hexInt(r.pick(PANEL));
      bm[i + BLD.COL_B] = hexInt(r.pick(GLASS));
      bm[i + BLD.FLOOR_H] = hgt / floors;
      bm[i + BLD.CELL_W] = r.pick([3.3, 3.6]);
      bm[i + BLD.LIT] = r.float(0.35, 0.6);
    }
    styled.push(k);
  }
  D.ecoParkStyled = styled;
  return styled;
}
