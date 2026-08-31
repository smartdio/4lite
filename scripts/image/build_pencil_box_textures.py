#!/usr/bin/env python3
"""Build the review-candidate textures for the 1980s tin pencil box."""

from pathlib import Path
import random

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[2]
SOURCES = {
    "flower-angel": ROOT / "assets/source/textures/pencil-box/flower-angel-cover-candidate-v01.png",
    "sun-wukong": ROOT / "assets/source/textures/pencil-box/sun-wukong-cover-candidate-v01.png",
    "black-cat-sheriff": ROOT / "assets/source/textures/pencil-box/black-cat-sheriff-cover-candidate-v01.png",
    "ikkyu": ROOT / "assets/source/textures/pencil-box/ikkyu-cover-candidate-v01.png",
}
OUTPUT = ROOT / "assets/source/textures/pencil-box/runtime"
SIZE = (1024, 360)
FONT_CANDIDATES = (
    Path("/System/Library/Fonts/STHeiti Medium.ttc"),
    Path("/System/Library/Fonts/Hiragino Sans GB.ttc"),
    Path("/System/Library/Fonts/Supplemental/Arial Unicode.ttf"),
)
FONT_PATH = str(next(path for path in FONT_CANDIDATES if path.exists()))


def fit_cover(image: Image.Image) -> Image.Image:
    source_ratio = image.width / image.height
    target_ratio = SIZE[0] / SIZE[1]
    if source_ratio > target_ratio:
        width = round(image.height * target_ratio)
        left = (image.width - width) // 2
        image = image.crop((left, 0, left + width, image.height))
    else:
        height = round(image.width / target_ratio)
        top = (image.height - height) // 2
        image = image.crop((0, top, image.width, top + height))
    image = image.resize(SIZE, Image.Resampling.LANCZOS)
    image = ImageEnhance.Color(image).enhance(0.93)
    image = ImageEnhance.Contrast(image).enhance(0.97)
    # Replace the source image's white square-canvas corners with the printed
    # yellow-green border color. The Blender decal is also a rounded polygon,
    # so no white corner can peek beyond the intended print area.
    mask = Image.new("L", SIZE, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, SIZE[0] - 1, SIZE[1] - 1), radius=39, fill=255)
    background = Image.new("RGB", SIZE, "#aeb91e")
    background.paste(image, (0, 0), mask)
    return background


def add_stains(image: Image.Image, seed: int, inner: bool) -> Image.Image:
    rng = random.Random(seed)
    base = image.convert("RGBA")
    haze = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(haze)
    count = 10 if inner else 5
    for _ in range(count):
        edge = rng.choice(("left", "right", "top", "bottom"))
        if edge in ("left", "right"):
            x = rng.randint(-25, 150) if edge == "left" else rng.randint(image.width - 150, image.width + 25)
            y = rng.randint(20, image.height - 20)
        else:
            x = rng.randint(25, image.width - 25)
            y = rng.randint(-20, 90) if edge == "top" else rng.randint(image.height - 90, image.height + 20)
        width = rng.randint(70, 190);height = rng.randint(25, 80)
        alpha = rng.randint(18, 34) if inner else rng.randint(5, 12)
        color = (92, 66, 31, alpha)
        draw.ellipse((x - width // 2, y - height // 2, x + width // 2, y + height // 2), fill=color)
    haze = haze.filter(ImageFilter.GaussianBlur(18 if inner else 24))
    base = Image.alpha_composite(base, haze)

    specks = Image.new("RGBA", image.size, (0, 0, 0, 0))
    speck_draw = ImageDraw.Draw(specks)
    for _ in range(54 if inner else 22):
        x = rng.randrange(image.width);y = rng.randrange(image.height)
        radius = rng.choice((1, 1, 2, 3))
        alpha = rng.randint(14, 32) if inner else rng.randint(5, 14)
        speck_draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=(77, 61, 39, alpha))
    specks = specks.filter(ImageFilter.GaussianBlur(0.7))
    return Image.alpha_composite(base, specks).convert("RGB")


def build_inner() -> Image.Image:
    image = Image.new("RGB", SIZE, "#ead79f")
    draw = ImageDraw.Draw(image)
    title = ImageFont.truetype(FONT_PATH, 42)
    body = ImageFont.truetype(FONT_PATH, 24)
    small = ImageFont.truetype(FONT_PATH, 18)

    # Slightly faded cool-gray print, matching an old lithographed inner lid.
    ink = "#4c5556"
    faint = "#7d827f"
    draw.rounded_rectangle((15, 15, 1008, 344), radius=22, outline="#9b9a91", width=3)
    draw.text((512, 41), "乘法口诀", font=title, fill=ink, anchor="mm")
    draw.text((918, 48), "学习用品", font=small, fill=faint, anchor="mm")

    cell_w = 103
    cell_h = 27
    left = 46
    top = 88
    for row in range(1, 10):
        for column in range(1, row + 1):
            x = left + (column - 1) * cell_w
            y = top + (row - 1) * cell_h
            draw.rounded_rectangle((x, y, x + 94, y + 22), radius=3, outline="#999a94", width=1)
            draw.text((x + 47, y + 11), f"{column}×{row}={column * row}", font=body, fill=ink, anchor="mm")
    return image


def build_inner_floor() -> Image.Image:
    image = Image.new("RGB", SIZE, "#e3bd65")
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((8, 8, SIZE[0] - 9, SIZE[1] - 9), radius=36, outline="#c49b45", width=3)
    return add_stains(image, seed=1985, inner=True)


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for index, (slug, source) in enumerate(SOURCES.items()):
        cover = add_stains(fit_cover(Image.open(source).convert("RGB")), seed=1981 + index, inner=False)
        cover.save(OUTPUT / f"{slug}-cover-runtime-v01.png", optimize=True)
    add_stains(build_inner(), seed=1983, inner=True).save(
        OUTPUT / "multiplication-inner-runtime-v01.png", optimize=True,
    )
    build_inner_floor().save(OUTPUT / "inner-metal-stains-runtime-v01.png", optimize=True)


if __name__ == "__main__":
    main()
