"""Build three reusable playground trees and export Blend + embedded-texture GLB assets.

Run with Blender in background mode:
  Blender --background --python scripts/blender/create_playground_trees.py
"""

from __future__ import annotations

import math
import random
import json
import struct
import sys
from pathlib import Path

import bpy
from mathutils import Quaternion, Vector


ROOT = Path(__file__).resolve().parents[2]
SOURCE_DIR = ROOT / "assets" / "source" / "blender" / "playground-trees"
MODEL_DIR = ROOT / "public" / "assets" / "models" / "playground-trees"
TEXTURE_DIR = ROOT / "public" / "assets" / "textures" / "playground-trees"
BARK_SOURCE_DIR = ROOT / "assets" / "source" / "textures" / "playground-trees"
PREVIEW_DIR = ROOT / "docs" / "previews" / "playground-trees"
for directory in (SOURCE_DIR, MODEL_DIR, TEXTURE_DIR, BARK_SOURCE_DIR, PREVIEW_DIR):
    directory.mkdir(parents=True, exist_ok=True)


SPECIES = {
    "casuarina": {
        "display_name": "牛尾松（木麻黄）",
        "asset_version": "v11",
        "texture": BARK_SOURCE_DIR / "casuarina-foliage-atlas-rgba-v03.png",
        "bark_texture": BARK_SOURCE_DIR / "casuarina-bark-whole-tree-256x1024-v03.png",
        "bark_atlas": BARK_SOURCE_DIR / "casuarina-bark-whole-tree-atlas-256-v04.png",
        "seed": 41021,
        "height": 11.6,
        "crown_radius": 3.25,
        "soil_radius": 0.82,
        "card_count": 192,
        "card_size": (1.75, 2.20),
    },
    "bauhinia": {
        "display_name": "羊蹄甲",
        "asset_version": "v11",
        "texture": BARK_SOURCE_DIR / "bauhinia-foliage-atlas-rgba-v03.png",
        "flower_texture": BARK_SOURCE_DIR / "bauhinia-flower-atlas-rgba-v01.png",
        "bark_texture": BARK_SOURCE_DIR / "bauhinia-bark-whole-tree-256x1024-v03.png",
        "bark_atlas": TEXTURE_DIR / "bauhinia-bark-whole-tree-atlas-256-v04.png",
        "seed": 52031,
        "height": 6.0,
        "crown_radius": 3.55,
        "soil_radius": 0.76,
        "card_count": 30,
        "card_size": (1.72, 1.54),
        "card_outward_bias": 0.50,
        "flower_count": 6,
        "flower_card_size": (0.34, 0.34),
    },
    "camphor": {
        "display_name": "樟树",
        "asset_version": "v11",
        "texture": BARK_SOURCE_DIR / "camphor-foliage-atlas-rgba-v03.png",
        "bark_texture": BARK_SOURCE_DIR / "camphor-bark-whole-tree-256x1024-v03.png",
        "bark_atlas": TEXTURE_DIR / "camphor-bark-whole-tree-atlas-256-v04.png",
        "seed": 63041,
        "height": 10.2,
        "crown_radius": 4.15,
        "soil_radius": 0.88,
        "card_count": 60,
        "card_size": (2.20, 1.88),
    },
}


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
        for datablock in list(datablocks):
            if datablock.users == 0:
                datablocks.remove(datablock)


def material_principled(name, color, roughness=0.82):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = color
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Roughness"].default_value = roughness
    return mat


