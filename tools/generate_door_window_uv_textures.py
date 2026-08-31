"""Generate deterministic, production UV textures from the project's source art."""

from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "assets" / "source-textures"
OUT = SOURCE_DIR / "door-window"
SIZE = 1024
RNG = np.random.default_rng(41726)


def load_rgb(name):
    return np.asarray(Image.open(SOURCE_DIR / name).convert("RGB").resize((SIZE, SIZE), Image.Resampling.LANCZOS), dtype=np.float32) / 255.0


def save_rgb(name, array):
    Image.fromarray(np.uint8(np.clip(array, 0, 1) * 255), "RGB").save(OUT / name, optimize=True)


def smooth_noise(radius, seed_scale=1.0):
    raw = RNG.random((SIZE, SIZE), dtype=np.float32) * seed_scale
    image = Image.fromarray(np.uint8(raw / max(seed_scale, 1e-6) * 255), "L").filter(ImageFilter.GaussianBlur(radius))
    result = np.asarray(image, dtype=np.float32) / 255.0
    return (result - result.min()) / max(result.max() - result.min(), 1e-6)


def edge_distance():
    y, x = np.mgrid[0:SIZE, 0:SIZE]
    return np.minimum.reduce([x, y, SIZE - 1 - x, SIZE - 1 - y]).astype(np.float32)


def painted_wood():
    green = load_rgb("painted-steel-dark-green-basecolor-source-v1.png")
    wood = load_rgb("wood-painted-aged-basecolor-source-v1.png")
    wood_luma = wood @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
    grain = (wood_luma - 0.36)[..., None]
    base = green * 0.86 + np.array([0.22, 0.27, 0.20])[None, None, :] * 0.14
    base += grain * np.array([0.055, 0.065, 0.038])[None, None, :]

    distance = edge_distance()
    edge_shadow = np.clip((38.0 - distance) / 38.0, 0, 1)[..., None]
    base *= 1.0 - edge_shadow * 0.16

    chips = (smooth_noise(2.2) > 0.70).astype(np.float32)
    chips *= np.clip((44.0 - distance) / 34.0, 0, 1)
    chips = np.asarray(Image.fromarray(np.uint8(chips * 255), "L").filter(ImageFilter.GaussianBlur(0.65)), dtype=np.float32) / 255.0
    exposed = np.dstack((0.31 + wood_luma * 0.23, 0.20 + wood_luma * 0.15, 0.105 + wood_luma * 0.09))
    frame = base * (1 - chips[..., None] * 0.78) + exposed * chips[..., None] * 0.78

    panel = base * np.array([1.06, 1.075, 1.025])[None, None, :]
    panel *= 1.0 - edge_shadow * 0.23
    # Two restrained plank joints: dark core plus a one-pixel worn highlight.
    for center in (SIZE // 3, 2 * SIZE // 3):
        panel[:, center - 1:center + 1] *= np.array([0.72, 0.75, 0.69])[None, None, :]
        panel[:, center + 1:center + 2] *= 1.045
    panel = panel * (1 - chips[..., None] * 0.58) + exposed * chips[..., None] * 0.58

    rough_frame = np.clip(0.70 + smooth_noise(8) * 0.18 + chips * 0.10, 0, 1)
    rough_panel = np.clip(0.72 + smooth_noise(10) * 0.16 + chips * 0.10, 0, 1)
    save_rgb("painted-wood-green-frame-basecolor-v2.png", frame)
    save_rgb("painted-wood-green-panel-seams-basecolor-v2.png", panel)
    save_rgb("painted-wood-green-frame-roughness-v2.png", np.repeat(rough_frame[..., None], 3, axis=2))
    save_rgb("painted-wood-green-panel-roughness-v2.png", np.repeat(rough_panel[..., None], 3, axis=2))


def alloy_and_iron():
    y, x = np.mgrid[0:SIZE, 0:SIZE]
    fine = np.sin(x * 0.75) * 0.012 + np.sin(x * 2.2) * 0.005
    broad = (smooth_noise(16) - 0.5) * 0.055
    # Keep the albedo deliberately bright. The campus uses direct lights but no
    # reflection environment, so physically dark metal albedo reads black-green.
    alloy_luma = np.clip(0.64 + fine + broad, 0, 1)
    alloy = np.dstack((alloy_luma * 0.96, alloy_luma, alloy_luma * 1.015))
    edge = np.clip((28.0 - edge_distance()) / 28.0, 0, 1)
    alloy *= 1 - edge[..., None] * 0.11
    oxidation = ((smooth_noise(3.0) > 0.73) * edge)[..., None]
    alloy = alloy * (1 - oxidation * 0.22) + np.array([0.28, 0.31, 0.31])[None, None, :] * oxidation * 0.22
    alloy_rough = np.clip(0.25 + smooth_noise(5) * 0.15 + oxidation[..., 0] * 0.20, 0, 1)

    iron_noise = smooth_noise(8)
    iron = np.dstack((0.085 + iron_noise * 0.045, 0.095 + iron_noise * 0.045, 0.096 + iron_noise * 0.042))
    rust = (smooth_noise(2.4) > 0.76).astype(np.float32) * 0.34
    iron = iron * (1 - rust[..., None]) + np.array([0.31, 0.135, 0.055])[None, None, :] * rust[..., None]
    iron_rough = np.clip(0.48 + smooth_noise(7) * 0.23 + rust * 0.20, 0, 1)

    save_rgb("oxidized-alloy-basecolor-v1.png", alloy)
    save_rgb("oxidized-alloy-roughness-v1.png", np.repeat(alloy_rough[..., None], 3, axis=2))
    save_rgb("aged-security-iron-basecolor-v1.png", iron)
    save_rgb("aged-security-iron-roughness-v1.png", np.repeat(iron_rough[..., None], 3, axis=2))


def glass():
    cloud = smooth_noise(28)
    luma = 0.58 + (cloud - 0.5) * 0.08
    rgba = np.zeros((SIZE, SIZE, 4), dtype=np.uint8)
    rgba[..., 0] = np.uint8(np.clip(luma * 0.64, 0, 1) * 255)
    rgba[..., 1] = np.uint8(np.clip(luma * 0.86, 0, 1) * 255)
    rgba[..., 2] = np.uint8(np.clip(luma * 0.91, 0, 1) * 255)
    rgba[..., 3] = np.uint8(np.clip(0.18 + cloud * 0.08, 0, 1) * 255)
    Image.fromarray(rgba, "RGBA").save(OUT / "old-glass-bluegrey-basecolor-v1.png", optimize=True)
    glass_rough = np.clip(0.12 + cloud * 0.11, 0, 1)
    save_rgb("old-glass-bluegrey-roughness-v1.png", np.repeat(glass_rough[..., None], 3, axis=2))


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    painted_wood()
    alloy_and_iron()
    glass()
    for path in sorted(OUT.glob("*.png")):
        print(path.relative_to(ROOT))


if __name__ == "__main__":
    main()
