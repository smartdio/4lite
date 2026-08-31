#!/usr/bin/env python3
"""Build low-resolution, aggressively compressed classroom essay textures."""

from pathlib import Path
import json

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "assets/source/school-ephemera/composition-pages"
OUTPUT = ROOT / "public/assets/textures/composition-pages-runtime"
MANIFEST = ROOT / "artifacts/composition-pages-runtime-manifest.json"
MAX_SIZE = (224, 320)
QUALITY = 55

STEMS = [
    "composition-century-clean-city-v01",
    "composition-century-home-v01",
    "composition-century-moon-sea-v01",
    "composition-future-school-v01",
    "composition-future-world-v01",
    "composition-meaningful-bus-seat-v01",
    "composition-meaningful-wallet-v01",
    "composition-my-ideal-immortal-v01",
    "composition-my-ideal-postman-v01",
    "composition-my-ideal-projectionist-v01",
    "composition-my-ideal-strongman-v01",
    "composition-my-ideal-zoo-director-v01",
    "composition-small-ink-spill-v01",
]


def main():
    sources = [SOURCE / f"{stem}.png" for stem in STEMS]
    missing = [str(path.relative_to(ROOT)) for path in sources if not path.is_file()]
    if missing:
        raise SystemExit(f"Missing composition page sources: {', '.join(missing)}")

    OUTPUT.mkdir(parents=True, exist_ok=True)
    for old in OUTPUT.glob("*.webp"):
        old.unlink()

    files = []
    for stem, source in zip(STEMS, sources):
        destination = OUTPUT / f"{stem}.webp"
        with Image.open(source) as original:
            image = original.convert("RGB")
            image.thumbnail(MAX_SIZE, Image.Resampling.LANCZOS)
            image.save(destination, "WEBP", quality=QUALITY, method=6)
            width, height = image.size
        files.append({
            "file": destination.relative_to(ROOT).as_posix(),
            "source": source.relative_to(ROOT).as_posix(),
            "width": width,
            "height": height,
            "quality": QUALITY,
            "bytes": destination.stat().st_size,
        })

    total = sum(item["bytes"] for item in files)
    if len(files) != 13:
        raise SystemExit(f"Expected 13 composition pages, generated {len(files)}")
    if total > 350_000:
        raise SystemExit(f"Composition pages exceed 350,000 B: {total:,} B")
    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(json.dumps({
        "version": 1,
        "policy": "maximum 224x320, lossy WebP q55 method 6",
        "files": files,
        "textureBytes": total,
        "decodedBytesWithMipmaps": round(sum(item["width"] * item["height"] * 4 for item in files) * 4 / 3),
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Generated {len(files)} composition pages ({total:,} bytes)")


if __name__ == "__main__":
    main()
