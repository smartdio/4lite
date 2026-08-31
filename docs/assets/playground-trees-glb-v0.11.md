# 木麻黄 GLB v0.11：叶片重制

日期：2026-08-17

## 用户修正

旧木麻黄叶图的镂空不足、单组过密，而且六个图块都沿左下至右上的斜轴生长，组合后显得杂乱。新版本只重制叶片，不在叶图中生成树枝、枝条、树干或棕色连接线。

## 新叶片图集

- 源文件：`assets/source/textures/playground-trees/casuarina-foliage-atlas-rgba-v03.png`
- 规格：1536×1024 RGBA，严格3列×2行，六个独立叶簇。
- 每簇从格子下中向上中直立生长，不再使用斜对角主轴。
- 叶片为疏松木麻黄针叶，组内保留大量透明孔洞；不含任何木质枝条。
- Alpha Mask可见覆盖率由旧图的33.04%降至10.65%。
- 使用内置ImageGen生成，原始候选保存在`artifacts/performance/phase6e/candidates/`。

最终生成提示词要点：严格3×2透明RGBA游戏图集；六个稀疏木麻黄针叶簇；每簇连接点位于下中、主轴直立至上中；宽间隔和大量透明孔洞；只允许绿色叶片；禁止枝、杆、树皮、棕线、斜轴、背景、阴影、文字和水印。

## 模型组合修正

- 木麻黄叶片改为纹理V轴直接对齐父细枝，不再应用旧图约45°的斜轴补偿。
- 卡片比例由2.10×2.00 m改为1.75×2.20 m，轮廓更修长直立。
- 根据“数量不足、树很瘦、中间太空”的追加反馈，32根主枝每根设6个附着位：主枝2个、细枝4个，共计192组。
- 每个位置只使用一张双面叶片卡，完全取消交叉组合；总平面由v10的98张增加到192张。
- 叶片从枝条内段到末端均匀分布，中部不再依靠悬空填充卡。
- 越靠近树干的叶片越接近竖直，内外冠之间使用平滑角度渐变；外圈叶片仍沿枝条向外舒展。

## 资产

- GLB：`public/assets/models/playground-trees/casuarina-tree-game-v11.glb`
- Blend：`assets/source/blender/playground-trees/casuarina-tree-source-v11.blend`
- 预览：`docs/previews/playground-trees/casuarina-tree-preview-v11.png`
- 运行URL：`/assets/models/playground-trees/casuarina-tree-game-v11.glb?v=4`

v11为`662,456 B`、3个mesh、1,478三角面；12棵校园实例继续共享3个InstancedMesh和同一套geometry／material。旧v10、旧v02叶图和源Blend保存在`archive/phase-6e-pre-leaf-redesign/`。

## 透明叶片 WebP

造型确认后，只将GLB内嵌叶图转为WebP q95，使用`sharp_yuv`、Alpha quality 100、best alpha filter和`exact`；树皮继续保留PNG。

- 叶图：`1,913,874 B → 458,348 B`，节省`1,455,526 B`（76.05%）。
- 整个GLB：`2,117,900 B → 662,456 B`，节省`1,455,444 B`（68.72%）。
- Alpha逐像素一致，Alpha RMSE为0；RGBA归一化RMSE为`0.00243276`。
- 同机同相机主操场场景RMSE为`0.000966931`，透明孔洞、细叶边缘和远景轮廓通过检查。

PNG叶图继续作为源素材保存在`assets/source/`，压缩前v11 GLB保存在`archive/phase-6e-pre-webp/`，可重新生成或完整恢复。
