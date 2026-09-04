# 中英文双语运行方案 v0.1

## 语言入口与命名

- `/` 是简体中文入口，`/en/` 是英文入口。首次访问 `/` 且没有保存过选择时，浏览器语言为中文则留在 `/`，其他语言跳转到 `/en/`；不根据地区进一步细分语言。
- 用户手动点击语言按钮后，将 `zh-CN` 或 `en` 保存到本地浏览器并优先于浏览器语言。直接访问 `/en/`、关于、帮助或故事等明确语言页面时不做自动改写；入口选择完成后，运行时仍以 URL 决定当前语言。
- 两个入口都保留“四小”原 Logo；`Sì Xiǎo` 位于 Logo 上方，`No. 4 Primary School` 位于 Logo 下方。拼音使用绝对定位，不改变现有 Logo 坐标。
- 首页语言按钮位于音乐、关于和帮助共用的工具栏内，并排在帮助之后。
- 英文正文以 `Sì Xiǎo` 为正式名称，直译只作辅助说明。
- 首版语言切换会重新载入页面，不保留小游戏的瞬时进度；本地纪录继续共享稳定 ID 和数值。

## 运行结构

- `src/i18n/` 集中维护页面与运行界面翻译、变量插值、数字／单位格式和本地化链接。
- `src/i18n/locale-preference.js` 负责首次浏览器语言识别、手动选择持久化和语言链接绑定；偏好只影响入口选择，不改变存档结构。
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
