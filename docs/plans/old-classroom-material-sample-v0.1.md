# 记忆中的学校｜旧教室材质样板 v0.1

制作日期：2026-08-10  
上游规范：[`material-rendering-spec-v0.1.md`](material-rendering-spec-v0.1.md)  
状态：墙面方向已通过初看并扩展至完整南立面；细节仍可调整

当前近景预览：[`../previews/old-classroom-material-sample-v2.webp`](../previews/old-classroom-material-sample-v2.webp)  
历史预览：[`../previews/old-classroom-material-sample-v0.1.webp`](../previews/old-classroom-material-sample-v0.1.webp)

## 1. 样板范围

本轮只在旧教室南立面西侧的一间教室段建立材质样板：

- 西侧单间正立面：旧石灰墙、两扇木门和一扇简化铁窗；
- 西侧单间前方：薄视觉地面贴片；
- 旧教室整体：暖黑灰瓦顶材质；
- 东侧单间正立面继续使用原灰盒材质，作为同屏对照。

样板未修改旧教室的中心、尺寸、檐口高度、门窗位置、高台标高或碰撞。旧教室总尺寸仍为 C 级工作值，本轮结果只能确认材质和渲染语言。

## 2. 运行时材质

| 材质族 | 运行时贴图 | 尺寸 | 色彩空间 | 状态 |
| --- | --- | --- | --- | --- |
| `limewash-old-white-exposed-brick` | `public/assets/textures/limewash/limewash-old-white-basecolor-v2.webp` | 1024² | sRGB | candidate |
| `concrete-aged-light` | `public/assets/textures/concrete/concrete-aged-light-basecolor-v1.webp` | 1024² | sRGB | candidate |
| `wood-painted-aged` | `public/assets/textures/wood/wood-painted-aged-basecolor-v1.webp` | 1024² | sRGB | candidate |
| `painted-steel-dark-green` | `public/assets/textures/painted-steel/painted-steel-dark-green-basecolor-v1.webp` | 1024² | sRGB | candidate |
| `roof-tile-warm-black` | `public/assets/textures/roof-tile/roof-tile-warm-black-basecolor-v1.webp` | 1024² | sRGB | candidate |

五张运行时贴图合计约 220 KB。1254² 无损源图保存在 `assets/source-textures/`，没有用运行时压缩文件覆盖源图。

## 3. 生成方式与提示词记录

贴图使用内置 ImageGen 分别生成，再以 ImageMagick 缩放并导出为 1024² WebP。共同提示要求：

- 用途为 Three.js 场景的无方向光基础色纹理；
- 原创、干净的赛璐璐动画背景绘制感，带柔和水彩色差；
- 正交、满画布、无物体、无透视、无文字、无水印；
- 避免纸纹、纤维、颜料颗粒、照片污渍、高频噪点、阴影和烘焙高光。

各材质的核心提示：

- 旧墙：暖灰旧白石灰面，少于约 10% 的柔和露砖，墙脚少量冷灰与橄榄绿青苔；
- 水泥：浅暖灰旧水泥，宽而安静的磨耗色差，无密集裂纹；
- 木门：深暖褐旧漆，纵向宽笔触，木纹为次要信息；
- 铁窗：深青灰哑光涂层，极少暖褐磨损点，无金属闪光；
- 黑瓦：暖黑灰传统瓦片节奏，低频综合色差，无湿亮高光。

## 4. 渲染参数

- 样板材质使用 `MeshToonMaterial`；
- 使用 5 级灰蓝至奶油白渐变图控制简练明暗层级；
- 基础色贴图为 sRGB，渐变图为线性数据；
- 纹理各向异性上限为 8；
- 墙、木和铁样板在当前单件 UV 上使用 Clamp；
- 水泥样板横向重复 2 次；
- 瓦顶沿屋脊方向重复 4 次；
- 旧教室坡屋顶几何已补正式 UV，尺寸与轮廓未变。

材质库入口：`src/materials/material-library.js`。样板接入点：`src/main.js` 的 `createOldClassroom()`。

## 5. 铁窗样板边界

为能实际判断铁件材质，西侧样板窗在原窗占位尺寸内增加深色窗内面和简化铁框。分格只用于材质与近景可读性验证，不代表旧教室最终窗框资料已经确认；后续正式门窗 GLB 不得直接把该分格当作历史事实。

## 6. 验收记录

2026-08-10 自动与视觉回归：

- `npm run build` 通过；
- 五张新增纹理和原一号楼栏杆纹理均成功加载；
- 场景碰撞数保持 775，样板地面为不参与碰撞的视觉贴片；
- 旧教室近景可区分石灰墙、木门、铁窗、瓦顶和水泥地面；
- 檐下和窗内面保持可读，没有压成纯黑；
- 鸟瞰未见明显纹理噪点或瓦顶摩尔纹；
- 西侧材质样板与东侧灰盒对照清晰；
- 未发现资源加载失败或场景初始化错误。

当前已知限制：

- 木门仍是平面占位，没有门框、门板结构和把手；
- 铁窗分格为材质样板工作形态，不是最终 GLB；
- 地面贴片只验证颜色与过渡，旧教室前地面的最终铺装范围尚未确认；
- 当前 5 级 Toon 明暗属于候选参数，需用户实际观看后决定是否进一步柔化；
- 生产包仍有原有的单入口 JS 超过 500 KB 提示，本轮没有引入新的运行错误。

## 7. v2 墙色修正

2026-08-10：用户指出 v1 旧石灰墙偏黄。v2 将大面积石灰底色改为明显的中性暖灰白，去除奶油黄色倾向，同时保留原露砖、冷灰潮痕和墙脚青苔的位置与强度。v1 文件继续保留作为历史版本，运行时改用 `limewash-old-white-basecolor-v2.webp`。

## 8. 屋顶体积补充

2026-08-10：旧教室黑瓦屋顶不再只以两片无厚度坡面表达。现已增加坡面厚度、檐口半圆瓦边、檐下木檩和木椽、山墙封檐木板、三角山墙面及分段脊瓦。完整记录与预览见 [`old-classroom-scope-v0.1.md`](old-classroom-scope-v0.1.md#7-屋顶外观实现-v01)。

## 9. 南立面扩展

2026-08-10：白色旧石灰墙材质由西侧单间样板扩展至完整南立面，水平方向重复两次、垂直方向保持单次墙脚旧化。每间正面按亲历者最新更正改为“门—窗—窗—窗—门”；门复用一号楼 GLB，窗使用简化内嵌铁窗格。
