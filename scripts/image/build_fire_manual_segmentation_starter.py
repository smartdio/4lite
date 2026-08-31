#!/usr/bin/env python3
"""Build a review-only FR-27 LCD ownership starter from confirmed full/base images.

The output is deliberately a candidate. Connected components do not define
physical electrodes; the user must repaint the 4x ownership image before it
can be imported or used to build a runtime atlas.
"""

from __future__ import annotations

import hashlib
import json
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


ROOT = Path(__file__).resolve().parents[2]
PREVIEW = ROOT / "docs/previews/fire-handheld-v01"
OUTPUT = PREVIEW / "manual-segmentation"
FULL_SOURCE = PREVIEW / "fire-fr27-photoreal-front-candidate-v02.png"
BASE_SOURCE = PREVIEW / "fire-fr27-photoreal-base-candidate-v02.png"

# Visible LCD glass, excluding the blue trim. This is a work rectangle derived
# from the confirmed 1672x941 front images and must be visually confirmed.
LCD_RECT = (474, 258, 1190, 711)
SCALE = 4
MIN_COMPONENT_PIXELS = 18
EDGE_GUARD = 10


def luminance(rgb: np.ndarray) -> np.ndarray:
    values = rgb.astype(np.float32)
    return values[..., 0] * 0.299 + values[..., 1] * 0.587 + values[..., 2] * 0.114


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
        if len(component) >= MIN_COMPONENT_PIXELS:
            components.append(component)
    return components


def palette_color(index: int) -> tuple[int, int, int]:
    # Deterministic high-contrast inspection palette. These colors are not
    # ownership facts and may be freely repainted by the user.
    return (
        32 + (index * 73) % 208,
        32 + (index * 137) % 208,
        32 + (index * 191) % 208,
    )


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    full_image = Image.open(FULL_SOURCE).convert("RGB")
    base_image = Image.open(BASE_SOURCE).convert("RGB")
    if full_image.size != base_image.size:
        raise ValueError(f"Confirmed source sizes differ: {full_image.size} != {base_image.size}")

    full = np.array(full_image.crop(LCD_RECT))
    base = np.array(base_image.crop(LCD_RECT))
    full_luma = luminance(full)
    base_luma = luminance(base)
    color_distance = np.linalg.norm(full.astype(np.float32) - base.astype(np.float32), axis=2)

    # Candidate pixels must be dark in the all-on image and materially absent
    # from the inactive base. A dilated base-dark mask suppresses most fixed
    # outlines even when ImageGen shifted them by a few pixels.
    base_dark = Image.fromarray((base_luma < 105).astype(np.uint8) * 255, "L")
    base_dark_dilated = np.array(base_dark.filter(ImageFilter.MaxFilter(11))) > 0
    candidate = (
        (full_luma < 122)
        & ((base_luma - full_luma > 30) | (color_distance > 72))
        & ~base_dark_dilated
    )
    candidate[:EDGE_GUARD, :] = False
    candidate[-EDGE_GUARD:, :] = False
    candidate[:, :EDGE_GUARD] = False
    candidate[:, -EDGE_GUARD:] = False

    components = connected_components(candidate)
    cleaned = np.zeros_like(candidate)
    ownership = np.full((*candidate.shape, 3), 255, dtype=np.uint8)
    records: list[dict[str, object]] = []
    for index, component in enumerate(components, 1):
        ys = np.array([point[0] for point in component])
        xs = np.array([point[1] for point in component])
        cleaned[ys, xs] = True
        color = palette_color(index)
        ownership[ys, xs] = color
        records.append({
            "candidateComponent": index,
            "pixelCount": int(len(component)),
            "rect": [int(xs.min()), int(ys.min()), int(xs.max() - xs.min() + 1), int(ys.max() - ys.min() + 1)],
            "reviewColor": list(color),
            "ownershipStatus": "automatic-candidate",
        })

    monochrome = np.full((*candidate.shape, 3), 255, dtype=np.uint8)
    monochrome[cleaned] = (38, 51, 47)
    difference = np.clip(color_distance * 3, 0, 255).astype(np.uint8)

    Image.fromarray(full, "RGB").save(OUTPUT / "fire-lcd-all-on-crop-v01.png")
    Image.fromarray(base, "RGB").save(OUTPUT / "fire-lcd-inactive-base-crop-v01.png")
    Image.fromarray(difference, "L").save(OUTPUT / "fire-lcd-source-difference-review-v01.png")
    Image.fromarray(monochrome, "RGB").save(OUTPUT / "fire-lcd-automatic-mask-candidate-v01.png")
    Image.fromarray(monochrome, "RGB").resize(
        (monochrome.shape[1] * SCALE, monochrome.shape[0] * SCALE), Image.Resampling.NEAREST
    ).save(OUTPUT / "fire-lcd-manual-coloring-template-candidate-v01-4x.png")
    Image.fromarray(ownership, "RGB").resize(
        (ownership.shape[1] * SCALE, ownership.shape[0] * SCALE), Image.Resampling.NEAREST
    ).save(OUTPUT / "fire-lcd-manual-recolor-starter-candidate-v01-4x.png")

    metrics = {
        "version": 1,
        "status": "automatic-candidate-requires-user-repaint",
        "fullSource": FULL_SOURCE.name,
        "fullSourceSha256": hashlib.sha256(FULL_SOURCE.read_bytes()).hexdigest(),
        "baseSource": BASE_SOURCE.name,
        "baseSourceSha256": hashlib.sha256(BASE_SOURCE.read_bytes()).hexdigest(),
        "fullImageSize": list(full_image.size),
        "lcdRect": list(LCD_RECT),
        "lcdSize": [full.shape[1], full.shape[0]],
        "editingScale": SCALE,
        "automaticCandidateComponents": len(records),
        "automaticCandidatePixels": int(np.count_nonzero(cleaned)),
        "discardedSmallCandidatePixels": int(np.count_nonzero(candidate & ~cleaned)),
        "minimumComponentPixels": MIN_COMPONENT_PIXELS,
        "warnings": [
            "Connected components are not physical-electrode ownership facts.",
            "Smoke/fire, touching people, stretchers, digits and overlaps require manual review.",
            "Generated all-on and inactive images may differ in texture outside LCD electrodes.",
            "Do not build an atlas until the user-edited ownership map is imported and validated.",
        ],
        "components": records,
    }
    (OUTPUT / "fire-lcd-manual-segmentation-starter-v01.json").write_text(
        json.dumps(metrics, ensure_ascii=False, indent=2) + "\n"
    )
    print(json.dumps({key: metrics[key] for key in (
        "lcdRect", "lcdSize", "automaticCandidateComponents", "automaticCandidatePixels",
        "discardedSmallCandidatePixels",
    )}, ensure_ascii=False))


if __name__ == "__main__":
    main()
