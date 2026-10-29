# 牛来盯盘 · 3D 桌面宠物

当前版本：`1.4.0`

一个极简的 Electron + Three.js 透明桌面挂件：支持 A 股、港股和美股实时行情，并按当前股票所在市场的交易时段，在“休盘睡觉 / 开盘平盘 / 牛来上涨 / 妈妈下跌”四种状态间平滑切换。默认股票为上证指数。

## 运行

```bash
npm install
npm start
```

如果使用 pnpm：

```bash
pnpm install
pnpm start
```

窗口固定为 `300x300`，透明无边框、始终置顶、不占用任务栏。鼠标按住任意位置可拖动；右上角会出现一个小圆形退出按钮（悬停时可见）。

左上角半透明行情卡显示名称、代码、最新价、涨跌额和涨跌幅。点击卡片可输入 `600519`、`sh600519` 或 `sz000001` 切换股票，选择结果会保存在本机。上涨显示红色，下跌显示绿色。

点击右上角齿轮可打开毛玻璃设置抽屉。股票页可勾选 A 股、港股和美股并同时搜索名称或代码；每只保存股票分别记忆成本价和持股数。点击左上角行情牌可在“我的股票”中立即切换，详情页也可用系统浏览器打开公开行情页。设置保存后统一写入本机 `localStorage`，旧版单持仓数据会自动迁移。

设置有效持仓后，底部常驻显示今日盈亏、累计盈亏及累计盈亏率，并将累计金额换算成鸡腿、奶茶、火锅、手机或“连续吃土”等趣味生活单位。盈利使用红金色，亏损使用绿色；未设置成本价和持股数时自动恢复为普通行情展示。

## 互动玩法

- 点击右上角齿轮可快速输入股票代码并按回车切换；点击行情卡或输入条的 `⋯` 进入完整设置。
- 单击牛身触发欢快摇摆，约 1.15 秒内连击三次触发鼻孔白烟与刨地冲锋；在牛身上滚轮可轮换上证、深成和创业板指数。
- 底部“上香 / 喂大阳线 / 喂大阴线”分别触发 15 秒赛博香火祈祷、爱心金币奖励和绿色嫌弃气体动画。
- 涨跌幅达到 `+3% / -3%` 时自动触发金币雨金环或泡面绿发带与剧烈颤抖彩蛋。
- 悬停牛身或每隔 30 秒会显示一条根据当前行情变化的股民吐槽气泡。

## 资源放置

模型或音频资源缺失时程序会自动降级，不会报错：

- 新版连续网格骨骼模型：`assets/models/bull-rigged.glb`（三视图重建的一体化雕刻表面，55 骨骼、32 动作、5 表情形态键）
- 第三版几何牛（只作故障回退）：`assets/models/bull-rigged-primitive-v3.glb`
  - 包含55根蒙皮骨骼、5组表情形变、32个动作和42,000个三角面；主角色是一个连续的 `SkinnedMesh`，动作由 `THREE.AnimationMixer` 驱动。
  - 运行 `npm run model:validate` 检查结构，运行 `npm run model:preview` 生成正、侧、背和80像素预览。
- 旧3D模型（回退）：`assets/models/bull.glb`
  - 新版骨骼模型缺失或不合格时加载；旧模型也失败时使用程序化 Low-Poly 牛，渲染故障最终回退2D。
- 上涨音效（可选）：`assets/audio/niulai.mp3`
  - 当前标的上涨时点击牛播放“牛来”，软件不会主动发声。
- 下跌音效（可选）：`assets/audio/mama.mp3`
  - 当前标的下跌时点击牛播放“妈妈”，休盘后仍按当天最后行情判断。

推荐音频使用短小的电影原声片段。打包时 `assets/**` 会自动打进安装包，渲染进程通过自定义 `pet://local/assets/...` 协议读取。

## 行情与状态机

- 主进程每 3~5 秒随机轮询新浪简易行情接口；初始代码为 `s_sh000001`，切换股票后动态更新接口代码并通过 IPC 推送给渲染进程。
- 交易时段按北京时间判定：周一至周五 `09:30-11:30`、`13:00-15:00` 为开盘，其余时间进入休盘状态。
- 开盘状态下，涨跌幅 `>= +0.50%` 进入“牛来”，`<= -0.50%` 进入“妈妈”，其余为“平盘”。

## 打包

在 Windows 11 上生成 `portable` 免安装单文件与 `nsis` 安装包：

```bash
npm run dist:win
```

在 macOS 上生成 Apple Silicon / Intel 双架构 `universal.dmg`：

```bash
npm run dist:mac:universal
```

也可以分别只打单架构：

```bash
npm run dist:mac:arm64
npm run dist:mac:x64
```

所有产物输出到 `release/`。注意：`dmg` 与 universal 包必须在 macOS 上构建，Windows 机器无法直接产出 macOS 安装包。

## 目录

```text
.
├── main.js          Electron 主进程：透明窗口、协议、行情轮询
├── preload.js       contextBridge IPC 桥
├── index.html       300x300 透明画布骨架
├── renderer.js      Three.js 场景、FSM、姿态动画、ZZZ、音频调度
├── assets/
│   ├── audio/       niulai.mp3 / mama.mp3
│   └── models/      bull-rigged.glb（连续网格主模型）/ bull-rigged-primitive-v3.glb、bull.glb（回退）
└── package.json     electron-builder 跨平台配置
```

