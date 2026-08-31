#!/usr/bin/env python3
"""Build readable, compressed document-viewer images without keeping them decoded."""

from pathlib import Path
import json

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
EPHEMERA = ROOT / "assets/source/school-ephemera"
COMPOSITIONS = EPHEMERA / "composition-pages"
OUTPUT = ROOT / "public/assets/textures/document-viewer-runtime"
MANIFEST = ROOT / "artifacts/document-viewer-runtime-manifest.json"

TEXTBOOKS = {
    "chinese": [f"textbook-chinese-{index:02d}-restored-v01" for index in range(3, 11)],
    "history": ["textbook-history-upper-restored-v01", "textbook-history-lower-restored-v01"],
    "math": [f"textbook-math-{index:02d}-restored-v01" for index in [1, 2, 3, 4, 5, 6, 8, 9, 10]],
}
WORKBOOKS = [
    "workbook-cover-arithmetic-v01", "workbook-cover-homework-green-v01",
    "workbook-cover-homework-red-v01", "workbook-cover-language-v01",
    "workbook-cover-math-v01", "workbook-cover-square-grid-v01",
]
COMPOSITION_STEMS = [
    "composition-century-clean-city-v01", "composition-century-home-v01",
    "composition-century-moon-sea-v01", "composition-future-school-v01",
    "composition-future-world-v01", "composition-meaningful-bus-seat-v01",
    "composition-meaningful-wallet-v01", "composition-my-ideal-immortal-v01",
    "composition-my-ideal-postman-v01", "composition-my-ideal-projectionist-v01",
    "composition-my-ideal-strongman-v01", "composition-my-ideal-zoo-director-v01",
    "composition-small-ink-spill-v01",
]


def jobs():
    for subject, stems in TEXTBOOKS.items():
        for stem in stems:
            yield stem, EPHEMERA / "textbooks" / subject / f"{stem}-master.png", 640, 66, "textbook"
    for stem in WORKBOOKS:
        yield stem, EPHEMERA / "workbooks" / f"{stem}-master.png", 640, 66, "workbook"
    for stem in COMPOSITION_STEMS:
        yield stem, COMPOSITIONS / f"{stem}.png", 768, 62, "composition"


def main():
    planned = list(jobs())
    missing = [str(source.relative_to(ROOT)) for _, source, *_ in planned if not source.is_file()]
    if missing:
        raise SystemExit(f"Missing document viewer sources: {', '.join(missing)}")
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for old in OUTPUT.glob("*.webp"):
        old.unlink()

    files = []
    for stem, source, longest_edge, quality, kind in planned:
        destination = OUTPUT / f"{stem}.webp"
        with Image.open(source) as original:
            image = original.convert("RGB")
            image.thumbnail((longest_edge, longest_edge), Image.Resampling.LANCZOS)
            image.save(destination, "WEBP", quality=quality, method=6)
            width, height = image.size
        files.append({
            "id": stem, "kind": kind,
            "file": destination.relative_to(ROOT).as_posix(),
            "source": source.relative_to(ROOT).as_posix(),
            "width": width, "height": height, "quality": quality,
            "bytes": destination.stat().st_size,
        })

    total = sum(item["bytes"] for item in files)
    if len(files) != 38:
        raise SystemExit(f"Expected 38 viewer documents, generated {len(files)}")
    if total > 2_500_000:
        raise SystemExit(f"Viewer documents exceed 2,500,000 B: {total:,} B")
    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(json.dumps({
        "version": 1,
        "policy": "books max 640px q66; compositions max 768px q62; compressed blobs preloaded, one image decoded at a time",
        "files": files,
        "textureBytes": total,
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Generated {len(files)} viewer documents ({total:,} bytes)")


if __name__ == "__main__":
    main()
