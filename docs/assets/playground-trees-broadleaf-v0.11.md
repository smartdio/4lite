# 操场阔叶树 GLB v11

阶段6F重制香樟和紫荆叶片，并按用户现场反馈调整树冠组合。两种树继续使用完整单一模型，无LOD；所有贴图内嵌在GLB。

## 正式资产

| 树种 | GLB | Blend | mesh | 三角面 | GLB字节 |
|---|---|---|---:|---:|---:|
| 紫荆 | `public/assets/models/playground-trees/bauhinia-tree-game-v11.glb` | `assets/source/blender/playground-trees/bauhinia-tree-source-v11.blend` | 4 | 1,086 | 1,381,868 |
| 香樟 | `public/assets/models/playground-trees/camphor-tree-game-v11.glb` | `assets/source/blender/playground-trees/camphor-tree-source-v11.blend` | 3 | 1,494 | 824,156 |

## 叶冠结构

- 两种叶图均为1536×1024、3×2、六变体RGBA PNG；不含烘焙枝条。
- 每个承叶锚点使用两张约80°–100°交叉的双面卡，叶组主轴沿真实建模枝条发散。
- 靠树心的叶组更接近竖直，外层逐渐贴近枝向；不使用悬空随机填充。
- 香樟使用60个锚点、120张卡，基准卡尺寸2.20×1.88 m。
- 紫荆使用30条承叶枝和30个锚点、60张卡，基准卡尺寸1.72×1.54 m。承叶枝包括21条原侧枝、6条低位外伸枝和3条朝树干正上方内收的中央顶部枝。
- 紫荆保留6张独立花卡、独立材质和独立mesh；花朵不会随叶组重复。

## 运行与恢复

- 运行URL：`camphor-tree-game-v11.glb?v=2`、`bauhinia-tree-game-v11.glb?v=2`。
- 三树种合计10个实例化绘制组、60个实例槽；紫荆新增花朵实例化绘制组。
- v10模型、Blend和v02叶图保存在`archive/phase-6f-pre-leaf-redesign/`。
- 阶段6G将香樟叶图、紫荆叶图和紫荆花图改为WebP q95；分辨率与Alpha逐像素保持，树皮继续使用PNG。
- 压缩前v11 PNG GLB保存在`archive/phase-6g-pre-broadleaf-webp/`。
