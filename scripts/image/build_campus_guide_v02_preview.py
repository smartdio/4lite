#!/usr/bin/env python3
"""Build the editable campus-guide v02 representative sample.

The generated source supplies only the period chalkboard illustration. All
visible copy is composed here so the Simplified Chinese remains exact and can
be revised without regenerating the artwork.
"""

from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[2]
PREVIEW = ROOT / "docs/previews/school-ephemera/campus-guide-v02"
SOURCE = PREVIEW / "campus-guide-v02-textless-generated.png"
MASTER = PREVIEW / "campus-guide-v02-fullboard-sample-master.png"
RUNTIME = PREVIEW / "campus-guide-v02-fullboard-sample-runtime.webp"

MASTER_SIZE = (2400, 640)
RUNTIME_SIZE = (1920, 512)

FONT_REGULAR = Path.home() / "Library/Fonts/LXGWWenKai-Regular.ttf"
FONT_MEDIUM = Path.home() / "Library/Fonts/LXGWWenKai-Medium.ttf"

COLORS = {
    "warm": (236, 218, 169, 245),
    "yellow": (226, 198, 116, 245),
    "pink": (216, 151, 153, 245),
    "blue": (145, 188, 199, 245),
    "green": (164, 191, 117, 245),
    "soft": (214, 207, 178, 232),
    "dark": (7, 20, 18, 210),
}


def font(path: Path, size: int) -> ImageFont.FreeTypeFont:
    if not path.is_file():
        raise SystemExit(f"Missing preview font: {path}")
    return ImageFont.truetype(str(path), size)


def text_width(text: str, chosen_font: ImageFont.FreeTypeFont) -> float:
    probe = ImageDraw.Draw(Image.new("L", (1, 1)))
    return probe.textlength(text, font=chosen_font)


