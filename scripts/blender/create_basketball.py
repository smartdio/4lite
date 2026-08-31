#!/usr/bin/env python3
"""Build the project basketball from the archived CC0 OpenGameArt source."""

from __future__ import annotations

import math
import shutil
import subprocess
import tempfile
import zipfile
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
SOURCE_ARCHIVE = ROOT / "assets/source/models/basketball/digitaln8m4r3-basketballs-cc0-source.zip"
SOURCE_BLEND = ROOT / "assets/source/blender/basketball-source-v01.blend"
TEXTURE_DIR = ROOT / "assets/source-textures/basketball"
MODEL_DIR = ROOT / "public/assets/models/basketball"
QA_DIR = ROOT / "docs/concepts"
OUTPUT_GLB = MODEL_DIR / "basketball-game-optimized-v01.glb"
TARGET_DIAMETER = 0.24
TEXTURE_SIZE = 512


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (
        bpy.data.meshes,
        bpy.data.curves,
        bpy.data.materials,
        bpy.data.cameras,
        bpy.data.lights,
    ):
        for datablock in list(datablocks):
            if datablock.users == 0:
                datablocks.remove(datablock)


def run_magick(*args: str) -> None:
    executable = shutil.which("magick")
    if not executable:
        raise RuntimeError("ImageMagick 'magick' is required to build basketball textures")
    subprocess.run([executable, *args], check=True)


def build_textures(source_dir: Path) -> tuple[Path, Path]:
    TEXTURE_DIR.mkdir(parents=True, exist_ok=True)
    source_base = source_dir / "basketball/textures/classic_baseColor.png"
    source_normal = source_dir / "basketball/textures/normal.png"
    if not source_base.exists() or not source_normal.exists():
        raise FileNotFoundError("Expected classic basketball textures are missing from the source archive")

    base_path = TEXTURE_DIR / "basketball-classic-aged-basecolor-v01.png"
    normal_path = TEXTURE_DIR / "basketball-classic-normal-v01.png"
    run_magick(
        str(source_base), "-resize", f"{TEXTURE_SIZE}x{TEXTURE_SIZE}",
        "-modulate", "84,78,98", "-fill", "#9a6346", "-colorize", "7%",
        str(base_path),
    )
    run_magick(str(source_normal), "-resize", f"{TEXTURE_SIZE}x{TEXTURE_SIZE}", str(normal_path))
    return base_path, normal_path


def import_source(source_dir: Path) -> bpy.types.Object:
    source_fbx = source_dir / "basketball/basketball.fbx"
    if not source_fbx.exists():
        raise FileNotFoundError("Expected basketball.fbx is missing from the source archive")
    bpy.ops.import_scene.fbx(filepath=str(source_fbx))
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if len(meshes) != 1:
        raise RuntimeError(f"Expected one source mesh, found {len(meshes)}")
    ball = meshes[0]
    ball.name = "basketball-game-v01"
    ball.data.name = "basketball-game-v01-geometry"

    bpy.ops.object.select_all(action="DESELECT")
    ball.select_set(True)
    bpy.context.view_layer.objects.active = ball
    # FBX arrives with a coordinate-system rotation. Bake it before any
    # non-uniform spherical correction; otherwise rotating the exported parent
    # in Three.js combines hidden rotation and scale into a visibly stretched ball.
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)

    # The source is already close to a youth/school basketball size, but its three
    # axes differ slightly. Normalize the visual shell to a true 0.24 m sphere.
    dimensions = ball.dimensions.copy()
    if min(dimensions) <= 0:
        raise RuntimeError(f"Invalid source dimensions: {tuple(dimensions)}")
    ball.scale.x *= TARGET_DIAMETER / dimensions.x
    ball.scale.y *= TARGET_DIAMETER / dimensions.y
    ball.scale.z *= TARGET_DIAMETER / dimensions.z
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

    rounding = ball.modifiers.new("basketball-game-rounding", "SUBSURF")
    rounding.subdivision_type = "CATMULL_CLARK"
    rounding.levels = 1
    rounding.render_levels = 1
    bpy.context.view_layer.objects.active = ball
    bpy.ops.object.modifier_apply(modifier=rounding.name)

    # Catmull-Clark slightly contracts the source silhouette. Re-normalize after
    # applying the modifier so the exported visual shell is exactly 0.24 m.
    dimensions = ball.dimensions.copy()
    ball.scale.x *= TARGET_DIAMETER / dimensions.x
    ball.scale.y *= TARGET_DIAMETER / dimensions.y
    ball.scale.z *= TARGET_DIAMETER / dimensions.z
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

    local_center = sum((Vector(corner) for corner in ball.bound_box), Vector()) / 8
    ball.data.transform(__import__("mathutils").Matrix.Translation(-local_center))
    ball.location = (0, 0, 0)
    for polygon in ball.data.polygons:
        polygon.use_smooth = True
    ball.data.update()
    return ball


