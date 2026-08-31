"""Rebuild the existing banyan with branch-bound crossed foliage clusters.

Run with Blender in background mode after opening the v41 source file:
  Blender --background assets/source/blender/banyan-tree-source-v41-convex-broad-rounded-stones.blend \
    --python scripts/blender/rebuild_banyan_foliage.py
"""

from __future__ import annotations

import json
import math
import random
import struct
from pathlib import Path

import bpy
import bmesh
from mathutils import Quaternion, Vector


ROOT = Path(__file__).resolve().parents[2]
SOURCE_BLEND = ROOT / "assets/source/blender/banyan-tree-source-v42-branch-tip-leaf-clusters.blend"
OUTPUT_GLB = ROOT / "public/assets/models/banyan-tree/banyan-tree-scene-preview-v26-branch-tip-leaf-clusters.glb"
WOOD_ATLAS = ROOT / "assets/source-textures/banyan/atlases/banyan-wood-branch-fused-basecolor-2k-v2.png"
FOLIAGE_ATLAS = ROOT / "assets/source-textures/banyan/banyan-fineleaf-clumps-deepgreen-rgba-v7.png"
PREVIEW = ROOT / "docs/previews/banyan-tree-blender-v31-branch-tip-clusters.png"
RNG = random.Random(824216)


def ring_center(obj, vertices):
    points = [obj.matrix_world @ obj.data.vertices[index].co for index in vertices]
    return sum(points, Vector()) / len(points)


def branch_path(obj):
    ring_size = 7 if "LowArc" in obj.name else 6
    count = len(obj.data.vertices)
    start = ring_center(obj, range(ring_size))
    end = ring_center(obj, range(count - ring_size, count))
    return start, end


def branch_polyline(obj):
    ring_size = 7 if "LowArc" in obj.name else 6
    ring_count = len(obj.data.vertices) // ring_size
    return [ring_center(obj, range(index * ring_size, (index + 1) * ring_size)) for index in range(ring_count)]


def closest_point_on_segment(point, start, end):
    segment = end - start
    denominator = segment.length_squared
    if denominator < 1e-8:
        return start.copy()
    factor = max(0.0, min(1.0, (point - start).dot(segment) / denominator))
    return start + segment * factor


def attach_branch_polylines_to_wood(wood, polylines):
    """Extend every branch base into the nearest trunk or parent branch.

    The legacy upper branches were separate mesh islands with gaps as large as
    several metres.  Adding an overlapping connector at the centerline level
    makes the later joined wood mesh read as one continuous branching system.
    """
    inverse = wood.matrix_world.inverted()
    normal_matrix = wood.matrix_world.to_3x3().inverted().transposed()
    attached = []
    distances = []
    for branch_index, (name, points) in enumerate(polylines):
        branch_start = points[0]
        hit, local_location, local_normal, _ = wood.closest_point_on_mesh(inverse @ branch_start)
        if hit:
            surface = wood.matrix_world @ local_location
            normal = (normal_matrix @ local_normal).normalized()
            best_point = surface - normal * 0.12
            best_distance = (surface - branch_start).length
        else:
            best_point = branch_start.copy()
            best_distance = float("inf")

        # Upper branches are often children of another restored branch rather
        # than direct children of the old trunk mesh.  Attach to the nearest
        # point along every other branch centerline when that is closer.
        for other_index, (_, other_points) in enumerate(polylines):
            if other_index == branch_index:
                continue
            for segment_index in range(len(other_points) - 1):
                candidate = closest_point_on_segment(
                    branch_start, other_points[segment_index], other_points[segment_index + 1]
                )
                distance = (candidate - branch_start).length
                if distance < best_distance:
                    best_point = candidate
                    best_distance = distance

        distances.append(best_distance)
        if best_distance > 0.04:
            # A midpoint softens long connectors and keeps the tube from
            # looking like a single rigid spike at the junction.
            midpoint = best_point.lerp(branch_start, 0.52)
            attached.append((name, [best_point, midpoint, *points]))
        else:
            attached.append((name, points))
    print(json.dumps({
        "branch_base_connections": len(attached),
        "max_connection_length": round(max(distances), 3),
        "average_connection_length": round(sum(distances) / len(distances), 3),
    }))
    return attached


