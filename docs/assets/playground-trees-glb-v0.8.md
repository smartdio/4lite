# 操场树木 GLB v0.8：整树唯一 UV 图集

## 实现方式

三种树木改为参考大榕树 `Banyan_Wood_Fused_UV` 的木质部分实现：

1. 将主干与全部树枝合并为一个 `Trunk_Branches` 网格。
2. 木麻黄和樟树的分段主干改为连续管状网格，消除段与段之间的横向几何缝。
3. 对完整木质网格做一次唯一 UV 展开。
4. 将从树根高度到枝梢高度的手绘树皮颜色烘焙到一张独立图集。
5. 导出前删除临时源 UV，只保留一个 `UVMap`、一个树皮材质和一张整树图集。

大榕树本身没有修改，只作为实现参考。

## 运行时规格

- 每种树的整树树皮图集：256×256 PNG。
- 木质材质：仅 Base Color，无树皮法线、粗糙度或置换贴图。
- 三张整树图集合计约 316 KB。
- 用于烘焙的纵向源图保存在 `assets/source/textures/playground-trees/`，不会作为运行时外部贴图加载。

## 输出文件

- `assets/source/blender/playground-trees/casuarina-tree-source-v08.blend`
- `assets/source/blender/playground-trees/bauhinia-tree-source-v08.blend`
- `assets/source/blender/playground-trees/camphor-tree-source-v08.blend`
- `archive/phase-1/runtime-history/public/assets/models/playground-trees/casuarina-tree-game-v08.glb`
- `archive/phase-1/runtime-history/public/assets/models/playground-trees/bauhinia-tree-game-v08.glb`
- `archive/phase-1/runtime-history/public/assets/models/playground-trees/camphor-tree-game-v08.glb`

## 验证结果

三份 Blend 回读结果一致：`Trunk_Branches` 只有一个 `UVMap` 和一个 `*_Bark_WholeTreeAtlas` 材质。三份 GLB 只嵌入各自的 256×256 整树树皮图集及原有叶簇图集，不包含烘焙源图。
