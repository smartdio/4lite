#!/usr/bin/env python3
"""Build the approved period-school freestanding basketball hoop.

Run with:
  /Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/blender/create_basketball_hoop.py
"""

from __future__ import annotations

import math
import random
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
SOURCE_BLEND = ROOT / "assets/source/blender/basketball-hoop-source-v01.blend"
TEXTURE_DIR = ROOT / "assets/source-textures/basketball-hoop"
MODEL_DIR = ROOT / "public/assets/models/basketball-hoop"
QA_DIR = ROOT / "docs/concepts"
OUTPUT_GLB = MODEL_DIR / "basketball-hoop-game-optimized-v01.glb"
ATLAS_PATH = TEXTURE_DIR / "basketball-hoop-atlas-v01.png"

RIM_HEIGHT = 2.75
RIM_INNER_DIAMETER = 0.50
BOARD_WIDTH = 1.80
BOARD_HEIGHT = 1.05
BOARD_BOTTOM = 2.60
BOARD_CENTER_Y = BOARD_BOTTOM + BOARD_HEIGHT / 2
BOARD_Z = -1.706
BOARD_SUPPORT_Z = BOARD_Z + 0.055
RIM_CENTER_Z = BOARD_Z - 0.375
BASE_WIDTH = 1.75
BASE_DEPTH = 1.336
PIPE_RADIUS = 0.028

# Confirmed single-side frame, mapped metrically from
# docs/concepts/basketball-hoop-side-structure-v0.1.svg. Two identical
# frames are placed at X +/-0.68 and connected only by straight crossbeams.
FRAME_REAR_Z = 0.608
FRAME_FRONT_UPRIGHT_Z = -0.608
FRAME_LONG_TOP_Z = -1.316
FRAME_LONG_TOP_Y = 3.396
FRAME_MIDDLE_Y = 3.020
FRAME_MIDDLE_LONG_Z = -1.099
FRAME_LOWER_START_Z = -1.400
FRAME_LOWER_END_Y = 1.648
FRAME_UPRIGHT_TOP_Y = 2.169

SWATCHES = {
    "steel": (0.105, 0.16, 0.17, 1.0),
    "board": (0.56, 0.58, 0.52, 1.0),
    "mark": (0.105, 0.12, 0.12, 1.0),
    "rim": (0.50, 0.105, 0.045, 1.0),
    "rope": (0.75, 0.69, 0.56, 1.0),
    "rust": (0.31, 0.105, 0.04, 1.0),
}


def to_blender(values: tuple[float, float, float] | Vector) -> Vector:
    """Convert intended glTF/Three coordinates (Y up, front -Z) to Blender Z-up."""
    x, y, z = values
    return Vector((x, -z, y))


def size_to_blender(values: tuple[float, float, float]) -> Vector:
    x, y, z = values
    return Vector((x, z, y))


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for blocks in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.images, bpy.data.cameras, bpy.data.lights):
        for block in list(blocks):
            if block.users == 0:
                blocks.remove(block)


