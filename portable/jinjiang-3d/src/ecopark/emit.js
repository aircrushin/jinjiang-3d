// 把生态园布局（layout.js 的方盒描述符）写进场景的构件缓冲，和补全街区、屋顶设备走同一条渲染路径。
// 材质、阴影和按距离剔除都由现有的立面着色器与 buildParts 处理，这里只做数据转换。

import { ST } from '../world/parts.js';
import { lin } from '../core/rng.js';

const colors = new Map();
const linear = (hex) => {
  let c = colors.get(hex);
  if (!c) colors.set(hex, (c = lin(hex)));
  return c;
};

export function emitEcoPark(P, eco, groundY = () => 0) {
  for (const it of eco.items) {
    const c = linear(it.ca);
    const style = ST[it.style];
    // 招牌着色器要的是 (层高, 开间, 亮度) = (1, 1, 1)；其余构件不发光
    const sign = style === ST.SIGN;
    P.add('box', it.x, it.y + groundY(it.x, it.z), it.z, it.rot, it.sx, it.sy, it.sz, style, c, c, sign ? 1 : 3, sign ? 1 : 3, sign ? 1 : 0);
  }
}
