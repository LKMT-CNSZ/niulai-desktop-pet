# 电子牛来 · 手机版

打开 [电子牛来](https://niulai.raaay.art/)，点击牛头即可播放声音并计数。

设置中可以调整声音、音量、自动敲击、动效、震动和外观，也可以开始新一轮。计数和设置保存在当前设备的浏览器中。

这是一个 PWA 网页应用，可通过浏览器添加到手机主屏幕。首次加载并缓存后可离线使用。震动效果取决于设备和浏览器支持情况，iPhone Safari 网页版不支持 Vibration API。

## 本地运行

```bash
node prepare.mjs
```

运行文件会复制到 `dist/`。使用本地服务器或 HTTPS 访问，才能启用 Service Worker。部署说明见 [PUBLIC_DEPLOYMENT.md](PUBLIC_DEPLOYMENT.md)。
