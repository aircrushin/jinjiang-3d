import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCommand } from '../src/patrol/command.js';

test('巡查指令能解析出智能体和分区', () => {
  assert.deepEqual(parseCommand('让机器狗去 C 区巡查').actions, [{ kind: 'inspect', agent: 'dog-1', sector: 'C' }]);
  assert.deepEqual(parseCommand('无人机去东南看看').actions, [{ kind: 'inspect', agent: 'drone-1', sector: 'D' }]);
});

test('东南不会被“东”抢走，西北不会被“北”抢走', () => {
  assert.equal(parseCommand('去东南巡查').actions[0].sector, 'D');
  assert.equal(parseCommand('去西北巡查').actions[0].sector, 'G');
  assert.equal(parseCommand('去西南巡查').actions[0].sector, 'F');
});

test('没说派谁时交给系统挑最近的', () => {
  assert.deepEqual(parseCommand('去 E 区巡查').actions, [{ kind: 'inspect', agent: 'auto', sector: 'E' }]);
});

test('模拟事件和召回', () => {
  assert.deepEqual(parseCommand('E 区出现积水').actions, [{ kind: 'inject', type: 'pond', sector: 'E' }]);
  assert.deepEqual(parseCommand('模拟东边冒烟').actions, [{ kind: 'inject', type: 'smoke', sector: 'C' }]);
  assert.deepEqual(parseCommand('召回所有智能体').actions, [{ kind: 'recallAll' }]);
  assert.deepEqual(parseCommand('把无人机召回').actions, [{ kind: 'recall', agent: 'drone-1' }]);
});

test('听不懂时给出提示而不是乱派', () => {
  assert.equal(parseCommand('').ok, false);
  assert.equal(parseCommand('今天天气怎么样').ok, false);
  const r = parseCommand('去巡查');
  assert.equal(r.ok, false);
  assert.match(r.reply, /哪个区/);
});

test('全面巡查走 sweep', () => {
  assert.deepEqual(parseCommand('全部巡查一遍').actions, [{ kind: 'sweep' }]);
});