def is_branch_object(obj):
    return obj.type == "MESH" and (
        obj.name.startswith("Banyan_Secondary_")
        or obj.name == "Banyan_Leader_Center"
        or obj.name.startswith("Banyan_LowArc_")
        or obj.name.startswith("Banyan_LowArcTwig_")
    )


def hide_legacy_crowns():
    markers = ("Crown", "Clump", "Foliage", "FishScale", "OuterClumps")
    for obj in bpy.context.scene.objects:
        if obj.type == "MESH" and any(marker in obj.name for marker in markers):
            obj.hide_render = True
            obj.hide_set(True)


def cap_open_branch_ends(obj):
    mesh = obj.data
    ring_size = 7 if "LowArc" in obj.name else 6
    tip_vertices = list(mesh.vertices)[-ring_size:]
    tip_center = sum((vertex.co for vertex in tip_vertices), Vector()) / ring_size
    for vertex in tip_vertices:
        vertex.co = tip_center + (vertex.co - tip_center) * 0.16
    bm = bmesh.new()
    bm.from_mesh(mesh)
    boundary = [edge for edge in bm.edges if edge.is_boundary]
    if boundary:
        bmesh.ops.holes_fill(bm, edges=boundary, sides=0)
    bm.normal_update()
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()


def add_terminal_twig_extensions(paths):
    extensions = []
    adjusted_paths = []
    bark = bpy.data.materials["MAT_Banyan_Bark_Handpainted"]
    for index, (name, start, end) in enumerate(paths):
        if "LowArcTwig" in name:
            adjusted_paths.append((name, start, end))
            continue
        direction = (end - start).normalized()
        extension_length = RNG.uniform(0.42, 0.62)
        extended_end = end + direction * extension_length
        bpy.ops.mesh.primitive_cone_add(
            vertices=6, radius1=0.058, radius2=0.014,
            depth=extension_length, end_fill_type="NGON",
            location=(end + extended_end) * 0.5,
        )
        extension = bpy.context.object
        extension.name = f"Banyan_TerminalTwig_Extension_{index + 1:02d}"
        extension.rotation_mode = "QUATERNION"
        extension.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(direction)
        extension.data.materials.append(bark)
        extensions.append(extension)
        adjusted_paths.append((name, start, extended_end))
        adjusted_paths.append((f"{name}_Transition", end - direction * 0.28, end))
    return extensions, adjusted_paths


def clean_branch_radii(name):
    if name == "Banyan_Leader_Center":
        return 0.24, 0.010
    if name.startswith("Banyan_PrimaryTransition_"):
        return 0.42, 0.022
    if name.startswith("Banyan_CanopyFiller_"):
        return 0.13, 0.006
    if "LowArcTwig" in name:
        return 0.072, 0.004
    if name.startswith("Banyan_LowSkirt_"):
        return 0.17, 0.007
    if name.startswith("Banyan_LowArc_"):
        return 0.26, 0.010
    return 0.18, 0.008


def supplemental_low_branch_polylines():
    """Add a lower skirt of side branches below the legacy low-arc ring."""
    branches = []
    for index in range(8):
        angle = math.radians(18 + index * 45 + RNG.uniform(-6, 6))
        radial = Vector((math.cos(angle), math.sin(angle), 0))
        tangent = Vector((-math.sin(angle), math.cos(angle), 0))
        reach = RNG.uniform(3.45, 4.15)
        start_z = RNG.uniform(2.02, 2.48)
        start = radial * RNG.uniform(0.12, 0.24) + Vector((0, 0, start_z))
        bend = RNG.uniform(-0.24, 0.24)
        points = [
            start,
            start + radial * (reach * 0.26) + tangent * bend + Vector((0, 0, RNG.uniform(0.16, 0.30))),
            start + radial * (reach * 0.57) + tangent * bend * 1.5 + Vector((0, 0, RNG.uniform(0.42, 0.62))),
            start + radial * (reach * 0.82) + tangent * bend + Vector((0, 0, RNG.uniform(0.74, 0.96))),
            start + radial * reach + Vector((0, 0, RNG.uniform(1.02, 1.30))),
        ]
        branches.append((f"Banyan_LowSkirt_{index + 1:02d}", points))
    return branches


