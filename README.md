# 锦江千年 · 白鹭湾园区巡检孪生

基于真实公开地理数据（OpenStreetMap）构建的成都锦江区三维城市，内置**白鹭湾科技生态园巡检孪生演示**：机器狗、无人机、无人车沿真实道路自动巡逻，发现异常后按事件类型自动派单处置，支持文字指令和一键演示剧情。

> 设备、事件和异常检测全部是模拟演示，没有接入任何真实设备或数据流。详见 [`docs/赛道二-白鹭湾巡检孪生方案-2026-11-01.md`](docs/赛道二-白鹭湾巡检孪生方案-2026-11-01.md)。

## 在线体验

<https://jinjiang-3d.vercel.app/>

打开后，右侧面板切到「巡检」标签，点「一键演示」看完整剧情（约 2 分钟，画面上方有字幕说明），或打开「自动出事件」自由观察，也可以直接在指令框里输入「让机器狗去 C 区巡查」「E 区出现积水」等指令。

GitHub 仓库：[aircrushin/jinjiang-3d](https://github.com/aircrushin/jinjiang-3d)

## 巡检孪生亮点

- **自动巡逻**：机器狗沿道路环线巡逻，无人机沿航线巡航，无人车驻点待命
- **真实路网寻路**：所有智能体的移动都沿 OpenStreetMap 真实道路计算路径，不是预设动画
- **按事件类型自动派单**：占道、积水、闯入、烟雾、路灯故障——每类事件对应不同的处置流程和派单策略，高风险事件多智能体同时响应
- **离线文字指令**：本地规则解析自然语言指令，不依赖网络和 API
- **确定性模拟**：同一随机种子每次演示的过程完全一致，可复现
- **统计面板**：待处理/已处置数、平均响应、平均闭环、累计里程，支持 1×/2×/4× 倍速

## 项目范围

- 重点覆盖成都锦江区及其周边城市区域，白鹭湾科技生态园 A–E 区为巡检孪生场景
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

### 便携版（拷到任意电脑直接运行）

```bash
npm run build:portable
```

生成 `portable/jinjiang-3d/`（约 9 MB，只含运行所需文件）。整个文件夹拷到别的电脑，装有 Node.js 18+ 即可：Windows 双击 `start.bat`，macOS 双击 `start.command`，会自动启动本机服务并打开浏览器。详见文件夹内的 `README.txt`。

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
