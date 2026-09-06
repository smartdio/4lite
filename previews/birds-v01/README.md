# 校园鸟类单只动态样张 v01

模型为颈部修订 v03：在两种鸟收腹的 v02 基础上，按用户反馈将鸽子颈部延长、头部抬高 2.4 cm（制作工作值）；颈根仍与胸部衔接。2026-09-06 更新与校园共用的鸽子动作：头部停稳／前伸、按位移迈步、啄地接触、离地前抬翅、蹬地初速度、离地接下拍和落地承重；没有更改模型、面数或材质。

状态：用户已确认 v03 外形并批准接入校园；2026-09-06 的动作按最新反馈修订，等待实际漫游反馈。这里的短循环与测试枝条仅用于动作验收，不是校园的固定落点或最终飞行路线。

## 启动

在项目根目录运行 `node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 6183`，访问 `http://127.0.0.1:6183/previews/birds-v01/`。

麻雀／鸽子按钮切换单体；“动作观察”跟随鸟便于审阅，“漫游距离”使用固定场景视角。鼠标或单指旋转，滚轮／双指缩放；空格／按钮暂停，进度条逐时刻检查，“重看起飞”回到起飞前。

## 可复现资产

- 生成命令：`/Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/blender/create_campus_birds.py`
- 可编辑源文件：`assets/source/blender/campus-birds/campus-birds-v01.blend`。
- 预览 GLB：`previews/birds-v01/assets/campus-birds-v01.glb`；93,884 B，1 材质、0 贴图。
- 麻雀：364 三角面、9 个网格；鸽子：428 三角面、9 个网格。体长制作工作值 15／30 cm。
- 私有 GLB 与 Blend 均被 Git 忽略；制作脚本、共享动作模块和预览代码可以独立审阅。不把样张资源放进 `public/`，生产构建不包含本预览入口或 GLB。

## 验证

- `node --test tests/unit/bird-model.test.js tests/unit/bird-motion.test.js`：8 项。
- `npm run test:birds-preview`：6 项独立浏览器测试，要求先生成本地私有 GLB。测试服务器端口为 6184。
- 覆盖共享资源／独立姿态、释放、缺失关节、暂停恢复、路径采样、起降与循环边界连续性、资源只请求一次、手机布局、真实触摸事件旋转、GLB 失败提示。
- 桌面和 390×844 模拟手机实际截图、资产计量、校园开发版基准位于 `docs/reports/campus-birds/`。

## 后续边界

用户已确认 v03 并批准接入。正常校园入口为 `http://127.0.0.1:6175/`，使用相同完整模型与动作库，3 只麻雀＋2 只鸽子随机活动；6183保留开发样张。正式空间、音效、预载与性能说明见 `docs/plans/campus-living-scenery-v0.1.md`；本预览的测试枝条和短循环仍只用于动作检查。
