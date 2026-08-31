# 厕所与教师宿舍游戏美术设定图 v0.1

生成日期：2026-08-10  
状态：厕所 ImageGen v0.3、教师宿舍 ImageGen v0.2；用于后续 GLB 美术设计，不替代已确认的平面和结构资料

上游风格依据：

- [`art-direction-v0.1.md`](art-direction-v0.1.md)
- [`material-rendering-spec-v0.1.md`](material-rendering-spec-v0.1.md)
- [`toilet-scope-v0.1.md`](toilet-scope-v0.1.md)
- [`teacher-dormitory-scope-v0.1.md`](teacher-dormitory-scope-v0.1.md)

## 1. 当前模型多面参考

### 厕所

- [`../previews/toilet-front-model-reference-v1.1.png`](../previews/toilet-front-model-reference-v1.1.png)
- [`../previews/toilet-right-entry-model-reference-v1.1.png`](../previews/toilet-right-entry-model-reference-v1.1.png)

### 教师宿舍

- [`../previews/dorm-west-model-reference-v1.0.png`](../previews/dorm-west-model-reference-v1.0.png)
- [`../previews/dorm-southwest-model-reference-v1.0.png`](../previews/dorm-southwest-model-reference-v1.0.png)

## 2. 概念图

- [`../concepts/toilet-game-concept-v0.3.png`](../concepts/toilet-game-concept-v0.3.png)
- [`../concepts/teacher-dormitory-game-concept-v0.2.png`](../concepts/teacher-dormitory-game-concept-v0.2.png)

## 3. ImageGen 提示词摘要

### 厕所

以首张厕所概念图的结构和构图为基准，保留约6 × 4 m一层体量、东西向屋脊、双坡黑灰瓦顶、无窗、檐下四周连续通风空隙、南侧两片平行屏风墙和中央共用入口。通风带由多根砖砌柱支撑，所有柱面与墙体一样抹旧白石灰，不露红砖或木色。最终 v0.3 的两片屏风墙面完全留白，不生成“女／男”文字、标牌或其他符号。

### 教师宿舍

以更新后的两张当前模型截图为体量和走廊／楼梯关系参考，生成中国南方1980年代小学教师宿舍的游戏环境设定图。保留两层三开间、南北长向、西向门窗、一层无走廊、二层连续外廊、南端贴墙外楼梯和双坡瓦顶。每层严格保持三组“窗—门—窗”。全部主体外墙采用裸露旧红砖，辅以旧木门、深绿色窗框、浅色旧水泥外廊和楼梯、暖黑灰瓦顶；宿舍前不出现榕树占位圆盘或其他景观元素。

## 4. 后续 GLB 使用边界

- 几何、尺寸、入口拓扑、楼层和楼梯关系以现有模型、资料卡及已确认图纸为准；概念图只决定材质、色彩、旧化程度和构造表现语言。
- 厕所正面只保留中央墙段；中央墙段不得连接左右侧墙，两侧缺口就是从地面直通檐下的入口，不得添加门板、门框或门楣。两片正面屏风及两端回墙必须与厕所主体墙身同高，屏风外侧墙面不得开门。最终 v0.3 概念图保持留白；正式运行 GLB 后续经亲历者确认加入小型、浅灰黑、褪色的手写“女／男”标识，不得改成现代成品标牌。
- 厕所檐下通风空隙必须沿四面连续一圈，必须是真实贯通的镂空；屋顶由沿四周布置的多根砖砌柱承托，正、背面中段也有多根。砖柱外表统一抹白色旧石灰，不露红砖且不是木柱；不得用灰黑色实体、网纹、贴条、木格栅或铁网填充。
- 教师宿舍必须保持每层三间房、三组“窗—门—窗”的结构节奏，即每扇门左右各有一扇窗。ImageGen 概念稿中的门窗数量和间距可能存在绘画性误差，制作 GLB 时须回到更新后的模型截图与结构图校正。
- 宿舍主体外墙统一采用裸露红砖，不改为石灰墙或粉刷墙。
- 两栋建筑均保持不可进入；概念图中的背景建筑、植物和地面细节不自动进入资产制作范围。
