from pathlib import Path

from PIL import Image, ImageFilter, ImageOps


ROOT = Path(__file__).resolve().parents[2]
TEXTURE_DIR = ROOT / "public" / "assets" / "models" / "activity-sand" / "textures"
SAND_SOURCE = ROOT / "public" / "assets" / "models" / "sandpit" / "textures" / "sandpit-sand-albedo-v01.png"

ASSETS = [
    ("activity-sand-north-edgefade-v01.png", "activity-sand-north-edgefade-rgba-v02.png", 12 / 5, 2048),
    ("activity-sand-south-edgefade-v01.png", "activity-sand-south-edgefade-rgba-v02.png", 7 / 3, 1536),
]


def clamp(value, minimum=0.0, maximum=1.0):
    return max(minimum, min(maximum, value))


def extract_rgba(source):
    image = Image.open(source).convert("RGB")
    pixels = list(image.getdata())
    raw_alpha = []
    for red, green, blue in pixels:
        # The generated checkerboard is neutral gray while sand carries strong warm chroma.
        # Recover opacity from two independent warm-color differences.
        warm_rb = max(0.0, red - blue) / 196.0
        warm_gb = max(0.0, green - blue) / 122.0
        score = warm_rb * 0.56 + warm_gb * 0.44
        alpha = clamp((score - 0.008) / 0.94) ** 0.92
        if alpha < 0.012:
            alpha = 0.0
        raw_alpha.append(alpha)

    opaque = [pixel for pixel, alpha in zip(pixels, raw_alpha) if alpha > 0.88]
    opaque.sort(key=lambda color: color[0] + color[1] + color[2])
    base = opaque[len(opaque) // 2] if opaque else (246, 172, 52)

    output = Image.new("RGBA", image.size)
    corrected = []
    for (red, green, blue), alpha in zip(pixels, raw_alpha):
        if alpha <= 0.0:
            corrected.append((*base, 0))
            continue
        # Red is close to both checker values and the sand highlight, so it is a useful
        # local background estimate. Reconstruct G/B from chroma, then stabilize the
        # faintest fringe toward the median sand color to remove gray checker contamination.
        background = red
        reconstructed = (
            red,
            clamp(background + (green - background) / max(alpha, 0.055), 0, 255),
            clamp(background + (blue - background) / max(alpha, 0.055), 0, 255),
        )
        local_weight = alpha ** 0.42
        color = tuple(round(base[i] * (1 - local_weight) + reconstructed[i] * local_weight) for i in range(3))
        corrected.append((*color, round(alpha * 255)))
    output.putdata(corrected)
    return output


def crop_pad_resize(image, target_aspect, target_width):
    alpha = image.getchannel("A").filter(ImageFilter.MedianFilter(5))
    alpha = alpha.point(lambda value: 0 if value < 20 else round((value - 20) * 255 / 235))
    image.putalpha(alpha)
    bbox = alpha.point(lambda value: 255 if value > 2 else 0).getbbox()
    if not bbox:
        raise RuntimeError("No sand alpha was recovered")
    image = image.crop(bbox)
    target_height = round(target_width / target_aspect)
    # The edited silhouette previously retained too much transparent canvas and therefore
    # looked substantially smaller than its nominal metre dimensions. Fit the recovered
    # sand contour to 96% of the target footprint, leaving only enough margin for feathering.
    content_width, content_height = round(target_width * 0.96), round(target_height * 0.96)
    image = image.resize((content_width, content_height), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (target_width, target_height), (0, 0, 0, 0))
    canvas.alpha_composite(image, ((target_width - content_width) // 2, (target_height - content_height) // 2))
    return canvas


def apply_clean_sand_rgb(mask_image, variant):
    width, height = mask_image.size
    alpha = mask_image.getchannel("A").filter(ImageFilter.MedianFilter(3))
    alpha = alpha.point(lambda value: 0 if value < 5 else value)
    source = Image.open(SAND_SOURCE).convert("RGB")
    tile_size = round(height * 1.22)
    tile = source.resize((tile_size, tile_size), Image.Resampling.LANCZOS)
    rgb = Image.new("RGB", (width, height))
    offset_x = -(variant * 173 % tile_size)
    offset_y = -(variant * 91 % tile_size)
    row = 0
    for y in range(offset_y, height, tile_size):
        column = 0
        for x in range(offset_x, width, tile_size):
            piece = tile
            if column % 2:
                piece = ImageOps.mirror(piece)
            if row % 2:
                piece = ImageOps.flip(piece)
            rgb.paste(piece, (x, y))
            column += 1
        row += 1
    result = rgb.convert("RGBA")
    result.putalpha(alpha)
    return result


def main():
    for variant, (source_name, output_name, target_aspect, target_width) in enumerate(ASSETS, start=1):
        mask = crop_pad_resize(extract_rgba(TEXTURE_DIR / source_name), target_aspect, target_width)
        result = apply_clean_sand_rgb(mask, variant)
        output = TEXTURE_DIR / output_name
        result.save(output, optimize=True)
        print(f"RGBA={output} size={result.size}")


if __name__ == "__main__":
    main()
