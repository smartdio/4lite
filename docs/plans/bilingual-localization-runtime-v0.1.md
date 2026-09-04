# 中英文双语运行方案 v0.1

## 语言入口与命名

- `/` 是简体中文入口，`/en/` 是英文入口；URL 是当前语言的唯一权威来源，不按浏览器语言自动跳转。
- 两个入口都保留“四小”原 Logo，并在下方使用 `Sì Xiǎo` 与 `No. 4 Primary School` 两行品牌注释。
- 英文正文以 `Sì Xiǎo` 为正式名称，直译只作辅助说明。
- 首版语言切换会重新载入页面，不保留小游戏的瞬时进度；本地纪录继续共享稳定 ID 和数值。

## 运行结构

- `src/i18n/` 集中维护页面与运行界面翻译、变量插值、数字／单位格式和本地化链接。
- 首页、加载页、关于页、帮助页、故事页与入口兜底共用语言结构；进入校园后的可见界面继续由 WebGL／Three.js 绘制。
- 小游戏判定使用 `feedbackCode`、`reasonCode` 等稳定语义代码，不依赖显示文字。
- 历史课本、标语、包装和场景物件保留中文原貌；只有“校园指南”和“开发过程”两块现代功能黑板随语言切换。

## 英文视觉资产

- 两块功能黑板由中文原图进行 ImageGen 文本本地化，保留原构图、图标中心和场景点击热区。可编辑母版位于 `assets/source/school-ephemera/blackboard-newspapers/`，运行 WebP 由 `scripts/image/build_school_ephemera_runtime.py` 生成。
- 英文成绩标签和八组游戏反馈由 `scripts/image/build_english_arcade_comic_hud_runtime.py` 使用项目授权的 Fusion Pixel 字体确定性排版，输出到 `public/assets/ui/arcade-comic-v01/en/`。
- 英文图集完全复用中文图集的尺寸、UV 格位和语言无关的爆字后景。运行时只请求当前语言的文字图集，不同时解码两套资源。
- 英文反馈为长词组预留了弹性动画安全区；中文布局参数保持不变。

## 构建与验证

```sh
npm run assets:hud:english
npm run assets:ephemera
npm run test:unit
npm run build
npm run perf:build
npm run build:test
npx playwright test tests/performance/localization.spec.js
npm run verify:public
```

语言专项测试会验证两种入口的页面与运行文案、跨语言读取同一份纪录，以及单次会话只加载当前语言的 9 张 HUD 文字图集和 2 张功能黑板。英文视觉候选不替换中文视觉基线。
