#!/usr/bin/env python3
"""Build Gate A previews for the shared Rubik's-cube sticker wear variants."""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageOps, ImageStat


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "docs/references/rubiks-cube/gate-a-source"
OUTPUT = ROOT / "docs/previews/rubiks-cube-gate-a-v01"
VARIANTS = ("a", "b", "c")
PALETTE = {
    "暖白": (226, 216, 190),
    "黄色": (211, 166, 48),
    "红色": (161, 59, 43),
    "橙色": (187, 91, 38),
    "蓝色": (48, 86, 112),
    "绿色": (59, 101, 67),
}


def font(size, bold=False):
    candidates = [
        Path("/System/Library/Fonts/PingFang.ttc"),
        Path("/System/Library/Fonts/STHeiti Medium.ttc" if bold else "/System/Library/Fonts/STHeiti Light.ttc"),
        Path("/System/Library/Fonts/Supplemental/Arial Unicode.ttf"),
    ]
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size=size, index=1 if bold and candidate.name == "PingFang.ttc" else 0)
    return ImageFont.load_default()


def normalized_variant(name):
    source = Image.open(SOURCE / f"rubiks-sticker-wear-{name}-imagegen-v01.png").convert("RGBA")
    alpha = source.getchannel("A")
    bounds = alpha.getbbox()
    if not bounds:
        raise RuntimeError(f"variant {name} has no alpha silhouette")
    crop = source.crop(bounds)
    gray = ImageOps.grayscale(crop)
    # Keep the generated wear hierarchy but remove fixed warm/brown color so runtime tinting stays clean.
    lo, hi = gray.getextrema()
    if hi <= lo:
        hi = lo + 1
    gray = gray.point(lambda value: max(150, min(255, round(174 + (value - lo) * 81 / (hi - lo)))))
    neutral = Image.merge("RGBA", (gray, gray, gray, crop.getchannel("A")))
    target = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
    scale = min(468 / neutral.width, 468 / neutral.height)
    neutral = neutral.resize((round(neutral.width * scale), round(neutral.height * scale)), Image.Resampling.LANCZOS)
    target.alpha_composite(neutral, ((512 - neutral.width) // 2, (512 - neutral.height) // 2))
    return target


def tint(sticker, color):
    gray = sticker.getchannel("R")
    alpha = sticker.getchannel("A")
    channels = []
    for component in color:
        channels.append(gray.point(lambda value, c=component: max(0, min(255, round(c * (0.70 + value / 850))))))
    return Image.merge("RGBA", (*channels, alpha))


def fit(image, size):
    result = image.copy()
    result.thumbnail(size, Image.Resampling.LANCZOS)
    return result


def rounded_panel(draw, box, fill=(238, 231, 215), outline=(54, 45, 37), radius=24, width=4):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def build_variant_sheet(stickers):
    canvas = Image.new("RGB", (2000, 1220), (214, 205, 187))
    draw = ImageDraw.Draw(canvas)
    draw.text((80, 54), "魔方贴纸 Gate A｜共享磨损与边缘轮廓", font=font(52, True), fill=(42, 35, 29))
    draw.text((82, 120), "A 轻微毛边　B 局部崩边　C 缺角；以下颜色全部由同一中性纹理染色", font=font(28), fill=(78, 67, 55))
    labels = ["A｜轻微毛边", "B｜局部崩边", "C｜缺角"]
    colors = [(211, 166, 48), (48, 86, 112), (161, 59, 43)]
    for index, name in enumerate(VARIANTS):
        left = 70 + index * 640
        rounded_panel(draw, (left, 190, left + 580, 1120))
        draw.text((left + 40, 222), labels[index], font=font(34, True), fill=(42, 35, 29))
        large = fit(tint(stickers[name], colors[index]), (500, 500))
        canvas.paste(large, (left + 40, 300), large)
        neutral = fit(stickers[name], (210, 210))
        canvas.paste(neutral, (left + 50, 850), neutral)
        detail = fit(tint(stickers[name], (59, 101, 67)), (210, 210)).rotate(90 * index, expand=False)
        canvas.paste(detail, (left + 315, 850), detail)
    path = OUTPUT / "rubiks-sticker-edge-variants-gate-a-v01.png"
    canvas.save(path, optimize=True)
    return path


def face_image(stickers, color, seed):
    face = Image.new("RGB", (444, 444), (22, 20, 18))
    for row in range(3):
        for column in range(3):
            index = row * 3 + column
            variant = VARIANTS[(seed + index * 2 + row) % 3]
            tile = tint(stickers[variant], color).rotate(90 * ((seed + index) % 4), expand=False)
            tile = fit(tile, (128, 128))
            x = 24 + column * 140
            y = 24 + row * 140
            face.paste(tile, (x, y), tile)
    return face


def build_six_face_sheet(stickers):
    canvas = Image.new("RGB", (2020, 1440), (207, 198, 180))
    draw = ImageDraw.Draw(canvas)
    draw.text((70, 42), "完整魔方六面贴纸预览", font=font(52, True), fill=(42, 35, 29))
    draw.text((72, 108), "预览轮廓来自三种共享贴纸；黑色部分仅为无贴图圆角材质工作示意", font=font(28), fill=(76, 65, 54))
    entries = list(PALETTE.items())
    for index, (label, color) in enumerate(entries):
        column = index % 3
        row = index // 3
        left = 65 + column * 650
        top = 180 + row * 600
        rounded_panel(draw, (left, top, left + 585, top + 540), fill=(235, 227, 210))
        draw.text((left + 38, top + 24), label, font=font(32, True), fill=(45, 37, 31))
        face = face_image(stickers, color, index * 7 + 3)
        canvas.paste(face, (left + 70, top + 80))
    path = OUTPUT / "rubiks-cube-six-faces-gate-a-v01.png"
    canvas.save(path, optimize=True)
    return path


def build_atlas(stickers):
    atlas = Image.new("RGB", (1536, 512), (245, 245, 245))
    for index, name in enumerate(VARIANTS):
        tile = stickers[name]
        flattened = Image.new("RGBA", tile.size, (245, 245, 245, 255))
        flattened.alpha_composite(tile)
        atlas.paste(flattened.convert("RGB"), (index * 512, 0))
    png = OUTPUT / "rubiks-sticker-wear-atlas-gate-a-v01.png"
    webp = OUTPUT / "rubiks-sticker-wear-atlas-gate-a-v01.webp"
    atlas.save(png, optimize=True)
    atlas.resize((768, 256), Image.Resampling.LANCZOS).save(webp, format="WEBP", quality=86, method=6)
    return png, webp


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    normalized_dir = OUTPUT / "normalized"
    normalized_dir.mkdir(parents=True, exist_ok=True)
    stickers = {name: normalized_variant(name) for name in VARIANTS}
    for name, sticker in stickers.items():
        sticker.save(normalized_dir / f"rubiks-sticker-wear-{name}-normalized-v01.png", optimize=True)
    paths = [build_variant_sheet(stickers), build_six_face_sheet(stickers), *build_atlas(stickers)]
    for path in paths:
        image = Image.open(path)
        print(f"{path.relative_to(ROOT)}\t{image.size}\t{path.stat().st_size} bytes")


if __name__ == "__main__":
    main()