def bark_material(name, texture_path, tree_height):
    """Temporary whole-height source material used before unique-atlas baking."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.diffuse_color = (1, 1, 1, 1)
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    image = nodes.new("ShaderNodeTexImage")
    image.name = "Whole_Tree_Bark_Source"
    image.image = bpy.data.images.load(str(texture_path), check_existing=True)
    image.interpolation = "Linear"
    image.extension = "CLIP"
    uv_map = nodes.new("ShaderNodeUVMap")
    uv_map.name = "Whole_Tree_Source_UV"
    uv_map.uv_map = "UVSource"
    links.new(uv_map.outputs["UV"], image.inputs["Vector"])
    links.new(image.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.90
    bsdf.inputs["Specular IOR Level"].default_value = 0.18
    mat["bark_tree_height_m"] = tree_height
    return mat


def bake_unique_bark_atlas(species, obj, atlas_path, size=256):
    """Bake the fused wood object to one non-repeating UV atlas, like the banyan."""
    source_uv = obj.data.uv_layers.active
    source_uv.name = "UVSource"
    atlas_uv = obj.data.uv_layers.new(name="UVMap")
    obj.data.uv_layers.active = atlas_uv
    source_uv.active_render = False
    atlas_uv.active_render = True

    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(
        angle_limit=math.radians(64),
        island_margin=0.012,
        correct_aspect=True,
        scale_to_bounds=True,
    )
    bpy.ops.object.mode_set(mode="OBJECT")

    atlas = bpy.data.images.new(f"{species}_Bark_WholeTree_Atlas", width=size, height=size, alpha=False)
    atlas.generated_color = (0.12, 0.085, 0.055, 1.0)
    source_mat = obj.data.materials[0]
    bake_node = source_mat.node_tree.nodes.new("ShaderNodeTexImage")
    bake_node.name = "Whole_Tree_Atlas_Bake_Target"
    bake_node.image = atlas
    source_mat.node_tree.nodes.active = bake_node
    bake_node.select = True

    scene = bpy.context.scene
    previous_engine = scene.render.engine
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 1
    scene.render.bake.use_pass_direct = False
    scene.render.bake.use_pass_indirect = False
    scene.render.bake.use_pass_color = True
    bpy.ops.object.bake(type="DIFFUSE", pass_filter={"COLOR"}, margin=6, use_clear=True)
    scene.render.engine = previous_engine

    atlas.filepath_raw = str(atlas_path)
    atlas.file_format = "PNG"
    atlas.save()

    final_mat = bpy.data.materials.new(f"{species}_Bark_WholeTreeAtlas")
    final_mat.use_nodes = True
    final_nodes = final_mat.node_tree.nodes
    final_links = final_mat.node_tree.links
    final_bsdf = final_nodes.get("Principled BSDF")
    final_image = final_nodes.new("ShaderNodeTexImage")
    final_image.name = "Whole_Tree_Bark_Atlas"
    final_image.image = atlas
    final_image.interpolation = "Linear"
    final_image.extension = "CLIP"
    final_uv = final_nodes.new("ShaderNodeUVMap")
    final_uv.name = "Whole_Tree_Atlas_UV"
    final_uv.uv_map = "UVMap"
    final_links.new(final_uv.outputs["UV"], final_image.inputs["Vector"])
    final_links.new(final_image.outputs["Color"], final_bsdf.inputs["Base Color"])
    final_bsdf.inputs["Roughness"].default_value = 0.90
    final_bsdf.inputs["Specular IOR Level"].default_value = 0.18
    obj.data.materials.clear()
    obj.data.materials.append(final_mat)
    obj.data.uv_layers.active = atlas_uv
    atlas_uv.active_render = True
    source_layer_to_remove = obj.data.uv_layers.get("UVSource")
    if source_layer_to_remove:
        obj.data.uv_layers.remove(source_layer_to_remove)
    obj.data.uv_layers.active = obj.data.uv_layers["UVMap"]
    obj["bark_atlas"] = atlas_path.name
    obj["uv_mapping"] = "single fused-object unique UV atlas"
    return final_mat


def foliage_material(name, texture_path):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.diffuse_color = (1, 1, 1, 1)
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    image = nodes.new("ShaderNodeTexImage")
    image.name = "RGBA_Leaf_Cluster"
    image.image = bpy.data.images.load(str(texture_path), check_existing=True)
    image.interpolation = "Linear"
    image.extension = "CLIP"
    links.new(image.outputs["Color"], bsdf.inputs["Base Color"])
    links.new(image.outputs["Alpha"], bsdf.inputs["Alpha"])
    # Keep the painted atlas free of baked shading, but let the leaf cards use
    # scene lighting and shadows. Emission would flatten that lighting response.
    if "Emission Strength" in bsdf.inputs:
        bsdf.inputs["Emission Strength"].default_value = 0.0
    bsdf.inputs["Roughness"].default_value = 0.88
    bsdf.inputs["Specular IOR Level"].default_value = 0.22
    if "Coat Weight" in bsdf.inputs:
        bsdf.inputs["Coat Weight"].default_value = 0.0
    if hasattr(mat, "surface_render_method"):
        mat.surface_render_method = "DITHERED"
    elif hasattr(mat, "blend_method"):
        mat.blend_method = "HASHED"
        mat.shadow_method = "HASHED"
    mat.use_transparency_overlap = False if hasattr(mat, "use_transparency_overlap") else True
    mat.use_backface_culling = False
    mat["gltf_alpha_mode"] = "MASK"
    mat["alpha_cutoff"] = 0.35
    return mat


def add_segment(start, end, r0, r1, material, name, vertices=8):
    start, end = Vector(start), Vector(end)
    delta = end - start
    if delta.length < 0.02:
        return None
    mid = (start + end) * 0.5
    joint_overlap = min(0.035, delta.length * 0.025)
    bpy.ops.mesh.primitive_cone_add(
        vertices=vertices,
        radius1=max(r0, 0.012),
        radius2=max(r1, 0.008),
        depth=delta.length + joint_overlap * 2.0,
        # Adjacent tapered sections overlap at their endpoints. Leaving them
        # open prevents stacked end caps from creating dark horizontal rings
        # after all sections are joined into the final trunk/branch mesh.
        end_fill_type="NOTHING",
        location=mid,
    )
    obj = bpy.context.object
    obj.name = name
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(delta.normalized())
    obj.data.materials.append(material)
    # Before the final atlas bake, all sections sample one continuous vertical
    # bark source according to their real height in the complete tree.
    if "bark_tree_height_m" in material:
        uv_layer = obj.data.uv_layers.active
        if uv_layer:
            depth = delta.length + joint_overlap * 2.0
            v0 = max(0.0, min(1.0, start.z / material["bark_tree_height_m"]))
            v1 = max(0.0, min(1.0, end.z / material["bark_tree_height_m"]))
            for loop_index, uv_loop in enumerate(uv_layer.data):
                vertex_index = obj.data.loops[loop_index].vertex_index
                local_z = obj.data.vertices[vertex_index].co.z
                t = max(0.0, min(1.0, local_z / depth + 0.5))
                uv_loop.uv.y = v0 * (1.0 - t) + v1 * t
    return obj


def add_polyline(points, radii, material, name, vertices=10):
    """Build a continuous tapered tube so the main trunk has no section rings."""
    points = [Vector(point) for point in points]
    mesh_vertices = []
    for index, point in enumerate(points):
        if index == 0:
            tangent = (points[1] - point).normalized()
        elif index == len(points) - 1:
            tangent = (point - points[index - 1]).normalized()
        else:
            tangent = (points[index + 1] - points[index - 1]).normalized()
        reference = Vector((1, 0, 0))
        if abs(tangent.dot(reference)) > 0.92:
            reference = Vector((0, 1, 0))
        axis_x = tangent.cross(reference).normalized()
        axis_y = tangent.cross(axis_x).normalized()
        for side_index in range(vertices):
            angle = side_index / vertices * math.tau
            mesh_vertices.append(point + (axis_x * math.cos(angle) + axis_y * math.sin(angle)) * radii[index])

    faces = []
    for ring_index in range(len(points) - 1):
        for side_index in range(vertices):
            next_side = (side_index + 1) % vertices
            faces.append((
                ring_index * vertices + side_index,
                ring_index * vertices + next_side,
                (ring_index + 1) * vertices + next_side,
                (ring_index + 1) * vertices + side_index,
            ))

    mesh = bpy.data.meshes.new(f"{name}_mesh")
    mesh.from_pydata(mesh_vertices, [], faces)
    mesh.update()
    uv_layer = mesh.uv_layers.new(name="UVMap")
    tree_height = material.get("bark_tree_height_m", max(point.z for point in points))
    for polygon_index, polygon in enumerate(mesh.polygons):
        ring_index = polygon_index // vertices
        side_index = polygon_index % vertices
        u0 = side_index / vertices
        u1 = (side_index + 1) / vertices
        v0 = max(0.0, min(1.0, points[ring_index].z / tree_height))
        v1 = max(0.0, min(1.0, points[ring_index + 1].z / tree_height))
        for loop_index, uv in zip(polygon.loop_indices, ((u0, v0), (u1, v0), (u1, v1), (u0, v1))):
            uv_layer.data[loop_index].uv = uv
        polygon.use_smooth = True
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(material)
    return obj


def join_objects(objects, name):
    objects = [obj for obj in objects if obj]
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    result = objects[0]
    result.name = name
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    for polygon in result.data.polygons:
        polygon.use_smooth = True
    return result


def point_on_segment(a, b, t):
    return Vector(a).lerp(Vector(b), t)


def build_branch_system(species, cfg, rng, bark):
    parts = []
    tips = []
    flower_tips = []
    height = cfg["height"]

    if species == "casuarina":
        trunk = [Vector((0, 0, 0)), Vector((0.06, -0.04, 2.5)), Vector((-0.08, 0.08, 5.3)), Vector((0.12, 0.02, 8.1)), Vector((-0.05, -0.02, 10.5))]
        radii = [0.42, 0.34, 0.25, 0.15, 0.055]
        parts.append(add_polyline(trunk, radii, bark, "Trunk_Continuous", 10))
        levels = [(4.1, 2.6, 7), (5.8, 2.8, 8), (7.4, 2.45, 7), (8.9, 1.85, 6), (9.8, 1.2, 4)]
        for level, length, count in levels:
            for j in range(count):
                angle = (j / count) * math.tau + rng.uniform(-0.25, 0.25) + level * 0.37
                start = Vector((rng.uniform(-0.08, 0.08), rng.uniform(-0.08, 0.08), level + rng.uniform(-0.25, 0.25)))
                lift = rng.uniform(0.25, 1.05)
                mid = start + Vector((math.cos(angle) * length * 0.58, math.sin(angle) * length * 0.58, lift))
                end = start + Vector((math.cos(angle) * length, math.sin(angle) * length, lift + rng.uniform(-0.35, 0.35)))
                r = max(0.045, 0.115 - level * 0.006)
                parts += [add_segment(start, mid, r, r * 0.58, bark, "Primary_Branch"), add_segment(mid, end, r * 0.58, 0.018, bark, "Fine_Branch", 7)]
                outward = end - mid
                tips.extend([
                    (end, outward),
                    (point_on_segment(mid, end, 0.72), outward),
                    (point_on_segment(mid, end, 0.45), outward),
                    (point_on_segment(mid, end, 0.20), outward),
                    (point_on_segment(start, mid, 0.70), mid - start),
                    (point_on_segment(start, mid, 0.35), mid - start),
                ])

    elif species == "bauhinia":
        base = Vector((0, 0, 0))
        fork = Vector((0.02, 0.0, 1.65))
        parts.append(add_segment(base, fork, 0.34, 0.25, bark, "Trunk_Base", 9))
        leaders = []
        for j, angle in enumerate((0.45, 2.52, 4.45)):
            mid = fork + Vector((math.cos(angle) * 0.78, math.sin(angle) * 0.78, 1.45 + rng.uniform(-0.15, 0.2)))
            end = mid + Vector((math.cos(angle + rng.uniform(-0.35, 0.35)) * 1.35, math.sin(angle + rng.uniform(-0.35, 0.35)) * 1.35, 1.35))
            parts += [add_segment(fork, mid, 0.22, 0.13, bark, "Main_Fork", 9), add_segment(mid, end, 0.13, 0.055, bark, "Main_Leader", 8)]
            leaders.append((mid, end, angle))
        for leader_index, (mid, leader_end, base_angle) in enumerate(leaders):
            for k in range(7):
                t = 0.15 + k * 0.12
                start = point_on_segment(mid, leader_end, min(t, 0.88))
                angle = base_angle + (-1 if k % 2 else 1) * rng.uniform(0.65, 1.25)
                length = rng.uniform(1.25, 2.15)
                bend = start + Vector((math.cos(angle) * length * 0.55, math.sin(angle) * length * 0.55, rng.uniform(0.25, 0.72)))
                end = start + Vector((math.cos(angle) * length, math.sin(angle) * length, rng.uniform(0.35, 0.95)))
                parts += [add_segment(start, bend, 0.065, 0.037, bark, "Primary_Branch", 7), add_segment(bend, end, 0.037, 0.013, bark, "Twig", 6)]
                outward = end - bend
                tips.extend([
                    (end, outward),
                    (point_on_segment(bend, end, 0.55), outward),
                    (point_on_segment(start, bend, 0.58), bend - start),
                ])
                if k in (5, 6):
                    flower_tips.append((end, outward))

            # Two lower lateral branches per leader open the canopy below the
            # old branch band instead of piling all foliage above the fork.
            for low_index, (t, turn) in enumerate(((0.26, -1.0), (0.56, 1.0))):
                start = point_on_segment(fork, mid, t)
                angle = base_angle + turn * rng.uniform(0.72, 1.08)
                length = rng.uniform(1.35, 1.75)
                bend = start + Vector((
                    math.cos(angle) * length * 0.54,
                    math.sin(angle) * length * 0.54,
                    rng.uniform(0.12, 0.32),
                ))
                end = start + Vector((
                    math.cos(angle) * length,
                    math.sin(angle) * length,
                    rng.uniform(0.28, 0.52),
                ))
                parts += [
                    add_segment(start, bend, 0.072, 0.040, bark, "Lower_Lateral_Branch", 7),
                    add_segment(bend, end, 0.040, 0.013, bark, "Lower_Lateral_Twig", 6),
                ]
                outward = end - bend
                tips.extend([
                    (end, outward),
                    (point_on_segment(bend, end, 0.55), outward),
                    (point_on_segment(start, bend, 0.58), bend - start),
                ])

            # One truly central upper branch per leader turns inward toward a
            # small area above the trunk. It fills the middle-top gap instead
            # of adding another tuft above each outer leader crown.
            start = point_on_segment(mid, leader_end, 0.58)
            center_angle = base_angle + 0.55
            end = Vector((
                math.cos(center_angle) * rng.uniform(0.52, 0.82),
                math.sin(center_angle) * rng.uniform(0.52, 0.82),
                max(mid.z, leader_end.z) + rng.uniform(0.30, 0.48),
            ))
            bend = start.lerp(end, 0.52)
            bend += Vector((
                math.cos(base_angle + math.pi * 0.5) * 0.13,
                math.sin(base_angle + math.pi * 0.5) * 0.13,
                0.14,
            ))
            parts += [
                add_segment(start, bend, 0.064, 0.034, bark, "Upper_Inner_Branch", 7),
                add_segment(bend, end, 0.034, 0.012, bark, "Upper_Inner_Twig", 6),
            ]
            outward = end - bend
            tips.extend([
                (end, outward),
                (point_on_segment(bend, end, 0.55), outward),
                (point_on_segment(start, bend, 0.58), bend - start),
            ])

    else:  # camphor
        trunk = [Vector((0, 0, 0)), Vector((0.04, 0.02, 2.2)), Vector((-0.05, 0.08, 4.2)), Vector((0.12, -0.04, 6.25)), Vector((0.02, 0.0, 8.25))]
        radii = [0.38, 0.32, 0.25, 0.155, 0.055]
        parts.append(add_polyline(trunk, radii, bark, "Trunk_Continuous", 10))
        levels = [(2.7, 3.15, 5), (4.0, 3.65, 7), (5.2, 3.75, 8), (6.4, 3.15, 8), (7.45, 2.35, 7), (8.35, 1.55, 5)]
        for level, length, count in levels:
            for j in range(count):
                angle = (j / count) * math.tau + level * 0.51 + rng.uniform(-0.18, 0.18)
                start = Vector((rng.uniform(-0.08, 0.08), rng.uniform(-0.08, 0.08), level + rng.uniform(-0.18, 0.18)))
                mid = start + Vector((math.cos(angle) * length * 0.50, math.sin(angle) * length * 0.50, rng.uniform(0.45, 1.15)))
                end = start + Vector((math.cos(angle) * length, math.sin(angle) * length, rng.uniform(0.55, 1.35)))
                r = max(0.05, 0.145 - level * 0.009)
                parts += [add_segment(start, mid, r, r * 0.55, bark, "Primary_Branch", 8), add_segment(mid, end, r * 0.55, 0.016, bark, "Twig", 6)]
                outward = end - mid
                tips.extend([
                    (end, outward),
                    (point_on_segment(mid, end, 0.55), outward),
                    (point_on_segment(start, mid, 0.62), mid - start),
                ])

    trunk_obj = join_objects(parts, "Trunk_Branches")
    trunk_obj["construction"] = "procedural tapered trunk and branch hierarchy"
    trunk_obj["uv_mapping"] = "continuous whole-tree-height source UV before unique-atlas bake"
    trunk_obj["merged_object"] = True
    return trunk_obj, tips, flower_tips


def random_crown_point(species, cfg, rng):
    radius = cfg["crown_radius"]
    if species == "casuarina":
        z = rng.uniform(4.0, 10.65)
        normalized = (z - 4.0) / 6.65
        local_radius = radius * (0.45 + 0.55 * math.sin(normalized * math.pi * 0.92))
        radial = local_radius * math.sqrt(rng.random())
    elif species == "bauhinia":
        z = rng.uniform(3.2, 7.25)
        normalized = (z - 3.2) / 4.05
        local_radius = radius * math.sin(max(0.18, normalized) * math.pi * 0.78)
        radial = max(0.4, local_radius) * math.sqrt(rng.random())
    else:
        z = rng.uniform(3.4, 9.9)
        normalized = (z - 3.4) / 6.5
        local_radius = radius * (0.70 + 0.30 * math.sin(normalized * math.pi))
        radial = local_radius * math.sqrt(rng.random())
    angle = rng.uniform(0, math.tau)
    return Vector((math.cos(angle) * radial, math.sin(angle) * radial, z))


def atlas_uv_rect(tile_index):
    """Return a padded UV rectangle for a 3x2 atlas laid out from top-left."""
    col = tile_index % 3
    row_from_top = tile_index // 3
    pad_u, pad_v = 0.012, 0.018
    u0 = col / 3 + pad_u
    u1 = (col + 1) / 3 - pad_u
    v0 = 1.0 - (row_from_top + 1) / 2 + pad_v
    v1 = 1.0 - row_from_top / 2 - pad_v
    return u0, v0, u1, v1


def add_card_quad(verts, faces, uvs, center, width, height, growth_direction, roll, tile_index, texture_axis="diagonal"):
    forward = Vector(growth_direction).normalized()
    reference = Vector((0, 0, 1))
    if abs(forward.dot(reference)) > 0.94:
        reference = Vector((1, 0, 0))
    side = forward.cross(reference).normalized()
    side.rotate(Quaternion(forward, roll))
    if texture_axis in ("world_vertical", "branch_upright"):
        v = Vector((0, 0, 1)) if texture_axis == "world_vertical" else forward
        facing = Vector((center.x, center.y, 0))
        if facing.length_squared < 1e-8:
            facing = Vector((forward.x, forward.y, 0))
        if facing.length_squared < 1e-8:
            facing = Vector((0, 1, 0))
        facing.normalize()
        facing.rotate(Quaternion(v, roll))
        u = v.cross(facing).normalized()
        v = facing.cross(u).normalized()
    elif texture_axis == "vertical":
        # The redesigned Casuarina atlas grows straight from bottom-center to
        # top-center. Align the texture's V axis directly to the parent twig;
        # the old diagonal compensation would rotate these upright tufts.
        u = side
        v = forward
    else:
        # The legacy broadleaf atlases grow from lower-left to upper-right.
        texture_angle = -math.atan2(height, width)
        u = forward * math.cos(texture_angle) + side * math.sin(texture_angle)
        v = forward * -math.sin(texture_angle) + side * math.cos(texture_angle)
    base = len(verts)
    verts.extend([
        center - u * width * 0.5 - v * height * 0.5,
        center + u * width * 0.5 - v * height * 0.5,
        center + u * width * 0.5 + v * height * 0.5,
        center - u * width * 0.5 + v * height * 0.5,
    ])
    faces.append((base, base + 1, base + 2, base + 3))
    u0, v0, u1, v1 = atlas_uv_rect(tile_index)
    uvs.extend(((u0, v0), (u1, v0), (u1, v1), (u0, v1)))


def build_foliage(species, cfg, rng, material, tips):
    verts, faces, uv_values = [], [], []
    if species == "casuarina":
        centers = list(tips)
    else:
        # Broadleaf branch builders emit three anchors per branch in the order
        # tip, fine-branch middle, primary-branch outer section. With crossed
        # cards, retain every branch tip and add a middle anchor to alternating
        # branches. This halves density while preserving the whole crown.
        branch_anchors = [tips[index:index + 3] for index in range(0, len(tips), 3)]
        centers = [anchors[0] for anchors in branch_anchors]
        extra_count = max(0, cfg["card_count"] - len(branch_anchors))
        if extra_count == 1:
            extra_indices = [len(branch_anchors) // 2]
        elif extra_count > 1:
            extra_indices = [
                round(index * (len(branch_anchors) - 1) / (extra_count - 1))
                for index in range(extra_count)
            ]
        else:
            extra_indices = []
        centers.extend(branch_anchors[index][1] for index in extra_indices)
    # Foliage must remain physically tied to modeled twigs; never fill the crown
    # with free-floating random cards just to reach a density target.
    centers = centers[: cfg["card_count"]]

    for i, (center, outward) in enumerate(centers):
        outward = Vector(outward)
        if species == "casuarina":
            # The remembered 马尾松 foliage rises diagonally from the inside
            # toward the crown exterior instead of hanging like willow foliage.
            # Cards near the trunk stay noticeably more upright; the lean then
            # increases smoothly toward the outer crown instead of changing at
            # a visible radius boundary.
            horizontal = math.hypot(outward.x, outward.y)
            outward.z = max(outward.z, horizontal * math.tan(math.radians(25)))
            radial_distance = math.hypot(center.x, center.y)
            inner_upright = max(0.0, min(1.0, 1.0 - radial_distance / (cfg["crown_radius"] * 0.72)))
            inner_upright = inner_upright * inner_upright * (3.0 - 2.0 * inner_upright)
            outward = outward.lerp(Vector((0, 0, 1)), inner_upright * 0.82)
        outward.normalize()
        if species == "casuarina":
            width = cfg["card_size"][0] * rng.uniform(0.78, 1.22)
            height = cfg["card_size"][1] * rng.uniform(0.78, 1.18)
            base_roll = rng.uniform(0, math.pi)
        else:
            scale = rng.uniform(0.92, 1.08)
            width = cfg["card_size"][0] * scale
            height = cfg["card_size"][1] * scale
            base_roll = rng.uniform(math.radians(-28), math.radians(28))
        base_tile = rng.randrange(6)
        rolls = (
            [base_roll]
            if species == "casuarina"
            else [base_roll, base_roll + rng.uniform(math.radians(80), math.radians(100))]
        )
        for card_index, roll in enumerate(rolls):
            # Jitter only around the attachment point; the growth vector remains outward.
            jitter = Vector((rng.uniform(-0.05, 0.05), rng.uniform(-0.05, 0.05), rng.uniform(-0.04, 0.04)))
            # Broadleaf clusters are terminal crown extensions: only a small
            # root portion overlaps the twig and most of the card grows outward.
            # The new leaf-only Casuarina art attaches at the bottom-center of
            # each tile, so shift most of the card outward from the twig tip.
            outward_bias = height * 0.40 if species == "casuarina" else height * cfg.get("card_outward_bias", 0.45)
            tile_index = (base_tile + card_index + rng.randrange(0, 3)) % 6
            if species == "casuarina":
                card_growth = outward
                texture_axis = "vertical"
            else:
                radial_factor = max(0.0, min(1.0, math.hypot(center.x, center.y) / cfg["crown_radius"]))
                branch_growth = outward.copy()
                branch_growth.z = max(branch_growth.z, 0.10)
                branch_growth.normalize()
                # Preserve the old crown's branch-radiating rhythm without its
                # crossed planes: inner cards remain mostly upright, while
                # outer cards increasingly follow the real modeled twig axis.
                branch_weight = 0.22 + 0.58 * radial_factor
                card_growth = Vector((0, 0, 1)).lerp(branch_growth, branch_weight).normalized()
                texture_axis = "branch_upright"
            add_card_quad(
                verts, faces, uv_values,
                center + (outward if species == "casuarina" else card_growth) * outward_bias + jitter,
                width, height, card_growth, roll, tile_index,
                texture_axis=texture_axis,
            )

    mesh = bpy.data.meshes.new(f"{species}_foliage_cards_mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    uv_layer = mesh.uv_layers.new(name="UVMap")
    for polygon in mesh.polygons:
        for loop_index in polygon.loop_indices:
            vertex_index = mesh.loops[loop_index].vertex_index
            uv_layer.data[loop_index].uv = uv_values[vertex_index]
    obj = bpy.data.objects.new("Foliage_Cards", mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(material)
    obj["construction"] = (
        "single double-sided leaf-only cards evenly distributed along branches"
        if species == "casuarina"
        else "branch-radiating crossed double-sided RGBA leaf-only cards bound to branch anchors"
    )
    obj["atlas_cluster_variants"] = 6
    obj["cluster_count"] = cfg["card_count"]
    obj["card_plane_count"] = len(faces)
    return obj


def build_flower_cards(species, cfg, rng, material, flower_tips):
    verts, faces, uv_values = [], [], []
    for i, (center, outward) in enumerate(flower_tips[: cfg["flower_count"]]):
        scale = rng.uniform(0.92, 1.08)
        width = cfg["flower_card_size"][0] * scale
        height = cfg["flower_card_size"][1] * scale
        jitter = Vector((rng.uniform(-0.025, 0.025), rng.uniform(-0.025, 0.025), rng.uniform(-0.02, 0.02)))
        add_card_quad(
            verts, faces, uv_values,
            Vector(center) + Vector((0, 0, height * 0.48)) + jitter,
            width, height, outward,
            rng.uniform(math.radians(-10), math.radians(10)), i % 6,
            texture_axis="world_vertical",
        )
    mesh = bpy.data.meshes.new(f"{species}_flower_cards_mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    uv_layer = mesh.uv_layers.new(name="UVMap")
    for polygon in mesh.polygons:
        for loop_index in polygon.loop_indices:
            vertex_index = mesh.loops[loop_index].vertex_index
            uv_layer.data[loop_index].uv = uv_values[vertex_index]
    obj = bpy.data.objects.new("Flower_Cards", mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(material)
    obj["construction"] = "six independent world-vertical flower cards bound to outer high branch tips"
    obj["card_plane_count"] = len(faces)
    return obj


def build_root_soil(species, cfg, rng):
    """Create a low-poly exposed-soil mound with an irregular hand-shaped edge."""
    segments = 18
    radius = cfg["soil_radius"]
    verts = [(0.0, 0.0, 0.055)]
    # A raised inner ring lets the soil tuck naturally into the trunk base.
    for ring_radius, z in ((radius * 0.43, 0.065), (radius, 0.006)):
        for index in range(segments):
            angle = index / segments * math.tau
            irregularity = 1.0 + rng.uniform(-0.12, 0.13)
            local_radius = ring_radius * irregularity
            verts.append((
                math.cos(angle) * local_radius,
                math.sin(angle) * local_radius,
                z + rng.uniform(-0.008, 0.008),
            ))

    faces = []
    for index in range(segments):
        next_index = (index + 1) % segments
        faces.append((0, 1 + index, 1 + next_index))
        inner_a = 1 + index
        inner_b = 1 + next_index
        outer_a = 1 + segments + index
        outer_b = 1 + segments + next_index
        faces.append((inner_a, outer_a, outer_b, inner_b))

    mesh = bpy.data.meshes.new(f"{species}_root_soil_mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    uv_layer = mesh.uv_layers.new(name="UVMap")
    for polygon in mesh.polygons:
        for loop_index in polygon.loop_indices:
            vertex = mesh.vertices[mesh.loops[loop_index].vertex_index].co
            uv_layer.data[loop_index].uv = (vertex.x / (radius * 2.3) + 0.5, vertex.y / (radius * 2.3) + 0.5)

    soil = bpy.data.objects.new("Root_Soil_Ring", mesh)
    bpy.context.collection.objects.link(soil)
    soil_mat = material_principled(f"{species}_Root_Soil_Handpainted", (0.235, 0.125, 0.058, 1.0), 0.98)
    soil.data.materials.append(soil_mat)
    soil["construction"] = "irregular low-poly exposed-soil mound"
    soil["nominal_radius_m"] = radius
    return soil


def setup_preview(species, cfg, root):
    ground_mat = material_principled("Preview_Ground", (0.35, 0.30, 0.205, 1), 0.95)
    bpy.ops.mesh.primitive_plane_add(size=30, location=(0, 0, -0.025))
    ground = bpy.context.object
    ground.name = "Preview_Ground"
    ground.data.materials.append(ground_mat)

    world = bpy.context.scene.world or bpy.data.worlds.new("World")
    bpy.context.scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.36, 0.52, 0.72, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.55

    bpy.ops.object.light_add(type="SUN", location=(4, -5, 12))
    sun = bpy.context.object
    sun.name = "Preview_Sun"
    sun.rotation_euler = (math.radians(25), math.radians(-22), math.radians(-28))
    sun.data.energy = 3.0
    sun.data.color = (1.0, 0.86, 0.65)
    sun.data.angle = math.radians(7)

    bpy.ops.object.light_add(type="AREA", location=(-4, -3, 7))
    fill = bpy.context.object
    fill.name = "Preview_Fill"
    fill.data.energy = 850
    fill.data.shape = "DISK"
    fill.data.size = 6
    fill.data.color = (0.48, 0.66, 1.0)
    track_to(fill, Vector((0, 0, cfg["height"] * 0.52)))

    bpy.ops.object.camera_add(location=(cfg["crown_radius"] * 2.7, -cfg["crown_radius"] * 3.2, cfg["height"] * 0.58))
    camera = bpy.context.object
    camera.name = "Preview_Camera"
    camera.data.lens = 46
    track_to(camera, Vector((0, 0, cfg["height"] * 0.52)))
    bpy.context.scene.camera = camera

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 720
    scene.render.resolution_y = 900
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    asset_version = cfg["asset_version"]
    scene.render.filepath = str(PREVIEW_DIR / f"{species}-tree-preview-{asset_version}.png")
    scene.render.image_settings.color_mode = "RGBA"
    scene.view_settings.look = "AgX - Medium High Contrast"
    bpy.ops.render.render(write_still=True)

    # A second render makes the bark/UV result directly reviewable rather than
    # hiding it inside the full-crown beauty shot.
    target_z = 1.05 if species == "bauhinia" else 2.05
    camera.location = (1.65, -2.35, target_z + 0.35)
    camera.data.lens = 62
    track_to(camera, Vector((0, 0, target_z)))
    scene.render.resolution_x = 720
    scene.render.resolution_y = 720
    scene.render.filepath = str(PREVIEW_DIR / f"{species}-bark-preview-{asset_version}.png")
    bpy.ops.render.render(write_still=True)

    camera.location = (1.45, -2.10, 0.82)
    camera.data.lens = 58
    track_to(camera, Vector((0, 0, 0.055)))
    scene.render.filepath = str(PREVIEW_DIR / f"{species}-root-preview-{asset_version}.png")
    bpy.ops.render.render(write_still=True)

    bpy.data.objects.remove(ground, do_unlink=True)
    bpy.data.objects.remove(sun, do_unlink=True)
    bpy.data.objects.remove(fill, do_unlink=True)
    bpy.data.objects.remove(camera, do_unlink=True)


def track_to(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def force_glb_foliage_lit_alpha_mask(glb_path):
    """Keep foliage as lit PBR while enforcing stable alpha-masked cards."""
    data = glb_path.read_bytes()
    magic, version, _total_length = struct.unpack_from("<4sII", data, 0)
    if magic != b"glTF" or version != 2:
        raise RuntimeError(f"Unexpected GLB header in {glb_path}")
    json_length, json_type = struct.unpack_from("<II", data, 12)
    if json_type != 0x4E4F534A:
        raise RuntimeError(f"First GLB chunk is not JSON in {glb_path}")
    json_start = 20
    json_end = json_start + json_length
    document = json.loads(data[json_start:json_end].decode("utf-8").rstrip(" \t\r\n\0"))
    patched = 0
    for material in document.get("materials", []):
        if "Foliage" in material.get("name", ""):
            material["alphaMode"] = "MASK"
            material["alphaCutoff"] = 0.45
            material["doubleSided"] = True
            extensions = material.get("extensions")
            if extensions:
                extensions.pop("KHR_materials_unlit", None)
                if not extensions:
                    material.pop("extensions", None)
            patched += 1
    if not patched:
        raise RuntimeError(f"No foliage material found to patch in {glb_path}")
    for extension_list_name in ("extensionsUsed", "extensionsRequired"):
        extension_list = document.get(extension_list_name)
        if extension_list and "KHR_materials_unlit" in extension_list:
            extension_list.remove("KHR_materials_unlit")
            if not extension_list:
                document.pop(extension_list_name, None)
    json_bytes = json.dumps(document, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    json_bytes += b" " * ((4 - len(json_bytes) % 4) % 4)
    remaining = data[json_end:]
    total_length = 12 + 8 + len(json_bytes) + len(remaining)
    header = struct.pack("<4sII", b"glTF", 2, total_length)
    json_chunk = struct.pack("<II", len(json_bytes), 0x4E4F534A) + json_bytes
    glb_path.write_bytes(header + json_chunk + remaining)


def build_species(species, cfg):
    clear_scene()
    rng = random.Random(cfg["seed"])
    bark = bark_material(f"{species}_Bark_Source", cfg["bark_texture"], cfg["height"])
    foliage = foliage_material(f"{species}_Foliage_RGBA", cfg["texture"])
    flower_material = None
    if cfg.get("flower_texture"):
        flower_material = foliage_material(f"{species}_Flower_Foliage_RGBA", cfg["flower_texture"])

    collection = bpy.data.collections.new(f"TREE_{species.upper()}")
    bpy.context.scene.collection.children.link(collection)
    trunk, tips, flower_tips = build_branch_system(species, cfg, rng, bark)
    bake_unique_bark_atlas(species, trunk, cfg["bark_atlas"])
    cards = build_foliage(species, cfg, rng, foliage, tips)
    flowers = build_flower_cards(species, cfg, rng, flower_material, flower_tips) if flower_material else None
    soil = build_root_soil(species, cfg, rng)
    tree_objects = [trunk, cards, soil] + ([flowers] if flowers else [])
    for obj in tree_objects:
        for old_collection in list(obj.users_collection):
            old_collection.objects.unlink(obj)
        collection.objects.link(obj)

    root = bpy.data.objects.new(f"{species}_tree_root", None)
    collection.objects.link(root)
    trunk.parent = root
    cards.parent = root
    soil.parent = root
    if flowers:
        flowers.parent = root
    root["species"] = species
    root["display_name_zh"] = cfg["display_name"]
    root["units"] = "meters"
    asset_version = cfg["asset_version"]
    root["asset_version"] = asset_version
    root["foliage_method"] = (
        "single double-sided leaf-only cards evenly distributed along branches"
        if species == "casuarina"
        else "branch-radiating crossed double-sided leaf-only cards bound to branch anchors"
    )
    root["root_ground_treatment"] = "irregular exposed-soil mound"
    root["nominal_height_m"] = cfg["height"]
    root["nominal_crown_radius_m"] = cfg["crown_radius"]

    setup_preview(species, cfg, root)

    blend_path = SOURCE_DIR / f"{species}-tree-source-{asset_version}.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))

    bpy.ops.object.select_all(action="DESELECT")
    root.select_set(True)
    for obj in tree_objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = root
    glb_path = MODEL_DIR / f"{species}-tree-game-{asset_version}.glb"
    bpy.ops.export_scene.gltf(
        filepath=str(glb_path),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_materials="EXPORT",
        export_image_format="AUTO",
        export_texcoords=True,
        export_normals=True,
        export_attributes=True,
        export_cameras=False,
        export_lights=False,
        export_extras=True,
    )
    force_glb_foliage_lit_alpha_mask(glb_path)
    print(f"BUILT {species}: BLEND={blend_path} GLB={glb_path}")


requested_species = set(SPECIES)
if "--" in sys.argv:
    script_args = sys.argv[sys.argv.index("--") + 1 :]
    if "--species" in script_args:
        requested_species = {script_args[script_args.index("--species") + 1]}
        unknown = requested_species.difference(SPECIES)
        if unknown:
            raise ValueError(f"Unknown species: {sorted(unknown)}")

for species_key, species_cfg in SPECIES.items():
    if species_key in requested_species:
        build_species(species_key, species_cfg)

print("All playground tree assets completed.")
