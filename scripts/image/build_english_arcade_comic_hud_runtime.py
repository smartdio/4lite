#!/usr/bin/env python3
"""Build deterministic English arcade-comic HUD atlases.

The English atlases keep the Chinese runtime dimensions and cell coordinates
exactly. Only the text layer changes; the shared burst atlas remains language
neutral and is not duplicated.
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "public/assets/ui/arcade-comic-v01/en"
FONT_PATH = ROOT / "public/assets/fonts/pixel/4lite-fusion-pixel-12px-ui-v02.woff2"

SCORE_GLYPHS = "0123456789+-:/.%"
SCORE_LABELS = [
    ("score", "SCORE"),
    ("hit", "HITS"),
    ("shots", "SHOTS"),
    ("player", "PLAYER"),
    ("computer", "COMPUTER"),
    ("practice", "PRACTICE"),
    ("match7", "7-POINT MATCH"),
    ("serve", "SERVE"),
    ("distance", "DISTANCE"),
    ("metre", "M"),
    ("height", "HEIGHT"),
    ("centimetre", "CM"),
    ("current", "CURRENT"),
    ("best", "BEST"),
    ("record", "RECORD"),
    ("target", "TARGET"),
    ("streak", "STREAK"),
    ("grab", "GRAB"),
    ("remaining", "LEFT"),
    ("combo", "COMBO"),
    ("misses", "MISSES"),
]

GAME_ATLASES = {
    "basketball": ((2048, 1024), (1024, 512), [
        ("two", "2-POINT SHOT!"),
        ("three", "3-POINT SHOT!"),
        ("four", "4-POINT SHOT!"),
    ]),
    "ping-pong": ((2048, 1536), (1024, 512), [
        ("good", "GREAT SHOT!"),
        ("smash", "SMASH!"),
        ("point", "POINT!"),
        ("win", "YOU WIN!"),
        ("again", "TRY AGAIN!"),
    ]),
    "long-jump": ((2048, 1536), (1024, 512), [
        ("jump", "JUMP!"),
        ("far", "GREAT JUMP!"),
        ("good", "NICE!"),
        ("again", "TRY AGAIN!"),
        ("more", "MORE POWER!"),
        ("overrun", "FOUL!"),
    ]),
    "bamboo-climb": ((2048, 1536), (1024, 512), [
        ("steady", "HOLD STEADY!"),
        ("power", "POWER!"),
        ("slip", "SLIPPED!"),
        ("again", "TRY AGAIN!"),
        ("top", "MADE IT!"),
    ]),
    "hopscotch": ((1024, 1024), (512, 256), [
        ("throw-good", "GOOD THROW!"),
        ("line", "LINE FOUL!"),
        ("throw-wide", "OUTSIDE!"),
        ("wrong-tile", "WRONG SQUARE!"),
        ("wrong-feet", "WRONG FEET!"),
        ("round", "ROUND CLEAR!"),
        ("complete", "ALL CLEAR!"),
    ]),
    "shuttlecock": ((1024, 768), (512, 256), [
        ("switch-foot", "SWITCH FOOT!"),
        ("watch", "WATCH IT!"),
        ("miss", "MISSED!"),
        ("again", "TRY AGAIN!"),
        ("ten", "10 KICKS!"),
        ("record", "NEW RECORD!"),
    ]),
    "jacks": ((1024, 1024), (512, 256), [
        ("disturbed", "DO NOT TOUCH!"),
        ("miss", "MISSED!"),
        ("hurry", "TOO SLOW!"),
        ("again", "TRY AGAIN!"),
        ("stage-one", "ONES CLEAR!"),
        ("stage-two", "TWOS CLEAR!"),
        ("stage-three", "THREES CLEAR!"),
        ("complete", "ALL CLEAR!"),
    ]),
    "slingshot": ((2048, 1024), (1024, 512), [
        ("hit", "HIT!"),
        ("miss", "MISSED!"),
        ("wood", "WOOD"),
        ("wire", "WIRE"),
    ]),
}


def text_metrics(draw: ImageDraw.ImageDraw, text: str, chosen: ImageFont.FreeTypeFont, stroke: int):
    core = text.rstrip("!")
    bang_count = len(text) - len(core)
    bounds = draw.textbbox((0, 0), core, font=chosen, stroke_width=stroke)
    bang_width = chosen.size * 0.28
    bang_gap = chosen.size * 0.07
    width = bounds[2] - bounds[0] + bang_count * (bang_width + bang_gap)
    return core, bang_count, bounds, bang_width, bang_gap, width


def fitted_font(draw: ImageDraw.ImageDraw, text: str, box, start_size: int, minimum: int = 22):
    left, top, right, bottom = box
    for size in range(start_size, minimum - 1, -2):
        chosen = ImageFont.truetype(str(FONT_PATH), size)
        stroke = max(2, round(size * 0.025))
        shadow = max(4, round(size * 0.10))
        _, _, bounds, _, _, width = text_metrics(draw, text, chosen, stroke)
        height = bounds[3] - bounds[1]
        if width + shadow <= (right - left) * 0.88 and height + shadow <= (bottom - top) * 0.72:
            return chosen
    return ImageFont.truetype(str(FONT_PATH), minimum)


def layered_text(draw: ImageDraw.ImageDraw, box, text: str, start_size: int) -> None:
    left, top, right, bottom = box
    chosen = fitted_font(draw, text, box, start_size)
    stroke = max(2, round(chosen.size * 0.025))
    navy_offset = max(4, round(chosen.size * 0.10))
    red_offset = max(3, round(chosen.size * 0.06))
    highlight_offset = max(1, round(chosen.size * 0.022))
    core, bang_count, bounds, bang_width, bang_gap, width = text_metrics(draw, text, chosen, stroke)
    height = bounds[3] - bounds[1]
    x = (left + right - width) / 2 - bounds[0] - navy_offset / 2
    y = (top + bottom - height) / 2 - bounds[1] - navy_offset / 2

    navy = "#101f46"
    dark_red = "#5e282d"
    red = "#b83b35"
    cream = "#fff4d4"
    yellow = "#f1c442"

    core_width = draw.textlength(core, font=chosen)

    def draw_layer(dx, dy, fill, layer_stroke, stroke_fill):
        draw.text((x + dx, y + dy), core, font=chosen, fill=fill,
                  stroke_width=layer_stroke, stroke_fill=stroke_fill)
        for index in range(bang_count):
            bang_x = x + dx + core_width + bang_gap + index * (bang_width + bang_gap)
            glyph_top = y + dy + bounds[1] + chosen.size * 0.06
            glyph_bottom = y + dy + bounds[3]
            bar_bottom = glyph_top + (glyph_bottom - glyph_top) * 0.58
            dot_top = glyph_top + (glyph_bottom - glyph_top) * 0.77
            half = bang_width * 0.24
            for glyph_box in [
                (bang_x - half, glyph_top, bang_x + half, bar_bottom),
                (bang_x - half, dot_top, bang_x + half, glyph_bottom),
            ]:
                outline_box = tuple(value + delta for value, delta in zip(
                    glyph_box, (-layer_stroke, -layer_stroke, layer_stroke, layer_stroke)
                ))
                draw.rectangle(outline_box, fill=stroke_fill)
                draw.rectangle(glyph_box, fill=fill)

    for offset in range(navy_offset, red_offset, -2):
        draw_layer(offset, offset, navy, stroke + 1, navy)
    for offset in range(red_offset, 1, -2):
        draw_layer(offset, offset, red, stroke, dark_red)
    draw_layer(0, -highlight_offset, cream, stroke + 1, navy)
    draw_layer(0, 0, yellow, stroke, navy)


def build_score_atlas() -> Path:
    atlas = Image.new("RGBA", (2048, 1792), (0, 0, 0, 0))
    draw = ImageDraw.Draw(atlas)
    for index, glyph in enumerate(SCORE_GLYPHS):
        x = index * 128
        layered_text(draw, (x, 0, x + 128, 256), glyph, 190)
    for index, (_, copy) in enumerate(SCORE_LABELS):
        x = (index % 4) * 512
        y = 256 + (index // 4) * 256
        layered_text(draw, (x, y, x + 512, y + 256), copy, 100)
    path = OUTPUT / "arcade-comic-score-v01.png"
    atlas.save(path, optimize=True, compress_level=9)
    return path


def build_game_atlas(game: str, atlas_size, cell_size, phrases) -> Path:
    atlas = Image.new("RGBA", atlas_size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(atlas)
    cell_width, cell_height = cell_size
    start_size = 190 if cell_width == 1024 else 104
    for index, (_, copy) in enumerate(phrases):
        x = (index % 2) * cell_width
        y = (index // 2) * cell_height
        layered_text(draw, (x, y, x + cell_width, y + cell_height), copy, start_size)
    path = OUTPUT / f"arcade-comic-{game}-v01.png"
    atlas.save(path, optimize=True, compress_level=9)
    return path


def main() -> None:
    if not FONT_PATH.is_file():
        raise SystemExit(f"Missing Fusion Pixel font: {FONT_PATH}")
    OUTPUT.mkdir(parents=True, exist_ok=True)
    paths = [build_score_atlas()]
    paths.extend(build_game_atlas(game, *config) for game, config in GAME_ATLASES.items())
    for path in paths:
        with Image.open(path) as image:
            print(
                f"{path.relative_to(ROOT)} {image.width}x{image.height} "
                f"alpha={image.getchannel('A').getextrema()} bytes={path.stat().st_size}"
            )


if __name__ == "__main__":
    main()
