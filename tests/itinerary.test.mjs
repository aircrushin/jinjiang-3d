import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INTERESTS, PLACES, ROUTES } from '../src/tour/catalog.js';
import { clearRouteGraphCache, formatMeters, formatMinutes, planItinerary, resample } from '../src/tour/planner.js';

const project = (lon, lat) => ({ x: lon, z: lat });
const place = (id, x, z, interests, dwellMin = 10, booking = null) => ({
  id,
  name: id,
  interests,
  lon: x,
  lat: z,
  dwellMin,
  preview: id,
  booking,
});

function grid(size = 80, step = 40) {
  const roads = [];
  for (let x = 0; x <= size; x += step) {
    roads.push({ pts: [[x, 0, 0], [x, size, 0]], ys: [0, 0], cls: 2, ped: true, w: 8 });
  }
  for (let z = 0; z <= size; z += step) {
    roads.push({ pts: [[0, z, 0], [size, z, 0]], ys: [0, 0], cls: 2, ped: true, w: 8 });
  }
  return roads;
}

test('目录里的点都落在锦江区，并且兴趣和订位字段可接后续数据', () => {
  const ids = new Set(INTERESTS.map((item) => item.id));
  const seen = new Set();
  assert.ok(PLACES.length >= 8);
  for (const p of PLACES) {
    assert.equal(seen.has(p.id), false);
    seen.add(p.id);
    assert.ok(p.interests.some((id) => ids.has(id)));
    assert.ok(p.interests.every((id) => ids.has(id)));
    assert.ok(p.lon > 104.05 && p.lon < 104.17);
    assert.ok(p.lat > 30.54 && p.lat < 30.68);
    assert.ok(p.dwellMin > 0);
    assert.equal(p.booking, null);
    assert.ok(p.preview);
  }
});

test('路线贴着街道走，不抄快速路直线', () => {
  clearRouteGraphCache();
  const roads = grid();
  roads.push({ pts: [[0, 0, 0], [80, 80, 0]], ys: [0, 0], cls: 7, ped: false, w: 20 });
  const route = planItinerary({
    places: [place('a', 0, 0, ['food']), place('b', 80, 80, ['food']), place('c', 0, 200, ['night'])],
    interests: ['food'],
    roads,
    project,
    start: { lon: 0, lat: 0 },
  });
  assert.ok(route);
  assert.deepEqual(route.stops.map((s) => s.id), ['a', 'b']);
  assert.ok(route.walkMeters > 145, `expected a street path, got ${route.walkMeters}`);
  assert.ok(route.walkMeters < 200);
  assert.equal(route.stats.directLegs, 0);
  assert.ok(route.totalMin >= 20);
  assert.match(route.stops[0].links.map, /openstreetmap\.org/);
});

test('没有匹配的兴趣时不排路线，远处的点不会被硬拉进同一段', () => {
  clearRouteGraphCache();
  const route = planItinerary({
    places: [place('a', 0, 0, ['food']), place('far', 8000, 8000, ['food'])],
    interests: ['art'],
    roads: grid(),
    project,
    start: { lon: 0, lat: 0 },
  });
  assert.equal(route, null);
});

test('最多五站，并从离起点最近的一站开始', () => {
  clearRouteGraphCache();
  const places = [0, 100, 200, 300, 400, 500].map((x, i) => place(`p${i}`, x, 0, ['family'], 15));
  const roads = [{ pts: [[0, 0, 0], [500, 0, 0]], ys: [0, 0], cls: 2, ped: true, w: 8 }];
  const route = planItinerary({
    places,
    interests: ['family'],
    roads,
    project,
    start: { lon: 0, lat: 0 },
  });
  assert.equal(route.stops.length, 5);
  assert.equal(route.stops[0].id, 'p0');
  assert.ok(route.stops[1].walkMin > 0);
});

test('街道没连上时仍给出直线，并带上以后可用的预订字段', () => {
  clearRouteGraphCache();
  const booking = { provider: 'example', ref: 'a1', url: 'https://example.com/a' };
  const route = planItinerary({
    places: [place('a', 0, 0, ['night'], 30, booking), place('b', 100, 0, ['night'], 20)],
    interests: ['night'],
    roads: [],
    project,
    start: { lon: 0, lat: 0 },
  });
  assert.equal(route.stats.directLegs, 1);
  assert.ok(route.walkMeters > 90 && route.walkMeters < 130);
  assert.equal(route.stops[0].links.booking.url, booking.url);
  assert.ok(route.totalMin > 50);
});

test('时间与距离的说法', () => {
  assert.equal(formatMinutes(0.2), '不到 1 分钟');
  assert.equal(formatMinutes(48), '48 分钟');
  assert.equal(formatMinutes(125), '2 小时 5 分');
  assert.equal(formatMeters(0), '不到 30 米');
  assert.equal(formatMeters(1800), '1.8 公里');
});

test('折线按步长取样并且保留终点', () => {
  const pts = resample([{ x: 0, y: 0, z: 0 }, { x: 100, y: 0, z: 0 }], 40);
  assert.ok(Math.hypot(pts[1].x - 40, pts[1].z) < 0.01);
  assert.equal(pts.at(-1).x, 100);
});

test('主题线的站点都在目录里，且各自有时段和钟点', () => {
  const ids = new Set(PLACES.map((p) => p.id));
  const seen = new Set();
  assert.ok(ROUTES.length >= 4);
  for (const r of ROUTES) {
    assert.equal(seen.has(r.id), false);
    seen.add(r.id);
    assert.ok(r.stops.length >= 3);
    assert.ok(r.stops.every((id) => ids.has(id)), `${r.id} 有目录里没有的站`);
    assert.equal(new Set(r.stops).size, r.stops.length);
    assert.ok(r.bestTime && r.tips && r.transport);
    assert.ok(r.hour >= 0 && r.hour < 24);
  }
});

test('固定主题线按给定顺序走，不受站数和兴趣限制', () => {
  clearRouteGraphCache();
  const places = [0, 100, 200, 300, 400, 500, 600].map((x, i) => place(`p${i}`, x, 0, ['family'], 15));
  const roads = [{ pts: [[0, 0, 0], [600, 0, 0]], ys: [0, 0], cls: 2, ped: true, w: 8 }];
  const order = ['p3', 'p1', 'p5', 'p0', 'p6', 'p2'];
  const route = planItinerary({ places, placeIds: order, roads, project });
  assert.ok(route);
  assert.deepEqual(route.stops.map((s) => s.id), order);
  assert.equal(route.fixed, true);
  assert.ok(route.totalMin > 0);
});

test('固定主题线里不存在的 id 会被跳过，全不存在则不排', () => {
  clearRouteGraphCache();
  const places = [place('a', 0, 0, ['food']), place('b', 100, 0, ['food'])];
  const roads = [{ pts: [[0, 0, 0], [100, 0, 0]], ys: [0, 0], cls: 2, ped: true, w: 8 }];
  const route = planItinerary({ places, placeIds: ['a', 'nope', 'b'], roads, project });
  assert.deepEqual(route.stops.map((s) => s.id), ['a', 'b']);
  assert.equal(planItinerary({ places, placeIds: ['x', 'y'], roads, project }), null);
});
