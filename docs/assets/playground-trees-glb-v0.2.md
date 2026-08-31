# 操场树木 GLB 资产 v0.2

日期：2026-08-15  
状态：根据叶片尺度与木麻黄生长方向反馈完成；v01 保留为历史版本，场景尚未接入。

## 本版修改

- 保持 v01 的树干、分枝层级、树冠外轮廓、卡片空间尺寸和枝端位置。
- 三个树种的每个图集单元从“小枝叶簇”改为“大型复合叶团”：一个单元包含多条二级小枝和大量更小叶片，信息量至少相当于 v01 六个小叶簇的组合。
- 羊蹄甲和樟树单叶视觉尺寸约缩小至 v01 的 `1/4–1/6`，解决树上出现巨叶的问题。
- 木麻黄改成从连接点向斜上方 `25°–55°` 扇形生长；不再使用下垂、垂柳状叶簇。
- 继续保留每树种 6 种图块、枝端绑定、2–3 卡片非固定角度穿插、二值 Alpha Mask、双面与 unlit 材质。

## v02 资产

| 树种 | GLB | Blend 源文件 | 叶簇图集 |
|---|---|---|---|
| 牛尾松／木麻黄 | `archive/phase-1/runtime-history/public/assets/models/playground-trees/casuarina-tree-game-v02.glb` | `assets/source/blender/playground-trees/casuarina-tree-source-v02.blend` | `archive/phase-1/runtime-history/public/assets/textures/playground-trees/casuarina-foliage-atlas-rgba-v02.png` |
| 羊蹄甲 | `archive/phase-1/runtime-history/public/assets/models/playground-trees/bauhinia-tree-game-v02.glb` | `assets/source/blender/playground-trees/bauhinia-tree-source-v02.blend` | `public/assets/textures/playground-trees/bauhinia-foliage-atlas-rgba-v02.png` |
| 樟树 | `archive/phase-1/runtime-history/public/assets/models/playground-trees/camphor-tree-game-v02.glb` | `assets/source/blender/playground-trees/camphor-tree-source-v02.blend` | `archive/phase-1/runtime-history/public/assets/textures/playground-trees/camphor-foliage-atlas-rgba-v02.png` |

## ImageGen 最终提示词要点

共同提示：严格 3 × 2 RGBA 图集；每格一个大型复合树冠片段；每簇包含多条分枝与大量小叶，信息量至少等于旧版六簇总和；单叶缩小4–6倍；透明背景、宽间隔、扁平手绘色；禁止光照、高光、阴影、渐变、发光、颗粒、背景、文字和水印。

树种差异：木麻黄所有叶簇从下方连接点向斜上方25°–55°生长，禁止下垂；羊蹄甲保留小型双裂叶和极少淡紫花；樟树采用大量小型椭圆常绿叶，禁止花果。

预览位于 `docs/previews/playground-trees/*-tree-preview-v02.png`。
