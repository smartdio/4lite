"""Create the in-game period paddle from the licensed BlenderKit source.

The source model is "Table Tennis Paddle" by Kin Chen, BlenderKit asset
78913e2e-0687-4589-96aa-7e2b7b99febf, Royalty Free.  Keep the downloaded
source outside distributable project assets; pass its GLB path after ``--``.

Example:
  blender --background --python scripts/blender/optimize_blenderkit_ping_pong_paddle.py -- /tmp/blenderkit-table-tennis-paddle.glb
"""

from pathlib import Path
import math
import random
import sys

import bpy
from mathutils import Matrix, Vector


ROOT = Path(__file__).resolve().parents[2]
OUTPUT_GLB = ROOT / "public/assets/models/ping-pong-paddle/ping-pong-paddle-game-v01.glb"
SOURCE_BLEND = ROOT / "assets/source/blender/ping-pong-paddle-source-v01.blend"
QA_FRONT = ROOT / "docs/concepts/ping-pong-paddle-model-qa-v01.png"
QA_BACK = ROOT / "docs/concepts/ping-pong-paddle-model-qa-back-v01.png"
DEFAULT_SOURCE = Path("/tmp/blenderkit-table-tennis-paddle.glb")


def source_path():
    if "--" in sys.argv:
        args = sys.argv[sys.argv.index("--") + 1 :]
        if args:
            return Path(args[0]).expanduser().resolve()
    return DEFAULT_SOURCE


def reset_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
        for datablock in list(datablocks):
            if datablock.users == 0:
                datablocks.remove(datablock)


def make_material(name, colour, roughness):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    material.diffuse_color = (*colour, 1.0)
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*colour, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = 0.0
    colour_node = material.node_tree.nodes.new("ShaderNodeVertexColor")
    colour_node.layer_name = "Color"
    material.node_tree.links.new(colour_node.outputs["Color"], bsdf.inputs["Base Color"])
    return material


def decimate(obj, ratio):
    modifier = obj.modifiers.new(f"{obj.name}-game-decimation", "DECIMATE")
    modifier.decimate_type = "COLLAPSE"
    modifier.ratio = ratio
    modifier.use_collapse_triangulate = True
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=modifier.name)


def colour_vertices(obj, role):
    layer = obj.data.color_attributes.new(name="Color", type="BYTE_COLOR", domain="CORNER")
    rng = random.Random({"wood-core": 173, "wood-handle": 281, "rubber": 419}[role])
    vertex_noise = [rng.uniform(-1.0, 1.0) for _ in obj.data.vertices]
    ys = [vertex.co.y for vertex in obj.data.vertices]
    zs = [vertex.co.z for vertex in obj.data.vertices]
    y_mid = (min(ys) + max(ys)) * 0.5
    z_mid = (min(zs) + max(zs)) * 0.5
    y_radius = max((max(ys) - min(ys)) * 0.5, 1e-5)
    z_radius = max((max(zs) - min(zs)) * 0.5, 1e-5)
    for polygon in obj.data.polygons:
        for loop_index in polygon.loop_indices:
            vertex_index = obj.data.loops[loop_index].vertex_index
            vertex = obj.data.vertices[vertex_index].co
            noise = vertex_noise[vertex_index]
            if role == "rubber":
                radial = min(1.0, math.sqrt(((vertex.y - y_mid) / y_radius) ** 2 + ((vertex.z - z_mid) / z_radius) ** 2))
                rubbed = 0.5 + 0.5 * math.sin(vertex.y * 142.0 + math.sin(vertex.z * 87.0) * 1.7)
                wear = min(1.0, 0.12 + 0.20 * rubbed + 0.25 * max(0.0, radial - 0.72) / 0.28 + 0.06 * noise)
                base, worn = (0.13, 0.002, 0.001), (0.37, 0.030, 0.014)
            else:
                grain = 0.5 + 0.5 * math.sin(vertex.z * 280.0 + math.sin(vertex.y * 58.0) * 2.1)
                wear = min(1.0, 0.10 + 0.16 * grain + 0.07 * noise)
                if role == "wood-handle":
                    base, worn = (0.13, 0.040, 0.007), (0.36, 0.16, 0.040)
                else:
                    base, worn = (0.22, 0.075, 0.016), (0.48, 0.23, 0.070)
            colour = tuple(base[i] * (1.0 - wear) + worn[i] * wear for i in range(3))
            layer.data[loop_index].color = (*colour, 1.0)


