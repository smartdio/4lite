from pathlib import Path

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
GATE_B_SOURCE = ROOT / 'docs/previews/minigame-arcade-comic-ui-v01/gate-b-source'
GATE_C_SOURCE = ROOT / 'docs/previews/minigame-arcade-comic-ui-v01/gate-c-source'
GATE_C_MASTER = ROOT / 'docs/previews/minigame-arcade-comic-ui-v01/gate-c-rgba'
OUTPUT = ROOT / 'public/assets/ui/arcade-comic-v01'

GATE_B_SOURCES = {
    'burst-major': GATE_B_SOURCE / 'burst-major-chroma-v01.png',
    'burst-hit': GATE_B_SOURCE / 'burst-hit-rgba-v01.png',
}
GAME_SHEETS = {
    'basketball': ('basketball-text-chroma-v01.png', ['score', 'two', 'three', 'four']),
    'ping-pong': ('ping-pong-text-chroma-v01.png', ['good', 'smash', 'point', 'win', 'again']),
    'long-jump': ('long-jump-text-chroma-v01.png', ['jump', 'far', 'good', 'again', 'more', 'overrun']),
    'bamboo-climb': ('bamboo-climb-text-chroma-v01.png', ['steady', 'power', 'slip', 'again', 'top']),
    'hopscotch': ('hopscotch-text-chroma-v01.png', ['throw-good', 'line', 'throw-wide', 'wrong-tile', 'wrong-feet', 'round', 'complete']),
    'shuttlecock': ('shuttlecock-text-chroma-v01.png', ['switch-foot', 'watch', 'miss', 'again', 'ten', 'record']),
    'jacks': ('jacks-text-chroma-v01.png', ['disturbed', 'miss', 'hurry', 'again', 'stage-one', 'stage-two', 'stage-three', 'complete']),
}
INDIVIDUAL_GAME_SHEETS = {
    'slingshot': [
        ('slingshot-hit-rgba-v01.png', 'hit'),
        ('slingshot-miss-rgba-v01.png', 'miss'),
        ('slingshot-wood-rgba-v01.png', 'wood'),
        ('slingshot-wire-rgba-v01.png', 'wire'),
    ],
}
COMPACT_GAME_SHEETS = {'hopscotch', 'shuttlecock', 'jacks'}
SCORE_GLYPHS = list('0123456789+-:/.%')
SCORE_LABELS = ['score', 'hit', 'shots', 'player', 'computer', 'practice', 'match7', 'serve',
                'distance', 'metre', 'height', 'centimetre', 'current', 'best', 'record',
                'target', 'streak', 'grab', 'remaining', 'combo', 'misses']


def chroma_alpha(image: Image.Image) -> Image.Image:
    """Remove ImageGen green while preserving the approved yellow/red/navy palette."""
    source = image.convert('RGB')
    output = Image.new('RGBA', source.size, (0, 0, 0, 0))
    destination, pixels = output.load(), source.load()
    for y in range(source.height):
        for x in range(source.width):
            red, green, blue = pixels[x, y]
            dominance = green - max(red, blue)
            alpha = round(max(0.0, min(1.0, (82.0 - dominance) / 64.0)) * 255)
            if alpha <= 2:
                destination[x, y] = (0, 0, 0, 0)
                continue
            if alpha < 250:
                green = min(green, max(red, blue))
            destination[x, y] = (red, green, blue, alpha)
    return output


def trim(image: Image.Image, padding: int = 18) -> Image.Image:
    alpha = image.getchannel('A')
    bounds = alpha.point(lambda value: 255 if value >= 8 else 0).getbbox()
    if not bounds:
        raise ValueError('source contains no visible pixels after alpha extraction')
    left, top, right, bottom = bounds
    return image.crop((max(0, left-padding), max(0, top-padding),
                       min(image.width, right+padding), min(image.height, bottom+padding)))


def contain(image: Image.Image, size: tuple[int, int], margin: int) -> Image.Image:
    result = image.copy()
    result.thumbnail((size[0]-margin*2, size[1]-margin*2), Image.Resampling.LANCZOS)
    return result


