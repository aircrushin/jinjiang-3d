// 生态园模块共用的平面几何：经纬度环 → 场景坐标、点在多边形内、点到环的最近点。

export function projectRing(ring, origin) {
  return ring.map(([lon, lat]) => ({ x: (lon - origin.lon) * origin.kx, z: -(lat - origin.lat) * origin.kz }));
}

export function inRing(x, z, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (a.z > z !== b.z > z && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

export function ringBounds(ring) {
  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (const p of ring) {
    x0 = Math.min(x0, p.x);
    x1 = Math.max(x1, p.x);
    z0 = Math.min(z0, p.z);
    z1 = Math.max(z1, p.z);
  }
  return { x0, x1, z0, z1 };
}

// 点到闭合环的最近点。seg 是最近的那条边的序号（第 seg 点到第 seg+1 点）。
export function nearestOnRing(ring, x, z) {
  let best = null;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / len2));
    const px = a.x + dx * t;
    const pz = a.z + dz * t;
    const d = Math.hypot(px - x, pz - z);
    if (!best || d < best.d) best = { x: px, z: pz, d, seg: i, t };
  }
  return best;
}
