#!/usr/bin/env python3
"""Build the single color atlas used by the candidate 1980s stationery set."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "assets/source/textures/student-stationery/runtime/student-stationery-atlas-v01.png"
PENCIL_LABEL_OUTPUT = ROOT / "assets/source/textures/student-stationery/runtime/pencil-label-atlas-v01.png"
SIZE = 1024
RUNTIME_SIZE = 896
FONT_CANDIDATES = (
    Path("/System/Library/Fonts/STHeiti Medium.ttc"),
    Path("/System/Library/Fonts/Hiragino Sans GB.ttc"),
    Path("/System/Library/Fonts/Supplemental/Arial Unicode.ttf"),
)
FONT_PATH = str(next(path for path in FONT_CANDIDATES if path.exists()))


def label(draw, box, background, foreground, text, size=34, border=None):
    draw.rectangle(box, fill=background, outline=border or background, width=4)
    font = ImageFont.truetype(FONT_PATH, size)
    x = (box[0] + box[2]) / 2
    y = (box[1] + box[3]) / 2
    draw.text((x, y), text, font=font, fill=foreground, anchor="mm")


def main():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    image = Image.new("RGB", (SIZE, SIZE), "#d8c89d")
    draw = ImageDraw.Draw(image)

    label(draw, (0, 0, 511, 127), "#24543b", "#d7c56d", "中华 101   HB", 42, "#b9aa65")
    # Simple bamboo leaves evoke the long-running green 101 decoration without
    # claiming an exact factory print reconstruction.
    for x, y, angle in ((44, 29, -1), (68, 55, 1), (91, 25, -1), (119, 58, 1)):
        draw.ellipse((x - 11, y - 5, x + 11, y + 5), fill="#b8b267")
        draw.line((x, y, x + angle * 22, y + 28), fill="#d0c16c", width=3)

    label(draw, (512, 0, 1023, 127), "#a52f29", "#ead18a", "红黑杆铅笔   HB", 36, "#342b29")
    label(draw, (0, 128, 511, 255), "#d39b35", "#5b331d", "学生铅笔   HB", 38, "#b8402d")
    label(draw, (512, 128, 1023, 255), "#234d38", "#d6c27a", "英雄 616", 42, "#d0d0c6")
    label(draw, (0, 256, 511, 383), "#762f32", "#d8c77f", "英雄 329", 42, "#cecec6")

    label(draw, (512, 256, 767, 639), "#315f87", "#e8dfc4", "学习用品", 34, "#d5c58f")
    label(draw, (768, 256, 1023, 639), "#9f423b", "#eddfb8", "学生橡皮", 34, "#d5c58f")

    # Neutral worn-paper and graphite-smudge areas used by the eraser decals.
    draw.rectangle((0, 384, 511, 639), fill="#e3d8b8", outline="#b9a886", width=5)
    for x, y, r in ((90, 470, 26), (215, 420, 15), (356, 528, 35), (450, 445, 18)):
        draw.ellipse((x-r, y-r//2, x+r, y+r//2), fill="#9c9482")

    # Dedicated continuous texture for the two-compound eraser. Geometry stays
    # a single watertight mesh; the cream/charcoal division exists only here.
    draw.rectangle((0, 640, 511, 1023), fill="#ded4b5")
    draw.rectangle((256, 640, 511, 1023), fill="#302d2a")
    font = ImageFont.truetype(FONT_PATH, 30)
    draw.text((128, 805), "两用橡皮", font=font, fill="#37332e", anchor="mm")
    draw.text((128, 845), "LIANG YONG", font=ImageFont.truetype(FONT_PATH, 18), fill="#575046", anchor="mm")

    # Five longitudinal rubber layers for the period coloured eraser. This is
    # reconstructed from the user's object reference; the seller watermark is
    # intentionally excluded.
    stripe_x1, stripe_x2 = 512, 1023
    stripe_bands = (
        (640, 716, "#d95b7d"),
        (717, 793, "#e5d9b7"),
        (794, 869, "#62b99a"),
        (870, 946, "#e5d9b7"),
        (947, 1023, "#43aeb8"),
    )
    for y1, y2, color in stripe_bands:
        draw.rectangle((stripe_x1, y1, stripe_x2, y2), fill=color)
    for x, y in ((600, 688), (735, 830), (880, 916), (960, 982), (550, 905)):
        draw.ellipse((x-2, y-2, x+2, y+2), fill="#8d806f")

    # Remaining area is a safe warm paper color rather than transparent black,
    # preventing mip bleed at the small label edges.
    # The layout keeps 1024-based logical coordinates for stable UVs, while
    # the runtime copy is modestly downsampled. At the models' real-world
    # sizes this is visually indistinguishable and keeps decoded texture
    # memory within the stationery budget.
    image.resize((RUNTIME_SIZE, RUNTIME_SIZE), Image.Resampling.LANCZOS).save(OUTPUT, optimize=True)
    # Pencil markings use a separate transparent, long-strip atlas. This
    # removes the old rectangular background patch and matches the decal's
    # physical aspect ratio so the lettering is not vertically stretched.
    labels = Image.new("RGBA", (512, 128), (0, 0, 0, 0))
    label_draw = ImageDraw.Draw(labels)
    label_font = ImageFont.truetype(FONT_PATH, 24)
    label_draw.text((256, 21), "中华 101   HB", font=label_font, fill="#d7c56d", anchor="mm")
    for x, y in ((34, 14), (52, 27), (71, 13)):
        label_draw.ellipse((x-7, y-3, x+7, y+3), fill="#c8bc67")
    label_draw.text((256, 63), "红黑杆铅笔   HB", font=label_font, fill="#ead18a", anchor="mm")
    label_draw.text((256, 105), "学生铅笔   HB", font=label_font, fill="#5b331d", anchor="mm")
    labels.save(PENCIL_LABEL_OUTPUT, optimize=True)
    print(OUTPUT)
    print(PENCIL_LABEL_OUTPUT)


if __name__ == "__main__":
    main()
