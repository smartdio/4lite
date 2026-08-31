#!/usr/bin/env python3
"""Build the OC-22 atlas and QA package from the user-approved manual color ownership map."""

from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[2]
PREVIEW = ROOT / "docs/previews/octopus-handheld-v01"
COLOR_MAP = PREVIEW / "manual-segmentation/octopus-lcd-manual-recolor-normalized-v05.png"
OUTPUT = PREVIEW / "manual-segmentation/segment-package-v03"
ATLAS_WIDTH = 1024
ATLAS_PADDING = 2
INK_RGBA = (0, 0, 0, 255)


def load_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for path in ("/System/Library/Fonts/PingFang.ttc", "/System/Library/Fonts/Supplemental/Arial.ttf"):
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def connected_component_count(mask: np.ndarray) -> int:
    height, width = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    count = 0
    for start_y, start_x in zip(*np.nonzero(mask)):
        if seen[start_y, start_x]:
            continue
        count += 1
        stack = [(int(start_y), int(start_x))]
        seen[start_y, start_x] = True
        while stack:
            y, x = stack.pop()
            for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                next_y, next_x = y + dy, x + dx
                if 0 <= next_y < height and 0 <= next_x < width and mask[next_y, next_x] and not seen[next_y, next_x]:
                    seen[next_y, next_x] = True
                    stack.append((next_y, next_x))
    return count


def broad_group(rect: tuple[int, int, int, int], pixel_count: int) -> str:
    left, top, right, bottom = rect
    center_x, center_y = (left + right) / 2, (top + bottom) / 2
    if bottom <= 95 and right < 195:
        return "life"
    if bottom <= 70 and 195 <= left < 250:
        return "clock-label"
    if bottom <= 75 and 250 <= left < 455:
        return "clock-digit"
    if bottom <= 85 and 455 <= left < 505:
        return "alarm"
    if left >= 500 and top < 145:
        return "caught-upper"
    if pixel_count > 10000:
        return "octopus-body"
    diver_zones = (
        (0, 100, 95, 205), (0, 145, 205, 340), (95, 225, 275, 405),
        (220, 335, 285, 405), (350, 485, 285, 405),
    )
    for index, (zone_left, zone_right, zone_top, zone_bottom) in enumerate(diver_zones):
        if zone_left <= center_x < zone_right and zone_top <= center_y < zone_bottom:
            return f"diver-zone-{index}"
    return "tentacle-or-caught"


