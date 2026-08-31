# 操场树木 GLB v0.7：轻量手绘树皮

## 结果

- 三种树的树干和全部树枝均合并为单一 `Trunk_Branches` 网格对象。
- 每个对象只有一个 `UVMap` 和一个树皮材质。
- 每种树只使用一张 256×256 PNG 树皮底色；无树皮法线、粗糙度或置换贴图。
- 三张运行时树皮图合计约 79 KB；高分辨率母版移到 `assets/source/textures/playground-trees/`，不会进入 `public` 运行时资源。
- 叶簇材质和 v0.6 树形保持不变。

## 树皮方向

- 木麻黄：深褐至炭褐色，纵向纤维状裂片，裂隙内少量红褐色。
- 羊蹄甲：灰褐色、较平滑，以细浅裂纹和短横向皮孔为主。
- 樟树：黄褐至深褐色，不规则纵裂和较窄的块状树皮。

参考资料：

- [香港绿化网：木麻黄](https://www.greening.gov.hk/en/community-outreach/qrcode-tree-labels/index_id_18.html)
- [香港绿化网：羊蹄甲](https://www.greening.gov.hk/en/community-outreach/qrcode-tree-labels/index_id_17.html)
- [新加坡 NParks：樟树](https://www.nparks.gov.sg/florafaunaweb/flora/2/8/2805)
- [香港动植物公园：樟树](https://www.hkzbg.gov.hk/en/plants/tree/lcsdcw68.html)

## 输出

Blend：

- `assets/source/blender/playground-trees/casuarina-tree-source-v07.blend`
- `assets/source/blender/playground-trees/bauhinia-tree-source-v07.blend`
- `assets/source/blender/playground-trees/camphor-tree-source-v07.blend`

GLB：

- `archive/phase-1/runtime-history/public/assets/models/playground-trees/casuarina-tree-game-v07.glb`
- `archive/phase-1/runtime-history/public/assets/models/playground-trees/bauhinia-tree-game-v07.glb`
- `archive/phase-1/runtime-history/public/assets/models/playground-trees/camphor-tree-game-v07.glb`

运行时树皮贴图：

- `archive/phase-1/runtime-history/public/assets/textures/playground-trees/casuarina-bark-handpaint-256-v02.png`
- `archive/phase-1/runtime-history/public/assets/textures/playground-trees/bauhinia-bark-handpaint-256-v02.png`
- `archive/phase-1/runtime-history/public/assets/textures/playground-trees/camphor-bark-handpaint-256-v02.png`

## 验证

Blender 回读确认三份 Blend 的 `Trunk_Branches` 均只有一个 `UVMap` 与一个树皮材质。GLB 已重新导出，并嵌入对应的轻量树皮底色。
