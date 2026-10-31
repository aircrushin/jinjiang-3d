// 把兴趣点收成一条步行路线：先在真实道路上建图，再按顺序寻路。
// 步行按 4.5 公里/小时估算。订位字段原样带出，规划本身不访问网络。

import { DEFAULT_START } from './catalog.js';

const WALK_MPM = 75;
const EXPRESS = 7;
const CELL = 32;
const MAX_STOPS = 5;
const MAX_LEG = 2200;
const SNAP = 280;

let cachedRoads = null;
let cachedGraph = null;

export function clearRouteGraphCache() {
  cachedRoads = null;
  cachedGraph = null;
}

export function formatMinutes(min) {
  if (min < 0.5) return '不到 1 分钟';
  const m = Math.max(1, Math.round(min));
  if (m < 60) return `${m} 分钟`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} 小时 ${r} 分` : `${h} 小时`;
}

export function formatMeters(m) {
  if (m < 30) return '不到 30 米';
  if (m < 950) return `${Math.round(m / 10) * 10} 米`;
  return `${(m / 1000).toFixed(1)} 公里`;
}

// placeIds 给定时是固定主题线：按这个顺序走，不再按兴趣挑点，也不限站数和单段长度。
export function planItinerary({ places, interests, placeIds, roads, project, start = DEFAULT_START, maxStops = MAX_STOPS, maxLeg = MAX_LEG }) {
  const fixed = Array.isArray(placeIds) && placeIds.length > 0;
  const want = [...(interests || [])];
  if ((!fixed && !want.length) || !places?.length || !project) return null;
  const chosen = fixed ? fixedPlaces(places, placeIds) : selectPlaces(places, want, project, start, maxStops, maxLeg);
  if (!chosen.length) return null;
  const graph = graphFor(roads || []);
  const located = [];
  for (const place of chosen) {
    const at = project(place.lon, place.lat);
    if (!Number.isFinite(at?.x) || !Number.isFinite(at?.z)) continue;
    const hit = graph.nodes.length ? nearest(graph, at.x, at.z, SNAP) : -1;
    const node = hit >= 0 ? graph.nodes[hit] : null;
    located.push({
      place,
      x: node ? node.x : at.x,
      z: node ? node.z : at.z,
      y: node ? node.y : 0,
      node: hit,
    });
  }
  const stopsLoc = [];
  for (const loc of located) {
    const prev = stopsLoc[stopsLoc.length - 1];
    if (prev && Math.hypot(prev.x - loc.x, prev.z - loc.z) < 45) continue;
    stopsLoc.push(loc);
  }
  if (!stopsLoc.length) return null;

  const raw = [];
  let directLegs = 0;
  const push = (x, y, z) => {
    const last = raw[raw.length - 1];
    if (last && Math.hypot(last.x - x, last.z - z) < 1) return;
    raw.push({ x, y: y || 0, z });
  };
  push(stopsLoc[0].x, stopsLoc[0].y, stopsLoc[0].z);
  for (let i = 1; i < stopsLoc.length; i++) {
    const a = stopsLoc[i - 1];
    const b = stopsLoc[i];
    if (a.node >= 0 && b.node >= 0 && a.node !== b.node) {
      const path = astar(graph.nodes, a.node, b.node);
      if (path) {
        for (const idx of path) push(graph.nodes[idx].x, graph.nodes[idx].y, graph.nodes[idx].z);
        continue;
      }
    }
    if (!(a.node >= 0 && a.node === b.node)) directLegs += 1;
    const dist = Math.hypot(b.x - a.x, b.z - a.z);
    const steps = Math.max(1, Math.ceil(dist / 16));
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      push(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);
    }
  }
  const points = raw.length > 1 ? resample(raw, 8) : raw.map((p) => ({ ...p }));
  const cum = cumulative(points);
  const selected = new Set(want);
  const stops = stopsLoc.map((loc) => {
    let best = 0;
    let bd = Infinity;
    for (let i = 0; i < points.length; i++) {
      const d = Math.hypot(points[i].x - loc.x, points[i].z - loc.z);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    const at = points[best];
    const matched = fixed ? loc.place.interests : loc.place.interests.filter((id) => selected.has(id));
    return {
      id: loc.place.id,
      name: loc.place.name,
      preview: loc.place.preview,
      dwellMin: loc.place.dwellMin,
      interests: loc.place.interests,
      matched,
      lon: loc.place.lon,
      lat: loc.place.lat,
      x: at.x,
      y: at.y,
      z: at.z,
      dist: cum[best],
      links: {
        map: mapUrl(loc.place.lon, loc.place.lat),
        booking: loc.place.booking || null,
      },
    };
  });
  let walkMeters = cum[cum.length - 1] || 0;
  let cursor = 0;
  let dwellMin = 0;
  for (let i = 0; i < stops.length; i++) {
    const walk = i === 0 ? 0 : Math.max(0, stops[i].dist - stops[i - 1].dist);
    stops[i].walkMeters = walk;
    stops[i].walkMin = walk / WALK_MPM;
    stops[i].arriveMin = cursor + stops[i].walkMin;
    cursor = stops[i].arriveMin + stops[i].dwellMin;
    dwellMin += stops[i].dwellMin;
  }
  if (!walkMeters && stops.length > 1) walkMeters = stops[stops.length - 1].dist;
  return {
    interests: want,
    fixed,
    stops,
    points,
    cum,
    walkMeters,
    walkMin: walkMeters / WALK_MPM,
    dwellMin,
    totalMin: cursor,
    activeId: stops[0].id,
    stats: { graphMs: graph.graphMs, nodes: graph.nodes.length, directLegs, cached: graph.cached },
  };
}

export function pointAt(points, cum, dist) {
  if (!points.length) return { x: 0, y: 0, z: 0, groundY: 0 };
  if (points.length === 1 || dist <= 0) return withGround(points[0]);
  const total = cum[cum.length - 1] || 0;
  if (dist >= total) return withGround(points[points.length - 1]);
  let lo = 1;
  let hi = cum.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] < dist) lo = mid + 1;
    else hi = mid;
  }
  const span = cum[lo] - cum[lo - 1] || 1;
  const t = (dist - cum[lo - 1]) / span;
  const a = points[lo - 1];
  const b = points[lo];
  return withGround({
    x: a.x + (b.x - a.x) * t,
    y: (a.y || 0) + ((b.y || 0) - (a.y || 0)) * t,
    z: a.z + (b.z - a.z) * t,
    groundY: (a.groundY ?? a.y ?? 0) + ((b.groundY ?? b.y ?? 0) - (a.groundY ?? a.y ?? 0)) * t,
  });
}

function withGround(p) {
  return { x: p.x, y: p.y || 0, z: p.z, groundY: p.groundY ?? p.y ?? 0 };
}

function mapUrl(lon, lat) {
  const la = lat.toFixed(6);
  const lo = lon.toFixed(6);
  return `https://www.openstreetmap.org/?mlat=${la}&mlon=${lo}#map=18/${la}/${lo}`;
}

