# 锦江区 P1 开发与验收报告

更新时间：2026-10-30（Asia/Shanghai）

## 1. 本次修改与技术方案

P1 沿用 P0 的 Three.js 场景、自由镜头、昼夜/天气、LOD、InstancedMesh、分块实例、视锥剔除和自适应画质管线，没有重写渲染层。

修改文件：

- `tools/city-config.mjs`：集中管理行政区 relation、边界 bbox、800 m 缓冲、投影原点、核心场景坐标和数据前缀。
- `tools/fetch-osm.mjs`：建筑抓取由 3 块扩展为 4 块，所有抓取范围使用统一配置。
- `tools/build-city.mjs`：读取并投影真实 GeoJSON 边界；构建元数据携带边界环；建筑记录区内/缓冲区外状态；对明显落水轮廓做检查；去除运行中的广州桥梁高度/桥型和广州专属地标分支；增加真实数据统计。
- `tools/validate-spatial.mjs`：新增空间预检命令，检查边界 relation、建筑闭合率、道路几何和桥梁标签。
- `src/world/data.js`、`src/ui/hud.js`：运行时读取边界并在小地图绘制锦江区行政边界虚线。
- `src/core/scenes.js`：全域鸟瞰机位改为覆盖边界范围，保留春熙路、太古里、合江亭、安顺廊桥、九眼桥场景。
- `index.html`、`src/world/city.js`：页面文案升级为 P1，精细片区不可用时明确显示基础场景状态。
- `data/chengdu.json`、`data/chengdu.bin.gz`、`data/chengdu-veg.bin.gz`、`data/chengdu-evidence.json.gz`：完成离线重建。

## 2. 边界、来源与投影

- 行政边界：OSM Nominatim GeoJSON，relation **4734760**，名称“锦江区, 成都市, 四川省, 中国”，缓存于 `data/jinjiang-boundary.geojson`。
- 核验范围：104.057658–104.1682525E，30.5493864–30.6724867N。
- 数据缓冲：外扩约 800 m，用于边缘道路、河岸和绿地视觉衔接。
- 投影：WGS84 经纬度转本地米制坐标；原点 104.087E, 30.642N；配置集中在 `tools/city-config.mjs`。
- 许可：OpenStreetMap contributors，ODbL-1.0；四川 PBF 裁剪时间为 2026-10-30，PBF 来源为 OpenStreetMap regional extract（ODbL-1.0）。

## 3. 实际统计

| 指标 | P0 报告 | 当前 P1 构建 |
|---|---:|---:|
| 元数据城市范围 | 104.045–104.145E / 30.600–30.675N | 104.0577–104.1683E / 30.5494–30.6725N |
| 原始建筑 way | 21,079 | 23,544 |
| 渲染真实建筑/构件 | 20,489 | 23,043 |
| 原始道路 way | 9,902 | 12,662 |
| 进入渲染的道路 | 5,103 | 6,547 |
| 道路长度 | 1,548 km | 2,336 km |
| 树木 | 148,388 | 254,487 |
| 桥梁（有名） | 3 | 3 |
| 行政区内建筑中心点 | 未统计 | 10,397 |
| 缓冲区外建筑中心点 | 未统计 | 12,831 |
| 明显落水建筑拒绝数 | 未统计 | 2 |

空间预检输出保存在 `output/spatial-check.json`。当前快照中建筑闭合率 100%，道路都有至少 2 个几何点，桥梁标签存在。

## 4. 建筑高度完整性

原始建筑 23,544 个：`height` 963 个；`building:levels` 3,070 个；至少有一种显式高度字段 3,657 个（15.5%）；缺少显式高度字段 19,887 个（84.5%）；`building:part` 1,104 个。

构建优先使用 `height`，其次使用 `building:levels`，最后使用可追踪的建筑类型、面积和分区推断。推断高度只进入渲染体量，不写回 OSM，也没有被统计为实测高度。

## 5. P0/P1 对比与截图

P1 保留春熙路商圈俯瞰、成都太古里、合江亭及锦江河岸、安顺廊桥、九眼桥夜景场景。全域鸟瞰相机覆盖行政边界及缓冲区；小地图显示黄色虚线行政边界。

P0 基线截图：[output/playwright/jinjiang.png](../output/playwright/jinjiang.png)。本轮浏览器通过 CUA 实际打开页面并验证了 P1 页面、边界图例、场景按钮和统计胶囊；当前截图通过浏览器会话查看，未把宿主截图伪装成测绘证据。

## 6. 性能验证

浏览器实测环境：本地静态服务器 `http://localhost:5173/`，默认桌面视口。

- 页面标题正确：锦江千年 · 成都 3D 数字城市。
- 控制台阻断性错误：0。
- 加载完成后 HUD：60 FPS、613 draw calls。
- 建筑 23,043、树木 254,487、道路 2,336 km 正常显示。
- P1 全域元数据范围约 10.6 × 13.6 km。
- 原有分块、LOD、InstancedMesh 和自适应画质保持工作。

仓库 `npm test` 结果为 64 passed、7 failed、2 skipped。失败来自 P0 遗留的广州精细样件、旧快照和旧道路数量断言，未将这些旧断言改写为通过。

## 7. 已知问题与数据限制

四川区域 PBF 已完成下载并本地裁剪，当前数据不再依赖 OSM map 或 Overpass 在线请求。PBF 文件位于 `data/source/sichuan.osm.pbf`，裁剪脚本为 `tools/clip-sichuan-pbf.py`。当前原始数据覆盖配置的锦江区 bbox 与 800 m 外扩范围，行政边界 relation 4734760 继续负责区内/区外识别。`npm run check:spatial` 已明确记录 PBF 来源。

可复现命令：`py -m pip install osmium`、`npm run clip:pbf`、`npm run build:data`。

## 8. P2 精细地标建议

1. 基于 OSM 轮廓与公开照片，分别建立安顺廊桥、九眼桥和合江亭的可追溯细节包。
2. 补充锦江岸线与桥面高程证据，区分桥面、引桥和地面道路层级。
3. 接入成都 DEM 或公开高程栅格，替换当前平面地面降级。
4. 为春熙路/太古里建立现代商业区材质与屋顶设备样件；历史街区继续使用 OSM 轮廓，不用程序化地标冒充真实建筑。
5. 扩展高度字段审计，输出 `height`、`building:levels`、推断、`building-part` 四类可追踪统计。



