#!/usr/bin/env python3
"""Extract six period eraser prints from the user-supplied object reference."""

from pathlib import Path
from PIL import Image, ImageEnhance, ImageFilter


ROOT = Path(__file__).resolve().parents[2]
SOURCE = Path("/var/folders/vj/fckm1ps121b7sk__7f8lw48h0000gn/T/codex-clipboard-a19477a8-26fd-4281-ba50-33c027fbb85b.png")
OUT_DIR = ROOT / "assets/source/textures/student-stationery/character-erasers"
ATLAS = OUT_DIR / "character-eraser-atlas-v01.jpg"

# Four independently measured face corners per eraser. Order is top-left,
# bottom-left, bottom-right, top-right for Pillow's QUAD transform.
QUADS = {
    "student-tree": (270, 260, 300, 1285, 975, 1276, 970, 250),
    "traffic-attendant": (975, 242, 980, 1281, 1650, 1277, 1646, 236),
    "running-dog": (1655, 256, 1658, 1279, 2310, 1273, 2315, 251),
    "blue-bear": (980, 1286, 986, 2325, 1650, 2322, 1648, 1283),
}


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    source = Image.open(SOURCE).convert("RGB")
    atlas = Image.new("RGB", (512, 512), "#ded9c8")
    for index, (slug, quad) in enumerate(QUADS.items()):
        # Rectify each photographed eraser face independently before any
        # resizing. This prevents the previous character/text displacement.
        crop = source.transform((480, 640), Image.Transform.QUAD, quad, Image.Resampling.BICUBIC)
        crop = crop.crop((18, 18, 462, 622))
        # Reduce photographic cast while retaining the authentic faded ink.
        crop = ImageEnhance.Color(crop).enhance(.88)
        crop = ImageEnhance.Contrast(crop).enhance(1.04)
        crop = crop.filter(ImageFilter.GaussianBlur(.18))
        crop.thumbnail((220, 224), Image.Resampling.LANCZOS)
        crop = crop.resize((round(crop.width * 1.22), round(crop.height * 1.22)), Image.Resampling.LANCZOS)
        tile = Image.new("RGB", (256, 256), "#ded9c8")
        tile.paste(crop, ((256-crop.width)//2, (256-crop.height)//2))
        tile.save(OUT_DIR / f"character-eraser-{slug}-v01.png", optimize=True)
        atlas.paste(tile, ((index % 2) * 256, (index // 2) * 256))
    atlas.save(ATLAS, quality=78, optimize=True, progressive=True)
    print(ATLAS)


if __name__ == "__main__":
    main()
