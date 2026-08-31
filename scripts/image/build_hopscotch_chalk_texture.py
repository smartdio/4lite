#!/usr/bin/env python3
"""Build the deterministic hopscotch chalk-grid review texture."""

from pathlib import Path
import math
import random

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
WIDTH, HEIGHT = 2048, 1024
MIN_X, MAX_X = -0.92, 0.92
MIN_Z, MAX_Z = -0.55, 4.55
PAD_X, PAD_Y = 58, 116

LAYOUTS = [
    {
        "output": "hopscotch-chalk-grid-connected-candidate-v02.webp", "seed": 198203,
        "cells": [(1, 0.00, 0.00), (2, 0.00, 0.82), (3, -0.39, 1.64), (4, 0.39, 1.64),
                  (5, 0.00, 2.46), (6, -0.39, 3.28), (7, 0.39, 3.28), (8, 0.00, 4.10)],
        "row_half_widths": [0.36, 0.36, 0.75, 0.36, 0.75, 0.36],
        "split_rows": [2, 4], "shape": "stepped",
    },
    {
        "output": "hopscotch-chalk-grid-fan-nine-candidate-v06.webp", "seed": 198311,
        "cells": [(1, 0.00, 0.00), (2, -0.39, 0.82), (3, 0.39, 0.82), (4, 0.00, 1.64),
                  (5, -0.48, 2.40), (6, 0.48, 2.40), (7, -0.38, 2.96), (8, 0.38, 2.96),
                  (9, 0.00, 3.48)],
        "row_half_widths": [0.36, 0.75, 0.75], "split_rows": [1], "shape": "fan",
    },
]
CELL_WIDTH, CELL_DEPTH = 0.72, 0.78

# The visual grid is one connected chalk diagram.  Adjacent rows meet at a
# shared boundary; they are deliberately not rendered as eight independent
# rectangles.  These remain configurable working values rather than a claim
# about a single historical local rule set.
ROW_EDGES = [-0.41, 0.41, 1.23, 2.05, 2.87, 3.69, 4.51]


def project(x: float, z: float) -> tuple[float, float]:
    # Runtime U follows local +Z. Image rows run from local +X to -X so the
    # numerals read correctly for a player standing west and facing east.
    px = PAD_X + (z - MIN_Z) / (MAX_Z - MIN_Z) * (WIDTH - PAD_X * 2)
    py = PAD_Y + (MAX_X - x) / (MAX_X - MIN_X) * (HEIGHT - PAD_Y * 2)
    return px, py


def jittered_polyline(start, end, rng: random.Random, wobble: float, samples: int = 26):
    x1, y1 = start
    x2, y2 = end
    dx, dy = x2 - x1, y2 - y1
    length = max(1.0, math.hypot(dx, dy))
    nx, ny = -dy / length, dx / length
    phase = rng.uniform(0, math.tau)
    points = []
    for index in range(samples + 1):
        t = index / samples
        envelope = math.sin(math.pi * t) ** 0.55
        offset = (math.sin(t * math.tau * rng.uniform(0.72, 1.15) + phase) * wobble
                  + rng.uniform(-wobble * 0.33, wobble * 0.33)) * envelope
        points.append((x1 + dx * t + nx * offset, y1 + dy * t + ny * offset))
    return points


def chalk_path(image: Image.Image, world_points, rng: random.Random, strength: float = 1.0):
    projected = [project(*point) for point in world_points]
    overlay = Image.new("RGBA", image.size)
    draw = ImageDraw.Draw(overlay)
    for pass_index in range(4):
        width = round(rng.uniform(7.5, 13.5) * strength * (1.0 if pass_index < 2 else 0.55))
        alpha = round(rng.uniform(46, 92) * (1.15 if pass_index == 0 else 1.0))
        wobble = rng.uniform(1.2, 4.2) * (1.0 + pass_index * 0.18)
        for start, end in zip(projected, projected[1:]):
            points = jittered_polyline(start, end, rng, wobble)
            draw.line(points, fill=(244, 235, 199, alpha), width=max(2, width), joint="curve")
    # Chalk crumbs stay close to the stroke instead of becoming uniform noise.
    for start, end in zip(projected, projected[1:]):
        for _ in range(36):
            t = rng.random()
            px = start[0] + (end[0] - start[0]) * t + rng.gauss(0, 7)
            py = start[1] + (end[1] - start[1]) * t + rng.gauss(0, 7)
            radius = rng.uniform(0.7, 2.2)
            draw.ellipse((px-radius, py-radius, px+radius, py+radius), fill=(248, 239, 205, rng.randint(18, 58)))
    image.alpha_composite(overlay.filter(ImageFilter.GaussianBlur(0.22)))


