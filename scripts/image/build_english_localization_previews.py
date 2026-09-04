#!/usr/bin/env python3
"""Build deterministic English localisation candidates for visual approval.

These files are review-only. They are written under docs/previews and are not
used by the runtime asset manifest. Production atlases and blackboards must not
be generated or wired in until the candidates have been approved.
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from build_campus_guide_v02_preview import (
    COLORS,
    FONT_MEDIUM,
    FONT_REGULAR,
    SOURCE as CAMPUS_SOURCE,
    centered,
    fullboard_base,
)


ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "docs/previews/english-localization"
HUD_SAMPLE = OUTPUT / "hud-type-sample-v01.png"
CAMPUS_SAMPLE = OUTPUT / "campus-guide-en-candidate-v01.png"

FUSION_PIXEL = ROOT / "public/assets/fonts/pixel/4lite-fusion-pixel-12px-ui-v02.woff2"
RUNTIME_SIZE = (1920, 512)


def fit_font(path: Path, text: str, max_width: int, start: int, minimum: int = 18):
    probe = ImageDraw.Draw(Image.new("L", (1, 1)))
    for size in range(start, minimum - 1, -1):
        chosen = ImageFont.truetype(str(path), size)
        if probe.textbbox((0, 0), text, font=chosen, stroke_width=max(1, size // 24))[2] <= max_width:
            return chosen
    return ImageFont.truetype(str(path), minimum)


def centered_fit(
    image: Image.Image,
    center_x: int,
    y: int,
    text: str,
    max_width: int,
    start_size: int,
    color,
    *,
    path: Path = FONT_REGULAR,
    stroke_width: int = 1,
):
    chosen = fit_font(path, text, max_width, start_size)
    centered(image, center_x, y, text, chosen, color, stroke_width=stroke_width)


def layered_pixel_text(draw: ImageDraw.ImageDraw, box, text: str, start_size: int):
    left, top, right, bottom = box
    core = text.rstrip("!")
    bang_count = len(text) - len(core)
    chosen = fit_font(FUSION_PIXEL, core, right - left - 36 - bang_count * start_size // 3, start_size, 28)
    bounds = draw.textbbox((0, 0), core, font=chosen, stroke_width=3)
    bang_width = chosen.size * .28
    bang_gap = chosen.size * .07
    width = bounds[2] - bounds[0] + bang_count * (bang_width + bang_gap)
    height = bounds[3] - bounds[1]
    x = (left + right - width) // 2 - bounds[0]
    y = (top + bottom - height) // 2 - bounds[1] - 3
    navy = "#101f46"
    red = "#b83b35"
    cream = "#fff4d4"
    yellow = "#f1c442"
    core_width = draw.textlength(core, font=chosen)

    def draw_layer(dx, dy, fill, stroke_width, stroke_fill):
        draw.text((x + dx, y + dy), core, font=chosen, fill=fill, stroke_width=stroke_width, stroke_fill=stroke_fill)
        for index in range(bang_count):
            bang_x = x + dx + core_width + bang_gap + index * (bang_width + bang_gap)
            glyph_top = y + dy + bounds[1] + chosen.size * .06
            glyph_bottom = y + dy + bounds[3]
            bar_bottom = glyph_top + (glyph_bottom - glyph_top) * .58
            dot_top = glyph_top + (glyph_bottom - glyph_top) * .77
            half = bang_width * .24
            for glyph_box in [
                (bang_x - half, glyph_top, bang_x + half, bar_bottom),
                (bang_x - half, dot_top, bang_x + half, glyph_bottom),
            ]:
                outline_box = tuple(value + delta for value, delta in zip(glyph_box, (-stroke_width, -stroke_width, stroke_width, stroke_width)))
                draw.rectangle(outline_box, fill=stroke_fill)
                draw.rectangle(glyph_box, fill=fill)

    for offset in range(16, 4, -2):
        draw_layer(offset, offset, navy, 4, navy)
    for offset in range(10, 2, -2):
        draw_layer(offset, offset, red, 3, "#5e282d")
    draw_layer(0, -4, cream, 5, "#172347")
    draw_layer(0, 0, yellow, 3, "#172347")


def build_hud_sample():
    if not FUSION_PIXEL.is_file():
        raise SystemExit(f"Missing Fusion Pixel font: {FUSION_PIXEL}")
    image = Image.new("RGB", (1920, 1080), "#d9d0bc")
    draw = ImageDraw.Draw(image)
    draw.rectangle((24, 24, 1896, 1056), fill="#efe4ca", outline="#172347", width=8)
    title_font = ImageFont.truetype(str(FUSION_PIXEL), 40)
    draw.text((76, 58), "ENGLISH HUD TYPE SAMPLE / V01", font=title_font, fill="#172347")
    draw.text((76, 112), "Fusion Pixel / deterministic layout / review only", font=title_font, fill="#6c5946")
    cards = [
        ((70, 186, 925, 416), "SCORE", 160),
        ((995, 186, 1850, 416), "PLAYER", 160),
        ((70, 470, 925, 710), "GREAT SHOT!", 120),
        ((995, 470, 1850, 710), "SMASH!", 142),
        ((70, 764, 925, 1004), "NEW RECORD!", 112),
        ((995, 764, 1850, 1004), "TRY AGAIN!", 116),
    ]
    for index, (box, text, size) in enumerate(cards):
        left, top, right, bottom = box
        fill = "#f8efd9" if index % 2 == 0 else "#f2e3c5"
        draw.rounded_rectangle(box, radius=24, fill=fill, outline="#b83b35", width=5)
        draw.line((left + 22, bottom - 18, right - 22, bottom - 18), fill="#172347", width=5)
        layered_pixel_text(draw, box, text, size)
    image.save(HUD_SAMPLE, "PNG", optimize=True)


def build_campus_sample():
    if not CAMPUS_SOURCE.is_file():
        raise SystemExit(f"Missing campus-guide artwork: {CAMPUS_SOURCE}")
    source = Image.open(CAMPUS_SOURCE).convert("RGBA")
    if source.size != (2172, 724):
        source = source.resize((2172, 724), Image.Resampling.LANCZOS)
    image = fullboard_base(source)

    centered_fit(image, 1200, 38, "A LITTLE GUIDE TO THE CAMPUS", 1500, 68, COLORS["yellow"], path=FONT_MEDIUM, stroke_width=2)
    centered_fit(image, 1200, 111, "WALK AROUND · LOOK CLOSER · HAVE A GO", 1100, 27, COLORS["soft"])

    centered_fit(image, 422, 193, "HOW TO MOVE", 520, 42, COLORS["pink"], path=FONT_MEDIUM)
    centered_fit(image, 1204, 193, "THINGS TO DISCOVER", 720, 42, COLORS["blue"], path=FONT_MEDIUM)
    centered_fit(image, 1982, 193, "GAMES TO PLAY", 520, 42, COLORS["green"], path=FONT_MEDIUM)

    left_lines = [
        (270, "Keyboard / joystick · Move freely", COLORS["warm"]),
        (338, "Green marker · Click to walk", COLORS["green"]),
        (406, "Mouse / finger · Look around", COLORS["blue"]),
        (474, "Aim at a prompt · Interact", COLORS["yellow"]),
    ]
    for y, copy, color in left_lines:
        centered_fit(image, 450, y, copy, 560, 29, color)

    middle_lines = [
        (266, "Open doors and windows · Sit at desks"),
        (326, "Draw on blackboards · Pick up chalk and balls"),
        (386, "Read textbooks, workbooks and compositions"),
        (446, "Explore comics, snack bags and pencil cases"),
        (506, "Find the flagpole · Raise the flag yourself"),
    ]
    for index, (y, copy) in enumerate(middle_lines):
        centered_fit(image, 1210, y, copy, 700, 27, COLORS["warm"] if index % 2 == 0 else COLORS["soft"])

    centered_fit(image, 1982, 252, "SPORTS", 470, 29, COLORS["pink"], path=FONT_MEDIUM)
    centered_fit(image, 1982, 294, "Basketball · Table tennis · Long jump · Bamboo climb", 560, 25, COLORS["warm"])
    centered_fit(image, 1982, 354, "PLAYGROUND GAMES", 470, 29, COLORS["yellow"], path=FONT_MEDIUM)
    centered_fit(image, 1982, 396, "Hopscotch · Shuttlecock · Jacks · Slingshot", 560, 25, COLORS["soft"])
    centered_fit(image, 1982, 456, "CLASSROOM TREASURES", 470, 29, COLORS["blue"], path=FONT_MEDIUM)
    centered_fit(image, 1982, 498, "Rubik's Cube · Octopus · Fire handhelds", 560, 25, COLORS["warm"])
    centered_fit(image, 1200, 594, "X to exit · Esc to pause   |   Use on-screen controls on mobile", 1400, 23, COLORS["soft"])

    image.convert("RGB").resize(RUNTIME_SIZE, Image.Resampling.LANCZOS).save(CAMPUS_SAMPLE, "PNG", optimize=True)


def build():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    build_hud_sample()
    build_campus_sample()
    for path in (HUD_SAMPLE, CAMPUS_SAMPLE):
        print(f"Wrote {path.relative_to(ROOT)}")


if __name__ == "__main__":
    build()
