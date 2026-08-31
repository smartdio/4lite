#!/usr/bin/env python3
"""Attach reviewable OC-22 semantics and representative states to the manual LCD atlas."""

from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[2]
PREVIEW = ROOT / "docs/previews/octopus-handheld-v01"
PACKAGE = PREVIEW / "manual-segmentation/segment-package-v03"
MANIFEST = PACKAGE / "octopus-lcd-segments-v03.json"
COLOR_MAP = PREVIEW / "manual-segmentation/octopus-lcd-manual-recolor-normalized-v05.png"
DEVICE_BASE = PREVIEW / "octopus-oc22-photoreal-base-approved-v02.png"


DIGITS = {
    0: "abcdef", 1: "bc", 2: "abdeg", 3: "abcdg", 4: "bcfg",
    5: "acdfg", 6: "acdefg", 7: "abc", 8: "abcdefg", 9: "abcdfg",
}


SEMANTIC = {
    "segment.001": ("life.boat.0", "confirmed"),
    "segment.002": ("life.boat.1", "confirmed"),
    "segment.003": ("life.boat.2", "confirmed"),
    "segment.004": ("diver.caught.frame.0", "confirmed"),
    "segment.005": ("clock.am", "confirmed"),
    "segment.018": ("cargo.boat", "confirmed"),
    "segment.019": ("clock.colon", "confirmed"),
    "segment.020": ("clock.alarm", "confirmed"),
    "segment.025": ("clock.pm", "confirmed"),
    "segment.038": ("octopus.body", "confirmed"),
    "segment.039": ("diver.position.0", "confirmed"),
    "segment.043": ("cargo.position.0", "confirmed"),
    "segment.055": ("diver.position.1", "confirmed"),
    "segment.067": ("cargo.position.1", "confirmed"),
    "segment.066": ("diver.position.2", "confirmed"),
    "segment.074": ("cargo.position.2", "confirmed"),
    "segment.069": ("diver.position.3", "confirmed"),
    "segment.073": ("cargo.position.3", "confirmed"),
    "segment.070": ("diver.position.4", "confirmed"),
    "segment.071": ("cargo.position.4", "confirmed"),
    "segment.072": ("treasure.pickup.frame.0", "candidate"),
    "segment.075": ("treasure.pickup.frame.1", "candidate"),
}


CAUGHT_DIVER_STATIC = {
    "segment.046": "diver.caught.struggle.static.0",
    "segment.049": "diver.caught.struggle.static.1",
    "segment.054": "diver.caught.struggle.static.2",
}


CAUGHT_DIVER_FEET = {
    "segment.050": "diver.caught.struggle.leg.0.pose.0",
    "segment.056": "diver.caught.struggle.leg.0.pose.1",
    "segment.058": "diver.caught.struggle.leg.1.pose.0",
    "segment.060": "diver.caught.struggle.leg.1.pose.1",
}


CAUGHT_DIVER_FOOT_FRAMES = (
    ("segment.050", "segment.058"),
    ("segment.056", "segment.060"),
)


DIGIT_SEGMENTS = {
    0: {"a": "segment.006", "f": "segment.010", "b": "segment.011", "g": "segment.022", "e": "segment.030", "c": "segment.031", "d": "segment.034"},
    1: {"a": "segment.007", "f": "segment.012", "b": "segment.013", "g": "segment.021", "e": "segment.032", "c": "segment.026", "d": "segment.035"},
    2: {"a": "segment.008", "f": "segment.014", "b": "segment.015", "g": "segment.023", "e": "segment.027", "c": "segment.028", "d": "segment.036"},
    3: {"a": "segment.009", "f": "segment.016", "b": "segment.017", "g": "segment.024", "e": "segment.033", "c": "segment.029", "d": "segment.037"},
}


TENTACLE_PATHS = {
    "tentacle.0": {
        "base": ["segment.041"],
        "pathA": ["segment.042", "segment.040"],
        "pathB": ["segment.044", "segment.047", "segment.052"],
    },
    "tentacle.1": {
        "base": ["segment.045"],
        "pathA": ["segment.048", "segment.053", "segment.061", "segment.064"],
    },
    "tentacle.2": {
        "base": ["segment.051"],
        "pathA": ["segment.057", "segment.062", "segment.065"],
    },
    "tentacle.3": {
        "base": ["segment.059"],
        "pathA": ["segment.063", "segment.068"],
    },
}


def load_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for path in ("/System/Library/Fonts/PingFang.ttc", "/System/Library/Fonts/Supplemental/Arial.ttf"):
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def digit_ids(slot: int, value: int) -> set[str]:
    return {DIGIT_SEGMENTS[slot][bar] for bar in DIGITS[value]}