def primary_transition_polylines():
    """Grow broad forks through the old flat trunk cap into the upper crown."""
    branches = []
    for index in range(6):
        angle = math.radians(index * 60 + 4)
        radial = Vector((math.cos(angle), math.sin(angle), 0))
        tangent = Vector((-math.sin(angle), math.cos(angle), 0))
        bend = RNG.uniform(-0.12, 0.12)
        branches.append((f"Banyan_PrimaryTransition_{index + 1:02d}", [
            radial * 0.18 + Vector((0, 0, 3.56)),
            radial * 0.48 + tangent * bend + Vector((0, 0, 4.08)),
            radial * 0.88 + tangent * bend * 1.4 + Vector((0, 0, 4.55)),
            radial * 1.30 + tangent * bend + Vector((0, 0, 5.02)),
        ]))
    return branches


def canopy_filler_polylines():
    """Fill sparse crown sectors with evenly distributed, varied branches."""
    branches = []
    for index in range(12):
        angle = math.radians(index * 30 + RNG.uniform(-5.5, 5.5))
        radial = Vector((math.cos(angle), math.sin(angle), 0))
        tangent = Vector((-math.sin(angle), math.cos(angle), 0))
        reach = RNG.uniform(3.15, 4.15)
        start_z = RNG.uniform(4.28, 4.92) + (0.18 if index % 2 else 0.0)
        rise = RNG.uniform(1.45, 2.15)
        bend = RNG.uniform(-0.34, 0.34)
        start = radial * RNG.uniform(0.22, 0.42) + Vector((0, 0, start_z))
        branches.append((f"Banyan_CanopyFiller_{index + 1:02d}", [
            start,
            start + radial * (reach * 0.28) + tangent * bend * 0.55 + Vector((0, 0, rise * 0.23)),
            start + radial * (reach * 0.58) + tangent * bend + Vector((0, 0, rise * 0.55)),
            start + radial * (reach * 0.82) + tangent * bend * 0.72 + Vector((0, 0, rise * 0.82)),
            start + radial * reach + Vector((0, 0, rise)),
        ]))
    return branches


