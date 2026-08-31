#!/usr/bin/env python3
"""Build the scene atlas and packed viewer images for restored comic books."""

from io import BytesIO
from pathlib import Path
import json
import shutil
import struct

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "public/assets/textures/comic-books-runtime"
MANIFEST = OUTPUT / "manifest.json"
ATLAS = OUTPUT / "comic-covers-atlas.webp"
VIEWER_PACK = OUTPUT / "comic-viewer-images.pack"

ATLAS_SIZE = 1024
ATLAS_COLUMNS = 5
ATLAS_ROWS = 5
CELL_SIZE = 204
CELL_ORIGIN = 2
CELL_PADDING = 4
VIEWER_LONGEST_EDGE = 1024


def source_jobs():
    groups = [
        (
            "dadi-enqing",
            ROOT / "assets/generated/dadi-enqing-covers",
            [f"《大地恩情》第{index}册" for index in range(1, 13)],
        ),
        (
            "chenzhen",
            ROOT / "assets/generated/chenzhen-covers",
            ["《陈真传》上", "《陈真》", "《陈真传》下", "《陈真传》", "《霍东觉》"],
        ),
        (
            "huoyuanjia",
            ROOT / "assets/generated/huoyuanjia-covers",
            [f"《霍元甲》封面{index}" for index in range(1, 6)],
        ),
    ]
    for group, directory, titles in groups:
        for index, title in enumerate(titles, 1):
            yield {
                "id": f"comic-{group}-{index:02d}",
                "group": group,
                "title": title,
                "source": directory / f"{index:02d}.png",
            }


def webp_bytes(image, quality):
    buffer = BytesIO()
    image.save(buffer, "WEBP", quality=quality, method=6)
    return buffer.getvalue()


def main():
    jobs = list(source_jobs())
    missing = [str(job["source"].relative_to(ROOT)) for job in jobs if not job["source"].is_file()]
    if missing:
        raise SystemExit(f"Missing comic cover masters: {', '.join(missing)}")
    if len(jobs) != 22:
        raise SystemExit(f"Expected 22 comic covers, found {len(jobs)}")

    if OUTPUT.exists():
        shutil.rmtree(OUTPUT)
    OUTPUT.mkdir(parents=True)

    atlas = Image.new("RGB", (ATLAS_SIZE, ATLAS_SIZE), "#d3c29e")
    manifest_assets = []
    viewer_images = []

    for asset_index, job in enumerate(jobs):
        with Image.open(job["source"]) as original:
            master = original.convert("RGB")
            source_width, source_height = master.size

            scene = master.copy()
            scene.thumbnail(
                (CELL_SIZE - CELL_PADDING * 2, CELL_SIZE - CELL_PADDING * 2),
                Image.Resampling.LANCZOS,
            )
            column = asset_index % ATLAS_COLUMNS
            row = asset_index // ATLAS_COLUMNS
            cell_x = CELL_ORIGIN + column * CELL_SIZE
            cell_y = CELL_ORIGIN + row * CELL_SIZE
            scene_x = cell_x + (CELL_SIZE - scene.width) // 2
            scene_y = cell_y + (CELL_SIZE - scene.height) // 2
            atlas.paste(scene, (scene_x, scene_y))

            viewer = master.copy()
            viewer.thumbnail((VIEWER_LONGEST_EDGE, VIEWER_LONGEST_EDGE), Image.Resampling.LANCZOS)
            viewer_data = webp_bytes(viewer, 72)
            viewer_images.append(viewer_data)

        manifest_assets.append({
            "id": job["id"],
            "kind": "comic",
            "group": job["group"],
            "title": job["title"],
            "source": job["source"].relative_to(ROOT).as_posix(),
            "sourceSize": [source_width, source_height],
            "aspect": source_width / source_height,
            "uv": [
                scene_x / ATLAS_SIZE,
                1 - (scene_y + scene.height) / ATLAS_SIZE,
                scene.width / ATLAS_SIZE,
                scene.height / ATLAS_SIZE,
            ],
            "viewerSize": [viewer.width, viewer.height],
            "viewerBytes": len(viewer_data),
        })

    atlas_data = webp_bytes(atlas, 90)
    ATLAS.write_bytes(atlas_data)

    header = bytearray(b"CBPK0001")
    header.extend(struct.pack("<I", len(viewer_images)))
    header.extend(struct.pack(f"<{len(viewer_images)}I", *(len(image) for image in viewer_images)))
    VIEWER_PACK.write_bytes(bytes(header) + b"".join(viewer_images))

    manifest = {
        "version": 1,
        "policy": "1024px WebP atlas; viewer max 1024px q72; one packed request; one viewer image decoded at a time",
        "atlas": {
            "url": "/assets/textures/comic-books-runtime/comic-covers-atlas.webp",
            "size": [ATLAS_SIZE, ATLAS_SIZE],
            "bytes": len(atlas_data),
        },
        "viewerPack": {
            "url": "/assets/textures/comic-books-runtime/comic-viewer-images.pack",
            "format": "CBPK0001",
            "count": len(viewer_images),
            "bytes": VIEWER_PACK.stat().st_size,
            "ids": [job["id"] for job in jobs],
        },
        "assets": manifest_assets,
    }
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    if len(atlas_data) > 350_000:
        raise SystemExit(f"Comic cover atlas exceeds 350,000 B: {len(atlas_data):,} B")
    if VIEWER_PACK.stat().st_size > 2_000_000:
        raise SystemExit(f"Comic viewer pack exceeds 2,000,000 B: {VIEWER_PACK.stat().st_size:,} B")
    print(
        f"Generated {len(jobs)} comic covers "
        f"(atlas {len(atlas_data):,} B; viewer pack {VIEWER_PACK.stat().st_size:,} B)"
    )


if __name__ == "__main__":
    main()