def tentacle_ids(name: str, length: int, path: str = "pathA") -> set[str]:
    definition = TENTACLE_PATHS[name]
    ordered = (
        list(definition["base"])
        + list(definition.get(path, definition.get("pathA", [])))
        + list(definition.get("sharedTail", []))
    )
    return set(ordered[:max(0, min(length, len(ordered)))])


def main() -> None:
    manifest = json.loads(MANIFEST.read_text())
    color_map = np.array(Image.open(COLOR_MAP).convert("RGB"))
    semantic_by_segment = dict(SEMANTIC)
    for segment_id, semantic_id in (CAUGHT_DIVER_STATIC | CAUGHT_DIVER_FEET).items():
        semantic_by_segment[segment_id] = (semantic_id, "confirmed")
    for slot, bars in DIGIT_SEGMENTS.items():
        for bar, segment_id in bars.items():
            semantic_by_segment[segment_id] = (f"digit.{slot}.{bar}", "confirmed")
    for tentacle_name, definition in TENTACLE_PATHS.items():
        for index, segment_id in enumerate(definition["base"]):
            semantic_by_segment[segment_id] = (f"{tentacle_name}.base.{index}", "candidate")
        for path_name in ("pathA", "pathB"):
            for index, segment_id in enumerate(definition.get(path_name, []), 1):
                semantic_by_segment[segment_id] = (f"{tentacle_name}.{path_name}.extension.{index}", "candidate")
        for index, segment_id in enumerate(definition.get("sharedTail", []), 1):
            semantic_by_segment[segment_id] = (f"{tentacle_name}.sharedTail.extension.{index}", "candidate")

    missing = sorted(set(manifest["segments"]) - set(semantic_by_segment))
    duplicate_semantics: dict[str, list[str]] = {}
    for segment_id, (semantic_id, _) in semantic_by_segment.items():
        duplicate_semantics.setdefault(semantic_id, []).append(segment_id)
    duplicate_semantics = {name: ids for name, ids in duplicate_semantics.items() if len(ids) > 1}
    if missing or duplicate_semantics:
        raise ValueError(f"Semantic coverage invalid: missing={missing}, duplicates={duplicate_semantics}")

    semantic_segments: dict[str, dict[str, object]] = {}
    for segment_id, record in manifest["segments"].items():
        semantic_id, confidence = semantic_by_segment[segment_id]
        semantic_segments[semantic_id] = {
            "atlasSegmentId": segment_id,
            "atlasRect": record["atlasRect"],
            "screenRect": record["screenRect"],
            "pixelCount": record["pixelCount"],
            "componentCount": record["componentCount"],
            "confidence": confidence,
        }

    states: list[tuple[str, set[str]]] = []
    clock_ids = {"segment.001", "segment.002", "segment.003", "segment.005", "segment.019", "segment.038"}
    for slot, value in enumerate((1, 2, 3, 4)):
        clock_ids |= digit_ids(slot, value)
    states.append(("TIME 12:34", clock_ids))

    score_zero = digit_ids(1, 0) | digit_ids(2, 0) | digit_ids(3, 0)
    life = {"segment.001", "segment.002", "segment.003"}
    body = {"segment.038"}
    bases = tentacle_ids("tentacle.0", 1) | tentacle_ids("tentacle.1", 1) | tentacle_ids("tentacle.2", 2) | tentacle_ids("tentacle.3", 1)
    states.append(("Game start", body | life | score_zero | {"segment.039"} | bases))

    mid_tentacles = (
        tentacle_ids("tentacle.0", 2, "pathA") | tentacle_ids("tentacle.1", 3) |
        tentacle_ids("tentacle.2", 4, "pathA") | tentacle_ids("tentacle.3", 2)
    )
    states.append(("Mid route", body | life | digit_ids(1, 1) | digit_ids(2, 2) | digit_ids(3, 3) | {"segment.066", "segment.074"} | mid_tentacles))

    full_tentacles = set()
    for name, definition in TENTACLE_PATHS.items():
        full_tentacles.update(definition["base"])
        full_tentacles.update(definition.get("pathA", []))
        full_tentacles.update(definition.get("pathB", []))
        full_tentacles.update(definition.get("sharedTail", []))
    states.append(("At treasure", body | life | digit_ids(1, 2) | digit_ids(2, 0) | digit_ids(3, 0) | {"segment.070", "segment.071", "segment.072"} | full_tentacles))
    states.append(("Caught upper pose", body | life | {"segment.004"} | full_tentacles))
    caught_static = body | life | set(CAUGHT_DIVER_STATIC) | full_tentacles
    for frame_index, foot_segments in enumerate(CAUGHT_DIVER_FOOT_FRAMES):
        states.append((f"Caught struggle {frame_index}", caught_static | set(foot_segments)))
    states.append(("All lit", set(manifest["segments"])))

    base = Image.open(DEVICE_BASE).convert("RGBA").crop((484, 262, 1152, 687)).resize((color_map.shape[1], color_map.shape[0]), Image.Resampling.LANCZOS)
    font = load_font(15)
    sheet_rows = math.ceil(len(states) / 2)
    sheet = Image.new("RGB", (color_map.shape[1] * 2, (color_map.shape[0] + 30) * sheet_rows), "#151817")
    sheet_draw = ImageDraw.Draw(sheet)
    color_by_segment = {segment_id: np.array(record["reviewColor"]) for segment_id, record in manifest["segments"].items()}
    for index, (label, visible) in enumerate(states):
        panel = base.copy()
        ink = np.zeros((color_map.shape[0], color_map.shape[1], 4), dtype=np.uint8)
        for segment_id in visible:
            mask = np.all(color_map == color_by_segment[segment_id], axis=2)
            ink[mask] = (30, 43, 39, 230)
        panel.alpha_composite(Image.fromarray(ink, "RGBA"))
        x, y = index % 2 * color_map.shape[1], index // 2 * (color_map.shape[0] + 30)
        sheet.paste(panel.convert("RGB"), (x, y + 30))
        sheet_draw.text((x + 8, y + 7), label, fill="#f1e8d2", font=font)
    sheet.save(PACKAGE / "octopus-lcd-semantic-states-candidate-v05.png")

    columns, cell_width, cell_height = 3, 390, 140
    ordered = sorted(semantic_segments.items(), key=lambda item: item[1]["atlasSegmentId"])
    contact = Image.new("RGB", (columns * cell_width, math.ceil(len(ordered) / columns) * cell_height), "#ece9df")
    contact_draw = ImageDraw.Draw(contact)
    label_font, detail_font = load_font(14), load_font(11)
    for index, (semantic_id, record) in enumerate(ordered):
        cell_x, cell_y = index % columns * cell_width, index // columns * cell_height
        contact_draw.rectangle((cell_x, cell_y, cell_x + cell_width - 1, cell_y + cell_height - 1), outline="#8f887c")
        contact_draw.text((cell_x + 8, cell_y + 6), f"{record['atlasSegmentId']}  {semantic_id}", fill="#222825", font=label_font)
        contact_draw.text((cell_x + 8, cell_y + 27), f"{record['confidence']}  px:{record['pixelCount']}  parts:{record['componentCount']}", fill="#555b57", font=detail_font)
        segment_color = color_by_segment[record["atlasSegmentId"]]
        mask = np.all(color_map == segment_color, axis=2)
        ys, xs = np.nonzero(mask)
        left, top, right, bottom = int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1
        preview = np.zeros((bottom - top, right - left, 4), dtype=np.uint8)
        preview[mask[top:bottom, left:right]] = (*[int(v) for v in segment_color], 255)
        preview_image = Image.fromarray(preview, "RGBA")
        preview_image.thumbnail((cell_width - 16, cell_height - 52), Image.Resampling.NEAREST)
        contact.paste(preview_image, (cell_x + (cell_width - preview_image.width) // 2, cell_y + 48), preview_image)
    contact.save(PACKAGE / "octopus-lcd-semantic-contact-sheet-candidate-v05.png")

    result = {
        "version": 5,
        "lcdLayoutVersion": manifest["lcdLayoutVersion"],
        "sourceManifest": MANIFEST.name,
        "referenceStructure": {
            "tentacleCount": 4,
            "alternatePaths": ["tentacle.0"],
            "pickupAnimationFrames": 2,
            "caughtDiverStruggleStatic": sorted(CAUGHT_DIVER_STATIC),
            "caughtDiverFootFrames": [list(frame) for frame in CAUGHT_DIVER_FOOT_FRAMES],
            "status": "four-tentacle grouping follows user markup; exact extension timing remains candidate",
        },
        "digitGlyphs": {str(value): list(bars) for value, bars in DIGITS.items()},
        "tentaclePaths": TENTACLE_PATHS,
        "segments": semantic_segments,
        "representativeStates": {label: sorted(ids) for label, ids in states},
        "validation": {
            "segmentCount": len(semantic_segments),
            "semanticCoverageMissing": 0,
            "duplicateSemanticIds": 0,
            "confirmedCount": sum(record["confidence"] == "confirmed" for record in semantic_segments.values()),
            "candidateCount": sum(record["confidence"] == "candidate" for record in semantic_segments.values()),
        },
    }
    (PACKAGE / "octopus-lcd-semantic-layout-candidate-v05.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(result["validation"], ensure_ascii=False))


if __name__ == "__main__":
    main()
