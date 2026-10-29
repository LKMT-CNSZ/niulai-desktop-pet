# 电子牛来

一个像电子木鱼一样的解压小应用。点击中央牛来大头，听一声“牛来”，收一份“牛气 +1”。牛气仅为趣味计数。

## 使用

- Windows 成品：双击 `release/Niulai-1.0.0-portable.exe`，免安装运行。
- 开发版：双击 `启动电子牛来.vbs`，使用上一级工程已有的 Electron，不改动盯盘应用。
- 网页版：使用静态服务器打开本目录，支持手机尺寸、触控、鼠标和空格键。
- 自己敲：点击大头或按空格；900 毫秒内继续点击算连击，自动敲击不计入连击纪录。
- 自动牛来：默认每 1.5 秒一声，可在节奏设置中改为 0.8 / 1.5 / 2.5 / 4 秒。切到后台、打开设置、重新启动均停止自动敲击，不会偷偷播放。
- 右上角可静音、调节音量、关闭动效；同时尊重系统减少动态效果设置。
- 今日牛气按设备本地日期换日；总数、最高连击和偏好保存在设备上，本次计数每次启动重置。桌面与浏览器存储各自独立。
- 快速连点限制最多三个重叠音轨，不积压音频队列；静音、后台会停止现有音频。

## 开发

界面为原生 HTML/CSS/JS，没有前端运行依赖，桌面外壳使用父工程已有的 Electron。

```powershell
node --check main.cjs
node --check app.js
..\node_modules\.bin\electron.cmd .
..\node_modules\.bin\electron-builder.cmd --win portable --config.electronVersion=33.4.11
```

`art.raaay.niulai-muyu` 为独立应用标识，桌面数据保存在 `%APPDATA%/niulai-muyu`。未读取任何股票或持仓信息，不需要联网服务。

## 素材

- `assets/niulai.mp3`：复用当前项目已有“牛来”音频。
- `assets/head.png`：电子牛来头像。
- 既有角色与音频素材的权利状态未在本项目中重新核实。
