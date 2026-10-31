import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PatrolSim } from '../src/patrol/sim.js';
import { makeRoute } from '../src/patrol/route.js';
import { runCommand, parseCommand } from '../src/patrol/command.js';
import { SECTORS } from '../src/patrol/zone.js';

// 以场景原点为中心的合成投影：每个分区按经纬度差放大到几百米
const project = (lon, lat) => ({ x: (lon - 104.1438) * 95000, z: -(lat - 30.5693) * 110000 });
const planRoad = (a, b) => makeRoute([{ x: a.x, y: 0, z: a.z }, { x: b.x, y: 0, z: b.z }]);
const make = (opts = {}) => new PatrolSim({ project, planRoad, ...opts });
const run = (sim, seconds, dt = 0.1) => {
  for (let i = 0; i < seconds / dt; i++) sim.tick(dt);
};

test('巡逻环线覆盖全部分区，首尾相接', () => {
  const sim = make();
  assert.equal(sim.sectors.length, SECTORS.length);
  assert.equal(sim.groundLoop.offsets.length, SECTORS.length);
  assert.ok(sim.groundLoop.length > 1000);
  const first = sim.groundLoop.points[0];
  const last = sim.groundLoop.points.at(-1);
  assert.ok(Math.hypot(first.x - last.x, first.z - last.z) < 1);
});

test('智能体沿环线巡逻并持续移动', () => {
  const sim = make();
  const dog = sim.agent('dog-1');
  const p0 = { x: dog.x, z: dog.z };
  run(sim, 30);
  assert.ok(Math.hypot(dog.x - p0.x, dog.z - p0.z) > 30);
  assert.equal(dog.mode, 'patrol');
});

test('事件先不可见，被巡检半径内的智能体发现后才开始派单', () => {
  const sim = make();
  const inc = sim.inject('obstacle', { ahead: 'dog-1', meters: 40 });
  assert.equal(inc.state, 'open');
  run(sim, 40);
  assert.equal(inc.state === 'open', false);
  assert.equal(inc.by, 'dog-1');
});

test('没人巡到的事件由视频监控兜底发现', () => {
  const sim = make();
  sim.agents.forEach((a) => { a.detectR = 0; });
  const inc = sim.inject('lamp', 'E');
  run(sim, 70);
  assert.equal(inc.by, 'camera');
});

test('串行事件：空中复核完成后才派安保员', () => {
  const sim = make();
  sim.agents.forEach((a) => { a.detectR = 0; });
  const inc = sim.inject('obstacle', 'C');
  run(sim, 61);
  const [air, human] = inc.steps;
  assert.notEqual(air.state, 'pending');
  assert.equal(human.state === 'pending' || air.state === 'done', true);
  run(sim, 200);
  assert.equal(inc.state, 'resolved');
  assert.ok(air.state === 'done' && human.state === 'done');
});

test('并行事件：烟雾告警同时派出空中和现场', () => {
  const sim = make();
  sim.agents.forEach((a) => { a.detectR = 0; });
  const inc = sim.inject('smoke', 'C');
  run(sim, 61);
  assert.ok(inc.steps.every((s) => s.state !== 'pending'), '两步应同时派出');
  assert.notEqual(inc.steps[0].agentId, inc.steps[1].agentId);
});

test('派单选最近的空闲安保员，并且不会重复派同一个', () => {
  const sim = make();
  sim.agents.forEach((a) => { a.detectR = 0; });
  sim.inject('smoke', 'C');
  sim.inject('smoke', 'C');
  run(sim, 61);
  const busy = sim.agents.filter((a) => a.role === 'human' && a.job);
  assert.equal(new Set(busy.map((a) => a.job.incident.id)).size, busy.length);
  assert.ok(busy.length <= 2);
});

test('处置完成后巡逻者回到原来的巡逻进度，安保员回到待命', () => {
  const sim = make();
  const dog = sim.agent('dog-1');
  runCommand(sim, parseCommand('让机器狗去 E 区巡查'));
  assert.equal(dog.mode, 'go');
  run(sim, 400);
  assert.equal(dog.mode, 'patrol');
  assert.equal(dog.job, null);
});

test('处置中的智能体不能被召回，巡查中的可以', () => {
  const sim = make();
  sim.agents.forEach((a) => { a.detectR = 0; });
  sim.inject('smoke', 'C');
  run(sim, 61);
  const busy = sim.agents.find((a) => a.job?.kind === 'step');
  assert.equal(sim.recall(busy.id).ok, false);
  const dog = sim.agent('dog-1');
  if (dog.job) sim.recall(dog.id);
  runCommand(sim, parseCommand('让机器狗去 F 区巡查'));
  assert.equal(sim.recall('dog-1').ok, true);
  assert.equal(dog.mode, 'back');
});

test('统计在事件清出列表后仍然保留', () => {
  const sim = make();
  sim.agents.forEach((a) => { a.detectR = 0; });
  sim.inject('lamp', 'B');
  run(sim, 200);
  assert.equal(sim.stats().resolved, 1);
  run(sim, 100);
  assert.equal(sim.incidents.length, 0);
  assert.equal(sim.stats().resolved, 1);
  assert.ok(sim.stats().resolve > 0);
});

test('同一种子得到同一串自动事件', () => {
  const log = (seed) => {
    const sim = make({ seed });
    sim.auto = true;
    run(sim, 300);
    return sim.events.filter((e) => e.kind === 'spawn').map((e) => e.text).join('|');
  };
  assert.equal(log(5), log(5));
  assert.notEqual(log(5), log(6));
});

test('雨天更容易出积水，夜里才会有路灯故障', () => {
  const count = (env, type) => {
    let n = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const sim = make({ seed });
      sim.setEnv(env);
      sim.auto = true;
      run(sim, 120);
      n += sim.events.filter((e) => e.kind === 'spawn' && e.text.includes(type)).length;
    }
    return n;
  };
  assert.equal(count({ rain: false, night: false }, '积水'), 0);
  assert.ok(count({ rain: true, night: false }, '积水') > 0);
  assert.equal(count({ rain: false, night: false }, '路灯'), 0);
  assert.ok(count({ rain: false, night: true }, '路灯') > 0);
});

test('同时未结事件有上限', () => {
  const sim = make();
  sim.auto = true;
  for (let i = 0; i < 20; i++) sim._spawnAuto();
  assert.ok(sim.incidents.length <= 3);
});