def build_atlas() -> bpy.types.Image:
    TEXTURE_DIR.mkdir(parents=True, exist_ok=True)
    size = 512
    image = bpy.data.images.new("basketball-hoop-atlas-v01", width=size, height=size, alpha=True)
    rng = random.Random(1982)
    names = list(SWATCHES)
    pixels = [0.0] * (size * size * 4)
    for y in range(size):
        for x in range(size):
            swatch = names[min(len(names) - 1, x * len(names) // size)]
            base = SWATCHES[swatch]
            broad = math.sin(y * 0.043 + x * 0.011) * 0.018
            grain = (rng.random() - 0.5) * (0.025 if swatch in {"steel", "board"} else 0.012)
            value = broad + grain
            index = (y * size + x) * 4
            pixels[index:index + 4] = [max(0, min(1, base[channel] + value)) for channel in range(3)] + [1.0]
    image.pixels.foreach_set(pixels)
    image.filepath_raw = str(ATLAS_PATH)
    image.file_format = "PNG"
    image.save()
    image.pack()
    return image


def create_material(image: bpy.types.Image) -> bpy.types.Material:
    material = bpy.data.materials.new("basketball-hoop-shared-atlas-v01")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    shader = nodes.new("ShaderNodeBsdfPrincipled")
    shader.inputs["Roughness"].default_value = 0.86
    shader.inputs["Metallic"].default_value = 0.04
    shader.inputs["Specular IOR Level"].default_value = 0.28
    texture = nodes.new("ShaderNodeTexImage")
    texture.image = image
    texture.interpolation = "Linear"
    links.new(texture.outputs["Color"], shader.inputs["Base Color"])
    links.new(shader.outputs["BSDF"], output.inputs["Surface"])
    return material


def set_swatch(obj: bpy.types.Object, swatch: str, material: bpy.types.Material) -> None:
    if obj.type != "MESH":
        return
    obj.data.materials.clear()
    obj.data.materials.append(material)
    uv = obj.data.uv_layers.get("UVMap") or obj.data.uv_layers.new(name="UVMap")
    names = list(SWATCHES)
    u = (names.index(swatch) + 0.5) / len(names)
    for loop in uv.data:
        loop.uv = (u, 0.5)


def apply_transform(obj: bpy.types.Object) -> bpy.types.Object:
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.select_set(False)
    return obj


def box(name: str, size: tuple[float, float, float], center: tuple[float, float, float], swatch: str, material: bpy.types.Material, bevel: float = 0.0) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(location=to_blender(center))
    obj = bpy.context.object
    obj.name = name
    obj.scale = size_to_blender(size) / 2
    apply_transform(obj)
    if bevel > 0:
        modifier = obj.modifiers.new(f"{name}-bevel", "BEVEL")
        modifier.width = bevel
        modifier.segments = 2
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        obj.select_set(False)
    set_swatch(obj, swatch, material)
    return obj


def cylinder_between(name: str, start: tuple[float, float, float], end: tuple[float, float, float], radius: float, swatch: str, material: bpy.types.Material, vertices: int = 10) -> bpy.types.Object:
    a, b = to_blender(start), to_blender(end)
    delta = b - a
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=delta.length, location=(a + b) / 2)
    obj = bpy.context.object
    obj.name = name
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = delta.to_track_quat("Z", "Y")
    obj.rotation_mode = "XYZ"
    apply_transform(obj)
    set_swatch(obj, swatch, material)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return obj


def torus(name: str, center: tuple[float, float, float], major_radius: float, minor_radius: float, swatch: str, material: bpy.types.Material, major_segments: int = 32, minor_segments: int = 8) -> bpy.types.Object:
    bpy.ops.mesh.primitive_torus_add(major_radius=major_radius, minor_radius=minor_radius, major_segments=major_segments, minor_segments=minor_segments, location=to_blender(center))
    obj = bpy.context.object
    obj.name = name
    set_swatch(obj, swatch, material)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return obj


def join_objects(name: str, objects: list[bpy.types.Object]) -> bpy.types.Object:
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    joined = bpy.context.object
    joined.name = name
    joined.data.name = f"{name}-geometry"
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    joined["assemblyPart"] = name
    joined["clickable"] = True
    joined["explodable"] = True
    joined.select_set(False)
    return joined


def create_model(material: bpy.types.Material) -> list[bpy.types.Object]:
    base = []
    y = PIPE_RADIUS + 0.008
    x0, x1 = -BASE_WIDTH / 2 + PIPE_RADIUS, BASE_WIDTH / 2 - PIPE_RADIUS
    z0, z1 = FRAME_FRONT_UPRIGHT_Z, FRAME_REAR_Z
    base += [
        cylinder_between("base-left", (x0, y, z0), (x0, y, z1), PIPE_RADIUS, "steel", material),
        cylinder_between("base-right", (x1, y, z0), (x1, y, z1), PIPE_RADIUS, "steel", material),
        cylinder_between("base-front", (x0, y, z0), (x1, y, z0), PIPE_RADIUS, "steel", material),
        cylinder_between("base-rear", (x0, y, z1), (x1, y, z1), PIPE_RADIUS, "steel", material),
    ]
    for index, (x, z) in enumerate(((x0, z0), (x1, z0), (x0, z1), (x1, z1))):
        base.append(box(f"base-foot-{index + 1}", (0.16, 0.025, 0.11), (x, 0.014, z), "rust" if index in {1, 2} else "steel", material, 0.012))
    base_assembly = join_objects("basketball-hoop-base", base)

    supports = []
    for side in (-1, 1):
        x = side * 0.68
        # One confirmed planar side frame. The long rear arm and lower brace
        # are both 60 degrees to the horizontal base. The front upright is
        # straight and meets the long arm below the middle-beam intersection.
        supports.append(cylinder_between(f"long-rear-diagonal-{side}", (x, 0.064, FRAME_REAR_Z), (x, FRAME_LONG_TOP_Y, FRAME_LONG_TOP_Z), PIPE_RADIUS * 1.16, "steel", material, 12))
        supports.append(cylinder_between(f"upper-horizontal-short-arm-{side}", (x, FRAME_LONG_TOP_Y, FRAME_LONG_TOP_Z), (x, FRAME_LONG_TOP_Y, BOARD_SUPPORT_Z), PIPE_RADIUS, "steel", material))
        supports.append(cylinder_between(f"middle-horizontal-{side}", (x, FRAME_MIDDLE_Y, BOARD_SUPPORT_Z), (x, FRAME_MIDDLE_Y, FRAME_MIDDLE_LONG_Z), PIPE_RADIUS, "steel", material))
        supports.append(cylinder_between(f"front-straight-upright-{side}", (x, 0.064, FRAME_FRONT_UPRIGHT_Z), (x, FRAME_UPRIGHT_TOP_Y, FRAME_FRONT_UPRIGHT_Z), PIPE_RADIUS, "steel", material))
        supports.append(cylinder_between(f"lower-long-parallel-brace-{side}", (x, FRAME_MIDDLE_Y, FRAME_LOWER_START_Z), (x, FRAME_LOWER_END_Y, FRAME_FRONT_UPRIGHT_Z), PIPE_RADIUS * 1.03, "steel", material))
        supports.append(cylinder_between(f"board-carrier-{side}", (x, 2.64, BOARD_SUPPORT_Z), (x, 3.61, BOARD_SUPPORT_Z), PIPE_RADIUS, "steel", material))
    supports += [
        # Every lower side-frame contact point receives a straight crossbeam.
        cylinder_between("crossbeam-lower-brace-contact", (-0.68, FRAME_LOWER_END_Y, FRAME_FRONT_UPRIGHT_Z), (0.68, FRAME_LOWER_END_Y, FRAME_FRONT_UPRIGHT_Z), PIPE_RADIUS * 0.85, "steel", material),
        cylinder_between("crossbeam-upright-long-contact", (-0.68, FRAME_UPRIGHT_TOP_Y, FRAME_FRONT_UPRIGHT_Z), (0.68, FRAME_UPRIGHT_TOP_Y, FRAME_FRONT_UPRIGHT_Z), PIPE_RADIUS, "steel", material),
        cylinder_between("crossbeam-middle-long-joint", (-0.68, FRAME_MIDDLE_Y, FRAME_MIDDLE_LONG_Z), (0.68, FRAME_MIDDLE_Y, FRAME_MIDDLE_LONG_Z), PIPE_RADIUS, "steel", material),
        cylinder_between("crossbeam-upper-long-joint", (-0.68, FRAME_LONG_TOP_Y, FRAME_LONG_TOP_Z), (0.68, FRAME_LONG_TOP_Y, FRAME_LONG_TOP_Z), PIPE_RADIUS, "steel", material),
        cylinder_between("crossbeam-board-carrier-upper", (-0.68, FRAME_LONG_TOP_Y, BOARD_SUPPORT_Z), (0.68, FRAME_LONG_TOP_Y, BOARD_SUPPORT_Z), PIPE_RADIUS * 0.85, "steel", material),
        cylinder_between("crossbeam-board-carrier-middle", (-0.68, FRAME_MIDDLE_Y, BOARD_SUPPORT_Z), (0.68, FRAME_MIDDLE_Y, BOARD_SUPPORT_Z), PIPE_RADIUS * 0.85, "steel", material),
    ]
    for x, yy, zz in ((-0.68, FRAME_LOWER_END_Y, FRAME_FRONT_UPRIGHT_Z), (0.68, FRAME_LOWER_END_Y, FRAME_FRONT_UPRIGHT_Z), (-0.68, FRAME_LONG_TOP_Y, FRAME_LONG_TOP_Z), (0.68, FRAME_LONG_TOP_Y, FRAME_LONG_TOP_Z)):
        supports.append(torus(f"worn-joint-{x}-{yy}", (x, yy, zz), PIPE_RADIUS * 1.22, PIPE_RADIUS * 0.24, "rust", material, 12, 5))
    support_assembly = join_objects("basketball-hoop-support-frame", supports)

    board = [box("backboard-panel", (BOARD_WIDTH, BOARD_HEIGHT, 0.04), (0, BOARD_CENTER_Y, BOARD_Z), "board", material, 0.012)]
    frame_t = 0.045
    board += [
        box("backboard-frame-top", (BOARD_WIDTH + 0.05, frame_t, 0.055), (0, BOARD_CENTER_Y + BOARD_HEIGHT / 2, BOARD_Z), "steel", material, 0.008),
        box("backboard-frame-bottom", (BOARD_WIDTH + 0.05, frame_t, 0.055), (0, BOARD_CENTER_Y - BOARD_HEIGHT / 2, BOARD_Z), "steel", material, 0.008),
        box("backboard-frame-left", (frame_t, BOARD_HEIGHT, 0.055), (-BOARD_WIDTH / 2, BOARD_CENTER_Y, BOARD_Z), "steel", material, 0.008),
        box("backboard-frame-right", (frame_t, BOARD_HEIGHT, 0.055), (BOARD_WIDTH / 2, BOARD_CENTER_Y, BOARD_Z), "steel", material, 0.008),
    ]
    target_w, target_h, line_t = 0.59, 0.45, 0.035
    front_z = BOARD_Z - 0.024
    target_y = BOARD_BOTTOM + 0.30 + target_h / 2
    board += [
        box("target-top", (target_w, line_t, 0.006), (0, target_y + target_h / 2, front_z), "mark", material),
        box("target-bottom", (target_w, line_t, 0.006), (0, target_y - target_h / 2, front_z), "mark", material),
        box("target-left", (line_t, target_h, 0.006), (-target_w / 2, target_y, front_z), "mark", material),
        box("target-right", (line_t, target_h, 0.006), (target_w / 2, target_y, front_z), "mark", material),
    ]
    board_assembly = join_objects("basketball-hoop-backboard", board)

    ring_radius = RIM_INNER_DIAMETER / 2 + 0.018
    rim = [torus("basketball-rim", (0, RIM_HEIGHT, RIM_CENTER_Z), ring_radius, 0.018, "rim", material, 40, 8)]
    rim += [
        box("rim-mount-plate", (0.24, 0.20, 0.035), (0, RIM_HEIGHT, BOARD_Z - 0.04), "rim", material, 0.006),
        cylinder_between("rim-left-brace", (-0.11, RIM_HEIGHT - 0.075, BOARD_Z - 0.06), (-0.15, RIM_HEIGHT - 0.09, RIM_CENTER_Z + 0.08), 0.014, "rim", material, 8),
        cylinder_between("rim-right-brace", (0.11, RIM_HEIGHT - 0.075, BOARD_Z - 0.06), (0.15, RIM_HEIGHT - 0.09, RIM_CENTER_Z + 0.08), 0.014, "rim", material, 8),
        cylinder_between("rim-neck", (0, RIM_HEIGHT, BOARD_Z - 0.06), (0, RIM_HEIGHT, RIM_CENTER_Z + ring_radius), 0.018, "rim", material, 10),
    ]
    rim_assembly = join_objects("basketball-hoop-rim", rim)

    net = []
    strand_count = 12
    top_radius = RIM_INNER_DIAMETER / 2 - 0.01
    mid_radius = 0.17
    bottom_radius = 0.125
    top_y, mid_y, bottom_y = RIM_HEIGHT - 0.025, RIM_HEIGHT - 0.27, RIM_HEIGHT - 0.54
    for index in range(strand_count):
        a0 = 2 * math.pi * index / strand_count
        a1 = 2 * math.pi * (index + 0.5) / strand_count
        a2 = 2 * math.pi * (index + 1.0) / strand_count
        top = (math.cos(a0) * top_radius, top_y, RIM_CENTER_Z + math.sin(a0) * top_radius)
        mid = (math.cos(a1) * mid_radius, mid_y, RIM_CENTER_Z + math.sin(a1) * mid_radius)
        bottom = (math.cos(a2) * bottom_radius, bottom_y, RIM_CENTER_Z + math.sin(a2) * bottom_radius)
        net.append(cylinder_between(f"net-upper-{index + 1}", top, mid, 0.0042, "rope", material, 6))
        net.append(cylinder_between(f"net-lower-{index + 1}", mid, bottom, 0.0042, "rope", material, 6))
    net.append(torus("net-bottom-loop", (0, bottom_y, RIM_CENTER_Z), bottom_radius, 0.0042, "rope", material, 24, 5))
    net_assembly = join_objects("basketball-hoop-net", net)

    model = [base_assembly, support_assembly, board_assembly, rim_assembly, net_assembly]
    for obj in model:
        obj["asset"] = "basketball-hoop"
        obj["frontAxis"] = "-Z"
        obj["rimHeightM"] = RIM_HEIGHT
        obj["collision"] = "analytic proxies in runtime"
    return model


def look_at(obj: bpy.types.Object, target: Vector) -> None:
    obj.rotation_euler = (to_blender(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def create_qa_scene() -> dict[str, bpy.types.Object]:
    world = bpy.data.worlds.new("Basketball Hoop QA World")
    bpy.context.scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.72, 0.68, 0.60, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.45

    floor_mat = bpy.data.materials.new("QA floor")
    floor_mat.diffuse_color = (0.40, 0.37, 0.31, 1)
    floor = box("qa-floor", (7, 0.04, 7), (0, -0.03, 0), "board", next(iter(bpy.data.materials)))
    floor.data.materials.clear();floor.data.materials.append(floor_mat)
    floor["qaOnly"] = True

    key_data = bpy.data.lights.new("Hoop QA Key", "AREA")
    key_data.energy = 850;key_data.shape = "DISK";key_data.size = 4.0
    key = bpy.data.objects.new("Hoop QA Key", key_data);bpy.context.scene.collection.objects.link(key)
    key.location = to_blender((-4.5, 7.0, -5.0));look_at(key, Vector((0, 2.0, -0.3)))
    fill_data = bpy.data.lights.new("Hoop QA Fill", "AREA")
    fill_data.energy = 380;fill_data.size = 3.0
    fill = bpy.data.objects.new("Hoop QA Fill", fill_data);bpy.context.scene.collection.objects.link(fill)
    fill.location = to_blender((4.5, 4.0, -2.0));look_at(fill, Vector((0, 2.0, -0.2)))

    cameras = {}
    for name, location, scale in (
        ("threequarter", (-4.7, 4.0, -6.5), 4.5),
        ("front", (0, 2.25, -8.0), 4.25),
        ("side", (-6.5, 2.15, -0.62), 4.25),
        ("rear-threequarter", (4.7, 4.0, 4.8), 4.5),
    ):
        camera_data = bpy.data.cameras.new(f"Basketball Hoop QA {name}")
        camera_data.type = "ORTHO";camera_data.ortho_scale = scale
        camera = bpy.data.objects.new(f"Basketball Hoop QA {name}", camera_data)
        bpy.context.scene.collection.objects.link(camera);camera.location = to_blender(location)
        look_at(camera, Vector((0, 1.8, -0.62 if name == "side" else -0.2)));cameras[name] = camera
    return cameras


def save_render_export(model: list[bpy.types.Object], cameras: dict[str, bpy.types.Object]) -> None:
    SOURCE_BLEND.parent.mkdir(parents=True, exist_ok=True)
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    QA_DIR.mkdir(parents=True, exist_ok=True)
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE_BLEND))

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 840;scene.render.resolution_y = 840;scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG";scene.render.film_transparent = False
    scene.render.image_settings.color_mode = "RGBA"
    scene.view_settings.look = "AgX - Medium High Contrast"
    for name, camera in cameras.items():
        scene.camera = camera
        scene.render.filepath = str(QA_DIR / f"basketball-hoop-model-qa-v01-{name}.png")
        bpy.ops.render.render(write_still=True)

    bpy.ops.object.select_all(action="DESELECT")
    for obj in model:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = model[0]
    bpy.ops.export_scene.gltf(
        filepath=str(OUTPUT_GLB), export_format="GLB", use_selection=True,
        export_apply=True, export_yup=True, export_materials="EXPORT",
        export_image_format="AUTO", export_texcoords=True, export_normals=True,
        export_tangents=False, export_attributes=True, export_cameras=False,
        export_lights=False, export_extras=True,
    )


def main() -> None:
    clear_scene()
    image = build_atlas()
    material = create_material(image)
    model = create_model(material)
    cameras = create_qa_scene()
    save_render_export(model, cameras)
    triangles = sum(sum(len(p.vertices) - 2 for p in obj.data.polygons) for obj in model)
    print(
        f"BUILT basketball hoop: objects={len(model)} triangles={triangles} "
        f"rim={RIM_HEIGHT:.2f}m board={BOARD_WIDTH:.2f}x{BOARD_HEIGHT:.2f}m "
        f"base={BASE_WIDTH:.2f}x{BASE_DEPTH:.2f}m GLB={OUTPUT_GLB}"
    )


if __name__ == "__main__":
    main()
