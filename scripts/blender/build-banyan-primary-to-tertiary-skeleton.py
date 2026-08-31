"""Build a restrained level-1 to level-5 banyan branch skeleton in-place."""

from __future__ import annotations

import json
import math
from pathlib import Path

import bpy
from mathutils import Quaternion, Vector


COLLECTION_NAME = "BANYAN_BRANCH_SKELETON_V1"
OBJECT_PREFIX = "Banyan_SkeletonBranch_"
MATERIAL_NAME = "MAT_Banyan_Branches_GreyBrown_NoEyes_V3"
TEXTURE_PATH = Path(__file__).resolve().parents[2] / "assets/source-textures/banyan/banyan-bark-seamless-gouache-no-eyes-basecolor-v3.png"
SKELETON_SCALE = 0.5
CROWN_PIVOT = Vector((0.0, 0.0, 3.75))


def remove_previous_skeleton() -> None:
    for obj in list(bpy.data.objects):
        if obj.name.startswith(OBJECT_PREFIX):
            curve = obj.data if obj.type == "CURVE" else None
            bpy.data.objects.remove(obj, do_unlink=True)
            if curve is not None and curve.users == 0:
                bpy.data.curves.remove(curve)

    collection = bpy.data.collections.get(COLLECTION_NAME)
    if collection is not None:
        bpy.data.collections.remove(collection)


def unified_bark_material() -> bpy.types.Material:
    material = bpy.data.materials.get(MATERIAL_NAME)
    if material is None:
        material = bpy.data.materials.new(MATERIAL_NAME)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()

    output = nodes.new("ShaderNodeOutputMaterial")
    output.location = (520, 20)
    principled = nodes.new("ShaderNodeBsdfPrincipled")
    principled.location = (230, 20)
    principled.inputs["Roughness"].default_value = 0.82
    principled.inputs["Specular IOR Level"].default_value = 0.24
    principled.inputs["Base Color"].default_value = (0.20, 0.17, 0.15, 1.0)

    texture = nodes.new("ShaderNodeTexImage")
    texture.name = "Banyan Branch Bark No Eyes V3"
    texture.label = "Seamless branch bark without knots or tree eyes"
    texture.location = (-360, 80)
    texture.extension = "REPEAT"
    texture.interpolation = "Linear"
    texture.image = bpy.data.images.load(str(TEXTURE_PATH), check_existing=True)
    texture.image.colorspace_settings.name = "sRGB"

    uv_map = nodes.new("ShaderNodeUVMap")
    uv_map.location = (-570, 80)
    uv_map.uv_map = "UVMap"

    bump = nodes.new("ShaderNodeBump")
    bump.location = (0, -150)
    bump.inputs["Strength"].default_value = 0.07
    bump.inputs["Distance"].default_value = 0.08

    links.new(uv_map.outputs["UV"], texture.inputs["Vector"])
    links.new(texture.outputs["Color"], principled.inputs["Base Color"])
    links.new(texture.outputs["Color"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], principled.inputs["Normal"])
    links.new(principled.outputs["BSDF"], output.inputs["Surface"])
    return material


def assign_material(obj: bpy.types.Object, material: bpy.types.Material) -> None:
    obj.data.materials.clear()
    obj.data.materials.append(material)


def prepare_existing_wood(material: bpy.types.Material) -> list[str]:
    """Give retained stem bundles branch bark; preserve the trunk's full UV atlas."""
    prepared = []
    for obj in bpy.data.objects:
        if obj.type != "MESH":
            continue
        if not obj.name.startswith("Banyan_StemBundle_"):
            continue
        assign_material(obj, material)
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
        obj["bark_material_stage"] = "seamless branch bark grey-brown no-eyes v3"
        prepared.append(obj.name)
    return prepared


def convert_branches_and_build_uv(records: list[bpy.types.Object], material: bpy.types.Material) -> None:
    """Convert curves and orient the tiling bark longitudinally on every limb."""
    for record_index, obj in enumerate(records):
        spline = obj.data.splines[0]
        points = [point.co.copy() for point in spline.bezier_points]
        branch_length = sum((b - a).length for a, b in zip(points, points[1:]))

        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.convert(target="MESH")
        assign_material(obj, material)

        uv_layer = obj.data.uv_layers.get("UVMap") or obj.data.uv_layers.active
        if uv_layer is None:
            raise RuntimeError(f"Converted branch has no UV map: {obj.name}")
        uv_layer.name = "UVMap"
        longitudinal_repeat = max(1.0, branch_length / 1.15)
        offset = (record_index * 0.137) % 1.0
        for loop_uv in uv_layer.data:
            old_u, old_v = loop_uv.uv.x, loop_uv.uv.y
            loop_uv.uv = (old_v, old_u * longitudinal_repeat + offset)
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
        obj["formal_uv_pending"] = False
        obj["uv_layout"] = "circumference U; longitudinal repeating V"
        obj["bark_material_stage"] = "seamless branch bark grey-brown no-eyes v3"


