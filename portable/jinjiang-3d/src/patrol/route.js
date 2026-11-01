// 巡检路线：折线、环线与取点。纯数据，不依赖 three.js 和 DOM。

import { pointAt } from '../tour/planner.js';

export function makeRoute(points) {
  const cum = [0];
  for (let i = 1; i < points.length; i++) cum.push(cum[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z));
  return { points, cum, length: cum[cum.length - 1] || 0 };
}

export function straightRoute(a, b) {
  return makeRoute([{ x: a.x, y: 0, z: a.z }, { x: b.x, y: 0, z: b.z }]);
}

// 把各分区之间的路线首尾相接成一个环，并记下每个分区在环上的里程。
// route(a, b) 返回 makeRoute 形态的路线。
export function buildLoop(sectors, route) {
  const points = [];
  const starts = [];
  for (let i = 0; i < sectors.length; i++) {
    const leg = route(sectors[i], sectors[(i + 1) % sectors.length]);
    const skip = points.length && leg.points.length && Math.hypot(points[points.length - 1].x - leg.points[0].x, points[points.length - 1].z - leg.points[0].z) < 1 ? 1 : 0;
    starts.push(points.length - skip);
    for (let k = skip; k < leg.points.length; k++) points.push(leg.points[k]);
  }
  const loop = makeRoute(points);
  loop.offsets = starts.map((idx) => loop.cum[Math.max(0, idx)] || 0);
  return loop;
}

export function loopPoint(loop, s) {
  const total = loop.length || 1;
  return pointAt(loop.points, loop.cum, ((s % total) + total) % total);
}

export { pointAt };
