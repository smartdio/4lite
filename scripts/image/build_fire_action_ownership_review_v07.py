#!/usr/bin/env python3
"""Build the FR-27 action-area ownership review without merging silhouettes."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "docs/previews/fire-handheld-v01/manual-segmentation"
SOURCE = OUTPUT / "fire-lcd-manual-ownership-user-v06.png"
STARTER_DATA = OUTPUT / "fire-lcd-manual-segmentation-starter-v02.json"
SCALE = 4
REVIEW_SCALE = 2
REVIEW_RECT = (0, 0, 1536, 1024)

FALLING_FIGURES = [
    32, 33, 35, 36, 37, 38, 43, 44, 45, 46, 47, 48,
    51, 52, 53, 54, 55, 56, 57,
]
RIGHT_ACTION_POSES = [34, 39, 40, 41, 42, 49, 50]
STRETCHER_TEAMS = [60, 63, 61]
STRETCHER_FIGURES = [59, 62, 58]


def main() -> None:
    ownership_image = Image.open(SOURCE).convert("RGB")
    ownership = np.asarray(ownership_image)
    source_data = json.loads(STARTER_DATA.read_text())
    records = {entry["visualIsland"]: entry for entry in source_data["visualIslands"]}

    groups = {
        "fallingFigures": FALLING_FIGURES,
        "rightActionPoses": RIGHT_ACTION_POSES,
        "stretcherTeams": STRETCHER_TEAMS,
        "stretcherFigures": STRETCHER_FIGURES,
    }
    classified = [island_id for ids in groups.values() for island_id in ids]
    if sorted(classified) != list(range(32, 64)):
        raise ValueError("Action classification must cover visual islands C032-C063 exactly once")

    candidates: list[dict[str, object]] = []
    for category, island_ids in groups.items():
        for island_id in island_ids:
            record = records[island_id]
            color = tuple(record["reviewColor"])
            pixel_count = int(np.count_nonzero(np.all(ownership == color, axis=2)))
            if pixel_count == 0:
                raise ValueError(f"Visual island {island_id} is missing from the v06 ownership map")
            candidates.append({
                "visualIsland": island_id,
                "category": category,
                "rect": record["rect"],
                "ownershipColor": list(color),
                "foregroundPixels": pixel_count,
                "status": "candidate-independent-electrode",
            })

    candidate_1x = OUTPUT / "fire-lcd-manual-ownership-candidate-v07.png"
    candidate_4x = OUTPUT / "fire-lcd-manual-recolor-candidate-v07-4x.png"
    ownership_image.save(candidate_1x)
    ownership_image.resize(
        (ownership_image.width * SCALE, ownership_image.height * SCALE),
        Image.Resampling.NEAREST,
    ).save(candidate_4x)

    crop = ownership_image.crop(REVIEW_RECT)
    review = crop.resize(
        (crop.width * REVIEW_SCALE, crop.height * REVIEW_SCALE),
        Image.Resampling.NEAREST,
    )
    draw = ImageDraw.Draw(review)
    font = ImageFont.load_default(size=15)
    crop_left, crop_top, _, _ = REVIEW_RECT
    for record in candidates:
        x, y, width, height = record["rect"]
        label_x = (x - crop_left) * REVIEW_SCALE
        label_y = max(0, (y - crop_top) * REVIEW_SCALE - 17)
        draw.text(
            (label_x, label_y),
            f"C{record['visualIsland']:03d}",
            font=font,
            fill=(0, 0, 0),
            stroke_width=2,
            stroke_fill=(255, 255, 255),
        )
    review.save(OUTPUT / "fire-lcd-action-index-review-v07-2x.png")

    foreground = np.any(ownership != 255, axis=2)
    colors = np.unique(ownership[foreground], axis=0)
    metrics = {
        "version": 7,
        "status": "action-area-independence-candidate",
        "source": SOURCE.name,
        "sourceSha256": hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
        "editingScale": SCALE,
        "reviewRect": list(REVIEW_RECT),
        "foregroundPixels": int(np.count_nonzero(foreground)),
        "ownershipColors": int(len(colors)),
        "candidateRule": "Each classified action silhouette remains an independent electrode; no new merges.",
        "categories": groups,
        "candidates": candidates,
        "warnings": [
            "The labels describe visual categories, not verified original-game semantics.",
            "Any detached island belonging to another silhouette must be corrected by the user.",
            "No runtime atlas may be generated from this candidate.",
        ],
    }
    (OUTPUT / "fire-lcd-manual-ownership-candidate-v07.json").write_text(
        json.dumps(metrics, ensure_ascii=False, indent=2) + "\n"
    )
    print(json.dumps({
        "foregroundPixels": metrics["foregroundPixels"],
        "ownershipColors": metrics["ownershipColors"],
        "reviewedActionIslands": len(candidates),
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
