#!/usr/bin/env python3
"""Build candidate ownership groups for the FR-27 bottom bounce animations."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "docs/previews/fire-handheld-v01/manual-segmentation"
SOURCE = OUTPUT / "fire-lcd-manual-ownership-user-v05.png"
STARTER_DATA = OUTPUT / "fire-lcd-manual-segmentation-starter-v02.json"
SCALE = 4

# Each candidate combines one bounced/fallen figure with its flanking motion
# marks. The three horizontal positions remain independent.
CANDIDATE_MERGES = {
    "bounce_left": [64, 72, 67, 75, 77],
    "bounce_center": [65, 71, 70, 74, 78],
    "bounce_right": [66, 68, 69, 73, 76],
}

# The four smoke/fire silhouettes are already separate visual islands and must
# remain separately controllable animation electrodes.
INDEPENDENT_SMOKE_ISLANDS = [1, 2, 15, 24]


def main() -> None:
    ownership = np.asarray(Image.open(SOURCE).convert("RGB")).copy()
    source_data = json.loads(STARTER_DATA.read_text())
    records = {entry["visualIsland"]: entry for entry in source_data["visualIslands"]}
    merge_records: list[dict[str, object]] = []

    for label, island_ids in CANDIDATE_MERGES.items():
        target_color = tuple(records[island_ids[0]]["reviewColor"])
        matched_pixels = 0
        source_colors: list[list[int]] = []
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

    smoke_records: list[dict[str, object]] = []
    for island_id in INDEPENDENT_SMOKE_ISLANDS:
        record = records[island_id]
        color = tuple(record["reviewColor"])
        pixel_count = int(np.count_nonzero(np.all(ownership == color, axis=2)))
        if pixel_count == 0:
            raise ValueError(f"Smoke island {island_id} is missing from the source ownership map")
        smoke_records.append({
            "visualIsland": island_id,
            "ownershipColor": list(color),
            "foregroundPixels": pixel_count,
            "status": "candidate-independent-animation-electrode",
        })

    ownership_image = Image.fromarray(ownership, "RGB")
    output_1x = OUTPUT / "fire-lcd-manual-ownership-candidate-v06.png"
    output_4x = OUTPUT / "fire-lcd-manual-recolor-candidate-v06-4x.png"
    output_review = OUTPUT / "fire-lcd-manual-ownership-review-v06-2x.png"
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
        "version": 6,
        "status": "smoke-and-bounce-grouping-candidate",
        "source": SOURCE.name,
        "sourceSha256": hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
        "editingScale": SCALE,
        "foregroundPixels": int(np.count_nonzero(foreground)),
        "ownershipColors": int(len(colors)),
        "candidateBounceMerges": merge_records,
        "candidateIndependentSmoke": smoke_records,
        "preservedConfirmedAreas": [
            "GAME A", "GAME B", "MISS", "AM", "PM", "three miss icons",
            "four seven-segment digits", "colon",
        ],
        "warnings": [
            "Smoke independence and bounce/action-mark grouping await user confirmation.",
            "No runtime atlas may be generated from this candidate.",
        ],
    }
    (OUTPUT / "fire-lcd-manual-ownership-candidate-v06.json").write_text(
        json.dumps(metrics, ensure_ascii=False, indent=2) + "\n"
    )
    print(json.dumps({
        "foregroundPixels": metrics["foregroundPixels"],
        "ownershipColors": metrics["ownershipColors"],
        "candidateBounceGroups": list(CANDIDATE_MERGES),
        "independentSmokeGroups": len(INDEPENDENT_SMOKE_ISLANDS),
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
