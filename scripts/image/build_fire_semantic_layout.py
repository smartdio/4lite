#!/usr/bin/env python3
"""Attach playable Fire FR-27 semantics to the frozen 77-segment atlas."""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
PREVIEW = ROOT / "docs/previews/fire-handheld-v01/manual-segmentation"
PACKAGE = PREVIEW / "segment-package-v01"
MANIFEST = PACKAGE / "fire-lcd-segments-v01.json"
DIGIT_SOURCE = PREVIEW / "fire-lcd-manual-ownership-user-v04.json"

DIGIT_NAMES = {"left_tens": 0, "left_ones": 1, "right_tens": 2, "right_ones": 3}
SEGMENT_INDEX_TO_BAR = {1: "a", 2: "f", 3: "b", 4: "g", 5: "e", 6: "c", 7: "d"}
DIGIT_GLYPHS = {
    "0": list("abcdef"), "1": list("bc"), "2": list("abdeg"), "3": list("abcdg"),
    "4": list("bcfg"), "5": list("acdfg"), "6": list("acdefg"), "7": list("abc"),
    "8": list("abcdefg"), "9": list("abcdfg"),
}

STATIC_SEMANTICS = {
    "segment.001": "smoke.frame.0", "segment.002": "smoke.frame.1",
    "segment.018": "smoke.frame.2", "segment.034": "smoke.frame.3",
    "segment.007": "status.miss.label", "segment.016": "clock.am", "segment.035": "clock.pm",
    "segment.017": "clock.colon.top", "segment.036": "clock.colon.bottom",
    "segment.031": "miss.icon.0", "segment.032": "miss.icon.1", "segment.033": "miss.icon.2",
    "segment.069": "stretcher.position.0", "segment.072": "stretcher.position.1", "segment.070": "stretcher.position.2",
    "segment.073": "crash.position.0", "segment.074": "crash.position.1", "segment.075": "crash.position.2",
    "segment.077": "mode.gameA", "segment.076": "mode.gameB",
}

ESCAPE_STAGES = [
    ["segment.041", "segment.046", "segment.052", "segment.057", "segment.062"],
    ["segment.063", "segment.055", "segment.044", "segment.042", "segment.045", "segment.056", "segment.066"],
    ["segment.064", "segment.054", "segment.047", "segment.053", "segment.061"],
]
# The right-side pieces were previously treated as mutually exclusive whole
# frames. The final hand-off needs the main figure (043) held while the small
# occluded pieces animate against the printed ambulance.
DELIVERY_FRAMES = [
    ["segment.060"], ["segment.065"], ["segment.059"], ["segment.049"], ["segment.048"],
    ["segment.043"], ["segment.043", "segment.050"],
    ["segment.043", "segment.051"], ["segment.043", "segment.058"],
]
CARRIED = ["segment.068", "segment.071", "segment.067"]
SMOKE_COMBINATIONS = [
    ["segment.002"],
    ["segment.002", "segment.001"],
    ["segment.001", "segment.018"],
    ["segment.001", "segment.018", "segment.034"],
    ["segment.001", "segment.018", "segment.034", "segment.002"],
    ["segment.018", "segment.034"],
    ["segment.034"],
    ["segment.034", "segment.002"],
]


def main() -> None:
    manifest = json.loads(MANIFEST.read_text())
    digit_data = json.loads(DIGIT_SOURCE.read_text())
    color_to_segment = {
        tuple(record["reviewColor"]): segment_id
        for segment_id, record in manifest["segments"].items()
    }
    semantic_by_segment = dict(STATIC_SEMANTICS)
    digit_slots: dict[str, dict[str, str]] = {str(index): {} for index in range(4)}
    for record in digit_data["segments"]:
        slot = DIGIT_NAMES[record["digit"]]
        bar = SEGMENT_INDEX_TO_BAR[int(record["segmentIndex"])]
        segment_id = color_to_segment[tuple(record["ownershipColor"])]
        semantic_by_segment[segment_id] = f"digit.{slot}.{bar}"
        digit_slots[str(slot)][bar] = segment_id

    for stage, route in enumerate(ESCAPE_STAGES):
        for step, segment_id in enumerate(route):
            semantic_by_segment[segment_id] = f"escape.stage.{stage}.step.{step}"
    delivery_segments = list(dict.fromkeys(segment for frame in DELIVERY_FRAMES for segment in frame))
    for index, segment_id in enumerate(delivery_segments):
        semantic_by_segment[segment_id] = f"delivery.part.{index}"
    for lane, segment_id in enumerate(CARRIED):
        semantic_by_segment[segment_id] = f"carried.position.{lane}"

    missing = sorted(set(manifest["segments"]) - set(semantic_by_segment))
    duplicates: dict[str, list[str]] = {}
    for segment_id, semantic_id in semantic_by_segment.items():
        duplicates.setdefault(semantic_id, []).append(segment_id)
    duplicates = {key: value for key, value in duplicates.items() if len(value) > 1}
    if missing or duplicates:
        raise ValueError(f"Semantic coverage failed: missing={missing}, duplicates={duplicates}")

    segments = {}
    for segment_id, semantic_id in semantic_by_segment.items():
        record = manifest["segments"][segment_id]
        segments[semantic_id] = {
            "atlasSegmentId": segment_id,
            "atlasRect": record["atlasRect"], "screenRect": record["screenRect"],
            "pixelCount": record["pixelCount"], "componentCount": record["componentCount"],
            "confidence": "confirmed" if not semantic_id.startswith(("escape.", "delivery.")) else "video-calibrated-candidate",
        }

    result = {
        "version": 1,
        "lcdLayoutVersion": manifest["lcdLayoutVersion"],
        "sourceManifest": MANIFEST.name,
        "digitGlyphs": DIGIT_GLYPHS,
        "digitSlots": digit_slots,
        "smokeFrames": [f"smoke.frame.{index}" for index in range(4)],
        "smokeCombinations": SMOKE_COMBINATIONS,
        "escapeStages": [[semantic_by_segment[segment_id] for segment_id in route] for route in ESCAPE_STAGES],
        "deliveryFrames": [[semantic_by_segment[segment_id] for segment_id in frame] for frame in DELIVERY_FRAMES],
        "gameBEntrySteps": [0, 2],
        "stretcherPositions": [f"stretcher.position.{index}" for index in range(3)],
        "crashPositions": [f"crash.position.{index}" for index in range(3)],
        "carriedPositions": [f"carried.position.{index}" for index in range(3)],
        "segments": segments,
        "representativeStates": {
            "allLit": sorted(manifest["segments"]),
            "gameAStart": ["segment.077", "segment.007", "segment.069"],
            "gameBStart": ["segment.076", "segment.007", "segment.069"],
            "threeMisses": ["segment.007", "segment.031", "segment.032", "segment.033"],
        },
        "validation": {
            "segmentCount": len(segments), "semanticCoverageMissing": 0,
            "duplicateSemanticIds": 0,
            "confirmedCount": sum(record["confidence"] == "confirmed" for record in segments.values()),
            "candidateCount": sum(record["confidence"] != "confirmed" for record in segments.values()),
        },
        "gameplayStatus": "Continuous three-bounce route follows original-device video; exact millisecond timing remains candidate.",
    }
    (PACKAGE / "fire-lcd-semantic-layout-v02.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({**result["validation"], "stageLengths": [len(route) for route in ESCAPE_STAGES], "deliveryFrames": len(DELIVERY_FRAMES)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
