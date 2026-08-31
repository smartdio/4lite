# 音效来源与许可

## Kenney RPG Audio

- 来源：https://kenney.nl/assets/rpg-audio
- 许可：Creative Commons Zero（CC0）
- 当前采用：通用脚步、木门开合、家具吱呀、书本、轻型物品及金属小件声音
- 原始包：`assets/source/audio-packs/kenney_rpg-audio.zip`

## Kenney Interface Sounds

- 来源：https://kenney.nl/assets/interface-sounds
- 许可：Creative Commons Zero（CC0）
- 当前采用：点击、选择、切换、操作成功提示、近似粉笔书写声和近似粉笔落下声
- 原始包：`assets/source/audio-packs/kenney_interface-sounds.zip`

## Kenney Impact Sounds

- 来源：https://kenney.nl/assets/impact-sounds
- 许可：Creative Commons CC0
- 原始包：`assets/source/audio-packs/kenney_impact-sounds.zip`

两个素材包均允许修改、商用且不强制署名。原始压缩包及包内 `License.txt` 保留在 `assets/source/audio-packs/`，运行目录只放经过选择的候选文件。

## 乒乓球专项音效

- `ping-pong/paddle.ogg`：Kenney Impact Sounds 的 `impactWood_light_001.ogg`，用于球拍击球。
- `ping-pong/table.ogg`：同包的 `impactGeneric_light_003.ogg`，用于乒乓球落台。
- `ping-pong/net.ogg`：同包的 `impactSoft_medium_001.ogg`，用于触网反馈。
- 三者均为CC0原声的单声道短版，不在击球过程中临时请求。

## 运行版本与公开边界

- 完整本地版本放行前会预载并解码统一清单中的 37 个声音资源：35 个非环境短音效和 2 个环境循环声。
- GitHub 公开快照只包含上述 35 个 Kenney CC0 短音效；两个环境声和入口音乐明确排除，因此公开骨架不是完整运行包。
- 既有短音效统一转为单声道 Opus-in-Ogg；新增脚步与环境声保留选定的 Ogg 源编码，避免无必要的二次有损转码。
- 原始 Kenney 文件没有覆盖，仍可从源压缩包重新选择或重新编码。

## 入口背景音乐

- 曲目：`Afternoon in the Schoolyard`，原始文件保留在 `assets/source/music/`。
- 运行文件：`music/afternoon-in-the-schoolyard.ogg`，立体声 Opus-in-Ogg，目标48kbps，约190KB。
- 音乐在入口页循环播放，进入校园时淡出；浏览器拦截有声自动播放时，可通过入口页音乐开关或进入按钮恢复播放。

## 当前脚步与环境声规则

- `footsteps/footstep_concrete_000.ogg`：普通地面和楼梯脚步；`footsteps/footstep_grass_003.ogg`：活动沙地脚步。左右脚使用独立声部交替播放，允许前一步尾音与后一步自然重叠；所有平台采用相同移动速度和步频。
- `ambient/blendertimer-cicada.ogg`：马尾松附近的空间蝉鸣，随距离衰减，室内进一步降低。
- `ambient/frogs-singing.ogg`：仅进入二号教学楼教室后播放，声像指向楼北侧池塘；走廊、室外及其他建筑保持静音。
- `doors/doorOpen*.ogg`、`doorClose*.ogg`：门窗暂时共用；窗户可叠加 `props/metalClick.ogg` 或 `metalLatch.ogg`。
- `blackboard/cloth*.ogg`：粉笔书写和板擦共用的柔和摩擦声；书写播放得更轻，板擦略慢、略响，不使用尖锐刮擦音。
- `chalk/tick*.ogg`：近似拾取粉笔。
- `chalk/drop*.ogg`：近似粉笔撞击、弹跳和停下。
- `basketball/pickup.ogg`、`throw.ogg`、`bounce.ogg`、`backboard.ogg`、`rim_01/02.ogg`：由 Kenney RPG Audio 与 Impact Sounds CC0 包内的皮革、布料、柔性撞击、重击和金属轻碰原声筛选并统一转码；分别用于拿球、出手、地面弹跳、篮板与篮圈碰撞。弹跳声采用 Impact Sounds 的 `impactSoft_heavy_004.ogg`，保留其接近充气篮球材质的弹跳质感；篮板声采用 `impactPunch_heavy_001.ogg`，收短低频拖尾后用于表现高速撞板。两者仅进行单声道转换、轻量频段整理、限幅和尾音收短；进球篮网声复用已加载的柔和布料声，不增加额外请求。
