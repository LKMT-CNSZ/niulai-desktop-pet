# 公开网页版

正式入口：https://niulai.raaay.art/

2026-10-20 已部署至独立 Cloudflare Pages 项目 `niulai-muyu`，不依赖 ChatGPT 登录、电脑或本地开发服务器。只新增 `niulai.raaay.art` 子域名，摄影网站的源文件、主域名与原部署未改动。

备用 Pages 地址：https://niulai-muyu.pages.dev/ 。大陆访问优先使用正式自定义域名；不要把备用域名、旧 ChatGPT Sites 域名或托管产品名称当作大陆可用性证明。旧 Sites 链接已经按用户要求改为公开访问，但不是新的正式入口。

## 本次验收

- 从未带登录 Cookie 的 HTTP 客户端访问正式域名，首页、CSS、脚本、主题、Manifest、Service Worker、头像、音频和图标共 11 项均为 200，文件 SHA-256 与当前 `dist/` 一致。
- 响应头 `X-Niulai-Hosting: cloudflare-pages` 标明实际来源。
- 真实浏览器打开正式域名，头像加载、点击增加数量、设置及三种外观选项均可用。
- **用户已确认**：通过大陆手机网络、不经过代理，可以打开并播放“牛来”。这是用户反馈的真机网络结果。
- 本机 HTTP 验证的出口为美国，不能单独用作大陆网络证据。
- ITDOG 大陆多线路检测被人工验证码挡住，未得到本网址的多节点测量结果；该站默认展示的其他结果不算本项目证据。

计数与偏好属于浏览器当前域名的本地数据；旧 ChatGPT Sites 地址、Pages 备用地址与新自定义域名之间不会自动同步。

## 2026-10-21 点击反馈与震动更新

- 已发布到上述正式域名，Cloudflare 显示 12/12 文件上传完成及部署 Success。
- 点击牛头时出现红色上涨箭头及“牛气➕1”，短暂上浮后消失；昼夜背景保留原指定颜色。
- 设置新增“点击震动”，默认开启并保存在本机；手动点击请求 18ms 短震，自动敲击不触发震动，关闭开关后立即停止。
- 震动依赖设备、系统与浏览器支持；iPhone Safari 网页版通常不支持，未来原生 iOS 版须独立接入触感接口。当前未进行手机实体马达验收。
- 38 项 Chromium 运行检查通过，包含开关保存、无震动 API 降级、连点、减少动态效果、离线与音频范围请求；震动 API 使用替身核对调用，不能视作真机震动测试。
- 发布后匿名 HTTP 检查 11/11 文件内容与 dist 一致，来源头正确；正式域名真实浏览器已验证点击计数、上涨反馈及震动开关可关闭/恢复。
- 离线缓存版本为 `niulai-mobile-v5`；新版入口脚本与样式附版本参数，导航改为网络优先并保留离线回退。首次更新可打开 `https://niulai.raaay.art/?v=20261021-feedback`。
- 上传包：`../artifacts/niulai-public-cloudflare-20261021-feedback.zip`，SHA-256 `94A97F88D1D0217463DA0147B5189B36A7276858F03C1F1AFF6AF463858D3E2C`。
- 浏览器截图及检查报告保存在 `../artifacts/niulai-mobile-review/`。此次发布没有新增大陆手机网络或实体设备测试，先前用户确认的大陆访问/声音反馈仍为历史结果。

## 后续更新

1. 在 `niulai-mobile` 修改源文件，运行 `node prepare.mjs`。
2. 上传 `dist/` 内的内容（`index.html` 位于 ZIP 根目录），包含 `_headers` 和 `assets/`；不要上传 `.git`、`.openai`、测试档案或凭证。
3. 在 Cloudflare → Workers & Pages → `niulai-muyu` → Create deployment，选择 Production。
4. 如修改离线缓存文件，更新 `sw.js` 的缓存版本；发布后核对正式域名的脚本、图片与声音，并进行真实浏览器操作。
5. 保留上次可用部署作为回退版本；不要覆盖摄影站点 `raaay-portfolio`。

本次上传包：`../artifacts/niulai-public-cloudflare-20261020.zip`，SHA-256 `3ECB07E6E05BFCEF0E75C873F0BB53674140DAC8FC34C51D61814E5D2D83FAF2`。Cloudflare 显示 12/12 文件上传成功并部署成功。

当前原生 iOS、TestFlight 与 App Store 状态不因网页版发布而改变，仍需独立构建与验收。