DIGITS = {
    1: [[(-0.10, 0.17), (0.01, 0.29), (0.01, -0.29)], [(-0.10, -0.29), (0.13, -0.29)]],
    2: [[(-0.17, 0.18), (-0.08, 0.29), (0.11, 0.27), (0.17, 0.14), (0.10, 0.02), (-0.16, -0.27), (0.18, -0.27)]],
    3: [[(-0.15, 0.25), (0.04, 0.29), (0.17, 0.17), (0.02, 0.01), (0.17, -0.09), (0.10, -0.27), (-0.14, -0.24)]],
    4: [[(0.11, -0.29), (0.11, 0.29)], [(-0.18, 0.03), (0.17, 0.03)], [(-0.16, 0.03), (0.04, 0.29)]],
    5: [[(0.16, 0.28), (-0.13, 0.28), (-0.16, 0.02), (0.08, 0.04), (0.18, -0.09), (0.10, -0.27), (-0.15, -0.24)]],
    6: [[(0.12, 0.25), (-0.03, 0.29), (-0.16, 0.12), (-0.15, -0.18), (-0.02, -0.29), (0.14, -0.21), (0.16, -0.05), (0.04, 0.04), (-0.14, 0.00)]],
    7: [[(-0.18, 0.28), (0.18, 0.28), (0.04, 0.04), (-0.04, -0.29)]],
    8: [[(0.00, 0.02), (-0.13, 0.13), (-0.08, 0.28), (0.09, 0.27), (0.14, 0.12), (0.00, 0.02), (-0.15, -0.10), (-0.09, -0.28), (0.09, -0.27), (0.16, -0.10), (0.00, 0.02)]],
    9: [[(-0.12, -0.24), (0.03, -0.28), (0.15, -0.12), (0.15, 0.17), (0.04, 0.29), (-0.12, 0.22), (-0.16, 0.06), (-0.05, -0.04), (0.14, 0.01)]],
}


def render_layout(layout):
    rng = random.Random(layout["seed"])
    image = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    row_half_widths = layout["row_half_widths"]

    # Draw the outside contour as one continuous piece of chalk work.  The
    # stepped shoulders join narrow single-foot rows to wide double-foot rows.
    if layout["shape"] == "fan":
        right = [(0.36, ROW_EDGES[0]), (0.36, ROW_EDGES[1]), (0.75, ROW_EDGES[1]), (0.75, ROW_EDGES[2]), (0.36, ROW_EDGES[2]), (0.36, ROW_EDGES[3]), (1.05, ROW_EDGES[3])]
        arc = [(1.05 * math.cos(index / 40 * math.pi), ROW_EDGES[3] + 1.65 * math.sin(index / 40 * math.pi)) for index in range(41)]
        left = [(-x, z) for x, z in reversed(right)]
        contour = right + arc[1:] + left[1:] + [right[0]]
    else:
        right = [(row_half_widths[0], ROW_EDGES[0])]
        for row, half_width in enumerate(row_half_widths):
            right.append((half_width, ROW_EDGES[row + 1]))
            if row + 1 < len(row_half_widths) and row_half_widths[row + 1] != half_width:
                right.append((row_half_widths[row + 1], ROW_EDGES[row + 1]))
        left = [(-x, z) for x, z in reversed(right)]
        contour = right + left + [right[0]]
    chalk_path(image, contour, rng, 1.08)

    # Every crossbar touches the outside contour.  On wide rows the centre
    # divider also meets both crossbars, so the complete diagram reads as one
    # connected network rather than a stack of separate boxes.
    if layout["shape"] == "fan":
        chalk_path(image, [(-0.75, ROW_EDGES[1]), (0.75, ROW_EDGES[1])], rng, 1.08)
        chalk_path(image, [(-0.75, ROW_EDGES[2]), (0.75, ROW_EDGES[2])], rng, 1.08)
        chalk_path(image, [(-1.05, ROW_EDGES[3]), (1.05, ROW_EDGES[3])], rng, 1.08)
        chalk_path(image, [(0.0, ROW_EDGES[1]), (0.0, ROW_EDGES[2])], rng, 1.08)
        for chord_z in (2.72, 3.23):
            chord_half_width = 1.05 * math.sqrt(1 - ((chord_z - ROW_EDGES[3]) / 1.65) ** 2)
            chalk_path(image, [(-chord_half_width, chord_z), (chord_half_width, chord_z)], rng, 1.08)
        # The fan has two paired rows followed by one undivided ninth cell.
        # Stop the centre divider at the last chord so it does not split cell 9.
        chalk_path(image, [(0.0, ROW_EDGES[3]), (0.0, 3.23)], rng, 1.08)
    else:
        for boundary_index, z in enumerate(ROW_EDGES[1:-1], start=1):
            half_width = max(row_half_widths[boundary_index - 1], row_half_widths[boundary_index])
            chalk_path(image, [(-half_width, z), (half_width, z)], rng, 1.08)
        for row in layout["split_rows"]:
            chalk_path(image, [(0.0, ROW_EDGES[row]), (0.0, ROW_EDGES[row + 1])], rng, 1.08)

    for number, x, z in layout["cells"]:
        for stroke in DIGITS[number]:
            world = [(x - horizontal * 0.95, z + vertical) for horizontal, vertical in stroke]
            chalk_path(image, world, rng, 0.92)
    output = ROOT / "public/assets/textures/hopscotch" / layout["output"]
    output.parent.mkdir(parents=True, exist_ok=True)
    image.save(output, "WEBP", lossless=True, method=6)
    print(f"wrote {output.relative_to(ROOT)} ({output.stat().st_size} bytes)")


def main():
    for layout in LAYOUTS:
        render_layout(layout)


if __name__ == "__main__":
    main()
