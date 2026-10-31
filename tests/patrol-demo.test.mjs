import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DemoRunner, DEMO_STEPS } from '../src/patrol/demo.js';
import { PatrolSim } from '../src/patrol/sim.js';
import { makeRoute } from '../src/patrol/route.js';

function fakeCtx(extra = {}) {
  const log = [];
  return { log, last: null, onStart: () => log.push('start'), onStop: (done) => log.push(done ? 'end' : 'abort'), ...extra };
}
const run = (r, seconds, dt = 0.1) => {
  for (let i = 0; i < seconds / dt && r.active; i++) r.tick(dt);
};

test('步骤按顺序执行，wait 是距上一步的间隔', () => {
  const ctx = fakeCtx();
  const steps = [3, 2, 5].map((w, i) => ({ wait: w, run: () => ctx.log.push(`s${i}@${r.elapsed.toFixed(1)}`) }));
  const r = new DemoRunner(steps, ctx);
  r.start();
  run(r, 20);
  assert.deepEqual(ctx.log, ['start', 's0@3.0', 's1@5.0', 's2@10.0', 'end']);
  assert.equal(r.active, false);
});

test('until 条件成立就往下走，不成立最多等到 max', () => {
  let ready = false;
  const ctx = fakeCtx();
  const mk = () => [{ wait: 1, until: () => ready, max: 6, run: () => ctx.log.push('go') }];
  const a = new DemoRunner(mk(), ctx);
  a.start();
  run(a, 3);
  assert.ok(!ctx.log.includes('go'), '条件没成立，不该往下走');
  ready = true;
  run(a, 1);
  assert.ok(ctx.log.includes('go'));

  const ctx2 = fakeCtx();
  ready = false;
  const b = new DemoRunner([{ wait: 1, until: () => false, max: 6, run: () => ctx2.log.push('go') }], ctx2);
  b.start();
  run(b, 5.5);
  assert.ok(!ctx2.log.includes('go'));
  run(b, 1);
  assert.ok(ctx2.log.includes('go'), '到 max 必须放行，否则演示会卡死');
});

test('wait 为 0 的步骤在同一帧连着走，中途停止不再触发后面的步骤', () => {
  const ctx = fakeCtx();
  const r = new DemoRunner([{ wait: 0, run: () => ctx.log.push('a') }, { wait: 0, run: () => ctx.log.push('b') }, { wait: 5, run: () => ctx.log.push('c') }], ctx);
  r.start();
  r.tick(0.1);
  assert.deepEqual(ctx.log, ['start', 'a', 'b']);
  r.stop();
  run(r, 10);
  assert.deepEqual(ctx.log, ['start', 'a', 'b', 'abort']);
});

test('没有启动或已结束时 tick 不做事，重新开始会从头来', () => {
  const ctx = fakeCtx();
  const r = new DemoRunner([{ wait: 1, run: () => ctx.log.push('x') }], ctx);
  r.tick(5);
  assert.deepEqual(ctx.log, []);
  r.start();
  run(r, 5);
  r.start();
  run(r, 5);
  assert.equal(ctx.log.filter((l) => l === 'x').length, 2);
});

test('演示脚本在模拟器上能完整走完，说明文字不重复', () => {
  const project = (lon, lat) => ({ x: (lon - 104.087) * 95776.238, z: -(lat - 30.642) * 110750 });
  const planRoad = (a, b) => makeRoute([{ x: a.x, y: 0, z: a.z }, { x: b.x, y: 0, z: b.z }]);
  const sim = new PatrolSim({ project, planRoad });
  const captions = [];
  const scenes = [];
  const ctx = {
    sim,
    last: null,
    caption: (t) => captions.push(t),
    scene: (id) => scenes.push(id),
    focus: () => {},
    command: () => {},
    inject: (type, at) => sim.inject(type, at),
    auto: (on) => { sim.auto = on; },
    onStart: () => { ctx.last = null; },
  };
  const r = new DemoRunner(DEMO_STEPS, ctx);
  r.start();
  for (let i = 0; i < 1200 / 0.1 && r.active; i++) {
    sim.tick(0.1);
    r.tick(0.1);
  }
  assert.equal(r.active, false, '演示应该在 20 分钟模拟时间内结束');
  assert.ok(r.elapsed > 90 && r.elapsed < 420, `演示用时 ${Math.round(r.elapsed)} s`);
  assert.ok(captions.length >= 10);
  assert.ok(captions.every((c) => c.length > 4));
  assert.equal(new Set(captions).size, captions.length);
  assert.ok(scenes.includes('bailuwan-night') && scenes.at(-1) === 'bailuwan');
  assert.ok(sim.stats().resolved >= 2);
  // 字幕里的地点来自实际事件，而不是写死的设施名
  assert.ok(captions.some((c) => /地点：[A-E]区/.test(c)), captions.join('\n'));
  assert.ok(!captions.some((c) => c.includes('垃圾站附近')));
});