def pack_segments(segments: list[dict[str, object]]) -> tuple[int, dict[str, tuple[int, int]]]:
    ordered = sorted(segments, key=lambda item: (-int(item["height"]), -int(item["width"]), str(item["id"])))
    positions: dict[str, tuple[int, int]] = {}
    cursor_x = cursor_y = row_height = 0
    for segment in ordered:
        width = int(segment["width"]) + ATLAS_PADDING * 2
        height = int(segment["height"]) + ATLAS_PADDING * 2
        if cursor_x and cursor_x + width > ATLAS_WIDTH:
            cursor_x = 0
            cursor_y += row_height
            row_height = 0
        positions[str(segment["id"])] = (cursor_x + ATLAS_PADDING, cursor_y + ATLAS_PADDING)
        cursor_x += width
        row_height = max(row_height, height)
    used_height = cursor_y + row_height
    atlas_height = 2 ** math.ceil(math.log2(max(1, used_height)))
    return atlas_height, positions


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    color_map = np.array(Image.open(COLOR_MAP).convert("RGB"))
    colored = np.any(color_map != 255, axis=2)
    foreground = colored
    overlap = 0
    unassigned = 0
    outside = 0

    colors = np.unique(color_map[colored], axis=0)
    records: list[dict[str, object]] = []
    for color in colors:
        mask = np.all(color_map == color, axis=2)
        ys, xs = np.nonzero(mask)
        left, top, right, bottom = int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1
        records.append({
            "color": [int(value) for value in color],
            "mask": mask,
            "left": left, "top": top, "right": right, "bottom": bottom,
            "width": right - left, "height": bottom - top,
            "pixelCount": int(len(xs)),
            "componentCount": connected_component_count(mask),
        })
    records.sort(key=lambda item: (int(item["top"]), int(item["left"]), int(item["bottom"]), int(item["right"])))
    for index, record in enumerate(records, 1):
        record["id"] = f"segment.{index:03d}"
        record["group"] = broad_group(
            (int(record["left"]), int(record["top"]), int(record["right"]), int(record["bottom"])),
            int(record["pixelCount"]),
        )

    atlas_height, atlas_positions = pack_segments(records)
    atlas = np.zeros((atlas_height, ATLAS_WIDTH, 4), dtype=np.uint8)
    manifest_segments: dict[str, dict[str, object]] = {}
    reconstructed = np.zeros((color_map.shape[0], color_map.shape[1], 4), dtype=np.uint8)
    for record in records:
        segment_id = str(record["id"])
        left, top = int(record["left"]), int(record["top"])
        right, bottom = int(record["right"]), int(record["bottom"])
        mask = record["mask"]
        segment = np.zeros_like(reconstructed)
        segment[mask] = INK_RGBA
        crop = segment[top:bottom, left:right]
        atlas_x, atlas_y = atlas_positions[segment_id]
        atlas[atlas_y:atlas_y + crop.shape[0], atlas_x:atlas_x + crop.shape[1]] = crop
        visible = crop[:, :, 3] > 0
        destination = reconstructed[top:bottom, left:right]
        destination[visible] = crop[visible]
        manifest_segments[segment_id] = {
            "atlasRect": [atlas_x, atlas_y, crop.shape[1], crop.shape[0]],
            "screenRect": [left, top, crop.shape[1], crop.shape[0]],
            "pixelCount": int(record["pixelCount"]),
            "componentCount": int(record["componentCount"]),
            "reviewColor": record["color"],
            "group": record["group"],
            "semanticStatus": "candidate",
        }

    expected = np.zeros_like(reconstructed)
    expected[foreground] = INK_RGBA
    different = np.any(reconstructed != expected, axis=2)
    different_pixels = int(np.count_nonzero(different))
    if different_pixels:
        raise ValueError(f"Atlas reconstruction differs from the manual ownership silhouette at {different_pixels} pixels")

    Image.fromarray(atlas, "RGBA").save(OUTPUT / "octopus-lcd-segment-atlas-v03.png")
    Image.fromarray(reconstructed, "RGBA").save(OUTPUT / "octopus-lcd-all-on-monochrome-v03.png")
    review = Image.new("RGB", (color_map.shape[1], color_map.shape[0]), "white")
    review.paste(Image.fromarray(reconstructed, "RGBA"), (0, 0), Image.fromarray(reconstructed, "RGBA"))
    review.resize((color_map.shape[1] * 3, color_map.shape[0] * 3), Image.Resampling.NEAREST).save(
        OUTPUT / "octopus-lcd-all-on-monochrome-review-v03.png"
    )

    # Numbered pseudo-color map. Labels are intentionally small; the contact
    # sheet is the authoritative place to inspect tiny digit electrodes.
    scale = 3
    numbered = Image.fromarray(color_map, "RGB").resize((color_map.shape[1] * scale, color_map.shape[0] * scale), Image.Resampling.NEAREST)
    draw = ImageDraw.Draw(numbered)
    font = load_font(11)
    for record in records:
        x = (int(record["left"]) + int(record["right"])) * scale // 2
        y = (int(record["top"]) + int(record["bottom"])) * scale // 2
        label = str(record["id"]).split(".")[-1]
        draw.text((x, y), label, fill="white", stroke_width=2, stroke_fill="black", font=font, anchor="mm")
    numbered.save(OUTPUT / "octopus-lcd-segment-numbered-v03.png")

    columns, cell_width, cell_height = 4, 300, 155
    rows = math.ceil(len(records) / columns)
    sheet = Image.new("RGB", (columns * cell_width, rows * cell_height), "#ece9df")
    sheet_draw = ImageDraw.Draw(sheet)
    label_font = load_font(15)
    detail_font = load_font(12)
    for index, record in enumerate(records):
        cell_x, cell_y = index % columns * cell_width, index // columns * cell_height
        sheet_draw.rectangle((cell_x, cell_y, cell_x + cell_width - 1, cell_y + cell_height - 1), outline="#8f887c")
        color = tuple(int(value) for value in record["color"])
        sheet_draw.rectangle((cell_x + 8, cell_y + 7, cell_x + 27, cell_y + 26), fill=color, outline="#3a3935")
        sheet_draw.text((cell_x + 34, cell_y + 7), str(record["id"]), fill="#222825", font=label_font)
        detail = f"{record['group']}  px:{record['pixelCount']}  parts:{record['componentCount']}"
        sheet_draw.text((cell_x + 8, cell_y + 31), detail, fill="#555b57", font=detail_font)
        mask = record["mask"]
        ys, xs = np.nonzero(mask)
        left, top, right, bottom = int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1
        preview = np.zeros((bottom - top, right - left, 4), dtype=np.uint8)
        local_mask = mask[top:bottom, left:right]
        preview[local_mask] = (*color, 255)
        preview_image = Image.fromarray(preview, "RGBA")
        preview_image.thumbnail((cell_width - 20, cell_height - 60), Image.Resampling.NEAREST)
        sheet.paste(preview_image, (cell_x + (cell_width - preview_image.width) // 2, cell_y + 55), preview_image)
    sheet.save(OUTPUT / "octopus-lcd-segment-contact-sheet-v03.png")

    manifest = {
        "version": 3,
        "lcdLayoutVersion": "manual-color-v05",
        "pixelSource": "manual-color-ownership-map",
        "inkColor": list(INK_RGBA[:3]),
        "screenSize": [color_map.shape[1], color_map.shape[0]],
        "atlasSize": [ATLAS_WIDTH, atlas_height],
        "ownershipMap": COLOR_MAP.name,
        "ownershipMapSha256": hashlib.sha256(COLOR_MAP.read_bytes()).hexdigest(),
        "validation": {
            "segmentCount": len(records),
            "overlapPixels": overlap,
            "unassignedPixels": unassigned,
            "outsidePixels": outside,
            "reconstructionDifferentPixels": different_pixels,
        },
        "segments": manifest_segments,
    }
    (OUTPUT / "octopus-lcd-segments-v03.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"atlasSize": manifest["atlasSize"], **manifest["validation"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
