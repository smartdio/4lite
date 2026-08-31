"""Upgrade the production door/window Blender assets and export their GLBs.

Run from Blender in background mode.  The script deliberately preserves object
names, parents, custom properties, transforms, and animation pivots.
"""

from __future__ import annotations

import math
import os
import sys
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[1]
TEXTURE_DIR = ROOT / "assets" / "source-textures" / "door-window"
PREVIEW_DIR = ROOT / "artifacts" / "door-window-materials"


def load_fresh_image(path: Path, colorspace: str):
    image = bpy.data.images.load(str(path), check_existing=True)
    if image.packed_file is not None:
        image.unpack(method="USE_ORIGINAL")
    image.filepath = str(path)
    image.reload()
    image.colorspace_settings.name = colorspace
    return image


def principled(material: bpy.types.Material) -> bpy.types.ShaderNodeBsdfPrincipled:
    material.use_nodes = True
    nodes = material.node_tree.nodes
    shader = next((node for node in nodes if node.type == "BSDF_PRINCIPLED"), None)
    if shader is None:
        nodes.clear()
        shader = nodes.new("ShaderNodeBsdfPrincipled")
        output = nodes.new("ShaderNodeOutputMaterial")
        material.node_tree.links.new(shader.outputs["BSDF"], output.inputs["Surface"])
    for node in list(nodes):
        if node not in {shader} and node.type != "OUTPUT_MATERIAL":
            nodes.remove(node)
    return shader


def set_input(shader, names, value):
    for name in names:
        socket = shader.inputs.get(name)
        if socket is not None:
            socket.default_value = value
            return


def image_material(
    material_name: str,
    base_path: Path,
    roughness_path: Path,
    base_factor,
    roughness: float,
    *,
    metallic: float = 0.0,
    anisotropic: float = 0.0,
    emission=None,
    emission_strength: float = 0.0,
):
    material = bpy.data.materials[material_name]
    shader = principled(material)
    set_input(shader, ["Base Color"], base_factor)
    set_input(shader, ["Metallic"], metallic)
    set_input(shader, ["Roughness"], roughness)
    set_input(shader, ["IOR"], 1.46)
    set_input(shader, ["Coat Weight", "Clearcoat"], 0.10)
    set_input(shader, ["Coat Roughness", "Clearcoat Roughness"], 0.48)
    set_input(shader, ["Anisotropic IOR Level", "Anisotropic"], anisotropic)
    if emission is not None:
        set_input(shader, ["Emission Color", "Emission"], emission)
        set_input(shader, ["Emission Strength"], emission_strength)

    base = material.node_tree.nodes.new("ShaderNodeTexImage")
    base.name = "Painted wood base color"
    base.label = "Aged green painted wood"
    base.image = load_fresh_image(base_path, "sRGB")
    material.node_tree.links.new(base.outputs["Color"], shader.inputs["Base Color"])

    rough = material.node_tree.nodes.new("ShaderNodeTexImage")
    rough.name = "Painted wood roughness"
    rough.image = load_fresh_image(roughness_path, "Non-Color")
    material.node_tree.links.new(rough.outputs["Color"], shader.inputs["Roughness"])
    material.diffuse_color = base_factor


def solid_material(
    material_name: str,
    color,
    *,
    metallic: float,
    roughness: float,
    anisotropic: float = 0.0,
):
    material = bpy.data.materials[material_name]
    shader = principled(material)
    set_input(shader, ["Base Color"], color)
    set_input(shader, ["Metallic"], metallic)
    set_input(shader, ["Roughness"], roughness)
    set_input(shader, ["IOR"], 1.46)
    set_input(shader, ["Anisotropic IOR Level", "Anisotropic"], anisotropic)
    material.diffuse_color = color


def glass_material(material_name: str, color=(0.33, 0.55, 0.58, 0.30)):
    material = bpy.data.materials[material_name]
    shader = principled(material)
    set_input(shader, ["Base Color"], color)
    set_input(shader, ["Metallic"], 0.0)
    set_input(shader, ["Roughness"], 0.16)
    set_input(shader, ["IOR"], 1.47)
    set_input(shader, ["Alpha"], color[3])
    # Keep transmission restrained: it reads as old, slightly dusty glazing and
    # remains stable when dozens of windows are rendered as Three.js instances.
    set_input(shader, ["Transmission Weight", "Transmission"], 0.12)
    base = material.node_tree.nodes.new("ShaderNodeTexImage")
    base.image = load_fresh_image(TEXTURE_DIR / "old-glass-bluegrey-basecolor-v1.png", "sRGB")
    material.node_tree.links.new(base.outputs["Color"], shader.inputs["Base Color"])
    material.node_tree.links.new(base.outputs["Alpha"], shader.inputs["Alpha"])
    rough = material.node_tree.nodes.new("ShaderNodeTexImage")
    rough.image = load_fresh_image(TEXTURE_DIR / "old-glass-bluegrey-roughness-v1.png", "Non-Color")
    material.node_tree.links.new(rough.outputs["Color"], shader.inputs["Roughness"])
    material.diffuse_color = color
    material.surface_render_method = "DITHERED"
    material.use_transparency_overlap = False


