#!/usr/bin/env python3
"""Build the small, production-only school ephemera texture set from PNG masters."""

from pathlib import Path
import json
import shutil

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "assets/source/school-ephemera"
OUTPUT = ROOT / "public/assets/textures/school-ephemera-runtime"
MANIFEST = ROOT / "artifacts/school-ephemera-runtime-manifest.json"


def jobs():
    corridor = [
        "corridor-poster-campus-labor-v01",
        "corridor-poster-study-discipline-v01",
        "corridor-poster-civility-v01",
        *[f"corridor-poster-rule-{index:02d}-{slug}-v01" for index, slug in enumerate([
            "love-study", "punctual-listen", "exercise-activity", "hygiene-neatness",
            "self-reliance-labor", "frugal-food", "discipline-order", "respect-unity",
            "public-property", "honest-correct",
        ], 1)],
    ]
    for stem in corridor:
        yield SOURCE / "posters" / f"{stem}-master.png", Path("corridor") / f"{stem}.webp", (256, 640), 88, False

    for stem in [
        "blackboard-newspaper-new-term-v01",
        "blackboard-newspaper-five-stresses-four-beauties-v01",
        "blackboard-newspaper-love-labor-v01",
        "blackboard-newspaper-books-progress-v01",
    ]:
        yield SOURCE / "blackboard-newspapers" / f"{stem}-master.png", Path("blackboards") / f"{stem}.webp", (768, 288), 92, True

    yield (
        SOURCE / "blackboard-newspapers/blackboard-newspaper-campus-guide-v02-master.png",
        Path("blackboards/blackboard-newspaper-campus-guide-v02.webp"), (1920, 512), 80, False,
    )
    yield (
        SOURCE / "blackboard-newspapers/blackboard-newspaper-development-process-v02-master.png",
        Path("blackboards/blackboard-newspaper-development-process-v02.webp"), (1920, 512), 80, False,
    )
    yield (
        SOURCE / "blackboard-newspapers/blackboard-newspaper-campus-guide-en-v01-master.png",
        Path("blackboards/blackboard-newspaper-campus-guide-en-v01.webp"), (1920, 512), 80, False,
    )
    yield (
        SOURCE / "blackboard-newspapers/blackboard-newspaper-development-process-en-v01-master.png",
        Path("blackboards/blackboard-newspaper-development-process-en-v01.webp"), (1920, 512), 80, False,
    )

    for stem in [
        "classroom-award-red-drapery-v01",
        "classroom-award-flags-floral-v01",
        "classroom-award-wheat-school-v01",
        "classroom-award-sunflower-industry-v01",
    ]:
        yield SOURCE / "classroom-awards" / f"{stem}-master.png", Path("awards") / f"{stem}.webp", (384, 288), 88, False

    for stem in [
        "office-portrait-engels-v01",
        "office-portrait-marx-v01",
        "office-portrait-mao-v01",
        "office-portrait-zhou-v01",
    ]:
        yield SOURCE / "office-portraits" / f"{stem}-master.png", Path("office") / f"{stem}.webp", (384, 576), 90, False

    yield (
        SOURCE / "classroom-slogans/classroom-slogan-study-upward-combined-v01-master.png",
        Path("classroom/classroom-slogan-study-upward-combined-v01.webp"), (1024, 131), 92, True,
    )
    yield (
        SOURCE / "classroom-posters/classroom-poster-student-code-v01-master.png",
        Path("classroom/classroom-poster-student-code-v01.webp"), (320, 545), 90, False,
    )
    yield (
        SOURCE / "classroom-posters/classroom-poster-eye-exercise-v01-master.png",
        Path("classroom/classroom-poster-eye-exercise-v01.webp"), (512, 341), 90, False,
    )


def main():
    planned = list(jobs())
    missing = [str(source.relative_to(ROOT)) for source, *_ in planned if not source.is_file()]
    if missing:
        raise SystemExit(f"Missing school ephemera masters: {', '.join(missing)}")

    if OUTPUT.exists():
        shutil.rmtree(OUTPUT)
    OUTPUT.mkdir(parents=True)
    manifest = []

    for source, relative, size, quality, alpha in planned:
        destination = OUTPUT / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        with Image.open(source) as image:
            image = image.convert("RGBA" if alpha else "RGB")
            image = image.resize(size, Image.Resampling.LANCZOS)
            image.save(destination, "WEBP", quality=quality, method=6, exact=alpha)
        manifest.append({
            "file": relative.as_posix(),
            "source": source.relative_to(ROOT).as_posix(),
            "width": size[0], "height": size[1], "quality": quality,
            "alpha": alpha, "bytes": destination.stat().st_size,
        })

    total = sum(item["bytes"] for item in manifest)
    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(json.dumps({
        "version": 1, "files": manifest, "textureBytes": total,
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Generated {len(manifest)} school ephemera textures ({total:,} bytes)")


if __name__ == "__main__":
    main()
