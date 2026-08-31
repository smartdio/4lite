#!/usr/bin/env python3
"""Apply the first user-confirmed FR-27 ownership merges to the v02 starter."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "docs/previews/fire-handheld-v01/manual-segmentation"
STARTER = OUTPUT / "fire-lcd-manual-recolor-starter-v02-4x.png"
STARTER_DATA = OUTPUT / "fire-lcd-manual-segmentation-starter-v02.json"
SCALE = 4

# User confirmation on 2026-08-22: letters within each label are one group.
# The three labels remain separate physical ownership groups.
CONFIRMED_MERGES = {
    "MISS": [4, 5, 6, 7],
    "GAME A": [84, 85, 86, 87, 88],
    "GAME B": [79, 80, 81, 82, 83],
}


def main() -> None:
    starter = Image.open(STARTER).convert("RGB")
    if starter.width % SCALE or starter.height % SCALE:
        raise ValueError("Starter dimensions are not divisible by the 4x editing scale")
    pixels_4x = np.asarray(starter)
    height, width = starter.height // SCALE, starter.width // SCALE
    blocks = pixels_4x.reshape(height, SCALE, width, SCALE, 3)
    if not np.all(blocks == blocks[:, :1, :, :1, :]):
        raise ValueError("Starter contains mixed 4x4 blocks")
    ownership = pixels_4x[::SCALE, ::SCALE].copy()

    source_data = json.loads(STARTER_DATA.read_text())
    records = {entry["visualIsland"]: entry for entry in source_data["visualIslands"]}
    merge_records: list[dict[str, object]] = []
    for label, island_ids in CONFIRMED_MERGES.items():
        target_color = tuple(records[island_ids[0]]["reviewColor"])
        changed_pixels = 0
        source_colors: list[list[int]] = []
        for island_id in island_ids:
            source_color = tuple(records[island_id]["reviewColor"])
            source_colors.append(list(source_color))
            mask = np.all(ownership == source_color, axis=2)
            changed_pixels += int(np.count_nonzero(mask & np.any(ownership != target_color, axis=2)))
            ownership[mask] = target_color
        merge_records.append({
            "label": label,
            "visualIslands": island_ids,
            "sourceColors": source_colors,
            "ownershipColor": list(target_color),
            "changedPixels": changed_pixels,
            "status": "user-confirmed-group",
        })

    ownership_image = Image.fromarray(ownership, "RGB")
    output_1x = OUTPUT / "fire-lcd-manual-ownership-user-v03.png"
    output_4x = OUTPUT / "fire-lcd-manual-recolor-user-v03-4x.png"
    output_review = OUTPUT / "fire-lcd-manual-ownership-review-v03-2x.png"
    ownership_image.save(output_1x)
    ownership_image.resize((width * SCALE, height * SCALE), Image.Resampling.NEAREST).save(output_4x)
    ownership_image.resize((width * 2, height * 2), Image.Resampling.NEAREST).save(output_review)

    colors = np.unique(ownership.reshape(-1, 3), axis=0)
    foreground_colors = [color.tolist() for color in colors if not np.all(color == 255)]
    metrics = {
        "version": 3,
        "status": "partial-user-confirmed-ownership",
        "source": STARTER.name,
        "sourceSha256": hashlib.sha256(STARTER.read_bytes()).hexdigest(),
        "editingScale": SCALE,
        "canvasSize": [width, height],
        "foregroundPixels": int(np.count_nonzero(np.any(ownership != 255, axis=2))),
        "ownershipColors": len(foreground_colors),
        "confirmedMerges": merge_records,
        "warnings": [
            "Only MISS, GAME A and GAME B have confirmed ownership grouping.",
            "All remaining colors are still automatic visual-island candidates.",
            "Do not generate a runtime atlas from this partial ownership map.",
        ],
    }
    (OUTPUT / "fire-lcd-manual-ownership-user-v03.json").write_text(
        json.dumps(metrics, ensure_ascii=False, indent=2) + "\n"
    )
    print(json.dumps({
        "foregroundPixels": metrics["foregroundPixels"],
        "ownershipColors": metrics["ownershipColors"],
        "confirmedGroups": list(CONFIRMED_MERGES),
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
