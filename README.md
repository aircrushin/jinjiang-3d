# 成都锦江 · 三维城市

基于真实公开地理数据构建的成都锦江区三维城市可视化项目。项目使用 WebGL 实时渲染建筑、道路、水系、绿地、交通与城市地标，并提供昼夜、天气、镜头漫游和细节样件展示。

## 在线体验

项目可部署为纯静态站点。GitHub 仓库：[aircrushin/jinjiang-3d](https://github.com/aircrushin/jinjiang-3d)

## 项目范围

- 重点覆盖成都锦江区及其周边城市区域
- 使用锦江区边界、成都城市建筑、道路、绿地与水系数据
- 支持街区级建筑体量、道路网络、树木、地标和精细建筑样件
- 提供场景切换、自由飞行、街景视角、昼夜和天气效果
- 城市数据预先构建并以 gzip 压缩，浏览器端分段加载

## 本地运行

项目不需要构建前端依赖，依赖已内置在 `vendor/` 中。使用 Node.js 启动静态服务器：

```bash
npm start
```

然后访问 <http://localhost:5173>。也可以使用 `node serve.mjs 8080` 指定端口。

不要直接用 `file://` 打开 `index.html`，浏览器会拦截模块和数据请求。

## 操作方式

- 方向键移动地图位置
- 鼠标左键旋转，右键平移，滚轮缩放
- 手机支持单指旋转、双指缩放和平移
- 默认开场落在锦邻公寓（OSM 在建地块），左上角显示成都当地时间（UTC+8），天色与灯光跟随真实时间；切换其他预设场景后使用预设时间，点“回到实时”恢复
- 锦邻公寓在 OSM 里只有地块轮廓（way 1346656240），地块内的 5 栋塔楼和 1 栋配套楼由 `src/jinlin/` 按地块形状示意摆放，层数与位置不对应实际规划
- 使用场景面板切换预设视角
- 地址栏中的场景参数可用于分享视角
- 闲置后会自动进入展示模式

## 数据与构建

主要数据位于 `data/`：

- `data/jinjiang-boundary.geojson`：锦江区边界
- `data/chengdu.json`：城市数据元信息
- `data/chengdu.bin.gz`：建筑、道路、水系、地形等主数据
- `data/chengdu-veg.bin.gz`：树木与植被数据
- `data/detail/`：精细建筑和样件参数

重新获取和构建数据：

```bash
npm run fetch:osm
npm run build:data
```

原始 OSM 数据体积较大，`data/source/*.osm.pbf` 使用 Git LFS 管理。构建脚本和城市配置位于 `tools/`，运行端代码位于 `src/`。

## 测试

```bash
npm test
```

空间数据检查：

```bash
node --import ./tools/lib/three-alias.mjs tools/validate-spatial.mjs
```

## 数据来源与许可

地图数据来自 [OpenStreetMap](https://www.openstreetmap.org/copyright) 贡献者，按 [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/) 使用。高程数据来自 [AWS Terrain Tiles](https://registry.opendata.aws/terrain-tiles/)。代码以 [MIT](LICENSE) 许可发布，第三方库许可见 `vendor/`。

## 目录结构

```text
index.html              三维城市页面
serve.mjs               本地静态服务器
src/                    渲染、场景、城市与界面代码
data/                   构建后的城市数据
tools/                  数据下载、构建与校验脚本
tests/                  自动化测试
output/                 验收截图与检查输出
```
