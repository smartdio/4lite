#!/usr/bin/env python3
"""Build the FR-27 manual ownership starter from the confirmed clean LCD master.

This script only assigns review colors to connected visual islands. A connected
island is not a physical-electrode ownership fact; the user must merge or split
colors in the 4x ownership image before any runtime segment package is built.
"""

from __future__ import annotations

import colorsys
import hashlib
import json
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "docs/previews/fire-handheld-v01/manual-segmentation"
MASTER = OUTPUT / "fire-lcd-all-on-master-candidate-v02.png"
THRESHOLD = 224
EDIT_SCALE = 4
INDEX_SCALE = 2


def connected_components(mask: np.ndarray) -> list[list[tuple[int, int]]]:
    height, width = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    components: list[list[tuple[int, int]]] = []
    for start_y, start_x in zip(*np.nonzero(mask)):
        if seen[start_y, start_x]:
            continue
        queue = deque([(int(start_y), int(start_x))])
        seen[start_y, start_x] = True
        component: list[tuple[int, int]] = []
        while queue:
            y, x = queue.popleft()
            component.append((y, x))
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    if not (dx or dy):
                        continue
                    next_y, next_x = y + dy, x + dx
                    if 0 <= next_y < height and 0 <= next_x < width:
                        if mask[next_y, next_x] and not seen[next_y, next_x]:
                            seen[next_y, next_x] = True
                            queue.append((next_y, next_x))
        components.append(component)
    return components


def review_color(index: int) -> tuple[int, int, int]:
    # Golden-angle hue rotation gives deterministic, saturated inspection colors.
    hue = (index * 0.618033988749895) % 1.0
    red, green, blue = colorsys.hsv_to_rgb(hue, 0.72, 0.82)
    return round(red * 255), round(green * 255), round(blue * 255)


def main() -> None:
    master_image = Image.open(MASTER).convert("RGB")
    source = np.asarray(master_image)
    luminance = (
        source[..., 0].astype(np.float32) * 0.299
        + source[..., 1].astype(np.float32) * 0.587
        + source[..., 2].astype(np.float32) * 0.114
    )
    foreground = luminance < THRESHOLD
    components = connected_components(foreground)
    components.sort(key=lambda pixels: (
        min(point[0] for point in pixels),
        min(point[1] for point in pixels),
    ))

    binary = np.full((*foreground.shape, 3), 255, dtype=np.uint8)
    binary[foreground] = (16, 23, 18)
    ownership = np.full((*foreground.shape, 3), 255, dtype=np.uint8)
    records: list[dict[str, object]] = []
    for index, component in enumerate(components, 1):
        ys = np.fromiter((point[0] for point in component), dtype=np.int32)
        xs = np.fromiter((point[1] for point in component), dtype=np.int32)
        color = review_color(index)
        ownership[ys, xs] = color
        records.append({
            "visualIsland": index,
            "pixelCount": int(len(component)),
            "rect": [
                int(xs.min()),
                int(ys.min()),
                int(xs.max() - xs.min() + 1),
                int(ys.max() - ys.min() + 1),
            ],
            "reviewColor": list(color),
            "ownershipStatus": "unconfirmed-visual-island",
        })

    binary_image = Image.fromarray(binary, "RGB")
    ownership_image = Image.fromarray(ownership, "RGB")
    binary_image.save(OUTPUT / "fire-lcd-master-binary-v02.png")
    binary_image.resize(
        (master_image.width * EDIT_SCALE, master_image.height * EDIT_SCALE),
        Image.Resampling.NEAREST,
    ).save(OUTPUT / "fire-lcd-manual-coloring-template-v02-4x.png")
    ownership_image.resize(
        (master_image.width * EDIT_SCALE, master_image.height * EDIT_SCALE),
        Image.Resampling.NEAREST,
    ).save(OUTPUT / "fire-lcd-manual-recolor-starter-v02-4x.png")

    index_image = ownership_image.resize(
        (master_image.width * INDEX_SCALE, master_image.height * INDEX_SCALE),
        Image.Resampling.NEAREST,
    )
    draw = ImageDraw.Draw(index_image)
    font = ImageFont.load_default(size=14)
    for record in records:
        x, y, width, height = record["rect"]
        label = f"C{record['visualIsland']:03d}"
        label_x = x * INDEX_SCALE
        label_y = max(0, y * INDEX_SCALE - 15)
        draw.text(
            (label_x, label_y), label, font=font, fill=(0, 0, 0),
            stroke_width=2, stroke_fill=(255, 255, 255),
        )
    index_image.save(OUTPUT / "fire-lcd-component-index-review-v02-2x.png")

    metrics = {
        "version": 2,
        "status": "confirmed-master-unconfirmed-ownership-starter",
        "masterSource": MASTER.name,
        "masterSourceSha256": hashlib.sha256(MASTER.read_bytes()).hexdigest(),
        "masterSize": list(master_image.size),
        "binaryThreshold": THRESHOLD,
        "editingScale": EDIT_SCALE,
        "foregroundPixels": int(np.count_nonzero(foreground)),
        "automaticVisualIslands": len(records),
        "warnings": [
            "Visual islands are not physical-electrode ownership facts.",
            "The user must merge islands belonging to one electrode and split touching electrodes.",
            "Digits, smoke/fire, people, stretchers, labels and action marks require manual review.",
            "Do not build an atlas until the user-edited ownership map is imported and validated.",
        ],
        "visualIslands": records,
    }
    (OUTPUT / "fire-lcd-manual-segmentation-starter-v02.json").write_text(
        json.dumps(metrics, ensure_ascii=False, indent=2) + "\n"
    )
    print(json.dumps({
        "masterSize": metrics["masterSize"],
        "foregroundPixels": metrics["foregroundPixels"],
        "automaticVisualIslands": metrics["automaticVisualIslands"],
        "editingSize": [master_image.width * EDIT_SCALE, master_image.height * EDIT_SCALE],
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
