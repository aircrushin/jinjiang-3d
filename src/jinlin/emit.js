// 把锦邻公寓的示意楼栋写进场景构件缓冲，和补全街区走同一条渲染路径（立面着色器、阴影、距离剔除）。

import { ST, rooftop } from '../world/parts.js';
import { RNG, hash32, lin } from '../core/rng.js';

const FLOOR_H = 3.0;
const linHex = (v) => lin(`#${v.toString(16).padStart(6, '0')}`);

export function emitJinlin(P, jl, groundY = () => 0) {
  for (const b of jl.items) {
    const rot = Math.atan2(-b.uz, b.ux);
    const gy = groundY(b.x, b.z);
    const wall = linHex(b.wall);
    const trim = linHex(b.trim);
    const tower = b.kind === 'tower';
    P.y0 = gy;
    P.add('box', b.x, 0, b.z, rot, b.w, b.h, b.d, tower ? ST.RESI : ST.WALKUP, wall, trim, FLOOR_H, tower ? 3.5 : 3.3, tower ? 0.6 : 0.5);
    if (tower) rooftop(P, new RNG(hash32(Math.round(b.x * 10), Math.round(b.z * 10), 61)), { x: b.x, z: b.z, ux: b.ux, uz: b.uz }, rot, b.w, b.d, b.h, 'mid');
  }
  P.y0 = 0;
}