function fixedPlaces(places, ids) {
  const byId = new Map(places.map((p) => [p.id, p]));
  return ids.map((id) => byId.get(id)).filter(Boolean);
}

function selectPlaces(places, interests, project, start, maxStops, maxLeg) {
  const want = new Set(interests);
  const matched = places.filter((p) => p.interests?.some((id) => want.has(id)));
  if (!matched.length) return [];
  const loc = new Map();
  for (const p of matched) loc.set(p.id, project(p.lon, p.lat));
  const dist = (a, b) => {
    const A = loc.get(a.id);
    const B = loc.get(b.id);
    return Math.hypot(A.x - B.x, A.z - B.z);
  };
  const ranked = matched
    .map((p) => {
      const overlap = p.interests.filter((id) => want.has(id)).length;
      let near = 0;
      for (const q of matched) if (q !== p && dist(p, q) < 1200) near += 1;
      return { p, key: overlap * 10 + near };
    })
    .sort((a, b) => b.key - a.key || a.p.name.localeCompare(b.p.name, 'zh'));
  const chosen = [ranked[0].p];
  const rest = ranked.slice(1);
  while (chosen.length < maxStops && rest.length) {
    let best = -1;
    let bestKey = -Infinity;
    for (let i = 0; i < rest.length; i++) {
      let d = Infinity;
      for (const c of chosen) d = Math.min(d, dist(c, rest[i].p));
      if (d > maxLeg) continue;
      const key = rest[i].key * 1000 - d;
      if (key > bestKey) {
        bestKey = key;
        best = i;
      }
    }
    if (best < 0) break;
    chosen.push(rest.splice(best, 1)[0].p);
  }
  return openPath(chosen, loc, project(start.lon, start.lat));
}

