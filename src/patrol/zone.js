// 白鹭湾巡检孪生台的点位与事件类型。
// 区域范围取自 OSM 白鹭湾水体（relation 11521411）周边；A–G 是演示用的巡检点位，
// 坐标落在已有道路上，命名只表示方位，不对应真实的园区分区。

export const ZONE = {
  id: 'bailuwan',
  name: '白鹭湾新经济总部功能区',
  center: { lon: 104.143872, lat: 30.569368 },
};

// 按巡逻顺序排列，首尾相接成环。A 区同时是机器狗、无人机和安保员的驻点。
export const SECTORS = [
  { id: 'A', name: 'A区·北', lon: 104.145062, lat: 30.571589 },
  { id: 'B', name: 'B区·东北', lon: 104.147046, lat: 30.57074 },
  { id: 'C', name: 'C区·东', lon: 104.14903, lat: 30.569214 },
  { id: 'D', name: 'D区·东南', lon: 104.146514, lat: 30.568411 },
  { id: 'E', name: 'E区·南', lon: 104.145376, lat: 30.566975 },
  { id: 'F', name: 'F区·西南', lon: 104.143006, lat: 30.566795 },
  { id: 'G', name: 'G区·西北', lon: 104.14312, lat: 30.57158 },
];

// 三类智能体。speed 是基础速度（米/秒），再乘模拟倍率；patrol 为真的会在点位间循环巡逻，
// 空闲时也可以被派去处理事件，处理完回到巡逻。dir 是巡逻方向，home 是驻点所在分区。
export const AGENT_DEFS = [
  { id: 'dog-1', role: 'ground', badge: '地', name: '巡检犬 01', kind: '四足巡检机器人', speed: 2.5, detectR: 70, patrol: true, dir: 1, home: 'A' },
  { id: 'drone-1', role: 'air', badge: '天', name: '无人机 01', kind: '多旋翼巡检无人机', speed: 8, alt: 70, hoverAlt: 32, detectR: 130, patrol: true, dir: -1, home: 'D' },
  { id: 'guard-1', role: 'human', badge: '人', name: '安保员 01', kind: '电动巡逻车', speed: 9, home: 'B' },
  { id: 'guard-2', role: 'human', badge: '人', name: '安保员 02', kind: '电动巡逻车', speed: 9, home: 'F' },
];

export const ROLE_NAME = { ground: '地面巡检', air: '空中巡检', human: '现场处置' };

// needs：需要哪类智能体到场。parallel 为真时同时派出，否则空中复核完再派人，少占人力。
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
    needs: [{ role: 'air', act: '空中跟踪', dwell: 5 }, { role: 'ground', act: '靠近取证', dwell: 5 }, { role: 'human', act: '现场劝离', dwell: 6 }],
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
