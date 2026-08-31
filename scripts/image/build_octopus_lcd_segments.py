#!/usr/bin/env python3
"""Build review-only OC-22 LCD segment masks from the approved ImageGen master."""

from __future__ import annotations

import hashlib
import json
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[2]
PREVIEW = ROOT / "docs/previews/octopus-handheld-v01"
SOURCE = PREVIEW / "octopus-lcd-master-approved-v01.png"
DEVICE = PREVIEW / "octopus-oc22-photoreal-base-approved-v02.png"
OUTPUT = PREVIEW / "segmentation-v02"
USER_MARKUP_BATCH_01 = PREVIEW / "annotations/segmentation-user-markup-batch-01.jpg"
ALPHA_THRESHOLD = 48

# Registration from the 603 x 405 pseudo-color sheet into the user's enlarged
# markup. It was solved from the unchanged colored pixels in that image.
MARKUP_SCALE = 2.414
MARKUP_OFFSET = (599, 266)

MANUAL_COMPONENTS = {
    # The five individually circled treasure electrodes.
    (71, 158, 23, 40): "cargo.position.0",
    (71, 300, 20, 33): "cargo.position.1",
    (185, 363, 29, 26): "cargo.position.2",
    (304, 360, 20, 34): "cargo.position.3",
    (356, 343, 27, 37): "cargo.position.4",
    # This disconnected fragment sits inside the circled green diver and is
    # part of that diver electrode, not a treasure electrode.
    (128, 324, 21, 19): "diver.position.2",
}


def components(mask: np.ndarray) -> list[list[tuple[int, int]]]:
    height, width = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    result: list[list[tuple[int, int]]] = []
    for y, x in zip(*np.nonzero(mask)):
        if seen[y, x]:
            continue
        queue = [(int(y), int(x))]
        seen[y, x] = True
        points: list[tuple[int, int]] = []
        while queue:
            current_y, current_x = queue.pop()
            points.append((current_y, current_x))
            for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                next_y, next_x = current_y + dy, current_x + dx
                if 0 <= next_y < height and 0 <= next_x < width and mask[next_y, next_x] and not seen[next_y, next_x]:
                    seen[next_y, next_x] = True
                    queue.append((next_y, next_x))
        result.append(points)
    return sorted(result, key=len, reverse=True)


def bounds(points: list[tuple[int, int]]) -> tuple[int, int, int, int]:
    ys = [point[0] for point in points]
    xs = [point[1] for point in points]
    return min(xs), min(ys), max(xs) + 1, max(ys) + 1


def markup_octopus_body_mask(screen_size: tuple[int, int]) -> np.ndarray:
    """Fill the largest closed black outline in the user's first markup."""
    markup = np.array(Image.open(USER_MARKUP_BATCH_01).convert("RGB"))
    black = np.max(markup, axis=2) < 90
    height, width = black.shape
    seen = np.zeros_like(black, dtype=bool)
    black_components: list[list[tuple[int, int]]] = []
    for start_y, start_x in zip(*np.nonzero(black)):
        if seen[start_y, start_x]:
            continue
        stack = [(int(start_y), int(start_x))]
        seen[start_y, start_x] = True
        points: list[tuple[int, int]] = []
        while stack:
            y, x = stack.pop()
            points.append((y, x))
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    if not dx and not dy:
                        continue
                    next_y, next_x = y + dy, x + dx
                    if 0 <= next_y < height and 0 <= next_x < width and black[next_y, next_x] and not seen[next_y, next_x]:
                        seen[next_y, next_x] = True
                        stack.append((next_y, next_x))
        black_components.append(points)

    outline = max(black_components, key=len)
    barrier = np.zeros_like(black, dtype=bool)
    for y, x in outline:
        barrier[y, x] = True
    # Seal sub-pixel/JPEG gaps before the outside flood fill.
    for _ in range(2):
        expanded = barrier.copy()
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                expanded[max(0, dy):height + min(0, dy), max(0, dx):width + min(0, dx)] |= barrier[max(0, -dy):height - max(0, dy), max(0, -dx):width - max(0, dx)]
        barrier = expanded

    ys = [point[0] for point in outline]
    xs = [point[1] for point in outline]
    left, top = max(0, min(xs) - 4), max(0, min(ys) - 4)
    right, bottom = min(width, max(xs) + 5), min(height, max(ys) + 5)
    local_barrier = barrier[top:bottom, left:right]
    outside = np.zeros_like(local_barrier, dtype=bool)
    queue: deque[tuple[int, int]] = deque()
    local_height, local_width = local_barrier.shape
    for x in range(local_width):
        for y in (0, local_height - 1):
            if not local_barrier[y, x] and not outside[y, x]:
                outside[y, x] = True; queue.append((y, x))
    for y in range(local_height):
        for x in (0, local_width - 1):
            if not local_barrier[y, x] and not outside[y, x]:
                outside[y, x] = True; queue.append((y, x))
    while queue:
        y, x = queue.popleft()
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            next_y, next_x = y + dy, x + dx
            if 0 <= next_y < local_height and 0 <= next_x < local_width and not local_barrier[next_y, next_x] and not outside[next_y, next_x]:
                outside[next_y, next_x] = True
                queue.append((next_y, next_x))
    filled = np.zeros_like(black, dtype=bool)
    filled[top:bottom, left:right] = ~outside

    screen_width, screen_height = screen_size
    source_mask = np.zeros((screen_height, screen_width), dtype=bool)
    offset_x, offset_y = MARKUP_OFFSET
    for y in range(screen_height):
        markup_y = min(height - 1, round(offset_y + y * MARKUP_SCALE))
        for x in range(screen_width):
            markup_x = min(width - 1, round(offset_x + x * MARKUP_SCALE))
            source_mask[y, x] = filled[markup_y, markup_x]
    return source_mask