// 站数很少，直接枚举走法。正反两条一样长时，从离春熙路更近的一端出发。
function openPath(chosen, loc, anchor) {
  if (chosen.length < 3) {
    const ranked = chosen
      .map((p) => ({ p, d: Math.hypot(loc.get(p.id).x - anchor.x, loc.get(p.id).z - anchor.z) }))
      .sort((a, b) => a.d - b.d);
    return ranked.map((item) => item.p);
  }
  const at = chosen.map((p) => loc.get(p.id));
  const idx = chosen.map((_, i) => i);
  let best = idx.slice();
  let bestD = Infinity;
  let bestStart = Infinity;
  const walk = (arr, k) => {
    if (k === arr.length) {
      let d = 0;
      for (let i = 1; i < arr.length; i++) d += Math.hypot(at[arr[i]].x - at[arr[i - 1]].x, at[arr[i]].z - at[arr[i - 1]].z);
      const startD = Math.hypot(at[arr[0]].x - anchor.x, at[arr[0]].z - anchor.z);
      if (d < bestD - 0.5 || (Math.abs(d - bestD) <= 0.5 && startD < bestStart)) {
        bestD = d;
        bestStart = startD;
        best = arr.slice();
      }
      return;
    }
    for (let i = k; i < arr.length; i++) {
      const tmp = arr[k];
      arr[k] = arr[i];
      arr[i] = tmp;
      walk(arr, k + 1);
      arr[i] = arr[k];
      arr[k] = tmp;
    }
  };
  walk(idx, 0);
  return best.map((i) => chosen[i]);
}

function graphFor(roads) {
  if (roads === cachedRoads && cachedGraph) return { ...cachedGraph, graphMs: 0, cached: true };
  const t0 = performance.now();
  const built = buildGraph(roads);
  cachedRoads = roads;
  cachedGraph = built;
  return { ...built, graphMs: performance.now() - t0, cached: false };
}

