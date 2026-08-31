#!/usr/bin/env python3
"""Replace the FR-27 score/time area with four copies of one confirmed 8."""

from __future__ import annotations

import colorsys
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "docs/previews/fire-handheld-v01/manual-segmentation"
MASTER_V02 = OUTPUT / "fire-lcd-master-binary-v02.png"
OWNERSHIP_V03 = OUTPUT / "fire-lcd-manual-ownership-user-v03.png"
SCALE = 4

# Existing complete 8, including all seven separate visual segments.
SOURCE_RECT = (992, 78, 54, 96)

# Left tens, left ones, right tens, right ones. Existing partial 1 shapes align
# to the latter three positions; the missing left-tens position continues the
# same current-master spacing and remains a visual work value.
DIGIT_TARGETS = {
    "left_tens": (684, 78),
    "left_ones": (775, 78),
    "right_tens": (901, 78),
    "right_ones": (992, 78),
}


def candidate_color(index: int) -> tuple[int, int, int]:
    hue = (index * 0.618033988749895) % 1.0
    red, green, blue = colorsys.hsv_to_rgb(hue, 0.72, 0.82)
    return round(red * 255), round(green * 255), round(blue * 255)


def unique_color(index: int, used: set[tuple[int, int, int]]) -> tuple[int, int, int]:
    while True:
        color = candidate_color(index)
        if color not in used and color != (255, 255, 255):
            used.add(color)
            return color
        index += 1


def main() -> None:
    master = np.asarray(Image.open(MASTER_V02).convert("RGB")).copy()
    ownership = np.asarray(Image.open(OWNERSHIP_V03).convert("RGB")).copy()
    if master.shape != ownership.shape:
        raise ValueError(f"Master/ownership size mismatch: {master.shape} != {ownership.shape}")

    source_x, source_y, digit_width, digit_height = SOURCE_RECT
    source_master = master[source_y:source_y + digit_height, source_x:source_x + digit_width].copy()
    source_ownership = ownership[
        source_y:source_y + digit_height,
        source_x:source_x + digit_width,
    ].copy()
    source_foreground = np.any(source_master != 255, axis=2)
    source_colors = [
        tuple(int(channel) for channel in color)
        for color in np.unique(source_ownership[source_foreground], axis=0)
    ]
    if len(source_colors) != 7:
        raise ValueError(f"Expected seven independently colored segments in source 8, found {len(source_colors)}")

    segment_records: list[dict[str, object]] = []
    sorted_segments: list[tuple[tuple[int, int, int], np.ndarray, list[int]]] = []
    for color in source_colors:
        mask = np.all(source_ownership == color, axis=2) & source_foreground
        ys, xs = np.nonzero(mask)
        sorted_segments.append((color, mask, [
            int(xs.min()), int(ys.min()),
            int(xs.max() - xs.min() + 1), int(ys.max() - ys.min() + 1),
        ]))
    sorted_segments.sort(key=lambda item: (item[2][1], item[2][0]))

    used_colors = {
        tuple(int(channel) for channel in color)
        for color in np.unique(ownership.reshape(-1, 3), axis=0)
    }
    new_color_index = 300
    for digit_index, (digit_name, (target_x, target_y)) in enumerate(DIGIT_TARGETS.items()):
        target_slice = np.s_[target_y:target_y + digit_height, target_x:target_x + digit_width]
        master[target_slice] = 255
        ownership[target_slice] = 255
        target_master = master[target_slice]
        target_ownership = ownership[target_slice]
        target_master[source_foreground] = (16, 23, 18)

        for segment_index, (source_color, segment_mask, segment_rect) in enumerate(sorted_segments):
            if digit_name == "right_ones":
                target_color = source_color
            else:
                target_color = unique_color(new_color_index, used_colors)
                new_color_index += 1
            target_ownership[segment_mask] = target_color
            segment_records.append({
                "digit": digit_name,
                "segmentIndex": segment_index + 1,
                "sourceLocalRect": segment_rect,
                "ownershipColor": list(target_color),
                "status": "copied-seven-segment-candidate",
            })

    master_image = Image.fromarray(master, "RGB")
    ownership_image = Image.fromarray(ownership, "RGB")
    master_path = OUTPUT / "fire-lcd-all-on-master-confirmed-v03.png"
    ownership_path = OUTPUT / "fire-lcd-manual-ownership-user-v04.png"
    ownership_4x_path = OUTPUT / "fire-lcd-manual-recolor-user-v04-4x.png"
    review_path = OUTPUT / "fire-lcd-manual-ownership-review-v04-2x.png"
    master_image.save(master_path)
    ownership_image.save(ownership_path)
    ownership_image.resize(
        (ownership_image.width * SCALE, ownership_image.height * SCALE),
        Image.Resampling.NEAREST,
    ).save(ownership_4x_path)
    ownership_image.resize(
        (ownership_image.width * 2, ownership_image.height * 2),
        Image.Resampling.NEAREST,
    ).save(review_path)

    foreground = np.any(master != 255, axis=2)
    ownership_foreground = np.any(ownership != 255, axis=2)
    colors = np.unique(ownership[ownership_foreground], axis=0)
    metrics = {
        "version": 4,
        "status": "partial-user-confirmed-ownership-digit-copy-candidate",
        "masterSource": MASTER_V02.name,
        "masterSourceSha256": hashlib.sha256(MASTER_V02.read_bytes()).hexdigest(),
        "ownershipSource": OWNERSHIP_V03.name,
        "ownershipSourceSha256": hashlib.sha256(OWNERSHIP_V03.read_bytes()).hexdigest(),
        "digitTemplateRect": list(SOURCE_RECT),
        "digitTargets": {name: list(position) for name, position in DIGIT_TARGETS.items()},
        "digitSegmentCount": 7,
        "foregroundPixels": int(np.count_nonzero(foreground)),
        "ownershipColors": int(len(colors)),
        "reconstructionDifferentPixels": int(np.count_nonzero(foreground != ownership_foreground)),
        "confirmedGroupsPreserved": ["MISS", "GAME A", "GAME B"],
        "segments": segment_records,
        "warnings": [
            "The missing left-tens placement is inferred from spacing in the current confirmed master.",
            "Each of the four copied digits has seven independent candidate electrodes.",
            "The colon remains unchanged and independent.",
            "All non-digit ownership groups except MISS, GAME A and GAME B remain unconfirmed.",
        ],
    }
    (OUTPUT / "fire-lcd-manual-ownership-user-v04.json").write_text(
        json.dumps(metrics, ensure_ascii=False, indent=2) + "\n"
    )
    print(json.dumps({
        "foregroundPixels": metrics["foregroundPixels"],
        "ownershipColors": metrics["ownershipColors"],
        "reconstructionDifferentPixels": metrics["reconstructionDifferentPixels"],
        "digitTargets": metrics["digitTargets"],
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