def place(atlas: Image.Image, image: Image.Image, rect: tuple[int, int, int, int], margin: int = 24) -> None:
    x, y, width, height = rect
    fitted = contain(image, (width, height), margin)
    atlas.alpha_composite(fitted, (x+(width-fitted.width)//2, y+(height-fitted.height)//2))


def load_rgba(path: Path) -> Image.Image:
    source = Image.open(path)
    return source.convert('RGBA') if source.mode == 'RGBA' else chroma_alpha(source)


def equal_cells(image: Image.Image, columns: int, rows: int, count: int) -> list[Image.Image]:
    cells = []
    for index in range(count):
        column, row = index % columns, index // columns
        cells.append(trim(image.crop((
            round(column*image.width/columns), round(row*image.height/rows),
            round((column+1)*image.width/columns), round((row+1)*image.height/rows),
        ))))
    return cells


def projection_bands(image: Image.Image, axis: str, minimum_pixels: int = 3, bridge: int = 6) -> list[tuple[int, int]]:
    """Find artwork bands from Alpha projection and bridge tiny antialias gaps."""
    alpha = image.getchannel('A')
    width, height = image.size
    counts = []
    if axis == 'x':
        for x in range(width):
            counts.append(sum(1 for y in range(height) if alpha.getpixel((x, y)) >= 8))
    else:
        for y in range(height):
            counts.append(sum(1 for x in range(width) if alpha.getpixel((x, y)) >= 8))
    raw, start = [], None
    for index, count in enumerate(counts + [0]):
        if count >= minimum_pixels and start is None:
            start = index
        elif count < minimum_pixels and start is not None:
            raw.append((start, index))
            start = None
    merged = []
    for band in raw:
        if merged and band[0]-merged[-1][1] <= bridge:
            merged[-1] = (merged[-1][0], band[1])
        else:
            merged.append(band)
    return merged


def crop_x_bands(image: Image.Image, expected: int) -> list[Image.Image]:
    bands = projection_bands(image, 'x', bridge=4)
    if len(bands) != expected:
        raise ValueError(f'expected {expected} x bands, found {len(bands)}: {bands}')
    return [trim(image.crop((left, 0, right, image.height))) for left, right in bands]


def crop_y_bands(image: Image.Image, expected: int) -> list[Image.Image]:
    bands = projection_bands(image, 'y', bridge=8)
    if len(bands) != expected:
        raise ValueError(f'expected {expected} y bands, found {len(bands)}: {bands}')
    return [trim(image.crop((0, top, image.width, bottom))) for top, bottom in bands]


def valley_cells_y(image: Image.Image, count: int) -> list[Image.Image]:
    """Split designed rows at the least-populated Alpha valley near each expected boundary."""
    alpha, width, height = image.getchannel('A'), image.width, image.height
    counts = [sum(1 for x in range(width) if alpha.getpixel((x, y)) >= 8) for y in range(height)]
    cuts = [0]
    for index in range(1, count):
        target = round(index*height/count)
        radius = max(8, round(height/count*.18))
        start, end = max(cuts[-1]+1, target-radius), min(height-1, target+radius)
        cuts.append(min(range(start, end+1), key=lambda y: counts[y]))
    cuts.append(height)
    cells = []
    for index in range(count):
        cell = image.crop((0, cuts[index], width, cuts[index+1]))
        # Generated strips occasionally let a few shadow pixels cross the midpoint.
        # The valley is intentionally empty, so clearing this narrow seam is safe.
        seam = min(28, max(4, cell.height//10))
        transparent = Image.new('RGBA', (cell.width, seam), (0, 0, 0, 0))
        if index > 0:
            cell.alpha_composite(transparent, (0, 0))
            cell.paste((0, 0, 0, 0), (0, 0, cell.width, seam))
        if index < count-1:
            cell.paste((0, 0, 0, 0), (0, cell.height-seam, cell.width, cell.height))
        cells.append(trim(cell))
    return cells


def component_rows(image: Image.Image, count: int) -> list[Image.Image]:
    """Assign complete Alpha-connected components to designed rows without cutting shadows."""
    rgba = np.asarray(image.convert('RGBA'))
    mask = rgba[:, :, 3] >= 8
    height, width = mask.shape
    runs_by_y: list[list[tuple[int, int, int]]] = []
    parents: list[int] = []

    def find(value: int) -> int:
        while parents[value] != value:
            parents[value] = parents[parents[value]]
            value = parents[value]
        return value

    def union(left: int, right: int) -> None:
        left, right = find(left), find(right)
        if left != right:
            parents[right] = left

    for y in range(height):
        padded = np.pad(mask[y].astype(np.int8), (1, 1))
        transitions = np.diff(padded)
        starts, ends = np.flatnonzero(transitions == 1), np.flatnonzero(transitions == -1)
        current = []
        for start, end in zip(starts.tolist(), ends.tolist()):
            run_id = len(parents);parents.append(run_id);current.append((start, end, run_id))
        if runs_by_y:
            previous = runs_by_y[-1]
            for start, end, run_id in current:
                for previous_start, previous_end, previous_id in previous:
                    if previous_end < start-1:
                        continue
                    if previous_start > end+1:
                        break
                    union(run_id, previous_id)
        runs_by_y.append(current)

    groups: dict[int, list[tuple[int, int, int]]] = {}
    for y, runs in enumerate(runs_by_y):
        for start, end, run_id in runs:
            groups.setdefault(find(run_id), []).append((y, start, end))
    outputs = [np.zeros_like(rgba) for _ in range(count)]
    centers = [(index+.5)*height/count for index in range(count)]
    for runs in groups.values():
        pixels = sum(end-start for _, start, end in runs)
        if pixels < 4:
            continue
        center_y = sum(y*(end-start) for y, start, end in runs)/pixels
        row = min(range(count), key=lambda index: abs(center_y-centers[index]))
        for y, start, end in runs:
            outputs[row][y, start:end] = rgba[y, start:end]
    return [trim(Image.fromarray(output, 'RGBA')) for output in outputs]


def build_score_atlas() -> None:
    sheet = load_rgba(GATE_C_SOURCE / 'score-glyphs-labels-chroma-v01.png')
    sheet.save(GATE_C_MASTER / 'score-glyphs-labels-rgba-v01.png', optimize=True, compress_level=9)
    split_y = round(sheet.height/4)
    glyphs = crop_x_bands(sheet.crop((0, 0, sheet.width, split_y)), len(SCORE_GLYPHS))
    label_region = sheet.crop((0, split_y, sheet.width, sheet.height))
    label_rows = crop_y_bands(label_region, 3)
    labels = [cell for row in label_rows for cell in crop_x_bands(row, 5)]
    new_labels_sheet = load_rgba(GATE_C_SOURCE / 'new-game-score-labels-chroma-v01.png')
    new_labels_sheet.save(GATE_C_MASTER / 'new-game-score-labels-rgba-v01.png', optimize=True, compress_level=9)
    labels.extend(component_rows(new_labels_sheet, 6))
    atlas = Image.new('RGBA', (2048, 1792), (0, 0, 0, 0))
    for index, image in enumerate(glyphs):
        place(atlas, image, (index*128, 0, 128, 256), 12)
    for index, image in enumerate(labels):
        place(atlas, image, ((index%4)*512, 256+(index//4)*256, 512, 256), 22)
    atlas.save(OUTPUT / 'arcade-comic-score-v01.png', optimize=True, compress_level=9)


def build_game_atlas(game: str, filename: str, names: list[str]) -> None:
    sheet = load_rgba(GATE_C_SOURCE / filename)
    sheet.save(GATE_C_MASTER / filename.replace('-chroma-', '-rgba-'), optimize=True, compress_level=9)
    cells = component_rows(sheet, len(names))
    # “进啦！” remains in the approved source sheet, but basketball runtime
    # reports only the awarded value: 两分球／三分球／四分球.
    if game == 'basketball':
        cells = cells[1:]
    cell_width, cell_height = (512, 256) if game in COMPACT_GAME_SHEETS else (1024, 512)
    atlas = Image.new('RGBA', (cell_width*2, ((len(cells)+1)//2)*cell_height), (0, 0, 0, 0))
    for index, image in enumerate(cells):
        place(atlas, image, ((index%2)*cell_width, (index//2)*cell_height, cell_width, cell_height), 18 if game in COMPACT_GAME_SHEETS else 36)
    atlas.save(OUTPUT / f'arcade-comic-{game}-v01.png', optimize=True, compress_level=9)


def build_individual_game_atlas(game: str, sources: list[tuple[str, str]]) -> None:
    cells = []
    for filename, _ in sources:
        image = trim(load_rgba(GATE_C_SOURCE / filename))
        image.save(GATE_C_MASTER / filename, optimize=True, compress_level=9)
        cells.append(image)
    atlas = Image.new('RGBA', (2048, ((len(cells)+1)//2)*512), (0, 0, 0, 0))
    for index, image in enumerate(cells):
        place(atlas, image, ((index%2)*1024, (index//2)*512, 1024, 512), 36)
    atlas.save(OUTPUT / f'arcade-comic-{game}-v01.png', optimize=True, compress_level=9)


def build_burst_atlas() -> None:
    images = {name: trim(load_rgba(path), 24) for name, path in GATE_B_SOURCES.items()}
    fail = trim(load_rgba(GATE_C_SOURCE / 'burst-fail-chroma-v01.png'), 24)
    fail.save(GATE_C_MASTER / 'burst-fail-rgba-v01.png', optimize=True, compress_level=9)
    atlas = Image.new('RGBA', (2048, 2048), (0, 0, 0, 0))
    place(atlas, images['burst-major'], (0, 0, 1024, 1024), 30)
    place(atlas, images['burst-hit'], (1024, 0, 1024, 1024), 30)
    place(atlas, fail, (0, 1024, 2048, 1024), 30)
    atlas.save(OUTPUT / 'arcade-comic-bursts-v01.png', optimize=True, compress_level=9)


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    GATE_C_MASTER.mkdir(parents=True, exist_ok=True)
    build_score_atlas()
    build_burst_atlas()
    for game, (filename, names) in GAME_SHEETS.items():
        build_game_atlas(game, filename, names)
    for game, sources in INDIVIDUAL_GAME_SHEETS.items():
        build_individual_game_atlas(game, sources)
    for path in sorted(OUTPUT.glob('arcade-comic-*.png')):
        image = Image.open(path)
        print(f'{path.relative_to(ROOT)} {image.width}x{image.height} alpha={image.getchannel("A").getextrema()} bytes={path.stat().st_size}')


if __name__ == '__main__':
    main()
