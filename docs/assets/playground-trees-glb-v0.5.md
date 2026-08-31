# 羊蹄甲 GLB v0.5

日期：2026-08-15  
状态：仅调整羊蹄甲叶簇卡片尺寸；木麻黄和樟树继续使用 v04。

## 修改

- 羊蹄甲叶簇横向尺寸由1.75 m增至1.92 m，约放大10%。
- 沿末级树枝向外的长度由1.55 m增至1.82 m，约放大17%。
- 生长轴、枝端位置、图集内容、单叶比例、树干和分枝几何保持不变。
- 叶簇仍然从末级枝端向树冠外侧延伸，不恢复围绕枝条铺叶的旧方式。

## 资产

- GLB：`archive/phase-1/runtime-history/public/assets/models/playground-trees/bauhinia-tree-game-v05.glb`
- Blend：`assets/source/blender/playground-trees/bauhinia-tree-source-v05.blend`
- 预览：`docs/previews/playground-trees/bauhinia-tree-preview-v05.png`

单独重建命令：

```bash
/Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/blender/create_playground_trees.py -- --species bauhinia
```
