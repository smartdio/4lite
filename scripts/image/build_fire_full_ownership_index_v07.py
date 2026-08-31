#!/usr/bin/env python3
"""Build full-canvas and smoke-detail indices for the current FR-27 ownership map."""

from __future__ import annotations

import hashlib
import json
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "docs/previews/fire-handheld-v01/manual-segmentation"
SOURCE = OUTPUT / "fire-lcd-manual-ownership-user-v06.png"
FULL_SCALE = 2
SMOKE_SCALE = 4
SMOKE_RECT = (180, 35, 560, 225)
CONTACT_SCALE = 2
CONTACT_HEADER = 48


def component_count(mask: np.ndarray) -> int:
    height, width = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    count = 0
    for start_y, start_x in zip(*np.nonzero(mask)):
        if seen[start_y, start_x]:
            continue
        count += 1
        queue = deque([(int(start_y), int(start_x))])
        seen[start_y, start_x] = True
        while queue:
            y, x = queue.popleft()
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    if not (dx or dy):
                        continue
                    next_y, next_x = y + dy, x + dx
                    if 0 <= next_y < height and 0 <= next_x < width:
                        if mask[next_y, next_x] and not seen[next_y, next_x]:
                            seen[next_y, next_x] = True
                            queue.append((next_y, next_x))
    return count


def main() -> None:
    ownership_image = Image.open(SOURCE).convert("RGB")
    ownership = np.asarray(ownership_image)
    colors = [
        tuple(int(channel) for channel in color)
        for color in np.unique(ownership.reshape(-1, 3), axis=0)
        if not np.all(color == 255)
    ]

    raw_groups: list[dict[str, object]] = []
    for color in colors:
        mask = np.all(ownership == color, axis=2)
        ys, xs = np.nonzero(mask)
        raw_groups.append({
            "color": list(color),
            "rect": [
                int(xs.min()), int(ys.min()),
                int(xs.max() - xs.min() + 1), int(ys.max() - ys.min() + 1),
            ],
            "foregroundPixels": int(len(xs)),
            "connectedIslands": component_count(mask),
        })
    raw_groups.sort(key=lambda group: (group["rect"][1], group["rect"][0]))

    for index, group in enumerate(raw_groups, 1):
        group["physicalCandidate"] = f"P{index:03d}"
        x, y, width, height = group["rect"]
        group["smokeRegion"] = bool(
            x < SMOKE_RECT[2] and x + width > SMOKE_RECT[0]
            and y < SMOKE_RECT[3] and y + height > SMOKE_RECT[1]
        )

    full_review = ownership_image.resize(
        (ownership_image.width * FULL_SCALE, ownership_image.height * FULL_SCALE),
        Image.Resampling.NEAREST,
    )
    full_draw = ImageDraw.Draw(full_review)
    full_font = ImageFont.load_default(size=14)
    for group in raw_groups:
        x, y, width, height = group["rect"]
        full_draw.text(
            (x * FULL_SCALE, max(0, y * FULL_SCALE - 15)),
            group["physicalCandidate"],
            font=full_font,
            fill=(0, 0, 0),
            stroke_width=2,
            stroke_fill=(255, 255, 255),
        )
    full_path = OUTPUT / "fire-lcd-full-ownership-index-review-v07-2x.png"
    full_review.save(full_path)

    smoke_crop = ownership_image.crop(SMOKE_RECT)
    smoke_review = smoke_crop.resize(
        (smoke_crop.width * SMOKE_SCALE, smoke_crop.height * SMOKE_SCALE),
        Image.Resampling.NEAREST,
    )
    smoke_draw = ImageDraw.Draw(smoke_review)
    smoke_font = ImageFont.load_default(size=18)
    smoke_left, smoke_top, _, _ = SMOKE_RECT
    smoke_groups = [group for group in raw_groups if group["smokeRegion"]]
    for group in smoke_groups:
        x, y, width, height = group["rect"]
        smoke_draw.text(
            ((x - smoke_left) * SMOKE_SCALE, max(0, (y - smoke_top) * SMOKE_SCALE - 20)),
            group["physicalCandidate"],
            font=smoke_font,
            fill=(0, 0, 0),
            stroke_width=3,
            stroke_fill=(255, 255, 255),
        )
    smoke_path = OUTPUT / "fire-lcd-smoke-index-review-v07-4x.png"
    smoke_review.save(smoke_path)

    # A contact sheet removes all label-direction ambiguity: every panel uses
    # the same coordinates and shows exactly one smoke ownership group.
    smoke_width = SMOKE_RECT[2] - SMOKE_RECT[0]
    smoke_height = SMOKE_RECT[3] - SMOKE_RECT[1]
    panel_width = smoke_width * CONTACT_SCALE
    panel_height = smoke_height * CONTACT_SCALE + CONTACT_HEADER
    contact_sheet = Image.new("RGB", (panel_width * 2, panel_height * 2), (238, 238, 232))
    contact_draw = ImageDraw.Draw(contact_sheet)
    contact_font = ImageFont.load_default(size=22)
    for panel_index, group in enumerate(smoke_groups):
        panel_x = (panel_index % 2) * panel_width
        panel_y = (panel_index // 2) * panel_height
        isolated = np.full((smoke_height, smoke_width, 3), 255, dtype=np.uint8)
        color = tuple(group["color"])
        source_mask = np.all(ownership == color, axis=2)
        crop_mask = source_mask[
            SMOKE_RECT[1]:SMOKE_RECT[3],
            SMOKE_RECT[0]:SMOKE_RECT[2],
        ]
        isolated[crop_mask] = color
        isolated_image = Image.fromarray(isolated, "RGB").resize(
            (panel_width, smoke_height * CONTACT_SCALE),
            Image.Resampling.NEAREST,
        )
        contact_sheet.paste(isolated_image, (panel_x, panel_y + CONTACT_HEADER))
        contact_draw.text(
            (panel_x + 16, panel_y + 11),
            f"{group['physicalCandidate']}  |  independent smoke candidate",
            font=contact_font,
            fill=(0, 0, 0),
        )
    contact_path = OUTPUT / "fire-lcd-smoke-contact-sheet-v07.png"
    contact_sheet.save(contact_path)

    metrics = {
        "version": 7,
        "status": "full-ownership-index-review",
        "source": SOURCE.name,
        "sourceSha256": hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
        "canvasSize": list(ownership_image.size),
        "physicalCandidateGroups": len(raw_groups),
        "smokeCandidateGroups": len(smoke_groups),
        "smokeRect": list(SMOKE_RECT),
        "smokeContactSheet": contact_path.name,
        "warnings": [
            "P-numbers are current ownership candidates, not final physical segment IDs.",
            "The smoke detail currently contains four candidate groups; touching contours may still require manual splitting.",
            "No runtime atlas may be generated until the user confirms every group.",
        ],
        "groups": raw_groups,
    }
    (OUTPUT / "fire-lcd-full-ownership-index-review-v07.json").write_text(
        json.dumps(metrics, ensure_ascii=False, indent=2) + "\n"
    )
    print(json.dumps({
        "physicalCandidateGroups": metrics["physicalCandidateGroups"],
        "smokeCandidateGroups": metrics["smokeCandidateGroups"],
        "fullReviewSize": list(full_review.size),
        "smokeReviewSize": list(smoke_review.size),
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