def chalk_text(
    image: Image.Image,
    xy: tuple[float, float],
    text: str,
    chosen_font: ImageFont.FreeTypeFont,
    color: tuple[int, int, int, int],
    *,
    anchor: str = "la",
    stroke_width: int = 1,
) -> None:
    """Draw readable text with restrained dry-chalk grain and faint dust."""
    mask = Image.new("L", image.size, 0)
    drawer = ImageDraw.Draw(mask)
    drawer.text(
        xy,
        text,
        font=chosen_font,
        fill=255,
        anchor=anchor,
        stroke_width=stroke_width,
        stroke_fill=210,
    )
    noise = Image.effect_noise(image.size, 16).point(lambda value: 202 + value * 53 // 255)
    dry_mask = ImageChops.multiply(mask, noise)

    dust = Image.new("RGBA", image.size, color[:3] + (0,))
    dust.putalpha(dry_mask.filter(ImageFilter.GaussianBlur(0.65)).point(lambda value: value * 45 // 255))
    image.alpha_composite(dust)

    solid = Image.new("RGBA", image.size, color[:3] + (0,))
    solid.putalpha(ImageChops.multiply(dry_mask, Image.new("L", image.size, color[3])))
    image.alpha_composite(solid)


def centered(
    image: Image.Image,
    center_x: float,
    y: float,
    text: str,
    chosen_font: ImageFont.FreeTypeFont,
    color: tuple[int, int, int, int],
    **kwargs,
) -> None:
    chalk_text(image, (center_x, y), text, chosen_font, color, anchor="ma", **kwargs)


def multicolor_title(image: Image.Image, text: str, center_x: float, y: float) -> None:
    chosen_font = font(FONT_MEDIUM, 80)
    colors = [COLORS["yellow"], COLORS["pink"], COLORS["warm"], COLORS["blue"], COLORS["green"]]
    widths = [text_width(character, chosen_font) for character in text]
    x = center_x - sum(widths) / 2
    for index, (character, width) in enumerate(zip(text, widths)):
        chalk_text(image, (x, y), character, chosen_font, colors[index % len(colors)], stroke_width=2)
        x += width


def chalk_cutout(source: Image.Image, box: tuple[int, int, int, int], scale: float = 1.0) -> Image.Image:
    """Extract generated chalk strokes without carrying over its dark board."""
    crop = source.crop(box).convert("RGBA")
    alpha = crop.convert("L").point(lambda value: max(0, min(255, (value - 42) * 5)))
    alpha = alpha.filter(ImageFilter.GaussianBlur(.25))
    crop.putalpha(alpha)
    if scale != 1:
        crop = crop.resize(
            (max(1, round(crop.width * scale)), max(1, round(crop.height * scale))),
            Image.Resampling.LANCZOS,
        )
    return crop


def paste_chalk(
    image: Image.Image,
    source: Image.Image,
    box: tuple[int, int, int, int],
    xy: tuple[int, int],
    scale: float = 1.0,
) -> None:
    cutout = chalk_cutout(source, box, scale)
    image.alpha_composite(cutout, xy)


def dashed_frame(
    image: Image.Image,
    box: tuple[int, int, int, int],
    color: tuple[int, int, int, int],
) -> None:
    """Draw a restrained broken chalk frame around a content zone."""
    x0, y0, x1, y1 = box
    overlay = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    segment, gap, width = 13, 9, 3
    for x in range(x0 + 22, x1 - 22, segment + gap):
        draw.line((x, y0, min(x + segment, x1 - 22), y0 + (x // 22) % 2), fill=color, width=width)
        draw.line((x, y1, min(x + segment, x1 - 22), y1 - (x // 22) % 2), fill=color, width=width)
    for y in range(y0 + 22, y1 - 22, segment + gap):
        draw.line((x0, y, x0 + (y // 22) % 2, min(y + segment, y1 - 22)), fill=color, width=width)
        draw.line((x1, y, x1 - (y // 22) % 2, min(y + segment, y1 - 22)), fill=color, width=width)
    draw.arc((x0, y0, x0 + 44, y0 + 44), 180, 270, fill=color, width=width)
    draw.arc((x1 - 44, y0, x1, y0 + 44), 270, 360, fill=color, width=width)
    draw.arc((x0, y1 - 44, x0 + 44, y1), 90, 180, fill=color, width=width)
    draw.arc((x1 - 44, y1 - 44, x1, y1), 0, 90, fill=color, width=width)
    image.alpha_composite(overlay.filter(ImageFilter.GaussianBlur(.18)))


def fullboard_base(source: Image.Image) -> Image.Image:
    """Recompose the 3:1 generated art over the exact 3.75:1 board face."""
    background = ImageOps.fit(source.convert("RGB"), MASTER_SIZE, method=Image.Resampling.LANCZOS)
    background = background.filter(ImageFilter.GaussianBlur(24))
    background = Image.blend(background, Image.new("RGB", MASTER_SIZE, (5, 21, 18)), .78).convert("RGBA")

    # Outer border and floral corners reach the true edges of the 4.5m board.
    border = Image.new("RGBA", MASTER_SIZE, (0, 0, 0, 0))
    draw = ImageDraw.Draw(border)
    draw.rounded_rectangle((16, 12, 2384, 628), radius=28, outline=(194, 166, 94, 178), width=3)
    background.alpha_composite(border.filter(ImageFilter.GaussianBlur(.2)))
    paste_chalk(background, source, (0, 0, 350, 205), (25, 5), .86)
    paste_chalk(background, source, (1822, 0, 2172, 205), (2074, 5), .86)
    paste_chalk(background, source, (0, 150, 130, 650), (24, 132), .88)
    paste_chalk(background, source, (2042, 150, 2172, 650), (2262, 132), .88)

    # The generated ribbon and bottom flourishes remain undistorted and centered.
    paste_chalk(background, source, (318, 10, 1854, 180), (520, 7), .89)
    paste_chalk(background, source, (0, 568, 2172, 724), (240, 500), .884)

    # Reuse the generated pictograms as chalk cutouts, redistributed across the wider surface.
    paste_chalk(background, source, (75, 180, 330, 610), (105, 182), .84)
    paste_chalk(background, source, (665, 180, 835, 620), (795, 180), .84)
    paste_chalk(background, source, (850, 486, 1035, 625), (1282, 466), .80)
    paste_chalk(background, source, (1020, 180, 1290, 605), (1385, 180), .84)
    paste_chalk(background, source, (1265, 180, 1535, 620), (1680, 180), .82)
    paste_chalk(background, source, (1760, 170, 2055, 625), (2110, 170), .82)

    dashed_frame(background, (88, 178, 756, 566), (202, 133, 143, 165))
    dashed_frame(background, (782, 178, 1626, 566), (126, 178, 194, 165))
    dashed_frame(background, (1652, 178, 2312, 566), (158, 183, 96, 165))
    return background


def build() -> None:
    if not SOURCE.is_file():
        raise SystemExit(f"Missing generated preview source: {SOURCE}")

    source = Image.open(SOURCE).convert("RGBA")
    if source.size != (2172, 724):
        source = source.resize((2172, 724), Image.Resampling.LANCZOS)
    image = fullboard_base(source)

    title_center = 1200
    multicolor_title(image, "校园漫游小指南", title_center, 38)
    centered(image, title_center, 111, "走一走 · 看一看 · 玩一玩", font(FONT_REGULAR, 27), COLORS["soft"])

    heading_font = font(FONT_MEDIUM, 43)
    centered(image, 422, 193, "怎样操作", heading_font, COLORS["pink"])
    centered(image, 1204, 193, "校园里可以互动", heading_font, COLORS["blue"])
    centered(image, 1982, 193, "可以玩的游戏", heading_font, COLORS["green"])

    left_font = font(FONT_REGULAR, 29)
    left_lines = [
        (270, "键盘／摇杆　自由移动", COLORS["warm"]),
        (338, "绿色标记　点击前往", COLORS["green"]),
        (406, "鼠标／手指　转动视角", COLORS["blue"]),
        (474, "对准提示　点击互动", COLORS["yellow"]),
    ]
    for y, copy, color in left_lines:
        centered(image, 450, y, copy, left_font, color)

    middle_font = font(FONT_REGULAR, 27)
    middle_lines = [
        (266, "开合门窗　坐课桌和石凳"),
        (326, "黑板写画　拾取粉笔篮球"),
        (386, "翻看课本、练习册和作文"),
        (446, "连环画、零食袋、铅笔盒"),
        (506, "找到旗台　还可以亲手升旗"),
    ]
    for index, (y, copy) in enumerate(middle_lines):
        centered(image, 1210, y, copy, middle_font, COLORS["warm"] if index % 2 == 0 else COLORS["soft"])

    group_font = font(FONT_MEDIUM, 29)
    games_font = font(FONT_REGULAR, 25)
    centered(image, 1982, 258, "运动游戏", group_font, COLORS["pink"])
    centered(image, 1982, 298, "篮球投篮 · 乒乓球 · 跳远 · 爬竹竿", games_font, COLORS["warm"])
    centered(image, 1982, 362, "课间游戏", group_font, COLORS["yellow"])
    centered(image, 1982, 402, "跳房子 · 踢毽子 · 抓石子 · 弹弓", games_font, COLORS["soft"])
    centered(image, 1982, 466, "教室珍藏", group_font, COLORS["blue"])
    centered(image, 1982, 506, "魔方 · 八爪鱼掌机 · 救火掌机", games_font, COLORS["warm"])

    footer_font = font(FONT_REGULAR, 23)
    centered(image, 1200, 594, "玩法中按 X 退出 · Esc 暂停　｜　手机使用画面按钮", footer_font, COLORS["soft"])

    image.convert("RGB").save(MASTER, "PNG", optimize=True)
    image.convert("RGB").resize(RUNTIME_SIZE, Image.Resampling.LANCZOS).save(
        RUNTIME, "WEBP", quality=80, method=6
    )
    print(f"Wrote {MASTER.relative_to(ROOT)}")
    print(f"Wrote {RUNTIME.relative_to(ROOT)}")


if __name__ == "__main__":
    build()