def build_clean_continuous_branches(polylines):
    sides = 8
    vertices, faces, vertex_uv = [], [], []
    for name, points in polylines:
        r0, r1 = clean_branch_radii(name)
        base = len(vertices)
        for point_index, point in enumerate(points):
            previous = points[max(0, point_index - 1)]
            following = points[min(len(points) - 1, point_index + 1)]
            tangent = (following - previous).normalized()
            reference = Vector((0, 0, 1))
            if abs(tangent.dot(reference)) > 0.92:
                reference = Vector((1, 0, 0))
            side = tangent.cross(reference).normalized()
            up = side.cross(tangent).normalized()
            t = point_index / max(1, len(points) - 1)
            radius = r0 * (1 - t ** 0.82) + r1 * t ** 0.82
            for side_index in range(sides):
                angle = math.tau * side_index / sides
                vertices.append(point + side * math.cos(angle) * radius + up * math.sin(angle) * radius)
                vertex_uv.append((side_index / sides, t))
        for ring_index in range(len(points) - 1):
            ring = base + ring_index * sides
            next_ring = ring + sides
            for side_index in range(sides):
                following_side = (side_index + 1) % sides
                faces.append((
                    ring + side_index, ring + following_side,
                    next_ring + following_side, next_ring + side_index,
                ))
        faces.append(tuple(base + side_index for side_index in reversed(range(sides))))
        tip = base + (len(points) - 1) * sides
        faces.append(tuple(tip + side_index for side_index in range(sides)))

    mesh = bpy.data.meshes.new("banyan_clean_continuous_branches_mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    uv_layer = mesh.uv_layers.new(name="UVMap")
    for polygon in mesh.polygons:
        for loop_index in polygon.loop_indices:
            vertex_index = mesh.loops[loop_index].vertex_index
            uv_layer.data[loop_index].uv = vertex_uv[vertex_index]
        polygon.use_smooth = len(polygon.vertices) == 4
    branches = bpy.data.objects.new("Banyan_Restored_Branches_Continuous", mesh)
    bpy.context.scene.collection.objects.link(branches)
    branches.data.materials.append(bpy.data.materials["MAT_Banyan_Bark_Handpainted"])
    branches["construction"] = "39 legacy branch centerlines rebuilt as continuous tapered tubes"
    return branches


def fuse_wood_and_bake(branches):
    wood = bpy.data.objects["Banyan_Wood_Fused_UV"]
    # The source Blend keeps PREVIEW_Ground selected for convenient renders.
    # Clear that persisted selection before joining, otherwise the 40 m preview
    # plane becomes part of the exported wood mesh.
    for obj in bpy.context.scene.objects:
        obj.select_set(False)
    for obj in [wood, *branches]:
        obj.hide_render = False
        obj.hide_set(False)
        obj.select_set(True)
    bpy.context.view_layer.objects.active = wood
    bpy.ops.object.join()
    wood.name = "Banyan_Wood_Branches_Fused_UV"
    wood["construction"] = "existing banyan wood plus all restored upper, low-arc and terminal branches"

    source_uv = wood.data.uv_layers.get("UVMap") or wood.data.uv_layers.active
    source_uv.name = "UVSource"
    source_uv.active_render = True

    # Force all original bark textures to read the preserved source UV while a
    # second UV set is created as the one-piece bake target.
    for slot in wood.material_slots:
        material = slot.material
        if not material or not material.use_nodes:
            continue
        nodes = material.node_tree.nodes
        links = material.node_tree.links
        uv_node = nodes.new("ShaderNodeUVMap")
        uv_node.name = "Banyan_Source_UV"
        uv_node.uv_map = "UVSource"
        for node in nodes:
            if node.type == "TEX_IMAGE":
                links.new(uv_node.outputs["UV"], node.inputs["Vector"])

    target_uv = wood.data.uv_layers.new(name="UVMap")
    wood.data.uv_layers.active = target_uv
    source_uv.active_render = False
    target_uv.active_render = True
    bpy.context.view_layer.objects.active = wood
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(
        angle_limit=math.radians(64), island_margin=0.006,
        correct_aspect=True, scale_to_bounds=True,
    )
    bpy.ops.object.mode_set(mode="OBJECT")

    atlas = bpy.data.images.new("Banyan_Wood_Branches_Atlas_2K", width=2048, height=2048, alpha=False)
    atlas.generated_color = (0.11, 0.065, 0.028, 1.0)
    for slot in wood.material_slots:
        material = slot.material
        if not material or not material.use_nodes:
            continue
        bake_node = material.node_tree.nodes.new("ShaderNodeTexImage")
        bake_node.name = "Banyan_Wood_Branches_Bake_Target"
        bake_node.image = atlas
        material.node_tree.nodes.active = bake_node
        bake_node.select = True

    scene = bpy.context.scene
    previous_engine = scene.render.engine
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 1
    scene.render.bake.use_pass_direct = False
    scene.render.bake.use_pass_indirect = False
    scene.render.bake.use_pass_color = True
    bpy.ops.object.bake(type="DIFFUSE", pass_filter={"COLOR"}, margin=8, use_clear=True)
    scene.render.engine = previous_engine
    atlas.filepath_raw = str(WOOD_ATLAS)
    atlas.file_format = "PNG"
    atlas.save()

    final_material = bpy.data.materials.new("MAT_Banyan_Wood_Branches_WholeTree_2K")
    final_material.use_nodes = True
    nodes = final_material.node_tree.nodes
    links = final_material.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    image = nodes.new("ShaderNodeTexImage")
    image.name = "Banyan_Wood_Branches_WholeTree_Atlas"
    image.image = atlas
    image.interpolation = "Linear"
    image.extension = "CLIP"
    uv = nodes.new("ShaderNodeUVMap")
    uv.uv_map = "UVMap"
    links.new(uv.outputs["UV"], image.inputs["Vector"])
    links.new(image.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.9
    bsdf.inputs["Specular IOR Level"].default_value = 0.18
    wood.data.materials.clear()
    wood.data.materials.append(final_material)
    source_index = next(index for index, layer in enumerate(wood.data.uv_layers) if layer.name == "UVSource")
    wood.data.uv_layers.active_index = source_index
    bpy.context.view_layer.objects.active = wood
    bpy.ops.mesh.uv_texture_remove()
    wood.data.uv_layers.active = wood.data.uv_layers["UVMap"]
    wood.data.uv_layers["UVMap"].active_render = True
    return wood


def foliage_material():
    material = bpy.data.materials.new("MAT_Banyan_Foliage_BranchClusters_Lit")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    image = nodes.new("ShaderNodeTexImage")
    image.name = "Banyan_LeafCluster_3x3_RGBA"
    image.image = bpy.data.images.load(str(FOLIAGE_ATLAS), check_existing=True)
    image.interpolation = "Linear"
    image.extension = "CLIP"
    links.new(image.outputs["Color"], bsdf.inputs["Base Color"])
    links.new(image.outputs["Alpha"], bsdf.inputs["Alpha"])
    bsdf.inputs["Roughness"].default_value = 0.92
    bsdf.inputs["Specular IOR Level"].default_value = 0.16
    if "Emission Strength" in bsdf.inputs:
        bsdf.inputs["Emission Strength"].default_value = 0.0
    if hasattr(material, "surface_render_method"):
        material.surface_render_method = "DITHERED"
    elif hasattr(material, "blend_method"):
        material.blend_method = "HASHED"
        material.shadow_method = "HASHED"
    material.use_backface_culling = False
    material["gltf_alpha_mode"] = "MASK"
    material["alpha_cutoff"] = 0.38
    return material


def atlas_uv(tile):
    col, row = tile % 3, tile // 3
    pad_u, pad_v = 0.010, 0.012
    return (
        col / 3 + pad_u, 1 - (row + 1) / 3 + pad_v,
        (col + 1) / 3 - pad_u, 1 - row / 3 - pad_v,
    )


def add_card(vertices, faces, uvs, center, forward, width, length, roll, tile):
    forward = Vector(forward).normalized()
    reference = Vector((0, 0, 1))
    if abs(forward.dot(reference)) > 0.94:
        reference = Vector((1, 0, 0))
    side = forward.cross(reference).normalized()
    side.rotate(Quaternion(forward, roll))
    u = side
    v = forward
    base = len(vertices)
    vertices.extend([
        center - u * width * 0.5 - v * length * 0.5,
        center + u * width * 0.5 - v * length * 0.5,
        center + u * width * 0.5 + v * length * 0.5,
        center - u * width * 0.5 + v * length * 0.5,
    ])
    faces.append((base, base + 1, base + 2, base + 3))
    u0, v0, u1, v1 = atlas_uv(tile)
    uvs.extend(((u0, v0), (u1, v0), (u1, v1), (u0, v1)))


def sample_polyline(points, factor):
    lengths = [(points[index + 1] - points[index]).length for index in range(len(points) - 1)]
    target = sum(lengths) * factor
    travelled = 0.0
    for index, segment_length in enumerate(lengths):
        if travelled + segment_length >= target or index == len(lengths) - 1:
            local = (target - travelled) / max(segment_length, 1e-6)
            direction = (points[index + 1] - points[index]).normalized()
            return points[index].lerp(points[index + 1], max(0.0, min(1.0, local))), direction
        travelled += segment_length
    return points[-1], (points[-1] - points[-2]).normalized()


def build_branch_bound_foliage(polylines):
    anchors = []
    for name, points in polylines:
        tip, tip_direction = sample_polyline(points, 1.0)
        anchors.append((name, tip, tip_direction, "tip"))
        if "Secondary" in name or "Leader" in name or "PrimaryTransition" in name:
            for factor, role in ((0.24, "inner-branch"), (0.48, "mid-branch"), (0.74, "outer-branch")):
                anchor, direction = sample_polyline(points, factor + RNG.uniform(-0.035, 0.035))
                anchors.append((name, anchor, direction, role))
        elif name.startswith("Banyan_CanopyFiller_"):
            for factor, role in ((0.43, "mid-branch"), (0.71, "outer-branch")):
                anchor, direction = sample_polyline(points, factor + RNG.uniform(-0.025, 0.025))
                anchors.append((name, anchor, direction, role))
        elif name.startswith("Banyan_LowSkirt_"):
            for factor, role in ((0.34, "lower-inner"), (0.59, "lower-mid"), (0.82, "lower-outer")):
                anchor, direction = sample_polyline(points, factor + RNG.uniform(-0.025, 0.025))
                anchors.append((name, anchor, direction, role))
        elif name.startswith("Banyan_LowArc_"):
            for factor, role in ((0.48, "mid-branch"), (0.75, "outer-branch")):
                anchor, direction = sample_polyline(points, factor + RNG.uniform(-0.035, 0.035))
                anchors.append((name, anchor, direction, role))

    vertices, faces, uvs = [], [], []
    for index, (branch_name, anchor, direction, role) in enumerate(anchors):
        if role in {"lower-inner", "lower-mid"}:
            width, length = RNG.uniform(1.34, 1.78), RNG.uniform(1.20, 1.58)
            outward_offset = RNG.uniform(-0.02, 0.05)
        elif role == "lower-outer":
            width, length = RNG.uniform(1.48, 1.94), RNG.uniform(1.34, 1.72)
            outward_offset = RNG.uniform(0.01, 0.08)
        elif role == "inner-branch":
            width, length = RNG.uniform(1.28, 1.68), RNG.uniform(1.18, 1.52)
            outward_offset = RNG.uniform(-0.03, 0.04)
        elif role == "mid-branch":
            width, length = RNG.uniform(1.42, 1.88), RNG.uniform(1.30, 1.70)
            outward_offset = RNG.uniform(0.0, 0.06)
        elif "LowArcTwig" in branch_name:
            width, length = RNG.uniform(1.42, 2.02), RNG.uniform(1.34, 1.86)
            outward_offset = RNG.uniform(0.08, 0.17)
        else:
            width, length = RNG.uniform(1.62, 2.32), RNG.uniform(1.55, 2.10)
            outward_offset = RNG.uniform(0.08, 0.17)
        center = anchor + direction * length * outward_offset
        center += Vector((RNG.uniform(-0.08, 0.08), RNG.uniform(-0.08, 0.08), RNG.uniform(-0.06, 0.10)))
        base_roll = RNG.uniform(0, math.tau)
        rolls = [base_roll, base_roll + RNG.uniform(math.radians(72), math.radians(106))]
        if role == "tip" or index % 2 == 0:
            rolls.append(base_roll + RNG.uniform(math.radians(30), math.radians(54)))
        base_tile = RNG.randrange(9)
        for card_index, roll in enumerate(rolls):
            add_card(
                vertices, faces, uvs, center, direction,
                width * RNG.uniform(0.9, 1.08), length * RNG.uniform(0.91, 1.08),
                roll, (base_tile + card_index + RNG.randrange(0, 3)) % 9,
            )

    mesh = bpy.data.meshes.new("banyan_branch_bound_foliage_mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    uv_layer = mesh.uv_layers.new(name="UVMap")
    for polygon in mesh.polygons:
        for loop_index in polygon.loop_indices:
            vertex_index = mesh.loops[loop_index].vertex_index
            uv_layer.data[loop_index].uv = uvs[vertex_index]
    foliage = bpy.data.objects.new("Banyan_Foliage_BranchBound_CrossCards", mesh)
    bpy.context.scene.collection.objects.link(foliage)
    foliage.data.materials.append(foliage_material())
    foliage["construction"] = "leaf-cluster cards bound to restored branch tips and outer terminal branch spans"
    foliage["anchor_count"] = len(anchors)
    foliage["card_plane_count"] = len(faces)
    foliage["atlas_variants"] = 9
    foliage["lighting"] = "lit PBR, alpha mask, casts and receives scene shadows"
    return foliage


def setup_preview():
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1100
    scene.render.resolution_y = 1100
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = str(PREVIEW)
    scene.render.film_transparent = False
    bpy.ops.render.render(write_still=True)


def patch_glb_material():
    data = OUTPUT_GLB.read_bytes()
    json_length, json_type = struct.unpack_from("<II", data, 12)
    if json_type != 0x4E4F534A:
        raise RuntimeError("First GLB chunk is not JSON")
    json_start, json_end = 20, 20 + json_length
    document = json.loads(data[json_start:json_end].decode("utf-8").rstrip(" \t\r\n\0"))
    patched = 0
    for material in document.get("materials", []):
        if "Foliage_BranchClusters" in material.get("name", ""):
            material["alphaMode"] = "MASK"
            material["alphaCutoff"] = 0.38
            material["doubleSided"] = True
            extensions = material.get("extensions")
            if extensions:
                extensions.pop("KHR_materials_unlit", None)
                if not extensions:
                    material.pop("extensions", None)
            patched += 1
    if patched != 1:
        raise RuntimeError(f"Expected one foliage material, patched {patched}")
    for key in ("extensionsUsed", "extensionsRequired"):
        extensions = document.get(key)
        if extensions and "KHR_materials_unlit" in extensions:
            extensions.remove("KHR_materials_unlit")
            if not extensions:
                document.pop(key, None)
    json_bytes = json.dumps(document, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    json_bytes += b" " * ((4 - len(json_bytes) % 4) % 4)
    remaining = data[json_end:]
    header = struct.pack("<4sII", b"glTF", 2, 12 + 8 + len(json_bytes) + len(remaining))
    OUTPUT_GLB.write_bytes(header + struct.pack("<II", len(json_bytes), 0x4E4F534A) + json_bytes + remaining)


hide_legacy_crowns()
legacy_branches = sorted([obj for obj in bpy.context.scene.objects if is_branch_object(obj)], key=lambda obj: obj.name)
polylines = [(obj.name, branch_polyline(obj)) for obj in legacy_branches]
low_supplement = supplemental_low_branch_polylines()
primary_transitions = primary_transition_polylines()
canopy_fillers = canopy_filler_polylines()
polylines.extend(primary_transitions)
polylines.extend(canopy_fillers)
polylines.extend(low_supplement)
for obj in legacy_branches:
    obj.hide_render = True
    obj.hide_set(True)
wood = bpy.data.objects["Banyan_Wood_Fused_UV"]
connected_polylines = attach_branch_polylines_to_wood(wood, polylines)
continuous_branches = build_clean_continuous_branches(connected_polylines)
fuse_wood_and_bake([continuous_branches])
foliage = build_branch_bound_foliage(connected_polylines)

for obj in bpy.context.scene.objects:
    obj.select_set(False)
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE_BLEND))
setup_preview()

for obj in bpy.context.scene.objects:
    obj.select_set(False)
for obj in bpy.context.scene.objects:
    if obj.type == "MESH" and not obj.hide_render and not obj.name.startswith("PREVIEW_"):
        obj.hide_set(False)
        obj.select_set(True)
bpy.context.view_layer.objects.active = foliage
bpy.ops.export_scene.gltf(
    filepath=str(OUTPUT_GLB), export_format="GLB", use_selection=True,
    export_apply=True, export_yup=True, export_materials="EXPORT",
    export_image_format="AUTO", export_texcoords=True, export_normals=True,
    export_attributes=True, export_cameras=False, export_lights=False,
    export_extras=True,
)
patch_glb_material()

print(json.dumps({
    "blend": str(SOURCE_BLEND), "glb": str(OUTPUT_GLB), "preview": str(PREVIEW),
    "branch_centerlines_rebuilt": len(legacy_branches),
    "primary_transition_branches": len(primary_transitions),
    "canopy_filler_branches": len(canopy_fillers),
    "supplemental_low_branches": len(low_supplement),
    "foliage_anchors": foliage["anchor_count"],
    "foliage_cards": foliage["card_plane_count"],
}))