def create_branch(
    collection: bpy.types.Collection,
    material: bpy.types.Material,
    level: int,
    index: int,
    points: list[Vector],
    radii: list[float],
    parent_name: str,
    apply_skeleton_scale: bool = True,
) -> bpy.types.Object:
    if len(points) != len(radii):
        raise ValueError("Each branch point needs a matching radius")

    # Keep attachment points around the crown base while halving the complete
    # scaffold. This leaves room for later fine branching and leaf clusters.
    if apply_skeleton_scale:
        points = [CROWN_PIVOT + (point - CROWN_PIVOT) * SKELETON_SCALE for point in points]
        radii = [radius * SKELETON_SCALE for radius in radii]

    curve = bpy.data.curves.new(f"{OBJECT_PREFIX}L{level}_{index:02d}_Curve", "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 3
    curve.resolution_v = 1
    curve.bevel_depth = 1.0
    curve.bevel_resolution = 2 if level == 1 else 1
    curve.resolution_u = 4 if level == 1 else 3
    curve.bevel_resolution = 2
    curve.resolution_v = 0
    curve.twist_smooth = 8
    curve.use_radius = True
    curve.materials.append(material)

    spline = curve.splines.new("BEZIER")
    spline.bezier_points.add(len(points) - 1)
    for bezier_point, point, radius in zip(spline.bezier_points, points, radii):
        bezier_point.co = point
        bezier_point.radius = radius
        bezier_point.handle_left_type = "AUTO"
        bezier_point.handle_right_type = "AUTO"

    obj = bpy.data.objects.new(f"{OBJECT_PREFIX}L{level}_{index:02d}", curve)
    collection.objects.link(obj)
    obj["branch_level"] = level
    obj["branch_parent"] = parent_name
    obj["construction"] = "banyan scaffold; leaf-support branches only"
    obj["formal_uv_pending"] = True
    obj["skeleton_scale"] = SKELETON_SCALE
    return obj


def polar(radius: float, angle: float, z: float) -> Vector:
    return Vector((radius * math.cos(angle), radius * math.sin(angle), z))


def build_lateral_scaffolds(collection, material, counters, records) -> None:
    # Five deliberately uneven radial sectors prevent a starburst silhouette.
    # Source-space heights form a rising spiral. After the 0.5 crown scale,
    # successive radial limbs attach near 3.05, 3.25, 3.45, 3.65 and 3.85 m.
    primary_specs = [
        (math.radians(8), 2.35, 0.08),
        (math.radians(79), 2.75, 0.22),
        (math.radians(151), 3.15, -0.04),
        (math.radians(222), 3.55, 0.12),
        (math.radians(301), 3.95, -0.10),
    ]

    for primary_number, (angle, start_z, lean) in enumerate(primary_specs, 1):
        side = Vector((-math.sin(angle), math.cos(angle), 0.0))
        p0 = polar(0.32, angle + lean, start_z)
        p1 = polar(0.82, angle + lean * 0.6, start_z + 0.92)
        p1 += side * (0.10 if primary_number % 2 else -0.08)
        p2 = polar(1.62, angle, start_z + 1.48)
        p2 += side * (0.16 if primary_number in {1, 4} else -0.10)
        fork = polar(2.42 + 0.10 * (primary_number % 2), angle, start_z + 1.83)
        fork += side * (0.20 if primary_number in {2, 5} else -0.12)

        counters[1] += 1
        primary = create_branch(
            collection,
            material,
            1,
            counters[1],
            [p0, p1, p2, fork],
            [0.44, 0.39, 0.31, 0.245],
            "Banyan_Wood_Branches_Fused_UV",
        )
        records.append(primary)

        for fork_sign in (-1.0, 1.0):
            secondary_angle = angle + fork_sign * math.radians(25 + 3 * (primary_number % 2))
            secondary_is_upward = fork_sign > 0.0
            if secondary_is_upward:
                # One limb in every level-2 pair rises steeply instead of both
                # limbs spreading across the same horizontal canopy layer.
                mid = fork + polar(0.48, secondary_angle, 0.0)
                mid.z = fork.z + 0.72
                end = fork + polar(0.92 + 0.06 * (primary_number % 2), secondary_angle, 0.0)
                end.z = fork.z + 1.52 + 0.08 * (primary_number % 3)
            else:
                mid = fork + polar(0.86, secondary_angle, 0.0)
                mid.z = fork.z + 0.46
                end = fork + polar(2.05 + 0.12 * (primary_number % 3), secondary_angle, 0.0)
                end.z = fork.z + 0.88 + 0.15 * (primary_number % 2)

            counters[2] += 1
            secondary = create_branch(
                collection,
                material,
                2,
                counters[2],
                [fork - polar(0.08, secondary_angle, 0.0), mid, end],
                [0.265, 0.195, 0.135],
                primary.name,
            )
            secondary["growth_direction"] = "steep-upward" if secondary_is_upward else "outward-spreading"
            records.append(secondary)

            # Each secondary forks into two short, upward leaf-support arms.
            for tertiary_sign in (-1.0, 1.0):
                tertiary_angle = secondary_angle + tertiary_sign * math.radians(21)
                tertiary_is_upward = tertiary_sign > 0.0
                if tertiary_is_upward:
                    t_mid = end + polar(0.27, tertiary_angle, 0.0)
                    t_mid.z = end.z + 0.52
                    t_end = end + polar(0.52, tertiary_angle, 0.0)
                    t_end.z = end.z + 1.02 + 0.06 * (primary_number % 2)
                else:
                    t_mid = end + polar(0.57, tertiary_angle, 0.0)
                    t_mid.z = end.z + 0.30
                    t_end = end + polar(1.20, tertiary_angle, 0.0)
                    t_end.z = end.z + 0.56

                counters[3] += 1
                tertiary = create_branch(
                    collection,
                    material,
                    3,
                    counters[3],
                    [end - polar(0.05, tertiary_angle, 0.0), t_mid, t_end],
                    [0.15, 0.115, 0.082],
                    secondary.name,
                )
                tertiary["growth_direction"] = "steep-upward" if tertiary_is_upward else "outward-spreading"
                records.append(tertiary)


def build_central_leaders(collection, material, counters, records) -> None:
    leader_specs = [
        (Vector((-0.22, 0.16, 4.02)), math.radians(116), 0.0),
        (Vector((0.28, -0.12, 4.20)), math.radians(304), 0.22),
    ]

    for leader_number, (start, angle, angle_bias) in enumerate(leader_specs, 1):
        p1 = start + Vector((0.18 * math.cos(angle), 0.18 * math.sin(angle), 0.90))
        p2 = start + Vector((0.42 * math.cos(angle + angle_bias), 0.42 * math.sin(angle + angle_bias), 1.75))
        fork = start + Vector((0.68 * math.cos(angle + angle_bias), 0.68 * math.sin(angle + angle_bias), 2.45))

        counters[1] += 1
        primary = create_branch(
            collection,
            material,
            1,
            counters[1],
            [start, p1, p2, fork],
            [0.36, 0.32, 0.265, 0.215],
            "Banyan_Wood_Branches_Fused_UV",
        )
        records.append(primary)

        for fork_sign in (-1.0, 1.0):
            secondary_angle = angle + fork_sign * math.radians(38)
            secondary_is_upward = fork_sign > 0.0
            secondary_reach = 0.34 if secondary_is_upward else 0.48
            secondary_end_reach = 0.72 if secondary_is_upward else 1.08
            secondary_mid_rise = 0.68 if secondary_is_upward else 0.55
            secondary_end_rise = 1.36 if secondary_is_upward else 1.05
            mid = fork + Vector((secondary_reach * math.cos(secondary_angle), secondary_reach * math.sin(secondary_angle), secondary_mid_rise))
            end = fork + Vector((secondary_end_reach * math.cos(secondary_angle), secondary_end_reach * math.sin(secondary_angle), secondary_end_rise))

            counters[2] += 1
            secondary = create_branch(
                collection,
                material,
                2,
                counters[2],
                [fork, mid, end],
                [0.23, 0.175, 0.12],
                primary.name,
            )
            secondary["growth_direction"] = "steep-upward" if secondary_is_upward else "upward-outward"
            records.append(secondary)

            tertiary_angle = secondary_angle + fork_sign * math.radians(18)
            tertiary_reach = 0.24 if secondary_is_upward else 0.36
            tertiary_end_reach = 0.48 if secondary_is_upward else 0.78
            tertiary_mid_rise = 0.48 if secondary_is_upward else 0.30
            tertiary_end_rise = 0.92 if secondary_is_upward else 0.55
            t_mid = end + Vector((tertiary_reach * math.cos(tertiary_angle), tertiary_reach * math.sin(tertiary_angle), tertiary_mid_rise))
            t_end = end + Vector((tertiary_end_reach * math.cos(tertiary_angle), tertiary_end_reach * math.sin(tertiary_angle), tertiary_end_rise))
            counters[3] += 1
            tertiary = create_branch(
                collection,
                material,
                3,
                counters[3],
                [end, t_mid, t_end],
                [0.135, 0.105, 0.078],
                secondary.name,
            )
            tertiary["growth_direction"] = "steep-upward" if secondary_is_upward else "upward-outward"
            records.append(tertiary)


def build_supplemental_upward_tertiaries(collection, material, counters, records) -> None:
    """Add upward level-3 branches from the middle of selected level-2 limbs."""
    secondary_branches = [obj for obj in records if obj.get("branch_level") == 2]
    for secondary_index, secondary in enumerate(secondary_branches):
        # Ten of fourteen secondaries receive an additional upward tertiary.
        if secondary_index % 3 == 2:
            continue

        bezier_points = secondary.data.splines[0].bezier_points
        start = bezier_points[1].co.copy()
        end = bezier_points[-1].co.copy()
        outward = Vector((end.x - start.x, end.y - start.y, 0.0))
        if outward.length < 0.001:
            outward = Vector((1.0, 0.0, 0.0))
        outward.normalize()
        side = Vector((-outward.y, outward.x, 0.0))
        side *= -1.0 if secondary_index % 2 else 1.0

        first = start + outward * 0.13 + side * 0.035
        first.z += 0.21
        second = start + outward * 0.28 + side * 0.070
        second.z += 0.50 + 0.04 * (secondary_index % 2)
        tip = start + outward * (0.40 + 0.035 * (secondary_index % 3)) + side * 0.09
        tip.z += 0.78 + 0.06 * (secondary_index % 3)

        counters[3] += 1
        upward = create_branch(
            collection,
            material,
            3,
            counters[3],
            [start, first, second, tip],
            [0.070, 0.058, 0.046, 0.034],
            secondary.name,
            apply_skeleton_scale=False,
        )
        upward["growth_direction"] = "upward-supplement"
        records.append(upward)


def build_supplemental_flat_and_drooping_scaffolds(collection, material, counters, records) -> None:
    """Insert low-angle level-2 limbs and flat/drooping level-3 forks."""
    lateral_primaries = [obj for obj in records if obj.get("branch_level") == 1][:5]
    for primary_index, primary in enumerate(lateral_primaries):
        bezier_points = primary.data.splines[0].bezier_points
        start = bezier_points[2].co.copy()
        primary_end = bezier_points[-1].co.copy()
        heading = Vector((primary_end.x - start.x, primary_end.y - start.y, 0.0))
        if heading.length < 0.001:
            heading = Vector((1.0, 0.0, 0.0))
        heading.normalize()

        turn = math.radians(38 + 4 * (primary_index % 3)) * (-1.0 if primary_index % 2 else 1.0)
        direction = Vector(
            (
                heading.x * math.cos(turn) - heading.y * math.sin(turn),
                heading.x * math.sin(turn) + heading.y * math.cos(turn),
                0.0,
            )
        )
        length = 0.86 + 0.09 * (primary_index % 3)
        level2_is_drooping = primary_index in {1, 3}
        level2_drop = -0.20 if level2_is_drooping else 0.045

        mid = start + direction * (length * 0.46)
        mid.z += 0.035 if level2_is_drooping else 0.025
        end = start + direction * length
        end.z += level2_drop

        counters[2] += 1
        secondary = create_branch(
            collection,
            material,
            2,
            counters[2],
            [start - direction * 0.035, mid, end],
            [0.13, 0.098, 0.068],
            primary.name,
            apply_skeleton_scale=False,
        )
        secondary["growth_direction"] = "drooping-supplement" if level2_is_drooping else "near-horizontal-supplement"
        secondary["supplemental_low_angle"] = True
        records.append(secondary)

        perpendicular = Vector((-direction.y, direction.x, 0.0))
        for child_number, child_sign in enumerate((-1.0, 1.0)):
            child_turn = child_sign * math.radians(24 + 3 * (primary_index % 2))
            child_direction = Vector(
                (
                    direction.x * math.cos(child_turn) - direction.y * math.sin(child_turn),
                    direction.x * math.sin(child_turn) + direction.y * math.cos(child_turn),
                    0.0,
                )
            )
            child_length = 0.58 + 0.08 * ((primary_index + child_number) % 3)
            child_drop = 0.025 if child_number == 0 else -0.17 - 0.025 * (primary_index % 2)
            child_mid = end + child_direction * (child_length * 0.47)
            child_mid += perpendicular * (0.025 * child_sign)
            child_mid.z += child_drop * 0.28 + (0.025 if child_number == 1 else 0.0)
            child_end = end + child_direction * child_length
            child_end.z += child_drop

            counters[3] += 1
            tertiary = create_branch(
                collection,
                material,
                3,
                counters[3],
                [end - child_direction * 0.025, child_mid, child_end],
                [0.070, 0.050, 0.031],
                secondary.name,
                apply_skeleton_scale=False,
            )
            tertiary["growth_direction"] = "near-horizontal-supplement" if child_number == 0 else "drooping-supplement"
            tertiary["supplemental_low_angle"] = True
            records.append(tertiary)


def build_small_flat_and_drooping_twigs(collection, material, counters, records) -> None:
    """Continue every tertiary, with occasional true level-4 forks."""
    tertiary_branches = [obj for obj in records if obj.get("branch_level") == 3]
    for tertiary_index, tertiary in enumerate(tertiary_branches):
        bezier_points = tertiary.data.splines[0].bezier_points
        end = bezier_points[-1].co.copy()
        previous = bezier_points[-2].co.copy()
        tangent = end - previous
        horizontal = Vector((tangent.x, tangent.y, 0.0))
        if horizontal.length < 0.001:
            horizontal = Vector((1.0, 0.0, 0.0))
        horizontal.normalize()

        # Every tertiary continues; every fourth tertiary gets a second fork.
        fork_signs = (-1.0, 1.0) if tertiary_index % 4 == 0 else ((-1.0,) if tertiary_index % 2 else (1.0,))
        for fork_number, fork_sign in enumerate(fork_signs):
            angle = fork_sign * math.radians(24 + 3 * (tertiary_index % 3))
            direction = Vector(
                (
                    horizontal.x * math.cos(angle) - horizontal.y * math.sin(angle),
                    horizontal.x * math.sin(angle) + horizontal.y * math.cos(angle),
                    0.0,
                )
            )
            length = 0.56 + 0.08 * ((tertiary_index + fork_number) % 3)
            orientation_slot = counters[4] % 5
            if orientation_slot < 3:
                # Sixty percent of level-4 branches rise at a clear 30-degree
                # class angle instead of only curling up at the tip.
                vertical_end = length * (0.58 + 0.04 * orientation_slot)
            elif orientation_slot == 3:
                vertical_end = 0.025
            else:
                vertical_end = -0.14 - 0.025 * (tertiary_index % 3)

            start = end - direction * 0.025
            mid = end + direction * (length * 0.48)
            mid.z += vertical_end * 0.42 + (0.018 if vertical_end < 0.0 else 0.0)
            tip = end + direction * length
            tip.z += vertical_end

            counters[4] += 1
            twig = create_branch(
                collection,
                material,
                4,
                counters[4],
                [start, mid, tip],
                [0.045, 0.032, 0.018],
                tertiary.name,
                apply_skeleton_scale=False,
            )
            if vertical_end > 0.12:
                twig["growth_direction"] = "clearly-upward"
            elif vertical_end > -0.08:
                twig["growth_direction"] = "near-horizontal"
            else:
                twig["growth_direction"] = "slightly-drooping"
            records.append(twig)


def build_long_fifth_level_extensions(collection, material, counters, records) -> None:
    """Continue every level-4 twig with a longer, very thin terminal branch."""
    fourth_level = [obj for obj in records if obj.get("branch_level") == 4]
    for branch_index, parent in enumerate(fourth_level):
        bezier_points = parent.data.splines[0].bezier_points
        end = bezier_points[-1].co.copy()
        previous = bezier_points[-2].co.copy()
        direction = end - previous
        if direction.length < 0.001:
            direction = Vector((1.0, 0.0, 0.0))
        direction.normalize()

        horizontal = Vector((direction.x, direction.y, 0.0))
        if horizontal.length < 0.001:
            horizontal = Vector((1.0, 0.0, 0.0))
        horizontal.normalize()
        perpendicular = Vector((-horizontal.y, horizontal.x, 0.0))

        length = 0.86 + 0.10 * (branch_index % 4)
        growth_mode = branch_index % 5
        if growth_mode < 3:
            # Match the level-4 balance: 60% of terminal branches visibly rise.
            vertical_end = 0.40 + 0.055 * growth_mode
        elif growth_mode == 3:
            vertical_end = 0.025
        else:
            vertical_end = -0.18
        lateral_curve = (0.055 + 0.018 * (branch_index % 3)) * (-1.0 if branch_index % 2 else 1.0)

        start = end - horizontal * 0.018
        first = end + horizontal * (length * 0.34) + perpendicular * lateral_curve
        first.z += vertical_end * 0.20 + 0.025
        second = end + horizontal * (length * 0.68) + perpendicular * (lateral_curve * 0.65)
        second.z += vertical_end * 0.58
        tip = end + horizontal * length
        tip.z += vertical_end

        counters[5] += 1
        terminal = create_branch(
            collection,
            material,
            5,
            counters[5],
            [start, first, second, tip],
            [0.020, 0.016, 0.011, 0.007],
            parent.name,
            apply_skeleton_scale=False,
        )
        terminal["growth_direction"] = (
            "clearly-upward" if growth_mode < 3 else "near-horizontal" if growth_mode == 3 else "slightly-drooping"
        )
        terminal["leaf_cluster_support"] = True
        records.append(terminal)


def set_review_view() -> None:
    # Store a useful review framing in every 3D viewport without touching a camera.
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type != "VIEW_3D":
                continue
            space = area.spaces.active
            space.region_3d.view_location = Vector((0.0, 0.0, 3.25))
            space.region_3d.view_distance = 7.4
            space.region_3d.view_rotation = Quaternion((0.7071068, 0.7071068, 0.0, 0.0))
            space.region_3d.view_perspective = "ORTHO"


remove_previous_skeleton()
material = unified_bark_material()
retained_wood = prepare_existing_wood(material)
collection = bpy.data.collections.new(COLLECTION_NAME)
bpy.context.scene.collection.children.link(collection)

counters = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0}
records: list[bpy.types.Object] = []
build_lateral_scaffolds(collection, material, counters, records)
build_central_leaders(collection, material, counters, records)
build_supplemental_upward_tertiaries(collection, material, counters, records)
build_supplemental_flat_and_drooping_scaffolds(collection, material, counters, records)
build_small_flat_and_drooping_twigs(collection, material, counters, records)
build_long_fifth_level_extensions(collection, material, counters, records)
convert_branches_and_build_uv(records, material)
set_review_view()

for obj in bpy.context.selected_objects:
    obj.select_set(False)
bpy.context.view_layer.objects.active = None

bounds = {
    "min": [min((obj.matrix_world @ Vector(corner))[axis] for obj in records for corner in obj.bound_box) for axis in range(3)],
    "max": [max((obj.matrix_world @ Vector(corner))[axis] for obj in records for corner in obj.bound_box) for axis in range(3)],
}
bpy.context.scene["banyan_branch_skeleton_stage"] = "levels 1-5 complete; leaves and aerial roots pending"
bpy.context.scene["banyan_branch_level_counts"] = json.dumps(counters)
bpy.context.scene["banyan_bark_material_stage"] = "branches use no-eyes v3; trunk full UV atlas preserved"
bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath)

print(
    "BANYAN_BRANCH_SKELETON_COMPLETE",
    json.dumps(
        {
            "counts": counters,
            "total": len(records),
            "bounds": bounds,
            "collection": COLLECTION_NAME,
            "material": MATERIAL_NAME,
            "texture": str(TEXTURE_PATH),
            "retained_wood": retained_wood,
            "scale": SKELETON_SCALE,
        },
        ensure_ascii=False,
    ),
)
