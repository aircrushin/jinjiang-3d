// 自然语言指令 → 任务。默认用本地规则解析，离线可用，评委现场不依赖网络。
// parse() 的输出是一组与大模型工具调用同构的动作，换成大模型时只需替换 parse。

import { SECTORS } from './zone.js';

const SECTOR_ALIAS = {
  A: ['a区', 'a 区', '北区', '北侧', '北边', '驻点'],
  B: ['b区', 'b 区', '东北'],
  C: ['c区', 'c 区', '东区', '东侧', '东边'],
  D: ['d区', 'd 区', '东南'],
  E: ['e区', 'e 区', '南区', '南侧', '南边'],
  F: ['f区', 'f 区', '西南'],
  G: ['g区', 'g 区', '西北'],
};

const AGENT_ALIAS = {
  'dog-1': ['机器狗', '巡检犬', '四足', '狗'],
  'drone-1': ['无人机', '飞机', '空中', '飞行器'],
  'guard-1': ['安保员1', '安保员 1', '安保员01', '安保员 01', '一号安保', '安保1'],
  'guard-2': ['安保员2', '安保员 2', '安保员02', '安保员 02', '二号安保', '安保2'],
};

const TYPE_ALIAS = {
  obstacle: ['占道', '障碍', '堵路', '路障'],
  pond: ['积水', '水坑', '漏水', '淹'],
  intruder: ['闯入', '可疑', '陌生人', '入侵', '翻越'],
  smoke: ['烟雾', '着火', '起火', '火情', '冒烟'],
  lamp: ['路灯', '灯坏', '灯不亮'],
};

const norm = (s) => String(s || '').toLowerCase().replace(/[，。,.！!？?]/g, ' ');

function findSector(text) {
  // 先匹配“X区”这种明确写法，再匹配方位词，避免“东南”被“东”抢走
  const hits = [];
  for (const sec of SECTORS) {
    for (const alias of SECTOR_ALIAS[sec.id] || []) {
      const at = text.indexOf(alias);
      if (at >= 0) hits.push({ id: sec.id, at, len: alias.length });
    }
  }
  if (!hits.length) return null;
  hits.sort((a, b) => b.len - a.len || a.at - b.at);
  return hits[0].id;
}

function findAgent(text) {
  const hits = [];
  for (const [id, list] of Object.entries(AGENT_ALIAS)) {
    for (const alias of list) {
      const at = text.indexOf(alias);
      if (at >= 0) hits.push({ id, at, len: alias.length });
    }
  }
  if (!hits.length) return null;
  hits.sort((a, b) => b.len - a.len || a.at - b.at);
  return hits[0].id;
}

function findType(text) {
  for (const [id, list] of Object.entries(TYPE_ALIAS)) if (list.some((w) => text.includes(w))) return id;
  return null;
}

export function parseCommand(input) {
  const text = norm(input).trim();
  if (!text) return { ok: false, reply: '请输入指令，例如“让机器狗去 C 区巡查”。' };
  const sector = findSector(text);
  const agent = findAgent(text);
  const type = findType(text);

  if (/召回|撤回|回来|返回|回岗/.test(text)) {
    if (agent) return { ok: true, actions: [{ kind: 'recall', agent }] };
    return { ok: true, actions: [{ kind: 'recallAll' }] };
  }
  if (/全部|所有|全面/.test(text) && /巡查|巡检|检查|看看/.test(text)) {
    return { ok: true, actions: [{ kind: 'sweep' }] };
  }
  if (/模拟|制造|演练|设置|触发|注入|上报/.test(text) && type) {
    return { ok: true, actions: [{ kind: 'inject', type, sector }] };
  }
  if (type && !agent && /出现|发现|有/.test(text)) {
    return { ok: true, actions: [{ kind: 'inject', type, sector }] };
  }
  if (/巡查|巡检|检查|看看|查看|前往|去|到/.test(text)) {
    if (!sector) return { ok: false, reply: '没听清要去哪个区，可以说“C 区”或“东南”。' };
    return { ok: true, actions: [{ kind: 'inspect', agent: agent || 'auto', sector }] };
  }
  return { ok: false, reply: '暂时只能理解巡查、召回和模拟事件，例如“让无人机去 D 区巡查”“东区出现烟雾”。' };
}

// 在模拟里执行解析结果，返回要显示给用户的回复
export function runCommand(sim, parsed) {
  if (!parsed.ok) return parsed.reply;
  const out = [];
  for (const act of parsed.actions) {
    if (act.kind === 'recall') {
      const r = sim.recall(act.agent);
      out.push(r.ok ? `已召回${sim.agent(act.agent).name}。` : r.reason);
    } else if (act.kind === 'recallAll') {
      let n = 0;
      for (const a of sim.agents) if (sim.recall(a.id).ok) n++;
      out.push(n ? `已召回 ${n} 个智能体。` : '没有需要召回的智能体。');
    } else if (act.kind === 'inject') {
      const inc = sim.inject(act.type, act.sector);
      out.push(inc ? `已在${inc.sectorName}模拟“${inc.name}”，等待巡检发现。` : '模拟失败。');
    } else if (act.kind === 'sweep') {
      // 空闲的巡检智能体各去离自己最远的一个未查分区，覆盖面最大
      const free = sim.agents.filter((a) => a.role !== 'human' && !a.job && (a.mode === 'patrol' || a.mode === 'idle'));
      const taken = new Set();
      const sent = [];
      for (const a of free) {
        let best = null;
        let bd = -1;
        for (const sec of sim.sectors) {
          if (taken.has(sec.id)) continue;
          const d = Math.hypot(sec.x - a.x, sec.z - a.z);
          if (d > bd) {
            bd = d;
            best = sec;
          }
        }
        if (best && sim.assignInspect(a.id, best.id).ok) {
          taken.add(best.id);
          sent.push(`${a.name}→${best.name}`);
        }
      }
      out.push(sent.length ? `已派出：${sent.join('，')}。` : '没有空闲的智能体。');
    } else if (act.kind === 'inspect') {
      let id = act.agent;
      const target = sim.sector(act.sector);
      if (id === 'auto') {
        const pick = sim.pickAgent('ground', target) || sim.pickAgent('air', target);
        id = pick?.id;
      }
      if (!id) {
        out.push('没有空闲的智能体可以派。');
        continue;
      }
      const r = sim.assignInspect(id, act.sector);
      out.push(r.ok ? `${sim.agent(id).name}前往${target.name}，约 ${Math.max(1, Math.round(r.eta))} 秒到达。` : r.reason);
    }
  }
  return out.join(' ');
}

export const EXAMPLES = ['让机器狗去 C 区巡查', '无人机去东南看看', 'E 区出现积水', '东边冒烟了', '召回所有智能体'];

