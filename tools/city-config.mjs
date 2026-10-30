// 成都锦江区城市配置。行政边界是唯一的城市范围依据；bbox 仅用于抓取边界外的自然缓冲。
export const CITY_CONFIG = {
  id: 'chengdu-jinjiang',
  name: '锦江区',
  title: '锦江千年 · 成都 3D 数字城市',
  origin: { lon: 104.087, lat: 30.642 },
  boundaryRelation: 4734760,
  // 由 data/jinjiang-boundary.geojson 的 relation 4734760 核验得到。
  boundaryBbox: { south: 30.5493864, west: 104.057658, north: 30.6724867, east: 104.1682525 },
  // bbox 覆盖行政区，outerBbox 额外保留约 800 m 的视觉衔接缓冲。
  bbox: { south: 30.5493864, west: 104.057658, north: 30.6724867, east: 104.1682525 },
  outerBbox: { south: 30.5422, west: 104.0493, north: 30.6797, east: 104.1766 },
  boundaryBufferMeters: 800,
  core: {
    chunxi: [104.0752984, 30.6591874],
    taikooLi: [104.0809664, 30.6558209],
    hejiangting: [104.0811936, 30.6453339],
    anshun: [104.0834347, 30.6441430],
    jiuyan: [104.0863304, 30.6423694],
  },
  rawDir: 'data/raw/jinjiang/',
  dataPrefix: 'chengdu',
  boundaryPath: 'data/jinjiang-boundary.geojson',
  boundarySource: 'OpenStreetMap Nominatim relation 4734760',
  osmSource: 'https://overpass-api.de/api/interpreter',
};

export const bboxString = (b = CITY_CONFIG.bbox) => `${b.south},${b.west},${b.north},${b.east}`;
