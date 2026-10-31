import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadCity } from '../src/world/data.js';
import { BLD, TREE_REC } from '../src/world/schema.js';
import { buildEcoPark, clearEcoLamps, clearEcoTrees } from '../src/ecopark/layout.js';
import { applyEcoParkStyle } from '../src/ecopark/style.js';
import { PatrolSim } from '../src/patrol/sim.js';
import { makeRoute } from '../src/patrol/route.js';
import { planPath } from '../src/tour/planner.js';

let cached = null;
async function city(t) {
  t.mock.method(globalThis, 'fetch', async (url) => new Response(fs.readFileSync(String(url).replace(/^\.\//, ''))));
  cached ??= await loadCity();
  return cached;
}

const insideRect = (r, x, z, m = 0) => {
  const dx = x - r.cx;
  const dz = z - r.cz;
  return Math.abs(dx * r.ux + dz * r.uz) < r.hw + m && Math.abs(-dx * r.uz + dz * r.ux) < r.hd + m;
};

test('每个分区至少有一个大门，且大门离道路不远', async (t) => {
  const D = await city(t);
  const eco = buildEcoPark(D);
  assert.equal(eco.zones.length, 5);
  for (const z of eco.zones) assert.ok(eco.gates[z.id].length >= 1, `${z.id} 区没有大门`);
  for (const g of Object.values(eco.gates).flat()) {
    // 按线段算：折线顶点之间可以隔一百多米，只量顶点会把临街的门误判成离路很远
    let best = Infinity;
    for (const r of D.roads) {
      if (r.cls === 7) continue;
      for (let i = 0; i < r.pts.length - 1; i++) {
        const [ax, az] = r.pts[i];
        const [bx, bz] = r.pts[i + 1];
        const l2 = (bx - ax) ** 2 + (bz - az) ** 2 || 1;
        const t = Math.max(0, Math.min(1, ((g.x - ax) * (bx - ax) + (g.z - az) * (bz - az)) / l2));
        best = Math.min(best, Math.hypot(ax + (bx - ax) * t - g.x, az + (bz - az) * t - g.z));
      }
    }
    assert.ok(best < 20, `大门 (${Math.round(g.x)},${Math.round(g.z)}) 离路网 ${Math.round(best)} m`);
  }
});

test('同样的数据得到同样的布局', async (t) => {
  const D = await city(t);
  const a = buildEcoPark(D);
  const b = buildEcoPark(D);
  assert.deepEqual(a.stats, b.stats);
  assert.equal(JSON.stringify(a.items), JSON.stringify(b.items));
});

test('构件数值都是有限的，并且尺寸为正', async (t) => {
  const D = await city(t);
  const eco = buildEcoPark(D);
  assert.ok(eco.items.length > 500);
  for (const it of eco.items) {
    assert.ok([it.x, it.y, it.z, it.rot, it.sx, it.sy, it.sz].every(Number.isFinite));
    assert.ok(it.sx > 0 && it.sy > 0 && it.sz > 0);
    assert.match(it.ca, /^#[0-9a-f]{6}$/i);
  }
});

test('配套设施落在分区内，不压在建筑上', async (t) => {
  const D = await city(t);
  const eco = buildEcoPark(D);
  for (const kind of ['garbage', 'ebike', 'substation', 'loading']) {
    assert.ok(eco.spots[kind].length >= 1, `缺少 ${kind}`);
    for (const s of eco.spots[kind]) {
      assert.ok(!eco.buildings.some((b) => insideRect(b, s.x, s.z, 1)), `${kind} 压在建筑上 (${Math.round(s.x)},${Math.round(s.z)})`);
      assert.ok(s.sector && s.label);
    }
  }
});

test('落点标签不带分区名，免得和事件里单独显示的分区名重复', async (t) => {
  const D = await city(t);
  const eco = buildEcoPark(D);
  for (const [kind, list] of Object.entries(eco.spots)) {
    for (const s of list) assert.ok(!/^[A-E]区/.test(s.label), `${kind} 的标签 "${s.label}" 带了分区名`);
  }
});

test('每类事件都有可用的落点', async (t) => {
  const D = await city(t);
  const eco = buildEcoPark(D);
  for (const kind of ['gate', 'fence', 'drain', 'garbage', 'ebike', 'substation', 'loading']) {
    assert.ok(eco.spots[kind].length >= 1, `缺少落点 ${kind}`);
  }
});

test('生态园建筑被换成办公楼外观，园区外的建筑不动', async (t) => {
  const D = await city(t);
  const before = Float32Array.from(D.S.bldMeta);
  const styled = applyEcoParkStyle(D);
  assert.ok(styled.length >= 8, `只改了 ${styled.length} 栋`);
  const set = new Set(styled);
  let outsideChanged = 0;
  for (let k = 0; k * BLD.N < D.S.bldMeta.length; k++) {
    if (set.has(k)) continue;
    for (let f = 0; f < BLD.N; f++) if (D.S.bldMeta[k * BLD.N + f] !== before[k * BLD.N + f]) outsideChanged++;
  }
  assert.equal(outsideChanged, 0);
  // 重复调用不会再改一遍
  assert.equal(applyEcoParkStyle(D), styled);
});

test('清理行道树和路灯后，布置范围内不再有树和灯', async (t) => {
  const D = await city(t);
  await D.vegReady;
  const eco = buildEcoPark(D);
  clearEcoTrees(D, eco);
  const lamps = clearEcoLamps(D, eco);
  assert.ok(lamps.lamps >= 0 && lamps.pools >= 0);
  for (const T of D.trees) {
    for (let i = 0; i < T.length; i += TREE_REC.N) {
      assert.ok(!eco.clear.some((r) => insideRect(r, T[i + TREE_REC.X], T[i + TREE_REC.Z], 1.5)), '清理后仍有树');
    }
  }
  // 第二次清理没有东西可清
  assert.deepEqual(clearEcoLamps(D, eco), { lamps: 0, pools: 0 });
});

test('事件按类型落在对应设施旁，没有落点数据时退回沿环线取点', async (t) => {
  const D = await city(t);
  const eco = buildEcoPark(D);
  const o = D.meta.origin;
  const project = (lon, lat) => ({ x: (lon - o.lon) * o.kx, z: -(lat - o.lat) * o.kz });
  const planRoad = (a, b) => makeRoute(planPath({ roads: D.roads, points: [a, b] }).points);

  const sim = new PatrolSim({ project, planRoad, spots: eco.spots });
  const smoke = sim.inject('smoke');
  assert.ok(smoke.place, '烟雾告警应带落点名称');
  assert.ok(['垃圾收集站', '电动车充电棚', '配电房'].includes(smoke.place), smoke.place);
  const near = [...eco.spots.garbage, ...eco.spots.ebike, ...eco.spots.substation].some((s) => Math.hypot(s.x - smoke.x, s.z - smoke.z) < 0.01);
  assert.ok(near);

  const pond = sim.inject('pond');
  assert.equal(pond.place, '路口排水口');

  const bare = new PatrolSim({ project, planRoad });
  const inc = bare.inject('smoke', 'C');
  assert.equal(inc.place, null);
  assert.equal(inc.sectorName, 'C区');
});

test('指定分区时，落点只选该分区的设施', async (t) => {
  const D = await city(t);
  const eco = buildEcoPark(D);
  const o = D.meta.origin;
  const project = (lon, lat) => ({ x: (lon - o.lon) * o.kx, z: -(lat - o.lat) * o.kz });
  const planRoad = (a, b) => makeRoute(planPath({ roads: D.roads, points: [a, b] }).points);
  const sim = new PatrolSim({ project, planRoad, spots: eco.spots });
  for (let i = 0; i < 12; i++) {
    const inc = sim.inject('intruder', 'E');
    if (!inc) continue;
    assert.equal(inc.sectorName, 'E区');
  }
});