def diver_zone(cx: float, cy: float) -> int | None:
    zones = (
        (0, 100, 95, 205),
        (0, 115, 205, 335),
        (95, 225, 275, 405),
        (220, 335, 285, 405),
        (365, 470, 285, 405),
    )
    for index, (left, right, top, bottom) in enumerate(zones):
        if left <= cx < right and top <= cy < bottom:
            return index
    return None


def tentacle_branch(cx: float, cy: float) -> int:
    if cy < 190 and cx < 360:
        return 0
    if cx < 275:
        return 1
    if cx < 385:
        return 2
    return 3


def tentacle_stage(cx: float, cy: float) -> int:
    distance = ((cx - 365) ** 2 + (cy - 175) ** 2) ** 0.5
    return 0 if distance < 90 else 1 if distance < 165 else 2


def digit_bar(rect: tuple[int, int, int, int], slot: int) -> str:
    left, top, right, bottom = rect
    cx, cy = (left + right) / 2, (top + bottom) / 2
    slot_left = (254, 303, 370, 416)[slot]
    local_x, local_y = cx - slot_left, cy
    if right - left > bottom - top:
        return "a" if local_y < 22 else "g" if local_y < 40 else "d"
    return ("f" if local_x < 16 else "b") if local_y < 28 else ("e" if local_x < 16 else "c")


def digit_slot(rect: tuple[int, int, int, int]) -> int | None:
    left, top, right, bottom = rect
    cx, cy = (left + right) / 2, (top + bottom) / 2
    if cy >= 70:
        return None
    for slot, (slot_left, slot_right) in enumerate(((250, 292), (298, 342), (363, 405), (410, 454))):
        if slot_left <= cx < slot_right:
            return slot
    return None


def split_digit(points: list[tuple[int, int]], slot: int, labels: dict[str, list[tuple[int, int]]]) -> None:
    left = (254, 303, 370, 416)[slot]
    centers = {
        "a": (left + 15, 7), "g": (left + 15, 29), "d": (left + 15, 51),
        "f": (left + 4, 18), "b": (left + 27, 18),
        "e": (left + 4, 41), "c": (left + 27, 41),
    }
    for y, x in points:
        def distance(item: tuple[str, tuple[int, int]]) -> float:
            name, (center_x, center_y) = item
            if name in "agd":
                return abs(y - center_y) + max(0, abs(x - center_x) - 8) * 1.5
            return abs(x - center_x) + max(0, abs(y - center_y) - 7) * 1.5
        bar = min(centers.items(), key=distance)[0]
        labels.setdefault(f"digit.{slot}.{bar}", []).append((y, x))


