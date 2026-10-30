// 下载成都锦江区 P0 的真实 OpenStreetMap 数据（© OpenStreetMap contributors, ODbL）。
// 分块抓取建筑，其他图层按外扩范围抓取；失败时重试并按 OSM id 去重。
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { normalizeOSM } from './osm-source.mjs';
import { CITY_CONFIG, bboxString } from './city-config.mjs';

const API = process.env.OVERPASS_URL || CITY_CONFIG.osmSource;
const MODE = process.env.OSM_MODE || 'map';
const OUT = CITY_CONFIG.rawDir;
const B = CITY_CONFIG.bbox;
const R = CITY_CONFIG.outerBbox;
const box = (b) => bboxString(b);
const chunkCount = 4;
const chunks = Array.from({ length: chunkCount }, (_, i) => [
  B.south,
  B.west + (B.east - B.west) * i / chunkCount,
  B.north,
  B.west + (B.east - B.west) * (i + 1) / chunkCount,
]);
const QUERIES = {
  'water.json': `(way["natural"="water"](${box(R)});relation["natural"="water"](${box(R)});way["waterway"](${box(R)});relation["waterway"](${box(R)}););out body geom;`,
  'landuse.json': `(way["leisure"](${box(R)});way["landuse"](${box(R)});way["natural"](${box(R)});way["amenity"](${box(R)});way["place"="square"](${box(R)});way["area:highway"](${box(R)}););out tags geom;`,
  'relations.json': `(relation["building"](${box(B)});relation["type"="building"](${box(B)});relation["leisure"](${box(R)});relation["landuse"](${box(R)});relation["natural"](${box(R)});relation["amenity"](${box(R)}););out body geom;`,
  'misc.json': `(way["railway"](${box(R)});way["man_made"](${box(R)});node["natural"="tree"](${box(R)});node["tourism"](${box(R)});way["tourism"](${box(R)});node["historic"](${box(R)});way["historic"](${box(R)}););out tags geom;`,
};
for (let i = 0; i < chunks.length; i++) {
  const b = { south: chunks[i][0], west: chunks[i][1], north: chunks[i][2], east: chunks[i][3] };
  QUERIES[`bld-${i + 1}.json`] = `(way["building"](${box(b)});relation["building"](${box(b)});way["building:part"](${box(b)}););out tags geom;`;
}
async function run(q) {
  const body = 'data=' + encodeURIComponent(`[out:json][timeout:300][maxsize:1073741824];${q}`);
  let last = '';
  for (let i = 0; i < 8; i++) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), Number(process.env.OVERPASS_REQUEST_TIMEOUT_MS || 360000));
    try {
      const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'chengdu-jinjiang-3d/1.0' }, body, signal: ac.signal });
      const text = await r.text();
      if (r.ok && text.trim().startsWith('{')) return JSON.parse(text);
      last = `HTTP ${r.status}: ${text.slice(0, 160)}`;
    } catch (e) {
      last = e.message;
      // 部分 Windows Node 运行时无法完成外部 TLS 握手，curl 使用系统证书作为兜底。
      try {
        const out = execFileSync('curl.exe', ['-sS', '--fail', '--max-time', '330', '-A', 'chengdu-jinjiang-3d/1.0', '--data', body, API], { encoding: 'utf8', maxBuffer: 1024 * 1024 * 1024 });
        if (out.trim().startsWith('{')) return JSON.parse(out);
        last = 'curl returned non-JSON';
      } catch (ce) { last = ce.message; }
    } finally { clearTimeout(timer); }
    console.warn(`  重试 ${i + 1}/8（${last}）`);
    await new Promise((s) => setTimeout(s, 2500 + i * 2500));
  }
  throw new Error(`Overpass 请求失败：${last}`);
}
function dedupe(data) {
  const seen = new Set();
  data.els = data.els.filter((e) => { const k = `${e.k}:${e.id}`; if (seen.has(k)) return false; seen.add(k); return true; });
  data.n = data.els.length;
  return data;
}
fs.mkdirSync(OUT, { recursive: true });
// 公开 OSM API 的 map 端点按小瓦片抓取，避免公共 Overpass 的超时限制。
const roadTiles = [];
for (let lat = R.south; lat < R.north - 1e-8; lat += 0.025) for (let lon = R.west; lon < R.east - 1e-8; lon += 0.03) {
  roadTiles.push({ south: lat, west: lon, north: Math.min(R.north, lat + 0.025), east: Math.min(R.east, lon + 0.03) });
}
function xmlUnescape(s) { return s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>'); }
function parseMapXml(xml) {
  const nodes = new Map();
  for (const m of xml.matchAll(/<node\b([^>]*?)(?:\/>|>([\s\S]*?)<\/node>)/g)) {
    const a = Object.fromEntries([...m[1].matchAll(/(\w+)="([^"]*)"/g)].map((x) => [x[1], x[2]]));
    if (!a.id || !a.lon || !a.lat) continue;
    const tags = {}; for (const t of (m[2] || '').matchAll(/<tag\b([^\/]*)\/>/g)) { const q = Object.fromEntries([...t[1].matchAll(/(\w+)="([^"]*)"/g)].map((x) => [x[1], xmlUnescape(x[2])])); if (q.k) tags[q.k] = q.v || ''; }
    nodes.set(a.id, { type: 'node', id: +a.id, lon: +a.lon, lat: +a.lat, tags });
  }
  const ways = [];
  for (const m of xml.matchAll(/<way\b([^>]*)>([\s\S]*?)<\/way>/g)) {
    const a = Object.fromEntries([...m[1].matchAll(/(\w+)="([^"]*)"/g)].map((x) => [x[1], x[2]]));
    const refs = [...m[2].matchAll(/<nd\b[^>]*ref="(\d+)"[^>]*\/>/g)].map((x) => x[1]);
    const tags = {}; for (const t of m[2].matchAll(/<tag\b([^\/]*)\/>/g)) { const q = Object.fromEntries([...t[1].matchAll(/(\w+)="([^"]*)"/g)].map((x) => [x[1], xmlUnescape(x[2])])); if (q.k) tags[q.k] = q.v || ''; }
    const geometry = refs.map((id) => nodes.get(id)).filter(Boolean).map((n) => ({ lon: n.lon, lat: n.lat }));
    if (a.id && geometry.length >= 2) ways.push({ type: 'way', id: +a.id, nodes: refs.map(Number), tags, geometry });
  }
  return [...nodes.values(), ...ways];
}
let normalized;
if (MODE === 'overpass') {
  // OSM map API 在部分网络出口会被 CDN 丢弃；Overpass POST 返回相同的 way geometry，且不依赖单瓦片 XML。
  const allEls = [];
  const overpassQueries = [
    ...chunks.map((c, i) => [`roads-${i + 1}.json`, `(way["highway"](${box({ south: c[0], west: c[1], north: c[2], east: c[3] })}););out tags geom;`]),
    ...Object.entries(QUERIES),
  ];
  for (const [name, query] of overpassQueries) {
    console.log('Overpass 查询', name);
    const data = await run(query);
    allEls.push(...(data.elements || []));
  }
  normalized = dedupe(normalizeOSM({ elements: allEls }, { id: 'jinjiang-overpass', url: API, license: 'ODbL-1.0', retrievedAt: new Date().toISOString() }));
} else {
  const allEls = [];
  for (const tile of roadTiles) {
    console.log('下载 OSM tile', tile.south.toFixed(3), tile.west.toFixed(3));
    const url = `https://api.openstreetmap.org/api/0.6/map?bbox=${tile.west},${tile.south},${tile.east},${tile.north}`;
    let xml = '';
    for (let attempt = 0; attempt < 4 && !xml; attempt++) {
      try { xml = execFileSync('curl.exe', ['-sS', '--fail', '--max-time', '120', '-A', 'chengdu-jinjiang-3d/1.0', url], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }); }
      catch {
        try {
          const ps = `$ProgressPreference='SilentlyContinue'; (Invoke-WebRequest -UseBasicParsing -Uri '${url}' -Headers @{'User-Agent'='chengdu-jinjiang-3d/1.0'} -TimeoutSec 180).Content`;
          xml = execFileSync('powershell.exe', ['-NoProfile', '-Command', ps], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
        } catch (pe) { console.warn(`  tile 重试 ${attempt + 1}/4: ${pe.message.split('\n')[0]}`); }
      }
    }
    if (!xml) throw new Error(`OSM map 下载失败 ${url}`);
    allEls.push(...parseMapXml(xml));
  }
  normalized = dedupe(normalizeOSM({ elements: allEls }, { id: 'jinjiang-map', url: 'https://api.openstreetmap.org/api/0.6/map', license: 'ODbL-1.0', retrievedAt: new Date().toISOString() }));
}
normalized.ts = normalized.source.retrievedAt;
const has = (pred) => ({ version: normalized.version, source: normalized.source, ts: normalized.ts, els: normalized.els.filter(pred), n: normalized.els.filter(pred).length });
const roadData = has((e) => e.k === 'w' && e.t.highway);
fs.writeFileSync(OUT + 'roads.json', JSON.stringify(roadData));
fs.writeFileSync(OUT + 'water.json', JSON.stringify(has((e) => e.k === 'w' && (e.t.natural === 'water' || e.t.waterway))));
fs.writeFileSync(OUT + 'landuse.json', JSON.stringify(has((e) => e.k === 'w' && (e.t.leisure || e.t.landuse || e.t.natural || e.t.amenity || e.t.place === 'square' || e.t['area:highway']))));
fs.writeFileSync(OUT + 'relations.json', JSON.stringify(has(() => false)));
fs.writeFileSync(OUT + 'misc.json', JSON.stringify(has((e) => e.k === 'w' && (e.t.railway || e.t.man_made || e.t.tourism || e.t.historic))));
for (let i = 0; i < chunks.length; i++) {
  const b = { south: chunks[i][0], west: chunks[i][1], north: chunks[i][2], east: chunks[i][3] };
  const d = has((e) => e.k === 'w' && (e.t.building || e.t['building:part']) && e.g?.some((p) => p[0] >= b.west && p[0] <= b.east && p[1] >= b.south && p[1] <= b.north));
  fs.writeFileSync(`${OUT}bld-${i + 1}.json`, JSON.stringify(d));
  console.log(`建筑分块 ${i + 1}: ${d.n} 个要素`);
}
console.log(`道路 ${roadData.n} 个要素 / ${roadTiles.length} 个 OSM map 瓦片`);
const boundaryUrl = 'https://nominatim.openstreetmap.org/search?format=geojson&polygon_geojson=1&q=%E9%94%A6%E6%B1%9F%E5%8C%BA%2C%E6%88%90%E9%83%BD%E5%B8%82';
let bj;
try {
  const br = await fetch(boundaryUrl, { headers: { 'User-Agent': 'chengdu-jinjiang-3d/1.0' } });
  if (!br.ok) throw new Error(`HTTP ${br.status}`);
  bj = await br.json();
  } catch {
  try {
    bj = JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-Command', `$ProgressPreference='SilentlyContinue'; (Invoke-WebRequest -UseBasicParsing -Uri '${boundaryUrl}' -Headers @{'User-Agent'='chengdu-jinjiang-3d/1.0'} -TimeoutSec 90).Content`], { encoding: 'utf8' }));
  } catch {
    if (fs.existsSync(CITY_CONFIG.boundaryPath)) bj = JSON.parse(fs.readFileSync(CITY_CONFIG.boundaryPath, 'utf8'));
    else throw new Error('行政区边界请求失败，且没有本地缓存');
  }
}
if (!bj.features?.some((f) => f.properties?.osm_id === 4734760)) console.warn('警告：边界结果未匹配锦江区 relation 4734760');
fs.writeFileSync(CITY_CONFIG.boundaryPath, JSON.stringify(bj));
console.log('行政边界写入', CITY_CONFIG.boundaryPath);
