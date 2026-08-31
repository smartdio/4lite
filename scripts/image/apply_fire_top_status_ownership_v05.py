#!/usr/bin/env python3
"""Apply candidate ownership grouping for FR-27 top status indicators."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "docs/previews/fire-handheld-v01/manual-segmentation"
SOURCE = OUTPUT / "fire-lcd-manual-ownership-user-v04.png"
STARTER_DATA = OUTPUT / "fire-lcd-manual-segmentation-starter-v02.json"
SCALE = 4

# Visual-island IDs come from the deterministic v02 index. These regions were
# untouched by the later four-digit reconstruction.
CANDIDATE_MERGES = {
    "AM": [12, 13],
    "PM": [25, 26],
    "miss_icon_left": [21, 29],
    "miss_icon_center": [22, 30],
    "miss_icon_right": [23, 28],
}


def main() -> None:
    ownership = np.asarray(Image.open(SOURCE).convert("RGB")).copy()
    source_data = json.loads(STARTER_DATA.read_text())
    records = {entry["visualIsland"]: entry for entry in source_data["visualIslands"]}
    merge_records: list[dict[str, object]] = []

    for label, island_ids in CANDIDATE_MERGES.items():
        target_color = tuple(records[island_ids[0]]["reviewColor"])
        source_colors: list[list[int]] = []
        matched_pixels = 0
        for island_id in island_ids:
            source_color = tuple(records[island_id]["reviewColor"])
            source_colors.append(list(source_color))
            mask = np.all(ownership == source_color, axis=2)
            pixel_count = int(np.count_nonzero(mask))
            if pixel_count == 0:
                raise ValueError(f"No pixels found for visual island {island_id} ({label})")
            matched_pixels += pixel_count
            ownership[mask] = target_color
        merge_records.append({
            "label": label,
            "visualIslands": island_ids,
            "sourceColors": source_colors,
            "ownershipColor": list(target_color),
            "foregroundPixels": matched_pixels,
            "status": "candidate-awaiting-user-confirmation",
        })

    ownership_image = Image.fromarray(ownership, "RGB")
    output_1x = OUTPUT / "fire-lcd-manual-ownership-candidate-v05.png"
    output_4x = OUTPUT / "fire-lcd-manual-recolor-candidate-v05-4x.png"
    output_review = OUTPUT / "fire-lcd-manual-ownership-review-v05-2x.png"
    ownership_image.save(output_1x)
    ownership_image.resize(
        (ownership_image.width * SCALE, ownership_image.height * SCALE),
        Image.Resampling.NEAREST,
    ).save(output_4x)
    ownership_image.resize(
        (ownership_image.width * 2, ownership_image.height * 2),
        Image.Resampling.NEAREST,
    ).save(output_review)

    foreground = np.any(ownership != 255, axis=2)
    colors = np.unique(ownership[foreground], axis=0)
    metrics = {
        "version": 5,
        "status": "top-status-grouping-candidate",
        "source": SOURCE.name,
        "sourceSha256": hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
        "editingScale": SCALE,
        "foregroundPixels": int(np.count_nonzero(foreground)),
        "ownershipColors": int(len(colors)),
        "candidateMerges": merge_records,
        "preservedConfirmedAreas": [
            "GAME A", "GAME B", "MISS", "four seven-segment digits", "colon",
        ],
        "warnings": [
            "AM, PM and the three miss-icon pairings await user confirmation.",
            "No runtime atlas may be generated from this candidate.",
        ],
    }
    (OUTPUT / "fire-lcd-manual-ownership-candidate-v05.json").write_text(
        json.dumps(metrics, ensure_ascii=False, indent=2) + "\n"
    )
    print(json.dumps({
        "foregroundPixels": metrics["foregroundPixels"],
        "ownershipColors": metrics["ownershipColors"],
        "candidateGroups": list(CANDIDATE_MERGES),
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
