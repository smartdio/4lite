# 公开资产许可与边界

本文档只说明 GitHub 公开快照中包含的非代码资产。项目 `LICENSE` 不会覆盖第三方素材各自的许可。

## 公开包含

| 资产 | 路径 | 来源与许可 |
| --- | --- | --- |
| 4Lite Logo、入口水彩图、视频号二维码 | `assets/branding/4lite-logo-approved.svg`、`assets/ui/` 中明确放行的 3 个文件 | 项目自有内容；版权所有，保留全部权利 |
| 校园手绘平面草图 | `docs/references/001-campus-plan-sketch.jpg` | 用户提供的项目参考资料；版权所有，保留全部权利 |
| 帮助页四张运行截图 | `tests/performance/baselines/{gate,courtyard,activityBasketball,pingPongMatch}.png` | 项目运行画面；仅随本公开快照展示，保留全部权利 |
| Fusion Pixel Font 12px 简体中文子集 | `public/assets/fonts/pixel/` | Copyright © 2022 TakWolf；SIL Open Font License 1.1，详见同目录 `OFL-Fusion-Pixel.txt` 和 `README.md` |
| 篮球运行模型 | `public/assets/models/basketball/` | DigitalN8m4r3 的 *Basketballs*，CC0 1.0；详见同目录 `README.md` |
| 非环境、非音乐短音效 | `public/assets/audio/{ui,footsteps,doors,furniture,blackboard,chalk,basketball,ping-pong,long-jump}/` | 来自 Kenney RPG Audio、Interface Sounds 和 Impact Sounds，CC0；详见 `public/assets/audio/SOURCES.md` |
| 页面内联平台图标路径 | `src/site-links.js` | Simple Icons 16.29.0，CC0；品牌标识仍受各权利人的商标规则约束 |

## 明确排除

以下内容保留在完整本地工作区，不进入 GitHub：

- `assets/source*`、`assets/generated`、`docs/previews`、`docs/references` 中未单独放行的资料、`docs/concepts`、`docs/reports`、`GLB`、`archive`、`artifacts`。
- 乒乓球拍 GLB、Pixabay 环境音、AI 音乐、LCD 掌机图、连环画、角色印花、零食包装，以及其余未完成公开再分发审计的模型、贴图、音频和字体。
- `public/assets/audio/ambient/`、`public/assets/audio/music/`和未被运行清单采用的 `public/assets/audio/footstep09.ogg`。
- 本地部署配置、环境变量、测试产物、协作交接文档和旧 Git 历史。

## 待审计原则

任何未在上表明确列出、且无法证明可公开再分发的二进制素材，一律默认排除。新增公开资产时，必须同时更新本文档和公开边界检查清单。
