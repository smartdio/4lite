# 操场树木 GLB 资产 v0.6

日期：2026-08-15  
状态：修正叶簇原图约45°倾斜造成的末梢偏转；三种树统一输出 v06。

## 问题根因

叶簇图集中的枝根位于左下、末梢位于右上，实际生长轴是图块对角线，约倾斜45°。旧版把图块竖直轴对齐父枝，因此图中真正的末梢仍会向侧面凸出。

## v06 修正

- 使用图块“左下—右上”对角线作为真实的叶簇生长轴。
- 根据每张卡片的实际宽高计算补偿角 `-atan(height / width)`，不是写死45°，矩形卡片也能精确对齐。
- 对角线固定沿父枝由内向外；多张交叉卡片只围绕该对角线滚转。
- 根部仍少量压进枝端，主体继续向树冠外侧延伸。
- 保留羊蹄甲 v05 放大后的1.92 × 1.82 m叶簇尺寸。
- 保留樟树 v04 缩细后的主干和三种树既有图集、Alpha Mask、双面、unlit材质。

## v06 资产

| 树种 | GLB | Blend 源文件 | 预览 |
|---|---|---|---|
| 牛尾松／木麻黄 | `archive/phase-1/runtime-history/public/assets/models/playground-trees/casuarina-tree-game-v06.glb` | `assets/source/blender/playground-trees/casuarina-tree-source-v06.blend` | `docs/previews/playground-trees/casuarina-tree-preview-v06.png` |
| 羊蹄甲 | `archive/phase-1/runtime-history/public/assets/models/playground-trees/bauhinia-tree-game-v06.glb` | `assets/source/blender/playground-trees/bauhinia-tree-source-v06.blend` | `docs/previews/playground-trees/bauhinia-tree-preview-v06.png` |
| 樟树 | `archive/phase-1/runtime-history/public/assets/models/playground-trees/camphor-tree-game-v06.glb` | `assets/source/blender/playground-trees/camphor-tree-source-v06.blend` | `docs/previews/playground-trees/camphor-tree-preview-v06.png` |
