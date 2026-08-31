#!/usr/bin/env python3
"""Build the production-only school book covers directly from PNG masters."""

from pathlib import Path
import json
import shutil

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "assets/source/school-ephemera"
OUTPUT = ROOT / "public/assets/textures/school-books-runtime"
MANIFEST = ROOT / "artifacts/school-books-runtime-manifest.json"

TEXTBOOKS = {
    "chinese": [f"textbook-chinese-{index:02d}-restored-v01" for index in range(3, 11)],
    "history": ["textbook-history-upper-restored-v01", "textbook-history-lower-restored-v01"],
    "math": [f"textbook-math-{index:02d}-restored-v01" for index in [1, 2, 3, 4, 5, 6, 8, 9, 10]],
}
WORKBOOKS = [
    "workbook-cover-arithmetic-v01",
    "workbook-cover-homework-green-v01",
    "workbook-cover-homework-red-v01",
    "workbook-cover-language-v01",
    "workbook-cover-math-v01",
    "workbook-cover-square-grid-v01",
]


def jobs():
    for subject, stems in TEXTBOOKS.items():
        for stem in stems:
            source = SOURCE / "textbooks" / subject / f"{stem}-master.png"
            yield source, Path("textbooks") / subject / f"{stem}.webp", "textbook", 90
    for stem in WORKBOOKS:
        source = SOURCE / "workbooks" / f"{stem}-master.png"
        yield source, Path("workbooks") / f"{stem}.webp", "workbook", 88


def output_size(image, kind):
    if kind == "workbook":
        return 224, 320
    width, height = image.size
    scale = 320 / max(width, height)
    return max(1, round(width * scale)), max(1, round(height * scale))


def main():
    planned = list(jobs())
    missing = [str(source.relative_to(ROOT)) for source, *_ in planned if not source.is_file()]
    if missing:
        raise SystemExit(f"Missing school book masters: {', '.join(missing)}")

    if OUTPUT.exists():
        shutil.rmtree(OUTPUT)
    OUTPUT.mkdir(parents=True)
    manifest = []

    for source, relative, kind, quality in planned:
        destination = OUTPUT / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        with Image.open(source) as original:
            size = output_size(original, kind)
            image = original.convert("RGB").resize(size, Image.Resampling.LANCZOS)
            image.save(destination, "WEBP", quality=quality, method=6)
        manifest.append({
            "file": relative.as_posix(),
            "source": source.relative_to(ROOT).as_posix(),
            "kind": kind,
            "width": size[0],
            "height": size[1],
            "quality": quality,
            "bytes": destination.stat().st_size,
        })

    total = sum(item["bytes"] for item in manifest)
    if len(manifest) != 25:
        raise SystemExit(f"Expected 25 school book covers, generated {len(manifest)}")
    if total > 1_200_000:
        raise SystemExit(f"School book runtime covers exceed 1,200,000 B: {total:,} B")
    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(json.dumps({
        "version": 1,
        "files": manifest,
        "textureBytes": total,
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Generated {len(manifest)} school book covers ({total:,} bytes)")


if __name__ == "__main__":
    main()
