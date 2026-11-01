// 生成可直接在电脑上运行的便携文件夹：node tools/build-portable.mjs [输出目录，默认 portable/jinjiang-3d]
// 只拷贝运行时用到的文件（页面、src、vendor、城市数据、精细建筑），不含 OSM 原始数据、构建脚本和测试。
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('..', import.meta.url));
const out = resolve(process.argv[2] || join(repo, 'portable', 'jinjiang-3d'));
if (out === repo || !out.startsWith(repo)) throw new Error(`输出目录必须在仓库内：${out}`);

const from = (p) => join(repo, p);
const to = (p) => join(out, p);
const copy = (p, filter) => cpSync(from(p), to(p), { recursive: true, filter });

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

copy('index.html');
copy('src');
copy('vendor');
// 精细建筑模型代码依赖 prototypes/p2 的三个模块（见 src/world/detail-layer.js）
for (const f of ['models.js', 'skybridge.js', 'geometry.js']) copy(`prototypes/p2/${f}`);

// data/ 只带运行时会请求的文件：不含 raw/source/evidence 研究数据和其他城市
const meta = JSON.parse(readFileSync(from('data/chengdu.json'), 'utf8'));
const dataFiles = ['chengdu.json', ...meta.files.map((f) => f.name), meta.evidence?.name].filter(Boolean);
for (const f of dataFiles) copy(`data/${f}`);
copy('data/detail', (src) => !/(report|validation|upgrades)[^/\\]*\.json$/.test(src));

// tools/portable/* 平铺到输出根目录
for (const f of ['server.mjs', 'start.bat', 'start.command', 'README.txt']) cpSync(from(`tools/portable/${f}`), join(out, f));
copy('LICENSE');

// 自检：所有相对 import / fetch 路径都必须落在输出目录里
const missing = [];
const walk = (d) => readdirSync(d).flatMap((n) => {
  const p = join(d, n);
  return statSync(p).isDirectory() ? walk(p) : [p];
});
for (const file of walk(out).filter((p) => /\.(js|mjs)$/.test(p) && !p.includes(`${join(out, 'vendor')}`))) {
  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(/(?:from\s*|import\s*\(\s*|import\s+)['"](\.{1,2}\/[^'"]+)['"]/g)) {
    if (!existsSync(resolve(dirname(file), m[1]))) missing.push(`${file.slice(out.length + 1)} → ${m[1]}`);
  }
}
for (const m of readFileSync(to('index.html'), 'utf8').matchAll(/(?:src|href)="(\.\/[^"]+)"/g)) {
  if (!existsSync(to(m[1]))) missing.push(`index.html → ${m[1]}`);
}
if (missing.length) {
  console.error(`缺少文件：\n  ${missing.join('\n  ')}`);
  process.exit(1);
}

const size = (d) => walk(d).reduce((s, p) => s + statSync(p).size, 0);
console.log(`已生成 ${out}（${(size(out) / 1048576).toFixed(1)} MB，${walk(out).length} 个文件）`);
