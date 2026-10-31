// 成都锦江区 P0 预设场景。机位坐标来自 OSM/Nominatim 中对应要素的 WGS84 位置，
// 运行时由 src/main.js 按 data/chengdu.json 的本地投影原点转换。
export const SCENES = [
  { id: 'chunxi', name: '春熙路商圈俯瞰', sub: '春熙路与IFS周边真实街区', icon: 'hero', atmos: { timeOfDay: 17.8, weather: 'humid', haze: 30, lightIntensity: 105, exposure: 102 }, cam: [104.0752984, 30.6591874, 260], tgt: [104.0809664, 30.6558209, 20] },
  { id: 'taikooli', name: '成都太古里', sub: '开放式商业街区与真实建筑轮廓', icon: 'street', atmos: { timeOfDay: 16.2, weather: 'clear', haze: 24, lightIntensity: 100, exposure: 102 }, cam: [104.0768, 30.6538, 95], tgt: [104.0809664, 30.6558209, 8] },
  { id: 'hejiangting', name: '合江亭及锦江河岸', sub: '两江交汇处的滨水城市界面', icon: 'river', atmos: { timeOfDay: 18.7, weather: 'humid', haze: 34, lightIntensity: 115, exposure: 103 }, cam: [104.0799, 30.6458, 2.2], tgt: [104.0811936, 30.6453339, 8], bank: true },
  { id: 'anshun', name: '安顺廊桥', sub: '锦江岸线与桥梁真实空间关系', icon: 'night', atmos: { timeOfDay: 20.4, weather: 'clear', haze: 28, lightIntensity: 135, exposure: 104 }, cam: [104.08245, 30.64475, 2.2], tgt: [104.0835001, 30.6441250, 1.5], bank: true },
  { id: 'jiuyan', name: '九眼桥夜景', sub: '九眼桥与东门码头一带夜景', icon: 'night', atmos: { timeOfDay: 21.0, weather: 'humid', haze: 36, lightIntensity: 145, exposure: 105 }, cam: [104.0894, 30.6388, 105], tgt: [104.0863304, 30.6423694, 8] },
  { id: 'jinjiang-top', name: '锦江区全景', sub: '行政边界与缓冲区全域鸟瞰', icon: 'top', atmos: { timeOfDay: 12.5, weather: 'clear', haze: 24, lightIntensity: 100, exposure: 100 }, cam: [104.105, 30.61, 2200], tgt: [104.105, 30.625, 0] },
  { id: 'bailuwan', name: '白鹭湾总部功能区俯瞰', sub: '白鹭湾科技生态园 A–E 区 · 巡检孪生', icon: 'top', atmos: { timeOfDay: 16.4, weather: 'clear', haze: 22, lightIntensity: 105, exposure: 102 }, cam: [104.11091, 30.5797, 520], tgt: [104.11091, 30.5862, 0] },
  { id: 'bailuwan-night', name: '白鹭湾功能区夜间巡检', sub: '低空视角 · 灯光下的巡逻环线', icon: 'night', atmos: { timeOfDay: 20.6, weather: 'clear', haze: 26, lightIntensity: 135, exposure: 104 }, cam: [104.1075, 30.5845, 130], tgt: [104.1115, 30.5862, 0] },
  { id: 'rain', name: '锦江雨幕', sub: '昼夜与天气效果', icon: 'rain', atmos: { timeOfDay: 15.0, weather: 'rain', haze: 60, lightIntensity: 110, exposure: 100 }, cam: [104.077, 30.652, 180], tgt: [104.081, 30.646, 10] },
];
export const DEFAULT_ATMOS = { timeOfDay: 17.9, weather: 'humid', haze: 34, lightIntensity: 100, exposure: 100 };
export const SCENE_KEYS = '1234567890-='.split('');