function buildGraph(roads) {
  const nodes = [];
  const buckets = new Map();
  const addNode = (x, z, y, end) => {
    const i = nodes.length;
    nodes.push({ x, z, y: y || 0, end: !!end, edges: [] });
    const key = `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
    let bucket = buckets.get(key);
    if (!bucket) buckets.set(key, (bucket = []));
    bucket.push(i);
    return i;
  };
  const link = (a, b, costK) => {
    if (a === b || a < 0 || b < 0) return;
    const A = nodes[a];
    const B = nodes[b];
    let d = Math.hypot(A.x - B.x, A.z - B.z);
    if (d > 90) return;
    if (d < 0.05) d = 0.05;
    if (A.edges.some((e) => e.to === b)) return;
    const cost = d * costK;
    A.edges.push({ to: b, d, cost });
    B.edges.push({ to: a, d, cost });
  };
  for (const road of roads) {
    const pts = road.pts;
    if (!pts || pts.length < 2 || road.cls === EXPRESS) continue;
    const costK = road.ped ? 1 : road.cls === 0 ? 1.45 : road.cls === 1 || road.cls === 6 ? 1.2 : 1.05;
    const samples = [];
    const pushSample = (x, z, y) => {
      const prev = samples[samples.length - 1];
      if (prev && Math.hypot(prev.x - x, prev.z - z) < 0.4) {
        prev.y = y || 0;
        return;
      }
      samples.push({ x, z, y: y || 0 });
    };
    pushSample(pts[0][0], pts[0][1], road.ys?.[0] || 0);
    for (let i = 1; i < pts.length; i++) {
      const ax = pts[i - 1][0];
      const az = pts[i - 1][1];
      const ay = road.ys?.[i - 1] || 0;
      const bx = pts[i][0];
      const bz = pts[i][1];
      const by = road.ys?.[i] || 0;
      const seg = Math.hypot(bx - ax, bz - az);
      const n = Math.max(1, Math.ceil(seg / 32));
      for (let s = 1; s <= n; s++) {
        const t = s / n;
        pushSample(ax + (bx - ax) * t, az + (bz - az) * t, ay + (by - ay) * t);
      }
    }
    if (samples.length < 2) continue;
    let prevId = -1;
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      const id = addNode(s.x, s.z, s.y, i === 0 || i === samples.length - 1);
      if (prevId >= 0) link(prevId, id, costK);
      prevId = id;
    }
  }
  for (let i = 0; i < nodes.length; i++) {
    const A = nodes[i];
    const cx = Math.floor(A.x / CELL);
    const cz = Math.floor(A.z / CELL);
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        const bucket = buckets.get(`${cx + dx},${cz + dz}`);
        if (!bucket) continue;
        for (const j of bucket) {
          if (j <= i) continue;
          const B = nodes[j];
          const d = Math.hypot(A.x - B.x, A.z - B.z);
          if (d <= 14 || (d <= 42 && A.end && B.end)) link(i, j, 1);
        }
      }
    }
  }
  return { nodes, buckets, cell: CELL };
}

function nearest(graph, x, z, maxDist) {
  const { nodes, buckets, cell } = graph;
  const reach = Math.ceil(maxDist / cell);
  const cx = Math.floor(x / cell);
  const cz = Math.floor(z / cell);
  let best = -1;
  let bd = maxDist;
  for (let dx = -reach; dx <= reach; dx++) {
    for (let dz = -reach; dz <= reach; dz++) {
      const bucket = buckets.get(`${cx + dx},${cz + dz}`);
      if (!bucket) continue;
      for (const i of bucket) {
        const d = Math.hypot(nodes[i].x - x, nodes[i].z - z);
        if (d < bd) {
          bd = d;
          best = i;
        }
      }
    }
  }
  return best;
}

function astar(nodes, a, b) {
  if (a === b) return [a];
  const h = (i) => Math.hypot(nodes[i].x - nodes[b].x, nodes[i].z - nodes[b].z);
  const g = new Float64Array(nodes.length);
  g.fill(Infinity);
  const prev = new Int32Array(nodes.length);
  prev.fill(-1);
  const closed = new Uint8Array(nodes.length);
  const open = new Heap();
  g[a] = 0;
  open.push(a, h(a));
  let expanded = 0;
  while (open.size && expanded < 70000) {
    const i = open.pop();
    if (closed[i]) continue;
    expanded += 1;
    if (i === b) break;
    closed[i] = 1;
    for (const e of nodes[i].edges) {
      const ng = g[i] + e.cost;
      if (ng < g[e.to]) {
        g[e.to] = ng;
        prev[e.to] = i;
        open.push(e.to, ng + h(e.to));
      }
    }
  }
  if (g[b] === Infinity) return null;
  const path = [];
  for (let i = b; i !== -1; i = prev[i]) path.push(i);
  path.reverse();
  return path;
}

function cumulative(points) {
  const cum = [0];
  for (let i = 1; i < points.length; i++) cum.push(cum[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z));
  return cum;
}

export function resample(points, step) {
  if (points.length < 2) return points.map((p) => ({ x: p.x, y: p.y || 0, z: p.z }));
  const out = [{ x: points[0].x, y: points[0].y || 0, z: points[0].z }];
  let remain = step;
  for (let i = 1; i < points.length; i++) {
    let ax = points[i - 1].x;
    let az = points[i - 1].z;
    let ay = points[i - 1].y || 0;
    const bx = points[i].x;
    const bz = points[i].z;
    const by = points[i].y || 0;
    let seg = Math.hypot(bx - ax, bz - az);
    if (seg < 1e-4) continue;
    while (seg >= remain) {
      const t = remain / seg;
      ax += (bx - ax) * t;
      az += (bz - az) * t;
      ay += (by - ay) * t;
      out.push({ x: ax, y: ay, z: az });
      seg -= remain;
      remain = step;
    }
    remain -= seg;
  }
  const last = points[points.length - 1];
  const tail = out[out.length - 1];
  if (Math.hypot(tail.x - last.x, tail.z - last.z) > step * 0.35) out.push({ x: last.x, y: last.y || 0, z: last.z });
  return out;
}

class Heap {
  constructor() {
    this.a = [];
  }
  get size() {
    return this.a.length;
  }
  push(i, p) {
    const a = this.a;
    let k = a.length;
    a.push({ i, p });
    while (k > 0) {
      const parent = (k - 1) >> 1;
      if (a[parent].p <= a[k].p) break;
      const tmp = a[parent];
      a[parent] = a[k];
      a[k] = tmp;
      k = parent;
    }
  }
  pop() {
    const a = this.a;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let k = 0;
      for (;;) {
        const l = k * 2 + 1;
        const r = l + 1;
        let m = k;
        if (l < a.length && a[l].p < a[m].p) m = l;
        if (r < a.length && a[r].p < a[m].p) m = r;
        if (m === k) break;
        const tmp = a[m];
        a[m] = a[k];
        a[k] = tmp;
        k = m;
      }
    }
    return top.i;
  }
}

// 点到点沿路网寻路，供巡检智能体复用。points 是场景坐标 {x, z}，吸附不到路网时该段走直线。
export function planPath({ roads, points, snap = SNAP, step = 8 }) {
  if (!points || points.length < 2) return null;
  const graph = graphFor(roads || []);
  const raw = [];
  let directLegs = 0;
  const push = (x, y, z) => {
    const last = raw[raw.length - 1];
    if (last && Math.hypot(last.x - x, last.z - z) < 1) return;
    raw.push({ x, y: y || 0, z });
  };
  const hits = points.map((p) => {
    const i = graph.nodes.length ? nearest(graph, p.x, p.z, snap) : -1;
    return i >= 0 ? { ...graph.nodes[i], i } : { x: p.x, y: 0, z: p.z, i: -1 };
  });
  push(hits[0].x, hits[0].y, hits[0].z);
  for (let k = 1; k < hits.length; k++) {
    const a = hits[k - 1];
    const b = hits[k];
    if (a.i >= 0 && b.i >= 0 && a.i !== b.i) {
      const path = astar(graph.nodes, a.i, b.i);
      if (path) {
        for (const idx of path) push(graph.nodes[idx].x, graph.nodes[idx].y, graph.nodes[idx].z);
        continue;
      }
    }
    if (!(a.i >= 0 && a.i === b.i)) directLegs += 1;
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 16));
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      push(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);
    }
  }
  const pts = raw.length > 1 ? resample(raw, step) : raw.map((p) => ({ ...p }));
  const cum = cumulative(pts);
  return { points: pts, cum, length: cum[cum.length - 1] || 0, directLegs, snapped: hits.map((h) => ({ x: h.x, y: h.y, z: h.z })) };
}
