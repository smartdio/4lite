# 操场树木 GLB v0.10：叶片受光与阴影

三种操场树的叶簇继续使用无烘焙明暗的扁平手绘 RGBA 图集，但叶片材质由无光材质改为 PBR 受光材质：

- 删除 `KHR_materials_unlit`，不再让叶色绕过场景灯光。
- 删除叶片自发光，使用高粗糙度、零金属度的 Principled/PBR 材质。
- 保留 `MASK`、双面、透明裁切和深度写入。
- 叶簇现在会随太阳方向产生明暗，也会投射和接收透明轮廓阴影。
- 场景加载端增加旧无光叶材质转换，避免缓存或旧资产使叶片恢复为恒定亮度。

输出：

- `public/assets/models/playground-trees/casuarina-tree-game-v10.glb`
- `public/assets/models/playground-trees/bauhinia-tree-game-v10.glb`
- `public/assets/models/playground-trees/camphor-tree-game-v10.glb`
- `assets/source/blender/playground-trees/casuarina-tree-source-v10.blend`
- `assets/source/blender/playground-trees/bauhinia-tree-source-v10.blend`
- `assets/source/blender/playground-trees/camphor-tree-source-v10.blend`

大榕树保留为后续独立调整项。