def add_small_bevels(width: float):
    for obj in bpy.data.objects:
        if obj.type != "MESH" or "Glass" in obj.name or "Glass" in " ".join(m.name for m in obj.data.materials):
            continue
        if any(mod.type == "BEVEL" and mod.name == "Material edge softness" for mod in obj.modifiers):
            continue
        bevel = obj.modifiers.new("Material edge softness", "BEVEL")
        bevel.width = width
        bevel.segments = 2
        bevel.limit_method = "ANGLE"
        bevel.angle_limit = math.radians(30)


def ensure_box_uvs(objects, force=False):
    for obj in objects:
        if obj.type != "MESH" or (len(obj.data.uv_layers) and not force):
            continue
        mesh = obj.data
        uv_layer = mesh.uv_layers.active or mesh.uv_layers.new(name="MaterialUV")
        coordinates = [vertex.co for vertex in mesh.vertices]
        mins = [min(co[i] for co in coordinates) for i in range(3)]
        maxs = [max(co[i] for co in coordinates) for i in range(3)]
        spans = [max(maxs[i] - mins[i], 1e-8) for i in range(3)]
        for polygon in mesh.polygons:
            dominant = max(range(3), key=lambda axis: abs(polygon.normal[axis]))
            axes = (1, 2) if dominant == 0 else (0, 2) if dominant == 1 else (0, 1)
            for loop_index in polygon.loop_indices:
                co = mesh.vertices[mesh.loops[loop_index].vertex_index].co
                uv_layer.data[loop_index].uv = (
                    (co[axes[0]] - mins[axes[0]]) / spans[axes[0]],
                    (co[axes[1]] - mins[axes[1]]) / spans[axes[1]],
                )


def descendants(root):
    result = []
    stack = [root]
    while stack:
        item = stack.pop()
        result.append(item)
        stack.extend(item.children)
    return result


def export_root(root_name: str, path: Path):
    bpy.ops.object.select_all(action="DESELECT")
    root = bpy.data.objects[root_name]
    # The production file stores each asset in an intentionally unlinked
    # collection. Link it only for this background export/render session.
    for collection in root.users_collection:
        if collection.name not in bpy.context.scene.collection.children:
            bpy.context.scene.collection.children.link(collection)
    bpy.context.view_layer.update()
    for obj in descendants(root):
        obj.select_set(True)
    bpy.context.view_layer.objects.active = root
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(path),
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=False,
        export_extras=True,
        export_materials="EXPORT",
        export_image_format="AUTO",
    )


def bounds(objects):
    points = []
    for obj in objects:
        if obj.type == "MESH":
            points.extend(obj.matrix_world @ Vector(corner) for corner in obj.bound_box)
    low = Vector((min(p.x for p in points), min(p.y for p in points), min(p.z for p in points)))
    high = Vector((max(p.x for p in points), max(p.y for p in points), max(p.z for p in points)))
    return low, high


def look_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def render_preview(kind: str, roots):
    # Production data was saved and exported before this temporary studio setup.
    original_locations = {root.name: root.location.copy() for root in roots}
    if kind == "b1":
        positions = [-2.7, -0.95, 1.05, 2.85]
        for root, x in zip(roots, positions):
            root.location.x = x
    else:
        roots[0].location.x = 0.0
    bpy.context.view_layer.update()

    low, high = bounds([obj for root in roots for obj in descendants(root)])
    center = (low + high) * 0.5
    size = high - low

    world = bpy.context.scene.world or bpy.data.worlds.new("Preview World")
    bpy.context.scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.055, 0.065, 0.075, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.32

    bpy.ops.object.camera_add(location=(center.x, low.y - max(size.x * 1.45, 4.5), center.z + size.z * 0.06))
    camera = bpy.context.object
    camera.data.lens = 52 if kind == "b1" else 66
    look_at(camera, center)
    bpy.context.scene.camera = camera

    for name, location, energy, size_value, color in (
        ("Key", (center.x - size.x * 0.6, low.y - 2.5, high.z + 1.8), 1050, 4.0, (1.0, 0.84, 0.68)),
        ("Fill", (center.x + size.x * 0.7, low.y - 1.0, center.z + 0.4), 720, 3.2, (0.57, 0.72, 1.0)),
        ("Rim", (center.x, high.y + 2.0, high.z + 1.0), 900, 3.0, (0.72, 0.85, 1.0)),
    ):
        bpy.ops.object.light_add(type="AREA", location=location)
        light = bpy.context.object
        light.name = name
        light.data.energy = energy
        light.data.shape = "DISK"
        light.data.size = size_value
        light.data.color = color
        look_at(light, center)

    bpy.ops.mesh.primitive_plane_add(size=max(size.x, size.z) * 2.5, location=(center.x, center.y, low.z - 0.006))
    floor = bpy.context.object
    floor_mat = bpy.data.materials.new("Preview charcoal floor")
    solid_material_for_new(floor_mat, (0.075, 0.085, 0.095, 1), 0.0, 0.72)
    floor.data.materials.append(floor_mat)

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1500 if kind == "b1" else 1000
    scene.render.resolution_y = 850 if kind == "b1" else 1000
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.render.filepath = str(PREVIEW_DIR / f"{kind}-material-preview-v02.png")
    scene.view_settings.look = "AgX - Medium High Contrast"
    bpy.ops.render.render(write_still=True)

    for root in roots:
        root.location = original_locations[root.name]


