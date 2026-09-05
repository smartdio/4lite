# 木制航天飞机｜制作与落位

日期：2026-09-05。依据：用户约1985年亲手制作模型的记忆，用户确认的概念图v02，以及用户已确认可接入场景的v14模型。

## 当前实现

- 独立 Blender 文件通过 Blender MCP 在可见窗口制作；106个可编辑部件，平滑白色亮漆，包括白漆底座、中央燃料箱和双助推火箭。黑色舷窗及货舱盖线条属于涂绘，不做玻璃窗。木纹不明显，不做破损旧化。
- 整套由单根铁丝支撑。尾部包含两侧鼓起的发动机舱与三枚呈三角形排列、带内壁的主喷口。
- 外形按用户侧面照片和最新正视图修订：收窄机身至39mm工作宽度，略收瘦收尖的鼻端；六块小舷窗为中央梯形、斜肩窗及下折侧窗，均为黑漆。腹部和机翼底面为黑色。机翼后缘增加分段黑带、白色舵面及分界线。三枚主喷口采用收腰、连续扩口和空心内壁，口径25.6mm；助推器增加白裙罩和黑喷口。保留无标志与全白燃料箱的用户要求。
- 总高0.40m、底座0.22×0.18m、铁丝直径约3.2mm均为工作值，不是历史实测。真实航天飞机照片只校正轮廓和部件关系，不覆盖用户的白漆木制作品记忆。
- 房间为 `b2-room-2-floor-1`，使用现有东侧讲台桌锚点。底座贴桌面，飞机正面朝学生，桌面中央空位，保留左边课本和右边粉笔盒。
- 独立 `src/wooden-space-shuttle.js` 负责一次加载、尺寸与朝向、边界检查、状态快照；配置在校园配置中。加入原有完整预载屏障，失败按既有加载错误处理，不静默省略；无LOD或距离替换，无新增交互或HTML控件。

## 文件

- 概念与用户修订：`docs/references/wooden-space-shuttle/`。
- 当前源文件：`assets/source/blender/wooden-space-shuttle/wooden-space-shuttle-v01.blend`；原厕所会话的未保存状态保存在同目录 `pre-shuttle-session-backup.blend`。独立源文件只有航天飞机场景，不含厕所。
- 可重建脚本：`scripts/blender/build_wooden_space_shuttle.py`。在独立空场景通过MCP载入定义后依次调用 `stage_tanks()`、`stage_orbiter()`、`stage_paint()`、`studio()`、`save_and_export()`。MCP调用不共享Python变量；跨调用需重载定义并从当前场景恢复材质和PARTS列表。不要对原校园或其他资产场景执行重建。
- 运行文件：`public/assets/models/wooden-space-shuttle/wooden-space-shuttle-v01.glb`。合并后的3个材质图元为白漆、黑漆、铁丝；无外部或内嵌纹理。
- 验收记录：`docs/reports/wooden-space-shuttle/`。本轮未发布线上、未更新视觉基线。

## 参考照片

- [NASA Atlantis机头照片与准备流程](https://asd.gsfc.nasa.gov/archive/sm4/multimedia/gallery4_atlantis.html)：圆钝鼻端、驾驶舱与舷窗位置。
- [NASA Endeavour尾部照片 ED08-0306-39](https://images.nasa.gov/details/ED08-0306-39)：三枚主发动机与两侧OMS发动机位置；NASA/Tony Landis。
- [NASA Challenger着陆照片 51b-s-072](https://images.nasa.gov/details/51b-s-072)：机头侧面和机翼、垂尾外形。
- [NASA航天飞机空气动力介绍](https://www.nasa.gov/centers-and-facilities/langley/the-aeronautics-of-the-space-shuttle/)：双三角机翼及OMS说明。

照片浏览器截图仅作本地制作依据，不打包到运行模型。

最新资产：9814三角面，277068字节，3个材质图元，零纹理。最新Blender预览为 `blender-front-v14.png`；确认版运行截图为 `runtime-student-v14.png`、`runtime-close-v14.png`、`runtime-rear-v14.png`、`runtime-mobile-v14.png`，审计为 `runtime-audit.json`，此前带较小版本号的截图仅供历史比较。

最终结构澄清：驾驶舱是机头上方略微隆起的较窄部分，机头下部仍接近机身宽度，不能将整个机头缩成2/3。v11恢复下部宽度，仅调整上部截面；最新v13按用户要求再次扩大窗组，保留向机鼻前移4mm；仅机鼻前端略微收瘦并延长2mm使其稍尖，驾驶舱下部宽度保留，均为工作值。v07运行截图早于此次修订。

机翼v14：后缘由分段平底改为从翼根向翼尖上扬的斜线；黑色铰链带随翼形浅斜，内侧舵面较深，每侧保留两片舵面及一条分隔。最新细节图`blender-wings-v14.png`。