## 模块边界与数据流

渲染层按职责拆分到 `renderer-modules/`。本次只整理代码边界，不改变界面、素材、本地存储字段或既有漫游行为：

- `state.js`：行情状态与动作优先级常量。
- `storage.js`：设置、持仓和股票代码的兼容读取与保存。
- `market-data.js`：行情快照、连接状态和持仓盈亏计算。
- `bull-controllers.js`：互相独立的 2D、3D 牛控制入口；2D 素材加载不依赖 GLB。
- `behavior-state-machine.js`：优先级、打断、排队、冷却和恢复。
- `action-scheduler.js`：短时互动动作的调度基础。
- `effects-manager.js`：特效强度与开关边界。
- `audio-manager.js`：`niulai.mp3`、`mama.mp3` 的音量和互斥播放。
- `home-window-controller.js`：300×300 家园窗口的控制边界。
- `desktop-roaming-controller.js`：3D 漫游状态、热区、拖动和互动 IPC 边界。

数据流保持为：`main.js` 获取三市场行情 → `market:quote` IPC → `MarketStore` → 行情卡与当前股票持仓计算 → 行为状态机 → 2D/3D 控制器 → 动作、特效与音频。继续兼容 `niulai:pet-settings`、`niulai:portfolio` 和 `niulai:selected-symbol`，多股票记忆使用 `niulai:saved-stocks-v1`。

## 3D 桌面巡游与动作架构

- 300×300 主窗口是牛的家，保存位置并继续显示行情、设置和 2D 趴窗牛。
- 3D 牛运行在独立的 300×300 透明小窗口中，不创建全屏透明遮罩。
- 巡游窗口默认鼠标穿透；主进程根据桌面光标和牛身热区临时开启点击，离开热区立即恢复穿透。
- 窗口坐标统一使用 Electron 的 DIP 屏幕坐标，并按当前显示器 `workArea` 约束，兼容负坐标副屏和不同缩放比例。
- 主进程以1/60秒固定步长运行目标选择、限速转向、加减速、走停观察和随机待机；30 FPS与60 FPS下位移速度一致。
- 停留期间会随机呼吸、张望、甩尾、挠肚子或打哈欠，并偶尔回头观察后再继续；3D朝向使用连续heading插值。
- 靠近目标与屏幕边缘会提前减速，不再碰边瞬时反弹。走路速度会换算为动作步频，降低滑步感。
- 家移动时更新回家目标；休盘、双击牛或“立即召回”会让牛平滑走回最新家的坐标。
- 默认不跨显示器。设置中的“跨屏巡游”只允许选择相邻显示器，DIP坐标兼容125%和150%缩放。
- `allowRoaming` 默认 `true`，新增 `crossDisplayRoaming` 默认 `false`，旧设置会自动补齐而不改变原字段含义。
- 开发环境使用 `electron . --debug-actions` 可打开 AnimationMixer 面板，逐个检查动作、循环、速度、混合和脚掌事件。
- 运行 `npm run test:animation` 会直接加载真实GLB逐项测试20个动作，并输出 `artifacts/skeletal-animation-validation.json`。
- 详细边界见 `docs/桌面巡游与动作系统.md`，模型制作要求见 `docs/骨骼牛模型与动画导出规范.md`。
- 运行 `npm run test:roaming` 可重跑长时间、多屏、DPI、拖动、减速和帧率一致性检查。
- 本轮灰模验收数据与限制见 `docs/新版骨骼牛灰模验收报告.md`。
- 1.3.0 的完整功能、动画、性能、显示器覆盖范围和已知限制见 `docs/1.3.0完整测试报告.md`；1.3.1 的图标、精简与打包复核见 `docs/1.3.1图标与体积优化报告.md`。

## 回归与性能测试

```bash
npm run test:regression
npm run test:single-instance
```

`test:regression` 会检查2D素材、两段MP3、设置兼容、行情/持仓、巡游几何、30/60 FPS一致性、30分钟确定性巡游、回家生命周期、完整动作集、脚掌接触、IK、GLB蒙皮和模型预算。Electron实机与Windows打包结果见 `docs/1.3.0完整测试报告.md` 和 `docs/1.3.1图标与体积优化报告.md`。

连续网格主模型实测刷新策略：普通3D约56.9 FPS；省电3D约29.5 FPS；3D休盘睡眠约11.9 FPS；2D省电睡眠约8 FPS。65秒巡游测试中主进程、家园渲染器和巡游渲染器私有内存均未持续增长，巡游窗口保持鼠标穿透。最大帧率设置仍可进一步限制刷新率。


## 开源与素材

项目代码按 [MIT 许可证](LICENSE) 发布。电影剧照参考图及原声音频的公开再分发授权尚未核实，因此不包含在本仓库中；音频可由使用者自行提供具有适当授权的文件。桌面版缺少音频时会静默跳过；手机版的声音功能需要自行配置音频。第三方依赖遵循各自的许可证，仓库中其他素材的使用须自行核实相应权利。
