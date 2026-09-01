<p align="center">
  <img src="assets/branding/4lite-logo-approved.svg" alt="4Lite — 四小" width="320">
</p>

# 4Lite

[English](README.md) · [简体中文](README.zh-CN.md)

[![公开代码骨架检查](https://github.com/smartdio/4lite/actions/workflows/public-build.yml/badge.svg)](https://github.com/smartdio/4lite/actions/workflows/public-build.yml)

4Lite 是一个以 Three.js 制作的第一人称互动式校园记忆项目。项目依据亲历者记忆、手绘草图、历史照片和明确标注为估算值的尺寸，还原 20 世纪 80 年代初的广东小学校园。

**在线体验：** [4lite.vercel.app](https://4lite.vercel.app)

> **公开仓库说明**
>
> 这是一份可安装、可构建的公开代码骨架，不是完整可运行发行包。完整校园模型、环境音、音乐、贴图和部分互动素材未放入 GitHub，因此本仓库的本地构建无法复现下方展示的全部场景和玩法。线上体验继续使用完整的私有素材集。

![4Lite 中复原的校园庭院](tests/performance/baselines/courtyard.png)

## 项目体验

4Lite 更像一处可以重返和漫游的记忆空间，而不是传统的关卡游戏。玩家可以走进校门，探索庭院与教学楼，进入教室，查看年代物件，坐到座位上，在黑板上写画，并发现当年校园生活中的细节。

复原过程不会把不确定内容写成实测事实。亲历者已确认的记忆与原始资料优先；尚未确认的尺寸和细节均作为工作值处理。

## 制作过程

校园的制作是在记忆与实现之间反复往返完成的：先整理亲历者口述、手绘草图和历史照片，为资料标注可信度；再把空间关系转化为米制平面和可步行的 Three.js 灰盒，交由亲历者进入场景复核。布局确认后，项目继续推进美术方向、模型与材质、互动玩法、移动端适配、性能分析和回归测试；仍无定论的细节始终保留为工作值，等待新资料或实机体验进一步校正。

完整文章见：[《从记忆到校园：〈记忆中的学校〉开发纪实》](docs/project-development-story.md)。

## 游戏与互动功能

完整体验目前包括：

- **篮球**：捡起篮球、瞄准并控制投篮力度，根据出手位置获得两分、三分或四分；得分时显示八十年代像素街机 × 漫画风格的分层反馈。
- **乒乓球**：可选择练习或七分制比赛，从球拍当前所在位置发球，与 AI 连续对打，并使用鼠标或触屏控制球拍。
- **跳远**：控制起跳方向和力量，在沙坑落地后显示成绩与实际落点标记。
- **爬竹竿**：交替使用双手，把握蓄力节奏，完成向上攀爬或下滑。
- **跳房子**：把瓦片投入手绘的八格或九格场地，完成往返路线，并遵守压线与落脚规则。
- **踢毽子**：左右脚交替踢毽，移动到落点下方，并不断刷新连续次数。
- **抓石子**：抛起母子，依次完成抓一颗、两颗、三颗石子的阶段，并在时限内接回母子。
- **弹弓练习**：选择木弹弓或铁丝弹弓，在五米和十米线上发射泥丸；两种弹弓拥有不同的力量与稳定性。
- **升旗**：反复抓住并下拉旗绳，把国旗逐步升起；互动进行期间会保持当前进度。
- **教室记忆互动**：使用粉笔写画，翻看课本与作文，查看铁皮文具盒和零食袋，操作魔方，并游玩两款年代感 LCD 掌机游戏。

### 游戏实景截图

| 校园入口 | 庭院漫游 |
| --- | --- |
| ![进入复原后的校园](tests/performance/baselines/gate.png) | ![探索校园中央庭院](tests/performance/baselines/courtyard.png) |

| 篮球 | 乒乓球 |
| --- | --- |
| ![篮球玩法与漫画式得分反馈](tests/performance/baselines/activityBasketball.png) | ![乒乓球比赛玩法](tests/performance/baselines/pingPongMatch.png) |

| 打开的旧课本 | 连环画阅读 |
| --- | --- |
| ![在教室里打开一本旧课本](docs/screenshots/readme/old-textbook-viewer.png) | ![打开从课桌中找到的连环画](docs/screenshots/readme/comic-book-viewer.png) |

| LCD 掌机游戏 | 弹弓瞄准 |
| --- | --- |
| ![正在游玩 Octopus 主题 LCD 掌机](docs/screenshots/readme/octopus-handheld-game.png) | ![在十米线上使用木弹弓蓄力瞄准](docs/screenshots/readme/slingshot-aiming.png) |

## 操作方式与平台

- 桌面端支持键盘移动、鼠标视角、点按行走和情境互动。
- 手机与平板使用独立的触屏行走、视角和玩法控件。
- 各玩法采用统一的暂停与退出规则：桌面端使用 `Esc` 暂停；适用时可按 `X` 或通过暂停菜单返回校园。
- 进入校园后的可见 HUD 与玩法控件由 WebGL／Three.js 渲染，不使用现代 HTML 浮层。

## 技术构成

- Three.js 与 WebGL：校园场景、互动与 HUD
- Vite：开发与生产构建
- Node.js Test Runner：确定性的玩法单元测试
- Playwright：完整本地互动、渲染、移动端与性能测试
- 脚本与 GitHub Actions：资源预算和公开仓库边界检查

## 构建公开代码骨架

需要 Node.js 22 和 npm。

```bash
npm ci
npm run test:unit
npm run verify:public
npm run build
```

`npm run build` 只验证公开源码能够正确打包，不会补齐私有运行素材；构建结果不是完整可玩发行版。

## 验证完整本地项目

拥有完整私有素材的本地工作区可运行：

```bash
npm run test:performance:full
```

该命令会执行生产构建、构建性能预算、测试构建和完整 Playwright 套件。依赖完整素材的 Playwright 测试不会在公开 GitHub Actions 中运行。

## 公开边界与许可

- 公开非代码资产的来源、许可和排除范围见 [ASSET_LICENSES.md](ASSET_LICENSES.md)。
- 项目代码与项目自有内容为“版权所有，保留全部权利”，详见 [LICENSE](LICENSE)。
- 第三方素材继续适用各自许可，不受项目代码许可覆盖。
- 无法确认公开再分发权利的素材默认排除，并由 `npm run verify:public` 自动检查。
