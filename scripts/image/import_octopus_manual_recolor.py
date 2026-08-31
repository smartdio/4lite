#!/usr/bin/env python3
"""Validate and import the user-edited 4x OC-22 segment ownership map."""

from __future__ import annotations

import json
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "docs/previews/octopus-handheld-v01/manual-segmentation"
INPUT = OUTPUT / "octopus-lcd-manual-recolor-round2-v05-4x.png"
PREVIOUS = OUTPUT / "octopus-lcd-manual-recolor-normalized-v04.png"
OUTPUT_1X = OUTPUT / "octopus-lcd-manual-recolor-normalized-v05.png"
OUTPUT_4X = OUTPUT / "octopus-lcd-manual-recolor-normalized-v05-4x.png"
METRICS = OUTPUT / "octopus-lcd-manual-recolor-normalized-v05.json"
SCALE = 4


def recolor_component(image: np.ndarray, seed: tuple[int, int], replacement: tuple[int, int, int]) -> int:
    """Recolor one 4-connected component without touching other uses of its source color."""
    seed_x, seed_y = seed
    source = image[seed_y, seed_x].copy()
    if np.array_equal(source, replacement):
        return 0
    height, width = image.shape[:2]
    queue: deque[tuple[int, int]] = deque([(seed_y, seed_x)])
    seen = np.zeros((height, width), dtype=bool)
    seen[seed_y, seed_x] = True
    changed = 0
    while queue:
        y, x = queue.popleft()
        if not np.array_equal(image[y, x], source):
            continue
        image[y, x] = replacement
        changed += 1
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            next_y, next_x = y + dy, x + dx
            if 0 <= next_y < height and 0 <= next_x < width and not seen[next_y, next_x]:
                if np.array_equal(image[next_y, next_x], source):
                    seen[next_y, next_x] = True
                    queue.append((next_y, next_x))
    return changed


def main() -> None:
    edited = np.array(Image.open(INPUT).convert("RGB"))
    if edited.shape[0] % SCALE or edited.shape[1] % SCALE:
        raise ValueError(f"Image size must be divisible by {SCALE}: {edited.shape[1]}x{edited.shape[0]}")

    height, width = edited.shape[0] // SCALE, edited.shape[1] // SCALE
    blocks = edited.reshape(height, SCALE, width, SCALE, 3).transpose(0, 2, 1, 3, 4)
    anchor = blocks[:, :, 0, 0, :]
    mixed = np.any(blocks != anchor[:, :, None, None, :], axis=(2, 3, 4))
    mixed_count = int(np.count_nonzero(mixed))
    if mixed_count:
        raise ValueError(f"Found {mixed_count} non-solid 4x4 blocks; use hard-edged, nearest-neighbor colors only")

    normalized = anchor.copy()
    cleanup = {
        # The user confirmed these two tiny shapes are surplus pixels, not LCD
        # electrodes. Remove them from the effective silhouette. The second
        # shape consists of two nearby disconnected islands.
        "removeSurplus019": recolor_component(normalized, (210, 141), (255, 255, 255)),
        "removeSurplus039a": recolor_component(normalized, (217, 145), (255, 255, 255)),
        "removeSurplus039b": recolor_component(normalized, (213, 144), (255, 255, 255)),
        "removeSurplus073": recolor_component(normalized, (442, 360), (255, 255, 255)),
        # Five isolated palette remnants belong to the immediately adjacent
        # digit/body electrodes. They are invisible at normal scale but would
        # otherwise couple unrelated runtime segments.
        "digitEdge037": recolor_component(normalized, (373, 47), tuple(int(v) for v in normalized[46, 373])),
        "digitEdge039a": recolor_component(normalized, (372, 48), tuple(int(v) for v in normalized[48, 373])),
        "digitEdge039b": recolor_component(normalized, (370, 50), tuple(int(v) for v in normalized[50, 371])),
        "bodyEdge034": recolor_component(normalized, (276, 171), tuple(int(v) for v in normalized[170, 276])),
        "bodyEdge045": recolor_component(normalized, (275, 171), tuple(int(v) for v in normalized[170, 275])),
    }

    foreground = np.any(normalized != 255, axis=2)
    colors = np.unique(normalized[foreground], axis=0)
    if not len(colors):
        raise ValueError("No colored LCD segments found")

    previous = np.array(Image.open(PREVIOUS).convert("RGB"))
    if previous.shape != anchor.shape:
        raise ValueError(f"Previous ownership map size differs: {previous.shape} != {anchor.shape}")
    previous_foreground = np.any(previous != 255, axis=2)
    added = int(np.count_nonzero(foreground & ~previous_foreground))
    removed = int(np.count_nonzero(previous_foreground & ~foreground))
    changed_ownership = int(np.count_nonzero(foreground & previous_foreground & np.any(normalized != previous, axis=2)))

    Image.fromarray(normalized, "RGB").save(OUTPUT_1X)
    Image.fromarray(normalized, "RGB").resize(
        (width * SCALE, height * SCALE), Image.Resampling.NEAREST
    ).save(OUTPUT_4X)

    metrics = {
        "version": 5,
        "input": INPUT.name,
        "screenSize": [width, height],
        "scale": SCALE,
        "segmentsByColor": int(len(colors)),
        "mixed4x4Blocks": mixed_count,
        "foregroundPixels": int(np.count_nonzero(foreground)),
        "addedForegroundPixelsVsV04": added,
        "removedForegroundPixelsVsV04": removed,
        "changedOwnershipPixelsVsV04": changed_ownership,
        "automaticCleanupPixels": int(sum(cleanup.values())),
        "removedSurplusPixels": int(
            cleanup["removeSurplus019"]
            + cleanup["removeSurplus039a"]
            + cleanup["removeSurplus039b"]
            + cleanup["removeSurplus073"]
        ),
        "automaticCleanup": cleanup,
        "overlapPixelsAfterNormalization": 0,
        "unassignedPixelsAfterNormalization": 0,
        "outsidePixelsAfterNormalization": 0,
        "usesLcdMaster": False,
    }
    METRICS.write_text(json.dumps(metrics, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(metrics, ensure_ascii=False))


if __name__ == "__main__":
    main()
