# 操场树木 GLB 资产 v0.1

日期：2026-08-15  
状态：Blend 源文件、GLB 与预览已生成；尚未写入校园场景摆放配置。

## 资产

| 树种 | GLB | Blend 源文件 | 回读包围盒（约） | 三角面 |
|---|---|---|---:|---:|
| 牛尾松／木麻黄 | `archive/phase-1/runtime-history/public/assets/models/playground-trees/casuarina-tree-game-v01.glb` | `assets/source/blender/playground-trees/casuarina-tree-source-v01.blend` | 7.24 × 7.80 × 11.83 m | 2,000 |
| 羊蹄甲 | `archive/phase-1/runtime-history/public/assets/models/playground-trees/bauhinia-tree-game-v01.glb` | `assets/source/blender/playground-trees/bauhinia-tree-source-v01.blend` | 7.64 × 8.27 × 5.92 m | 1,332 |
| 樟树 | `archive/phase-1/runtime-history/public/assets/models/playground-trees/camphor-tree-game-v01.glb` | `assets/source/blender/playground-trees/camphor-tree-source-v01.blend` | 8.96 × 9.17 × 10.52 m | 2,372 |

每个 GLB 只有两个网格节点：`Trunk_Branches` 和 `Foliage_Cards`。贴图已内嵌，场景运行时不依赖外部纹理路径。

## 制作方法

- 树干、主枝、次枝和细枝由 Blender 脚本按树种生成锥度明确的低面数实体几何。
- 每个树种使用一张 3 × 2 RGBA 图集，包含 6 种不同叶簇轮廓、枝向、疏密和不对称形态。
- 叶簇只绑定真实细枝端点，不用自由悬空的随机卡片补密度。
- 每个枝端放置 2 张交叉卡片，约三分之一枝端增加第 3 张斜卡；交叉夹角在 62°–112° 内随机，不形成整齐重复的十字板。
- 图集为扁平固有色，不含烘焙光照、高光、阴影、渐变或纸纹；Alpha 已整理为二值硬遮罩。
- GLB 叶材质使用 `MASK`、`alphaCutoff = 0.45`、双面渲染和 `KHR_materials_unlit`，避免不同卡片朝向产生不一致明暗和透明排序问题。
- 木麻黄保留既有设定中的疏冠、下垂细枝叶和下部旧石灰刷白；羊蹄甲为低分叉横展冠，少量淡紫花；樟树为较高大、浓密、层状常绿冠。

## 叶簇图集

- `archive/phase-1/runtime-history/public/assets/textures/playground-trees/casuarina-foliage-atlas-rgba-v01.png`
- `archive/phase-1/runtime-history/public/assets/textures/playground-trees/bauhinia-foliage-atlas-rgba-v01.png`
- `archive/phase-1/runtime-history/public/assets/textures/playground-trees/camphor-foliage-atlas-rgba-v01.png`

图集由内置 ImageGen 生成，再用 Alpha 阈值整理成硬遮罩。最终提示词共同约束如下：

> 为指定树种生成严格 3 列 × 2 行的实时游戏 RGBA 叶簇图集；每格一个独立叶簇，共 6 种不同轮廓、枝向、叶数、疏密和不对称形态；真正透明背景与宽间隔；原创扁平手绘动漫叶片，只用统一叶色和略深枝色；禁止光照、高光、阴影、渐变、体积明暗、颗粒、背景、树干、地面、文字和水印。

树种附加约束：木麻黄使用细长下垂针状枝叶；羊蹄甲使用双裂羊蹄形叶，最多两个图块各带一朵小型淡紫花；樟树使用椭圆常绿叶，禁止花果。

## 验证

- 三个 GLB 均由 Blender 5.1.2 导出后重新导入成功。
- 每个 GLB 回读为 3 个节点、2 个网格、1 张内嵌图像。
- 三个叶材质均回读为 `MASK`、双面和 `KHR_materials_unlit`。
- 预览位于 `docs/previews/playground-trees/`。

## 可重建脚本

运行：

```bash
/Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/blender/create_playground_trees.py
```

脚本使用固定随机种子；在贴图不变时，重新构建结果可重复。

## 参考方法

- [SpeedTree Clusters](https://docs.unity3d.com/speedtree-modeler/manual/clusters.html)
- [SpeedTree Texture Atlases](https://docs.unity3d.com/speedtree-modeler/manual/texture-atlases.html)
- [SpeedTree Randomization](https://docs.unity3d.com/speedtree-modeler/manual/randomization.html)
- [SpeedTree Level of Detail](https://docs.unity3d.com/speedtree-modeler/manual/level-of-detail.html)
- [SpeedTree Lighting Leaves and Fronds](https://docs.unity3d.com/speedtree-modeler/manual/lighting-leaves-and-fronds.html)
