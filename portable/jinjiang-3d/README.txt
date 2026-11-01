锦江千年 · 白鹭湾园区巡检孪生（便携版）
========================================

运行
  Windows：双击 start.bat
  macOS  ：双击 start.command（首次若被系统拦截，右键 → 打开）
  Linux  ：终端执行 ./start.command

  需要先安装 Node.js 18 或更高版本（https://nodejs.org/）。
  启动后会自动打开浏览器，默认地址 http://localhost:5173 。
  端口被占用时自动顺延；也可以手动指定：node server.mjs 8080
  关闭命令行窗口即停止服务。

注意
  - 不要直接双击 index.html（file:// 会被浏览器拦截模块和数据请求），请用上面的启动脚本。
  - 服务只监听本机 127.0.0.1，局域网内其他设备访问不到。
  - 页面使用 WebGL，请用最新版 Chrome / Edge / Safari / Firefox。
  - 页面从 CDN 加载 Geist 字体；离线时会自动使用系统字体，其余功能不受影响。
  - 巡检设备、事件和异常检测均为模拟演示，未接入任何真实设备。

数据来源：© OpenStreetMap contributors (ODbL)。
