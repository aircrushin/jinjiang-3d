import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BLD, FILL } from '../src/world/schema.js';
import { buildWalkBlockers } from '../src/ui/walkCollider.js';

function building(fields) {
  const bm = new Float64Array(BLD.N);
  bm[BLD.CX] = 10;
  bm[BLD.CZ] = 20;
  bm[BLD.UX] = 1;
  bm[BLD.UZ] = 0;
  bm[BLD.W] = 8;
  bm[BLD.D] = 4;
  bm[BLD.BASE] = 0;
  bm[BLD.TOP] = 18;
  for (const [k, v] of Object.entries(fields)) bm[BLD[k]] = v;
  return bm;
}

test('墙内挡住脚步，墙外可以走过', () => {
  const blockers = buildWalkBlockers({ bldMeta: building({}) });
  assert.equal(blockers.blocked(10, 20), true);
  assert.equal(blockers.blocked(10 + 4 + 0.4, 20), true);
  assert.equal(blockers.blocked(10 + 4 + 0.45 + 0.2, 20), false);
  assert.equal(blockers.blocked(80, 80), false);
});

test('长边转向后仍按占地挡住', () => {
  const blockers = buildWalkBlockers({ bldMeta: building({ UX: 0, UZ: 1 }) });
  assert.equal(blockers.blocked(10, 20 + 4), true);
  assert.equal(blockers.blocked(10 + 3, 20), false);
});

test('架空构筑物不挡地面，矮垫层也不挡', () => {
  assert.equal(buildWalkBlockers({ bldMeta: building({ BASE: 6, TOP: 20 }) }).blocked(10, 20), false);
  assert.equal(buildWalkBlockers({ bldMeta: building({ TOP: 0.4 }) }).blocked(10, 20), false);
});

test('补全地块同样挡住', () => {
  const fill = new Float64Array(FILL.N);
  fill[FILL.X] = 0;
  fill[FILL.Z] = 0;
  fill[FILL.UX] = 1;
  fill[FILL.UZ] = 0;
  fill[FILL.W] = 6;
  fill[FILL.D] = 6;
  fill[FILL.H] = 12;
  const blockers = buildWalkBlockers({ fill });
  assert.equal(blockers.blocked(0, 0), true);
  assert.equal(blockers.blocked(8, 0), false);
});