def create_material(base_path: Path, normal_path: Path) -> bpy.types.Material:
    material = bpy.data.materials.new("basketball-aged-rubber-v01")
    material.use_nodes = True
    material.diffuse_color = (0.53, 0.20, 0.09, 1)
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()

    output = nodes.new("ShaderNodeOutputMaterial")
    shader = nodes.new("ShaderNodeBsdfPrincipled")
    shader.inputs["Roughness"].default_value = 0.9
    shader.inputs["Metallic"].default_value = 0
    shader.inputs["Specular IOR Level"].default_value = 0.28
    links.new(shader.outputs["BSDF"], output.inputs["Surface"])

    base_image = bpy.data.images.load(str(base_path), check_existing=False)
    base_image.name = "basketball-classic-aged-basecolor-v01"
    base_image.colorspace_settings.name = "sRGB"
    base = nodes.new("ShaderNodeTexImage")
    base.name = "Basketball Base Color"
    base.image = base_image
    base.interpolation = "Linear"
    links.new(base.outputs["Color"], shader.inputs["Base Color"])

    normal_image = bpy.data.images.load(str(normal_path), check_existing=False)
    normal_image.name = "basketball-classic-normal-v01"
    normal_image.colorspace_settings.name = "Non-Color"
    normal = nodes.new("ShaderNodeTexImage")
    normal.name = "Basketball Normal"
    normal.image = normal_image
    normal.interpolation = "Linear"
    normal_map = nodes.new("ShaderNodeNormalMap")
    normal_map.inputs["Strength"].default_value = 0.5
    links.new(normal.outputs["Color"], normal_map.inputs["Color"])
    links.new(normal_map.outputs["Normal"], shader.inputs["Normal"])
    return material


def look_at(obj: bpy.types.Object, target: Vector) -> None:
    obj.rotation_euler = (target - obj.location).to_track_quat("-Z", "Y").to_euler()


def create_preview_scene(ball: bpy.types.Object) -> dict[str, bpy.types.Object]:
    world = bpy.data.worlds.new("Basketball QA World") if not bpy.context.scene.world else bpy.context.scene.world
    bpy.context.scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.78, 0.74, 0.67, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.38

    key_data = bpy.data.lights.new("Basketball QA Key", "AREA")
    key_data.energy = 20
    key_data.shape = "DISK"
    key_data.size = 0.55
    key = bpy.data.objects.new("Basketball QA Key", key_data)
    bpy.context.scene.collection.objects.link(key)
    key.location = (-0.38, -0.44, 0.52)
    look_at(key, Vector((0, 0, 0)))

    fill_data = bpy.data.lights.new("Basketball QA Fill", "AREA")
    fill_data.energy = 7
    fill_data.size = 0.4
    fill = bpy.data.objects.new("Basketball QA Fill", fill_data)
    bpy.context.scene.collection.objects.link(fill)
    fill.location = (0.4, -0.15, 0.22)
    look_at(fill, Vector((0, 0, 0)))

    cameras = {}
    for name, location in {
        "threequarter": (0.34, -0.42, 0.27),
        "front": (0, -0.55, 0),
        "side": (0.55, 0, 0),
    }.items():
        camera_data = bpy.data.cameras.new(f"Basketball QA {name}")
        camera_data.type = "ORTHO"
        camera_data.ortho_scale = 0.305
        camera = bpy.data.objects.new(f"Basketball QA {name}", camera_data)
        bpy.context.scene.collection.objects.link(camera)
        camera.location = location
        look_at(camera, Vector((0, 0, 0)))
        cameras[name] = camera

    ball["asset"] = "basketball"
    ball["source_license"] = "CC0-1.0"
    ball["source_author"] = "DigitalN8m4r3 / Miodrag Sejic"
    ball["diameter_m"] = TARGET_DIAMETER
    ball["collision"] = "analytic sphere, radius 0.12 m"
    return cameras


def save_render_export(ball: bpy.types.Object, cameras: dict[str, bpy.types.Object]) -> None:
    SOURCE_BLEND.parent.mkdir(parents=True, exist_ok=True)
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    QA_DIR.mkdir(parents=True, exist_ok=True)
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE_BLEND))

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 720
    scene.render.resolution_y = 720
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    try:
        scene.view_settings.look = "AgX - Medium High Contrast"
    except TypeError:
        scene.view_settings.look = "Medium High Contrast"
    for name, camera in cameras.items():
        scene.camera = camera
        scene.render.filepath = str(QA_DIR / f"basketball-model-qa-v01-{name}.png")
        bpy.ops.render.render(write_still=True)

    bpy.ops.object.select_all(action="DESELECT")
    ball.select_set(True)
    bpy.context.view_layer.objects.active = ball
    bpy.ops.export_scene.gltf(
        filepath=str(OUTPUT_GLB),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_materials="EXPORT",
        export_image_format="AUTO",
        export_texcoords=True,
        export_normals=True,
        export_tangents=True,
        export_attributes=True,
        export_cameras=False,
        export_lights=False,
        export_extras=True,
    )


def main() -> None:
    if not SOURCE_ARCHIVE.exists():
        raise FileNotFoundError(f"Missing archived source: {SOURCE_ARCHIVE}")
    with tempfile.TemporaryDirectory(prefix="4lite-basketball-") as temporary:
        temporary_path = Path(temporary)
        with zipfile.ZipFile(SOURCE_ARCHIVE) as archive:
            archive.extractall(temporary_path)
        base_path, normal_path = build_textures(temporary_path)
        clear_scene()
        ball = import_source(temporary_path)
        ball.data.materials.clear()
        ball.data.materials.append(create_material(base_path, normal_path))
        cameras = create_preview_scene(ball)
        save_render_export(ball, cameras)
        print(
            f"BUILT basketball: vertices={len(ball.data.vertices)} polygons={len(ball.data.polygons)} "
            f"diameter={TARGET_DIAMETER} BLEND={SOURCE_BLEND} GLB={OUTPUT_GLB}"
        )


if __name__ == "__main__":
    main()
