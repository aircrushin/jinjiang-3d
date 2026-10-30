# 锦江区 P0 验收记录

更新时间：2026-10-30（Asia/Shanghai）

## 范围与坐标

P0 使用 WGS84，核心区域覆盖春熙路、成都太古里、合江亭、安顺廊桥、九眼桥，下载范围为 `104.045–104.145E, 30.600–30.675N`，外扩抓取范围为 `104.035–104.155E, 30.590–30.685N`。投影原点集中定义在 `tools/city-config.mjs`：`104.087E, 30.642N`。

锦江区行政边界保存于 [`data/jinjiang-boundary.geojson`](../data/jinjiang-boundary.geojson)，来源为 OpenStreetMap Nominatim 返回的 administrative relation `4734760`（显示名“锦江区, 成都市, 四川省, 中国”）。边界数据只作为未来完整锦江区扩展依据，P0 渲染范围由配置中的 bbox 控制。

## 数据来源与统计

- 道路、建筑、水体、地块、铁路及桥梁等：OpenStreetMap 官方 map API 小瓦片，原始请求脚本为 [`tools/fetch-osm.mjs`](../tools/fetch-osm.mjs)，下载时间为 2026-10-30；行政边界使用同一 OSM 数据生态的 Nominatim GeoJSON。
- 许可：OpenStreetMap contributors，ODbL-1.0；页面和数据元数据保留署名。
- 原始下载文件：`data/raw/jinjiang/`，16 个 OSM map 瓦片，分块建筑 3 份，另有道路、水体、地块、铁路等图层。
- 原始道路 way：9,902；进入渲染管线的道路：5,103 条，统计长度约 1,548 km（包含 OSM 线段总长度，非实测通行里程）。
- 原始水体/水道 way：435；栅格化后 86 个主要水体多边形/连通组件。
- 原始建筑 way：21,079（3 个建筑分块合计）；经过轮廓、面积、水面和 building-part 处理后渲染建筑：20,489 栋，其中 704 个 building:part 参与体量替换。
- 构建输出：`data/chengdu.json`、`data/chengdu.bin.gz`、`data/chengdu-veg.bin.gz`、`data/chengdu-evidence.json.gz`。
- 建筑高度优先使用 `height` / `building:levels`；缺失值按原有可追踪推断规则降级。当前没有下载成都 DEM，地面高度安全降级为 0 m，未生成越秀山或其他广州地形。

## 运行与构建

```powershell
npm start

# 重新下载（Overpass 端点失败时可切换镜像；OSM map API 是默认分块来源）
$env:OVERPASS_URL = 'https://overpass.kumi.systems/api/interpreter'
npm run fetch:osm

# 离线重新构建
npm run build:data
```

浏览器加载路径已经改为 `data/chengdu.json`，前端标题为“锦江千年 · 成都 3D 数字城市”。原有广州数据文件仍保留在 `data/guangzhou*`，没有覆盖。

## 浏览器验收

Playwright 实际访问 `http://localhost:5173/`，页面标题、品牌文案和数据统计均为成都锦江区；截图见 [`output/playwright/jinjiang.png`](../output/playwright/jinjiang.png)。截图中可见真实建筑、道路、绿地、锦江水系小地图和五个目标场景。

已验证的预设切换：春熙路商圈俯瞰、成都太古里、合江亭及锦江河岸、安顺廊桥（`#scene=anshun`）、九眼桥夜景（`#scene=jiuyan`）。

页面级检查结果：Playwright 控制台 0 errors、2 warnings；场景切换后 FPS 约 60、绘制调用约 305–543；自由相机、昼夜参数和天气预设均由原 Three.js 管线继续提供。警告来自宿主环境 Statsig 和精细片区清单原点不匹配，基础城市不受阻断。

## 测试结果与限制

`npm run build:data` 通过。`npm test` 共 73 项，64 项通过、7 项失败、2 项跳过；失败项是原广州快照/沙面精细样件/广州数据数量断言，与本次切换城市数据直接冲突，未将其伪装成通过。当前 P0 精细片区清单暂不可用，页面显示基础场景并继续渲染。

尚未解决的问题：OSM map API 的 XML 瓦片偶发网络断连，脚本已按瓦片重试；当前构建没有 DEM，地形为平面降级；安顺廊桥和九眼桥的桥梁结构暂由通用桥梁程序生成，未加入成都专属精细模型；建筑立面仍为程序化材质，不是实景纹理。

## 下一阶段建议

先把行政边界 relation 4734760 用于完整锦江区裁剪，补齐边界外缺口并重新统计覆盖率；随后接入成都 DEM、锦江岸线与桥梁的细节证据包，再为太古里、安顺廊桥、九眼桥和合江亭分别建立基于 OSM 轮廓和公开资料的可追溯精细地标模型。广州原有精细样件清单应保持隔离，待成都数据的原点和 source ID 完成后再建立新的 `data/detail/jinjiang-*` 清单。