def mark_rubber_vertices(obj, is_rubber):
    """Export a non-visual mask so Three.js can recolour only the rubber."""
    attribute = obj.data.attributes.new(name="_RUBBER_MASK", type="FLOAT", domain="POINT")
    value = 1.0 if is_rubber else 0.0
    for entry in attribute.data:
        entry.value = value


def split_by_material(paddle):
    bpy.ops.object.select_all(action="DESELECT")
    paddle.select_set(True)
    bpy.context.view_layer.objects.active = paddle
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.separate(type="MATERIAL")
    bpy.ops.object.mode_set(mode="OBJECT")
    return [obj for obj in bpy.context.selected_objects if obj.type == "MESH"]


def material_name(obj):
    return obj.material_slots[0].material.name if obj.material_slots and obj.material_slots[0].material else ""


def shorten_penhold_handle(parts, rubber):
    rubber_min_y = min((rubber.matrix_world @ vertex.co).y for vertex in rubber.data.vertices)
    join_y = rubber_min_y + 0.006
    handle_vertices = []
    for obj in parts:
        for vertex in obj.data.vertices:
            world = obj.matrix_world @ vertex.co
            if world.y < join_y:
                handle_vertices.append(world)
    handle_center_x = sum(vertex.x for vertex in handle_vertices) / len(handle_vertices)
    handle_center_z = sum(vertex.z for vertex in handle_vertices) / len(handle_vertices)
    for obj in parts:
        inverse = obj.matrix_world.inverted()
        is_grip = material_name(obj) == "wood.001"
        for vertex in obj.data.vertices:
            world = obj.matrix_world @ vertex.co
            if world.y >= join_y:
                continue
            distance = min(1.0, (join_y - world.y) / 0.025)
            blend = distance * distance * (3.0 - 2.0 * distance)
            world.y = join_y + (world.y - join_y) * (1.0 - 0.25 * blend)
            world.x = handle_center_x + (world.x - handle_center_x) * (1.0 - 0.20 * blend)
            if is_grip:
                world.z = handle_center_z + (world.z - handle_center_z) * (1.0 - 0.16 * blend)
            vertex.co = inverse @ world
        obj.data.update()


def bake_axis_and_origin(parts, rubber, wood_core):
    rubber_world = [rubber.matrix_world @ vertex.co for vertex in rubber.data.vertices]
    blade_x = (min(v.x for v in rubber_world) + max(v.x for v in rubber_world)) * 0.5
    blade_y = (min(v.y for v in rubber_world) + max(v.y for v in rubber_world)) * 0.5
    wood_world = [wood_core.matrix_world @ vertex.co for vertex in wood_core.data.vertices]
    thickness_z = (min(v.z for v in wood_world) + max(v.z for v in wood_world)) * 0.5
    # Source: X width, Y handle-to-blade, Z face normal.  Runtime contract:
    # Blender +X face normal, +Z blade-to-handle; glTF export maps +Z to +Y.
    for obj in parts:
        transformed = []
        for vertex in obj.data.vertices:
            world = obj.matrix_world @ vertex.co
            transformed.append(Vector((world.z - thickness_z, -(world.x - blade_x), -(world.y - blade_y))))
        obj.matrix_world = Matrix.Identity(4)
        obj.parent = None
        for vertex, coordinate in zip(obj.data.vertices, transformed):
            vertex.co = coordinate
        obj.data.update()


def join_parts(parts):
    bpy.ops.object.select_all(action="DESELECT")
    for part in parts:
        part.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    paddle = bpy.context.object
    paddle.name = "ping-pong-paddle-game-v01"
    paddle.data.name = "ping-pong-paddle-game-v01-licensed-derived-geometry"
    paddle["asset"] = "ping-pong-paddle"
    paddle["source"] = "BlenderKit 78913e2e-0687-4589-96aa-7e2b7b99febf"
    paddle["sourceAuthor"] = "Kin Chen"
    paddle["license"] = "BlenderKit Royalty Free"
    paddle["strikingNormal"] = "+X"
    return paddle


