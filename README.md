# 4Lite

4Lite 是一个以 Three.js 制作的互动式校园记忆项目，依据亲历者记忆、手绘草图、历史照片和尺寸估算，还原 20 世纪 80 年代初的广东小学校园。

> 注意：这是一份可安装、可构建的公开代码骨架，不是完整可运行发行包。完整校园模型、环境音、音乐、贴图和部分互动素材未放入 GitHub，因此本仓库构建结果无法完整运行所有场景和玩法。

在线体验：[4lite.vercel.app](https://4lite.vercel.app)

## 本地构建

需要 Node.js 22 和 npm。

```bash
npm ci
npm run test:unit
npm run verify:public
npm run build
```

`npm run build` 只验证源码能正确打包；它不会补齐未公开的运行素材。

## 完整本地验证

拥有项目完整私有素材的本地工作区可运行：

```bash
npm run test:performance:full
```

该命令会执行生产构建、构建性能预算、测试构建和完整 Playwright 套件，不在公开 GitHub Actions 中运行。

## 公开边界与许可

- 公开资产的来源、许可和排除范围见 [ASSET_LICENSES.md](ASSET_LICENSES.md)。
- 代码和项目自有内容为“版权所有，保留全部权利”，见 [LICENSE](LICENSE)。
- 第三方素材的许可不由本项目的代码许可覆盖。
