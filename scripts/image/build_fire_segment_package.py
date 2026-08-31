#!/usr/bin/env python3
"""Build the Fire FR-27 physical LCD atlas and Gate D QA package."""

from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[2]
PREVIEW = ROOT / "docs/previews/fire-handheld-v01/manual-segmentation"
COLOR_MAP = PREVIEW / "fire-lcd-manual-ownership-user-v06.png"
MASTER = PREVIEW / "fire-lcd-all-on-master-confirmed-v03.png"
OUTPUT = PREVIEW / "segment-package-v01"
ATLAS_WIDTH = 2048
PADDING = 2
INK = (16, 23, 18, 255)


def load_font(size: int):
    for path in ("/System/Library/Fonts/PingFang.ttc", "/System/Library/Fonts/Supplemental/Arial.ttf"):
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def components(mask: np.ndarray) -> int:
    height, width = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    result = 0
    for sy, sx in zip(*np.nonzero(mask)):
        if seen[sy, sx]:
            continue
        result += 1
        stack = [(int(sy), int(sx))]
        seen[sy, sx] = True
        while stack:
            y, x = stack.pop()
            for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                ny, nx = y + dy, x + dx
                if 0 <= ny < height and 0 <= nx < width and mask[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    stack.append((ny, nx))
    return result


def broad_group(left: int, top: int, right: int, bottom: int) -> str:
    cx, cy = (left + right) / 2, (top + bottom) / 2
    if cy < 225 and cx < 560:
        return "smoke-fire"
    if cy < 190 and 580 < cx < 1100:
        return "clock-score"
    if cy < 230 and cx > 1120:
        return "miss-status"
    if cy > 885 and cx < 450:
        return "mode-game-a"
    if cy > 885 and cx > 1150:
        return "mode-game-b"
    if cy > 780:
        return "bounce-animation"
    if cy > 620:
        return "stretcher-rescue"
    if cx > 1120:
        return "right-action"
    return "falling-person"


def pack(records: list[dict[str, object]]) -> tuple[int, dict[str, tuple[int, int]]]:
    ordered = sorted(records, key=lambda item: (-int(item["height"]), -int(item["width"]), str(item["id"])))
    positions: dict[str, tuple[int, int]] = {}
    x = y = row_height = 0
    for record in ordered:
        width, height = int(record["width"]) + PADDING * 2, int(record["height"]) + PADDING * 2
        if x and x + width > ATLAS_WIDTH:
            x = 0
            y += row_height
            row_height = 0
        positions[str(record["id"])] = (x + PADDING, y + PADDING)
        x += width
        row_height = max(row_height, height)
    used = y + row_height
    return 2 ** math.ceil(math.log2(max(1, used))), positions


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    ownership = np.asarray(Image.open(COLOR_MAP).convert("RGB"))
    master = np.asarray(Image.open(MASTER).convert("RGB"))
    foreground = np.any(ownership != 255, axis=2)
    expected_foreground = np.any(master != 255, axis=2)
    if ownership.shape != master.shape:
        raise ValueError("Ownership and master dimensions differ")
    unassigned = int(np.count_nonzero(expected_foreground & ~foreground))
    outside = int(np.count_nonzero(foreground & ~expected_foreground))

    records: list[dict[str, object]] = []
    for color in np.unique(ownership[foreground], axis=0):
        mask = np.all(ownership == color, axis=2)
        ys, xs = np.nonzero(mask)
        left, top, right, bottom = int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1
        records.append({
            "color": [int(value) for value in color], "mask": mask,
            "left": left, "top": top, "right": right, "bottom": bottom,
            "width": right - left, "height": bottom - top,
            "pixelCount": int(len(xs)), "componentCount": components(mask),
        })
    records.sort(key=lambda item: (int(item["top"]), int(item["left"]), int(item["bottom"]), int(item["right"])))
    for index, record in enumerate(records, 1):
        record["id"] = f"segment.{index:03d}"
        record["group"] = broad_group(int(record["left"]), int(record["top"]), int(record["right"]), int(record["bottom"]))

    atlas_height, positions = pack(records)
    atlas = np.zeros((atlas_height, ATLAS_WIDTH, 4), dtype=np.uint8)
    reconstructed = np.zeros((*foreground.shape, 4), dtype=np.uint8)
    manifest_segments: dict[str, dict[str, object]] = {}
    for record in records:
        segment_id = str(record["id"])
        left, top, right, bottom = map(int, (record["left"], record["top"], record["right"], record["bottom"]))
        mask = record["mask"]
        rgba = np.zeros_like(reconstructed)
        rgba[mask] = INK
        crop = rgba[top:bottom, left:right]
        ax, ay = positions[segment_id]
        atlas[ay:ay + crop.shape[0], ax:ax + crop.shape[1]] = crop
        visible = crop[..., 3] > 0
        reconstructed[top:bottom, left:right][visible] = crop[visible]
        manifest_segments[segment_id] = {
            "atlasRect": [ax, ay, crop.shape[1], crop.shape[0]],
            "screenRect": [left, top, crop.shape[1], crop.shape[0]],
            "pixelCount": int(record["pixelCount"]),
            "componentCount": int(record["componentCount"]),
            "reviewColor": record["color"],
            "group": record["group"],
            "semanticStatus": "candidate",
        }

    expected = np.zeros_like(reconstructed)
    expected[expected_foreground] = INK
    different = int(np.count_nonzero(np.any(expected != reconstructed, axis=2)))
    if unassigned or outside or different:
        raise ValueError(f"Gate D validation failed: unassigned={unassigned}, outside={outside}, different={different}")

    Image.fromarray(atlas, "RGBA").save(OUTPUT / "fire-lcd-segment-atlas-v01.png")
    Image.fromarray(reconstructed, "RGBA").save(OUTPUT / "fire-lcd-all-on-monochrome-v01.png")

    scale = 2
    numbered = Image.fromarray(ownership, "RGB").resize((ownership.shape[1] * scale, ownership.shape[0] * scale), Image.Resampling.NEAREST)
    draw = ImageDraw.Draw(numbered)
    font = load_font(13)
    for record in records:
        x = (int(record["left"]) + int(record["right"])) * scale // 2
        y = (int(record["top"]) + int(record["bottom"])) * scale // 2
        draw.text((x, y), str(record["id"]).split(".")[-1], fill="white", stroke_width=2, stroke_fill="black", font=font, anchor="mm")
    numbered.save(OUTPUT / "fire-lcd-segment-numbered-v01.png")

    columns, cell_width, cell_height = 4, 360, 190
    sheet = Image.new("RGB", (columns * cell_width, math.ceil(len(records) / columns) * cell_height), "#ece9df")
    sheet_draw = ImageDraw.Draw(sheet)
    label_font, detail_font = load_font(16), load_font(12)
    for index, record in enumerate(records):
        cell_x, cell_y = index % columns * cell_width, index // columns * cell_height
        sheet_draw.rectangle((cell_x, cell_y, cell_x + cell_width - 1, cell_y + cell_height - 1), outline="#8f887c")
        color = tuple(int(value) for value in record["color"])
        sheet_draw.rectangle((cell_x + 8, cell_y + 8, cell_x + 30, cell_y + 30), fill=color, outline="#333")
        sheet_draw.text((cell_x + 38, cell_y + 7), str(record["id"]), fill="#222825", font=label_font)
        sheet_draw.text((cell_x + 8, cell_y + 34), f"{record['group']}  px:{record['pixelCount']}  parts:{record['componentCount']}", fill="#555b57", font=detail_font)
        mask = record["mask"]
        left, top, right, bottom = map(int, (record["left"], record["top"], record["right"], record["bottom"]))
        preview = np.zeros((bottom - top, right - left, 4), dtype=np.uint8)
        preview[mask[top:bottom, left:right]] = (*color, 255)
        image = Image.fromarray(preview, "RGBA")
        image.thumbnail((cell_width - 20, cell_height - 68), Image.Resampling.NEAREST)
        sheet.paste(image, (cell_x + (cell_width - image.width) // 2, cell_y + 60), image)
    sheet.save(OUTPUT / "fire-lcd-segment-contact-sheet-v01.png")

    manifest = {
        "version": 1,
        "lcdLayoutVersion": "fire-manual-ownership-v06",
        "pixelSource": "user-confirmed-manual-color-ownership-map",
        "screenSize": [ownership.shape[1], ownership.shape[0]],
        "atlasSize": [ATLAS_WIDTH, atlas_height],
        "ownershipMap": COLOR_MAP.name,
        "ownershipMapSha256": hashlib.sha256(COLOR_MAP.read_bytes()).hexdigest(),
        "validation": {
            "segmentCount": len(records), "overlapPixels": 0,
            "unassignedPixels": unassigned, "outsidePixels": outside,
            "reconstructionDifferentPixels": different,
        },
        "segments": manifest_segments,
    }
    (OUTPUT / "fire-lcd-segments-v01.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"atlasSize": manifest["atlasSize"], **manifest["validation"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
