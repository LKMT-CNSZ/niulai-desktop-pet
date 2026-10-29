# macOS Universal 打包说明

macOS 的 `.dmg` 和 `.app` 必须在 macOS 主机上构建。Windows 版 electron-builder 会明确拒绝执行 macOS 构建，因此不能在 Windows 上生成可验证、可安装的 macOS 安装包。

1. 将工程复制到 Intel 或 Apple Silicon Mac。
2. 安装 Node.js 20 或更高版本。
3. 打开“终端”，进入工程目录。
4. 首次执行：`chmod +x build-macos.command`。
5. 执行：`./build-macos.command`。
6. 构建完成后，在 `release` 目录取得 macOS Universal `.dmg`。

未配置 Apple Developer 证书时生成的是未签名体验包，其他 Mac 首次打开时可能需要在“系统设置 → 隐私与安全性”中确认。正式分发需要 Apple Developer ID 签名与公证。