def setup_qa(paddle):
    scene = bpy.context.scene
    scene.world.use_nodes = True
    scene.world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.035, 0.045, 0.055, 1)
    scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.5
    bpy.ops.object.light_add(type="AREA", location=(0.55, -0.35, 0.75))
    bpy.context.object.data.energy = 240
    bpy.context.object.data.size = 1.4
    bpy.ops.object.camera_add(location=(0.46, -0.25, 0.36))
    camera = bpy.context.object
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 0.34
    scene.camera = camera
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 800
    scene.render.resolution_y = 800
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = True
    for path, x in ((QA_FRONT, 0.46), (QA_BACK, -0.46)):
        camera.location.x = x
        camera.rotation_euler = (paddle.location - camera.location).to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)


def main():
    source = source_path()
    if not source.exists():
        raise FileNotFoundError(f"Licensed BlenderKit source not found: {source}")
    reset_scene()
    bpy.ops.import_scene.gltf(filepath=str(source))
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    paddle = max(meshes, key=lambda obj: len(obj.data.vertices))
    for obj in meshes:
        if obj != paddle:
            bpy.data.objects.remove(obj, do_unlink=True)
    parts = split_by_material(paddle)
    by_material = {material_name(obj): obj for obj in parts}
    required = {"wood", "wood.001", "Material.001", "Material.002", "Material.004", "Material.005"}
    missing = required - set(by_material)
    if missing:
        raise RuntimeError(f"Unexpected BlenderKit source material layout; missing {sorted(missing)}")

    # Retain the author's mature core/shoulder/handle topology and one rubber
    # surface.  Remove the full reverse rubber and both modern sponge inserts.
    wood_core = by_material["wood"]
    wood_handle = by_material["wood.001"]
    rubber = by_material["Material.001"]
    retained = [wood_core, wood_handle, rubber]
    for obj in parts:
        if obj not in retained:
            bpy.data.objects.remove(obj, do_unlink=True)

    shorten_penhold_handle([wood_core, wood_handle], rubber)
    # Preserve the authored silhouette and curved reverse.  Most of the source
    # density is the two 33k rubber skins; deleting one and reducing the other
    # to 15% gives a roughly 9.5k-triangle hero prop without broad facets.
    decimate(wood_core, 0.80)
    decimate(wood_handle, 0.75)
    decimate(rubber, 0.15)
    bake_axis_and_origin(retained, rubber, wood_core)

    # One shared opaque material keeps the joined asset as one glTF primitive;
    # role-specific colour and wear remain encoded per vertex.
    shared_material = make_material("aged-school-paddle-vertex-colour", (0.5, 0.5, 0.5), 0.82)
    for obj, role in ((wood_core, "wood-core"), (wood_handle, "wood-handle"), (rubber, "rubber")):
        obj.data.materials.clear()
        obj.data.materials.append(shared_material)
        colour_vertices(obj, role)
        mark_rubber_vertices(obj, role == "rubber")
        for polygon in obj.data.polygons:
            polygon.use_smooth = True

    paddle = join_parts(retained)
    OUTPUT_GLB.parent.mkdir(parents=True, exist_ok=True)
    SOURCE_BLEND.parent.mkdir(parents=True, exist_ok=True)
    QA_FRONT.parent.mkdir(parents=True, exist_ok=True)
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE_BLEND))
    bpy.ops.export_scene.gltf(
        filepath=str(OUTPUT_GLB), export_format="GLB", use_selection=False,
        export_apply=True, export_yup=True, export_materials="EXPORT", export_attributes=True,
    )
    setup_qa(paddle)
    triangles = sum(len(poly.vertices) - 2 for poly in paddle.data.polygons)
    print(f"BUILT BlenderKit-derived game paddle: triangles={triangles} size={OUTPUT_GLB.stat().st_size}B")


if __name__ == "__main__":
    main()
