# 大榕树 GLB v0.26：沿枝叶团

大榕树叶冠由旧版整冠切片改为与操场三种树一致的枝条绑定叶团：

- 停用水平整冠切片、径向整冠卡片和外壳式叶冠。
- 读取旧模型中 39 条枝条中心线，重建为连续、封闭并逐渐收尖的 8 边管状枝条。
- 每条悬空枝基自动延伸到最近的主干表面或父枝内部，消除树干与树枝之间的可见断口。
- 从旧主干顶端内部新增 6 条粗壮过渡主枝，使主干自然分叉进入树冠。
- 按 12 个周向分区新增填隙枝，并随机调整高度、长度和弯曲方向，使树冠分布更均匀但不呈机械放射状。
- 下层新增 8 条弧形侧枝，补足靠近树干底层的枝叶密度。
- 树干和全部新旧枝条合并为一个 `Banyan_Wood_Branches_Fused_UV` 网格。
- 完整木质网格重新烘焙到一张 2048 × 2048 的唯一 UV 树皮图。
- 使用 9 种叶团图块，在 188 个内段、中段、外段和枝梢锚点布置 488 张卡片。
- 每个锚点使用 2–3 张卡片，围绕枝条生长方向交叉穿插；中央和低位枝条均设有独立叶团。
- 叶片采用 PBR 受光材质、双面 Alpha Mask，会投射并接收场景阴影，不使用 `unlit` 或自发光。

输出：

- Blend：`assets/source/blender/banyan-tree-source-v42-branch-tip-leaf-clusters.blend`
- GLB：`public/assets/models/banyan-tree/banyan-tree-scene-preview-v26-branch-tip-leaf-clusters.glb`
- 木质图集：`assets/source-textures/banyan/atlases/banyan-wood-branch-fused-basecolor-2k-v2.png`
- Blender 预览：`docs/previews/banyan-tree-blender-v31-branch-tip-clusters.png`