def component_name(rect: tuple[int, int, int, int], size: int, ordinal: int) -> str:
    left, top, right, bottom = rect
    manual_name = MANUAL_COMPONENTS.get((left, top, right - left, bottom - top))
    if manual_name is not None:
        return manual_name
    cx, cy = (left + right) / 2, (top + bottom) / 2
    if cy < 95 and cx < 195:
        life = 0 if cx < 78 else 1 if cx < 132 else 2
        return f"life.boat.{life}" if size > 600 else f"cargo.boat.{life}"
    if 195 <= cx < 250 and cy < 70:
        return "clock.am" if cy < 27 else "clock.pm"
    for slot, (slot_left, slot_right) in enumerate(((250, 292), (298, 342), (363, 405), (410, 454))):
        if slot_left <= cx < slot_right and cy < 70:
            return f"digit.{slot}.{digit_bar(rect, slot)}"
    if 338 <= cx < 363 and cy < 70:
        return "clock.colon"
    if 454 <= cx < 505 and cy < 80:
        return "clock.alarm"
    if cx >= 500 and cy < 145:
        return "caught.upper"
    zone = diver_zone(cx, cy)
    if zone is not None:
        return f"diver.position.{zone}" if size > 650 else f"candidate.unresolved.{ordinal}"
    if 235 <= cx < 385 and 175 <= cy < 305:
        return "diver.caught"
    branch = tentacle_branch(cx, cy)
    stage = tentacle_stage(cx, cy)
    return f"tentacle.{branch}.extension.{stage}.{ordinal}"


def split_primary(points: list[tuple[int, int]], labels: dict[str, list[tuple[int, int]]]) -> None:
    for y, x in points:
        in_head = ((x - 468) / 105) ** 2 + ((y - 145) / 76) ** 2 <= 1
        in_core = ((x - 365) / 76) ** 2 + ((y - 171) / 67) ** 2 <= 1
        if in_head or in_core:
            name = "octopus.body"
        else:
            branch = tentacle_branch(x, y)
            stage = tentacle_stage(x, y)
            name = f"tentacle.{branch}.extension.{stage}"
        labels.setdefault(name, []).append((y, x))


def apply_user_correction_batch_01(labels: dict[str, list[tuple[int, int]]], body_mask: np.ndarray) -> None:
    """Apply only the merges explicitly drawn in the user's first markup."""
    body_points = labels.setdefault("octopus.body", [])
    for name in list(labels):
        if name == "octopus.body":
            continue
        kept: list[tuple[int, int]] = []
        for y, x in labels[name]:
            if body_mask[y, x]:
                body_points.append((y, x))
            else:
                kept.append((y, x))
        if kept:
            labels[name] = kept
        else:
            del labels[name]


def color_for(index: int) -> tuple[int, int, int, int]:
    hue = (index * 0.61803398875) % 1
    import colorsys
    red, green, blue = colorsys.hsv_to_rgb(hue, 0.72, 0.92)
    return int(red * 255), int(green * 255), int(blue * 255), 255


