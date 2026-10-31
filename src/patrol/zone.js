// 白鹭湾科技生态园（A–E 区）巡检孪生台的点位与事件类型。
// 五个分区的范围来自 OSM 中名为“白鹭湾科技生态园 A–E 区”的商业用地（way 1568670319 / 1191850931 /
// 1568670316 / 1568670317 / 1568670318），合计约 450 m × 640 m。OSM 里没有“新经济总部功能区”这个对象，
// 这里按用户确认把这片区域当作功能区。巡检点位取各分区临街的路口，保证落在已有道路上。

export const ZONE = {
  id: 'bailuwan-eco',
  name: '白鹭湾新经济总部功能区',
  sub: '白鹭湾科技生态园 A–E 区',
  center: { lon: 104.11091, lat: 30.586018 },
};

// 按巡逻顺序排列，首尾相接成环：A→B→C→D→E→A，沿路绕行一圈约 1.4 km。
// 点位取各分区临街的路口，不取地块中心（地块中心离路网 100 m 以上，没法沿路走到）。
export const SECTORS = [
  { id: 'A', name: 'A区', lon: 104.110732, lat: 30.588149 },
  { id: 'B', name: 'B区', lon: 104.11091, lat: 30.586027 },
  { id: 'C', name: 'C区', lon: 104.110983, lat: 30.584167 },
  { id: 'D', name: 'D区', lon: 104.11186, lat: 30.583354 },
  { id: 'E', name: 'E区', lon: 104.113228, lat: 30.586208 },
];

export const HOME = { name: 'A区驻点', sector: 'A' };

// 五个分区的真实轮廓（OSM way，经纬度），用来在场景里描出范围。
export const ZONE_AREAS = [
  { id: 'A', name: 'A区', osm: 1568670319, ring: [[104.10844,30.58916],[104.108505,30.58722],[104.110489,30.587193],[104.110538,30.588832]] },
  { id: 'B', name: 'B区', osm: 1191850931, ring: [[104.108509,30.586896],[104.108618,30.585344],[104.110724,30.58536],[104.110815,30.585454],[104.110706,30.586943]] },
  { id: 'C', name: 'C区', osm: 1568670316, ring: [[104.108711,30.585136],[104.108774,30.583439],[104.110768,30.583423],[104.110881,30.583509],[104.110899,30.585016],[104.110773,30.585128]] },
  { id: 'D', name: 'D区', osm: 1568670317, ring: [[104.111257,30.585163],[104.111107,30.584965],[104.111101,30.583506],[104.111236,30.583422],[104.112786,30.583418],[104.112904,30.583556],[104.112899,30.585062],[104.112759,30.585117]] },
  { id: 'E', name: 'E区', osm: 1568670318, ring: [[104.111123,30.586969],[104.110973,30.586886],[104.111075,30.58545],[104.111171,30.585371],[104.112797,30.585367],[104.112974,30.585496],[104.113156,30.586304],[104.113022,30.586392]] },
];

// 三类智能体。speed 是基础速度（米/秒），再乘模拟倍率；patrol 为真的会在点位间循环巡逻，
// 空闲时也可以被派去处理事件，处理完回到巡逻。dir 是巡逻方向，home 是驻点所在分区。
export const AGENT_DEFS = [
  { id: 'dog-1', role: 'ground', badge: '地', name: '巡检犬 01', kind: '四足巡检机器人', speed: 3.5, detectR: 55, patrol: true, dir: 1, home: 'A' },
  { id: 'drone-1', role: 'air', badge: '天', name: '无人机 01', kind: '多旋翼巡检无人机', speed: 9, alt: 55, hoverAlt: 26, detectR: 100, patrol: true, dir: -1, home: 'C' },
  { id: 'guard-1', role: 'human', badge: '人', name: '安保员 01', kind: '电动巡逻车', speed: 8, home: 'B' },
  { id: 'guard-2', role: 'human', badge: '人', name: '安保员 02', kind: '电动巡逻车', speed: 8, home: 'D' },
];

export const ROLE_NAME = { ground: '地面巡检', air: '空中巡检', human: '现场处置' };

// needs：需要哪类智能体到场。parallel 为真时同时派出，否则空中复核完再派人，少占人力。
// near：该步骤只在目标 260 m 内有空闲的该类智能体时才派（四足机器人太慢，远了赶不上，直接跳过）。
export const INCIDENT_TYPES = {
  obstacle: {
    name: '占道障碍',
    level: 1,
    weight: 3,
    parallel: false,
    needs: [{ role: 'air', act: '空中复核', dwell: 3 }, { role: 'human', act: '现场清理', dwell: 6 }],
  },
  pond: {
    name: '路面积水',
    level: 1,
    weight: 0,
    rain: 5,
    parallel: false,
    needs: [{ role: 'air', act: '空中复核', dwell: 3 }, { role: 'human', act: '设置警示', dwell: 6 }],
  },
  intruder: {
    name: '异常闯入',
    level: 2,
    weight: 2,
    parallel: true,
    needs: [{ role: 'air', act: '空中跟踪', dwell: 5 }, { role: 'ground', act: '靠近取证', dwell: 5, near: 260 }, { role: 'human', act: '现场劝离', dwell: 6 }],
  },
  smoke: {
    name: '烟雾告警',
    level: 3,
    weight: 1,
    parallel: true,
    needs: [{ role: 'air', act: '确认火情', dwell: 4 }, { role: 'human', act: '现场处置', dwell: 8 }],
  },
  lamp: {
    name: '路灯故障',
    level: 0,
    weight: 0,
    night: 4,
    parallel: false,
    needs: [{ role: 'human', act: '报修检查', dwell: 5 }],
  },
};

export const LEVEL_NAME = ['提示', '一般', '较急', '紧急'];
