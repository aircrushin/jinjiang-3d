// P1 空间数据预检：只报告可由当前 OSM 快照核验的事实，不把程序化补全计入真实覆盖。
import fs from 'node:fs';
import { CITY_CONFIG } from './city-config.mjs';
import { pointInRing } from './lib.mjs';

const raw = CITY_CONFIG.rawDir;
const boundary = JSON.parse(fs.readFileSync(CITY_CONFIG.boundaryPath, 'utf8'));
const feature = boundary.features?.find((f) => f.properties?.osm_id === CITY_CONFIG.boundaryRelation);
if (!feature) throw new Error(`boundary relation ${CITY_CONFIG.boundaryRelation} not found`);
const rings = (feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates).map((p) => p[0]);
const inside = (lon, lat) => rings.some((r) => pointInRing(lon, lat, r));
const read = (name) => JSON.parse(fs.readFileSync(`${raw}${name}`, 'utf8')).els || [];
const bld = ['bld-1.json', 'bld-2.json', 'bld-3.json', 'bld-4.json'].flatMap((n) => fs.existsSync(`${raw}${n}`) ? read(n) : []);
const roads = read('roads.json');
const boundaryBld = bld.filter((e) => e.g?.length && inside(e.g.reduce((s, p) => s + p[0], 0) / e.g.length, e.g.reduce((s, p) => s + p[1], 0) / e.g.length));
const closed = bld.filter((e) => e.g?.length >= 4 && e.g[0][0] === e.g.at(-1)[0] && e.g[0][1] === e.g.at(-1)[1]);
const bridgeRoads = roads.filter((e) => e.t?.bridge && e.t.bridge !== 'no');
const report = {
  boundary: { relation: CITY_CONFIG.boundaryRelation, featureName: feature.properties.name, bbox: CITY_CONFIG.boundaryBbox },
  raw: { buildingWays: bld.length, roadWays: roads.length, closedBuildingWays: closed.length, boundaryBuildingWays: boundaryBld.length, boundaryBuildingRatio: +(boundaryBld.length / Math.max(1, bld.length)).toFixed(4), bridgeWays: bridgeRoads.length },
  checks: {
    boundaryVerified: true,
    buildingClosureRatio: +(closed.length / Math.max(1, bld.length)).toFixed(4),
    roadsHaveGeometry: roads.every((e) => e.g?.length >= 2),
    bridgeTagsPresent: bridgeRoads.length > 0,
  },
  source: { type: 'osm-pbf', file: 'data/source/sichuan.osm.pbf', clippedTo: CITY_CONFIG.outerBbox },
  limitations: ['PBF is a regional extract; the renderer still uses its configured outer buffer and administrative-boundary clipping.'],
};
console.log(JSON.stringify(report, null, 2));