def load_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for path in ("/System/Library/Fonts/PingFang.ttc", "/System/Library/Fonts/Supplemental/Arial.ttf"):
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    source = Image.open(SOURCE).convert("RGBA")
    rgba = np.array(source)
    foreground = rgba[:, :, 3] >= ALPHA_THRESHOLD
    found = components(foreground)
    labels: dict[str, list[tuple[int, int]]] = {}
    split_primary(found[0], labels)
    for ordinal, points in enumerate(found[1:]):
        if len(points) < 12:
            continue
        slot = digit_slot(bounds(points))
        if slot is not None:
            split_digit(points, slot, labels)
            continue
        name = component_name(bounds(points), len(points), ordinal)
        labels.setdefault(name, []).extend(points)
    apply_user_correction_batch_01(labels, markup_octopus_body_mask((rgba.shape[1], rgba.shape[0])))

    height, width = foreground.shape
    ownership = np.full((height, width), -1, dtype=np.int16)
    names = sorted(labels)
    overlap = 0
    for index, name in enumerate(names):
        for y, x in labels[name]:
            if ownership[y, x] >= 0:
                overlap += 1
            ownership[y, x] = index
    assigned = ownership >= 0
    unassigned = int(np.count_nonzero(foreground & ~assigned))
    outside = int(np.count_nonzero(assigned & ~foreground))

    pseudo = np.zeros((height, width, 4), dtype=np.uint8)
    for index in range(len(names)):
        pseudo[ownership == index] = color_for(index)
    Image.fromarray(pseudo, "RGBA").save(OUTPUT / "octopus-lcd-segment-pseudocolor-v02.png")

    segment_records: dict[str, dict[str, object]] = {}
    segment_images: list[tuple[str, Image.Image]] = []
    for index, name in enumerate(names):
        ys, xs = np.nonzero(ownership == index)
        left, top, right, bottom = int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1
        segment = np.zeros_like(rgba)
        keep = ownership == index
        segment[keep] = rgba[keep]
        crop = Image.fromarray(segment, "RGBA").crop((left, top, right, bottom))
        segment_images.append((name, crop))
        segment_records[name] = {
            "sourceRect": [left, top, right - left, bottom - top],
            "pixelCount": int(np.count_nonzero(keep)),
            "group": name.rsplit(".", 1)[0],
        }

    font = load_font(15)
    cell_width, cell_height, columns = 300, 150, 4
    rows = (len(segment_images) + columns - 1) // columns
    sheet = Image.new("RGB", (cell_width * columns, cell_height * rows), "#e8e5dc")
    draw = ImageDraw.Draw(sheet)
    for index, (name, segment) in enumerate(segment_images):
        cell_x, cell_y = index % columns * cell_width, index // columns * cell_height
        draw.rectangle((cell_x, cell_y, cell_x + cell_width - 1, cell_y + cell_height - 1), outline="#8e877a")
        preview = segment.copy(); preview.thumbnail((cell_width - 20, cell_height - 38), Image.Resampling.LANCZOS)
        sheet.paste(preview, (cell_x + (cell_width - preview.width) // 2, cell_y + 26), preview)
        draw.text((cell_x + 8, cell_y + 6), name, fill="#242b28", font=font)
    sheet.save(OUTPUT / "octopus-lcd-segment-contact-sheet-v02.png")

    base = Image.open(DEVICE).convert("RGBA").crop((484, 262, 1152, 687)).resize((width, height), Image.Resampling.LANCZOS)
    states = [
        ("TIME / all digits", {name for name in names if name.startswith(("clock.", "digit.", "life."))} | {"octopus.body"}),
        ("Game start", {"octopus.body", "diver.position.0", "life.boat.0", "life.boat.1", "life.boat.2"} | {name for name in names if name.startswith("tentacle.") and ".extension.0" in name}),
        ("Mid route", {"octopus.body", "diver.position.2"} | {name for name in names if name.startswith("tentacle.") and any(token in name for token in (".extension.0", ".extension.1"))}),
        ("At treasure", {"octopus.body", "diver.position.4", "cargo.position.4"} | {name for name in names if name.startswith("tentacle.")}),
        ("Caught", {"octopus.body", "diver.caught", "caught.upper"} | {name for name in names if name.startswith("tentacle.")}),
        ("All lit", set(names)),
    ]
    state_sheet = Image.new("RGB", (width * 2, (height + 30) * 3), "#171a19")
    state_draw = ImageDraw.Draw(state_sheet)
    for index, (label, visible) in enumerate(states):
        panel = base.copy()
        layer = np.zeros_like(rgba)
        for name in visible:
            if name in names:
                layer[ownership == names.index(name)] = rgba[ownership == names.index(name)]
        overlay = Image.fromarray(layer, "RGBA")
        panel.alpha_composite(overlay)
        x, y = index % 2 * width, index // 2 * (height + 30)
        state_sheet.paste(panel.convert("RGB"), (x, y + 30))
        state_draw.text((x + 8, y + 7), label, fill="#f1e8d2", font=font)
    state_sheet.save(OUTPUT / "octopus-lcd-animation-states-v02.png")

    manifest = {
        "version": 2,
        "manualCorrections": ["user-markup-batch-01"],
        "source": SOURCE.name,
        "sourceSha256": hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
        "screenSize": [width, height],
        "alphaThreshold": ALPHA_THRESHOLD,
        "validation": {"overlapPixels": overlap, "unassignedPixels": unassigned, "outsidePixels": outside},
        "segments": segment_records,
    }
    (OUTPUT / "octopus-lcd-segments-candidate-v02.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"segments": len(names), **manifest["validation"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
