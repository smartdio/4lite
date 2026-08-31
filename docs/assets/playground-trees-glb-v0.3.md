# 操场树木 GLB 资产 v0.3

日期：2026-08-15  
状态：修正三个树种叶簇根部与末梢方向；v01、v02 保留为历史版本，场景尚未接入。

## 问题根因

v02 的卡片围绕世界竖轴随机旋转。虽然叶簇图集本身已把枝根放在图块底部，但卡片并不知道父枝从哪里来，导致部分叶簇从树冠外缘反向指回主干。

## v03 修正

- 每一个叶簇保存其父细枝的实际生长向量。
- 贴图 V 轴固定沿父枝由内向外：图块底部／枝根朝主干，图块顶部／末梢朝树冠外缘。
- 多卡片穿插改成围绕“枝根—末梢”生长轴滚转，只改变观察角度，不允许反转生长方向。
- 木麻黄的生长向量额外限制为至少向上25°，同时保持从内向外。
- v02 的大型复合叶团、细小叶片、六种图块、Alpha Mask、双面和 unlit 材质保持不变。

## v03 资产

| 树种 | GLB | Blend 源文件 | 预览 |
|---|---|---|---|
| 牛尾松／木麻黄 | `archive/phase-1/runtime-history/public/assets/models/playground-trees/casuarina-tree-game-v03.glb` | `assets/source/blender/playground-trees/casuarina-tree-source-v03.blend` | `docs/previews/playground-trees/casuarina-tree-preview-v03.png` |
| 羊蹄甲 | `archive/phase-1/runtime-history/public/assets/models/playground-trees/bauhinia-tree-game-v03.glb` | `assets/source/blender/playground-trees/bauhinia-tree-source-v03.blend` | `docs/previews/playground-trees/bauhinia-tree-preview-v03.png` |
| 樟树 | `archive/phase-1/runtime-history/public/assets/models/playground-trees/camphor-tree-game-v03.glb` | `assets/source/blender/playground-trees/camphor-tree-source-v03.blend` | `docs/previews/playground-trees/camphor-tree-preview-v03.png` |
