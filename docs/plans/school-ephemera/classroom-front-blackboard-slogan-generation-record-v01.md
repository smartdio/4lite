# 教室前黑板剪纸标语生成记录 v0.1

生成日期：2026-08-17  
处理方式：Codex 内置图像生成工具的参考图生成模式＋ImageMagick 透明边缘整理、裁切与 WebP 导出

## 固定内容与位置

- 左侧：“好好学习”。
- 中间：一面五星红旗。
- 右侧：“天天向上”。
- 指定位置：每个教室前墙，讲台上方前黑板的正上方，整体水平居中。

## 美术约束

- 单行横排，八个字字数、顺序和内容必须准确。
- 使用晚七十至八十年代常见的红色手工剪纸字形，边缘略有手剪不齐和纸纤维。
- 红纸与国旗保留轻微皱褶、褪色和粘贴使用痕迹。
- 输出为透明底贴花，不生成墙、黑板、相框、胶带、图钉、阴影或现代字体。

## 最终提示规格

`Use case: historical-scene`

以用户参考作为构图和年代质感依据，生成一行用于八十年代小学教室前黑板上方的透明剪纸墙贴。从左至右严格为四个独立红色剪纸字“好 好 学 习”、一面居中的五星红旗、四个独立红色剪纸字“天 天 向 上”。所有字形清楚、端正、大小一致，薄红纸有轻微皱褶、毛边和褪色。整体正视、水平、宽横构图，透明背景，不得增加或遗漏字符，不得出现墙面、黑板、框架、图钉、胶带、透视或水印。

## 输出

- 原始／整理母版：`assets/source/school-ephemera/classroom-slogans/`
- 运行时贴图：`public/assets/textures/school-ephemera/posters/classroom-slogans/classroom-slogan-study-upward-combined-v01.webp`
- 墙色预览：`docs/previews/school-ephemera/classroom-front-blackboard-slogan-v01.png`
- 运行时规格：`2400 × 480`、透明 WebP、质量 92。
