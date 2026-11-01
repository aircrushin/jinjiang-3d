import test from 'node:test';
import assert from 'node:assert/strict';
import { buildJinlin, fitsParcel } from '../src/jinlin/layout.js';

const D = { meta: { origin: { lon: 104.087, lat: 30.642, kx: 95776.238, kz: 110750 } } };

test('锦邻公寓：所有楼栋都放得下，并留出边界退距', () => {
  const r = buildJinlin(D);
  assert.deepEqual(r.skipped, []);
  assert.equal(r.items.filter((b) => b.kind === 'tower').length, 5);
  for (const b of r.items) assert.ok(fitsParcel(r.ring, b), `${b.kind} 超出地块`);
});

test('锦邻公寓：楼栋之间互不重叠，高度与周边公寓同量级', () => {
  const { items } = buildJinlin(D);
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      assert.ok(Math.hypot(items[i].x - items[j].x, items[i].z - items[j].z) > 20, `${i} 与 ${j} 过近`);
    }
  }
  for (const b of items.filter((x) => x.kind === 'tower')) assert.ok(b.h > 60 && b.h < 120, `塔楼高度 ${b.h}`);
});
