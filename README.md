# 牛来盯盘

牛来盯盘是一个桌面看盘挂件。把股票放在桌面上，牛来会随着行情变化做出不同的动作；休盘后，它也会回家休息。

## 功能

- 查看 A 股、港股和美股行情，搜索并保存关注的股票。
- 记录持仓成本和数量，查看今日及累计盈亏。
- 在 2D 挂件和 3D 桌面巡游之间切换，支持召回和多屏设置。
- 点击互动、行情动画、声音和提醒均可在设置中调整。
- 仓库还包含电子牛来桌面版和[手机版](niulai-mobile/README.md)。

行情来自第三方公开接口，可能延迟或不可用，仅供参考。

## 运行

需要 Node.js 和 npm。克隆仓库后运行：

```bash
npm install
npm start
```

也可以使用 pnpm：`pnpm install`，然后运行 `pnpm start`。

## 打包

```bash
npm run dist:win            # Windows 安装包和便携版
npm run dist:mac:universal  # macOS 通用版本，需在 macOS 上构建
```

构建结果位于 `release/`。更多说明见 [docs](docs/)。

## 测试

```bash
npm run test:regression
npm run test:single-instance
```

代码使用 [MIT 许可证](LICENSE)。