def solid_material_for_new(material, color, metallic, roughness):
    shader = principled(material)
    set_input(shader, ["Base Color"], color)
    set_input(shader, ["Metallic"], metallic)
    set_input(shader, ["Roughness"], roughness)


def main(kind: str):
    TEXTURE_DIR.mkdir(parents=True, exist_ok=True)
    PREVIEW_DIR.mkdir(parents=True, exist_ok=True)

    if kind == "b1":
        ensure_box_uvs(bpy.data.objects, force=True)
        image_material(
            "wood_base",
            TEXTURE_DIR / "painted-wood-green-frame-basecolor-v2.png",
            TEXTURE_DIR / "painted-wood-green-frame-roughness-v2.png",
            (0.82, 0.88, 0.78, 1.0),
            0.76,
        )
        image_material(
            "wood_panel",
            TEXTURE_DIR / "painted-wood-green-panel-seams-basecolor-v2.png",
            TEXTURE_DIR / "painted-wood-green-panel-roughness-v2.png",
            (0.92, 0.96, 0.88, 1.0),
            0.80,
        )
        glass_material("glass_base", (0.30, 0.52, 0.56, 0.29))
        solid_material("metal_dark", (0.075, 0.068, 0.056, 1.0), metallic=0.72, roughness=0.52)
        add_small_bevels(0.0022)
        roots = [
            bpy.data.objects["b1_classroom_door_wood_left_v01"],
            bpy.data.objects["b1_classroom_door_wood_right_v01"],
            bpy.data.objects["b1_classroom_window_wood_corridor_v01"],
            bpy.data.objects["b1_classroom_window_wood_rear_v01"],
        ]
        outputs = [
            ROOT / "public/assets/models/building-1/b1-classroom-door-wood-left-v01.glb",
            ROOT / "public/assets/models/building-1/b1-classroom-door-wood-right-v01.glb",
            ROOT / "public/assets/models/building-1/b1-classroom-window-wood-corridor-v01.glb",
            ROOT / "public/assets/models/building-1/b1-classroom-window-wood-rear-v01.glb",
        ]
    elif kind == "b2":
        ensure_box_uvs(bpy.data.objects, force=True)
        image_material(
            "M_B2_SilverGrey_Alloy",
            TEXTURE_DIR / "oxidized-alloy-basecolor-v1.png",
            TEXTURE_DIR / "oxidized-alloy-roughness-v1.png",
            (0.92, 0.95, 0.96, 1.0),
            0.40,
            metallic=0.28,
            anisotropic=0.16,
            emission=(0.16, 0.18, 0.19, 1.0),
            emission_strength=0.55,
        )
        image_material(
            "M_B2_Security_Iron",
            TEXTURE_DIR / "aged-security-iron-basecolor-v1.png",
            TEXTURE_DIR / "aged-security-iron-roughness-v1.png",
            (0.82, 0.84, 0.84, 1.0),
            0.53,
            metallic=0.70,
        )
        glass_material("M_B2_BlueTint_Glass", (0.27, 0.50, 0.56, 0.27))
        add_small_bevels(0.0014)
        roots = [bpy.data.objects["b2_classroom_window_alloy_v01"]]
        outputs = [ROOT / "public/assets/models/building-2/b2-classroom-window-alloy-v01.glb"]
    else:
        raise ValueError(f"Unknown asset kind: {kind}")

    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath)
    for root, output in zip(roots, outputs):
        export_root(root.name, output)
        print(f"EXPORTED {output.relative_to(ROOT)} {output.stat().st_size} bytes")
    render_preview(kind, roots)


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    if not args:
        raise SystemExit("usage: blender -b FILE --python SCRIPT -- b1|b2")
    main(args[0])
