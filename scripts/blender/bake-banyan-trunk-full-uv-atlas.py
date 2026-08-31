"""Bake a one-off whole-trunk cylindrical design into the trunk's real UV atlas."""

from __future__ import annotations

import math
from pathlib import Path

import bpy


ROOT = Path(__file__).resolve().parents[2]
TRUNK_NAME = "Banyan_Wood_Branches_Fused_UV"
SOURCE_PATH = ROOT / "assets/source-textures/banyan/illustration-sources/banyan-trunk-fullheight-fused-buttress-source-v1.png"
ATLAS_PATH = ROOT / "assets/source-textures/banyan/atlases/banyan-trunk-full-uv-fused-buttress-basecolor-1k-v2.png"
MATERIAL_NAME = "MAT_Banyan_Trunk_FullUV_FusedButtress_V2"
SOURCE_UV = "WholeTrunkProjection"
TARGET_UV = "UVMap"


def restore_original_atlas_uv(obj: bpy.types.Object) -> bpy.types.MeshUVLoopLayer:
    uv_layer = obj.data.uv_layers.get(TARGET_UV)
    if uv_layer is None:
        raise RuntimeError(f"{TRUNK_NAME} has no {TARGET_UV}")
    if not obj.get("full_uv_restored_v1", False):
        # Earlier material tests scaled the original atlas UV by these exact
        # factors. Undo that temporary tiling before the dedicated full bake.
        if obj.get("unified_bark_uv_v4_broad_applied", False):
            u_divisor, v_divisor = 1.75, 2.4
        elif obj.get("unified_bark_uv_v3_fine_applied", False):
            u_divisor, v_divisor = 4.2, 5.76
        elif obj.get("unified_bark_uv_v2_applied", False):
            u_divisor, v_divisor = 1.75, 2.4
        else:
            u_divisor, v_divisor = 1.0, 1.0
        for loop_uv in uv_layer.data:
            loop_uv.uv = (loop_uv.uv.x / u_divisor, loop_uv.uv.y / v_divisor)
        obj["full_uv_restored_v1"] = True
    return uv_layer


def build_whole_trunk_projection(obj: bpy.types.Object) -> bpy.types.MeshUVLoopLayer:
    old = obj.data.uv_layers.get(SOURCE_UV)
    if old is not None:
        obj.data.uv_layers.remove(old)
    projection = obj.data.uv_layers.new(name=SOURCE_UV)
    vertices = obj.data.vertices
    z_min = min(vertex.co.z for vertex in vertices)
    z_max = max(vertex.co.z for vertex in vertices)
    z_span = max(1e-6, z_max - z_min)

    for polygon in obj.data.polygons:
        loop_values = []
        for loop_index in polygon.loop_indices:
            vertex = vertices[obj.data.loops[loop_index].vertex_index].co
            u = (math.atan2(vertex.y, vertex.x) / (2.0 * math.pi) + 0.5) % 1.0
            v = max(0.0, min(1.0, (vertex.z - z_min) / z_span))
            loop_values.append([loop_index, u, v])
        us = [value[1] for value in loop_values]
        if max(us) - min(us) > 0.5:
            for value in loop_values:
                if value[1] < 0.5:
                    value[1] += 1.0
        for loop_index, u, v in loop_values:
            projection.data[loop_index].uv = (u, v)
    return projection


def repack_target_uv(obj: bpy.types.Object, uv_layer: bpy.types.MeshUVLoopLayer) -> None:
    """Normalize texel density and tightly repack the retained seam layout."""
    if obj.get("full_uv_repacked_v2", False):
        return
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    obj.data.uv_layers.active = uv_layer
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.select_all(action="SELECT")
    bpy.ops.uv.average_islands_scale()
    bpy.ops.uv.pack_islands(rotate=True, margin=0.008)
    bpy.ops.object.mode_set(mode="OBJECT")
    obj["full_uv_repacked_v2"] = True


def bake_material(source_image: bpy.types.Image, target_image: bpy.types.Image) -> bpy.types.Material:
    material = bpy.data.materials.get("MAT_Banyan_Trunk_FullUV_BakeSource")
    if material is None:
        material = bpy.data.materials.new("MAT_Banyan_Trunk_FullUV_BakeSource")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()

    output = nodes.new("ShaderNodeOutputMaterial")
    principled = nodes.new("ShaderNodeBsdfPrincipled")
    source = nodes.new("ShaderNodeTexImage")
    source.image = source_image
    source.extension = "REPEAT"
    source.interpolation = "Linear"
    projection_uv = nodes.new("ShaderNodeUVMap")
    projection_uv.uv_map = SOURCE_UV
    target = nodes.new("ShaderNodeTexImage")
    target.name = "Full UV Bake Target"
    target.image = target_image

    links.new(projection_uv.outputs["UV"], source.inputs["Vector"])
    links.new(source.outputs["Color"], principled.inputs["Base Color"])
    links.new(principled.outputs["BSDF"], output.inputs["Surface"])
    nodes.active = target
    target.select = True
    source.select = False
    return material


def final_material(atlas: bpy.types.Image) -> bpy.types.Material:
    material = bpy.data.materials.get(MATERIAL_NAME)
    if material is None:
        material = bpy.data.materials.new(MATERIAL_NAME)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()

    output = nodes.new("ShaderNodeOutputMaterial")
    output.location = (500, 20)
    principled = nodes.new("ShaderNodeBsdfPrincipled")
    principled.location = (220, 20)
    principled.inputs["Roughness"].default_value = 0.84
    principled.inputs["Specular IOR Level"].default_value = 0.22
    texture = nodes.new("ShaderNodeTexImage")
    texture.image = atlas
    texture.extension = "EXTEND"
    texture.interpolation = "Linear"
    texture.location = (-330, 80)
    uv_map = nodes.new("ShaderNodeUVMap")
    uv_map.uv_map = TARGET_UV
    uv_map.location = (-540, 80)
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.035
    bump.inputs["Distance"].default_value = 0.045
    bump.location = (-10, -150)

    links.new(uv_map.outputs["UV"], texture.inputs["Vector"])
    links.new(texture.outputs["Color"], principled.inputs["Base Color"])
    links.new(texture.outputs["Color"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], principled.inputs["Normal"])
    links.new(principled.outputs["BSDF"], output.inputs["Surface"])
    return material


trunk = bpy.data.objects.get(TRUNK_NAME)
if trunk is None or trunk.type != "MESH":
    raise RuntimeError(f"Missing mesh object: {TRUNK_NAME}")

target_uv = restore_original_atlas_uv(trunk)
repack_target_uv(trunk, target_uv)
build_whole_trunk_projection(trunk)
source_image = bpy.data.images.load(str(SOURCE_PATH), check_existing=True)
source_image.colorspace_settings.name = "sRGB"

old_target = bpy.data.images.get("Banyan_Trunk_FullUV_Atlas_1K_V2")
if old_target is not None:
    bpy.data.images.remove(old_target)
atlas = bpy.data.images.new("Banyan_Trunk_FullUV_Atlas_1K_V2", width=1024, height=1024, alpha=False)
atlas.colorspace_settings.name = "sRGB"

temporary = bake_material(source_image, atlas)
trunk.data.materials.clear()
trunk.data.materials.append(temporary)
target_uv = trunk.data.uv_layers.get(TARGET_UV)
if target_uv is None:
    raise RuntimeError(f"Repacked target UV layer disappeared: {TARGET_UV}")
trunk.data.uv_layers.active_index = trunk.data.uv_layers.find(TARGET_UV)
for uv_layer in trunk.data.uv_layers:
    uv_layer.active_render = uv_layer.name == TARGET_UV

bpy.ops.object.select_all(action="DESELECT")
trunk.select_set(True)
bpy.context.view_layer.objects.active = trunk
bpy.context.scene.render.engine = "CYCLES"
bpy.context.scene.render.bake.use_clear = True
bpy.context.scene.render.bake.margin = 16
bpy.context.scene.render.bake.use_selected_to_active = False
bpy.ops.object.bake(type="DIFFUSE", pass_filter={"COLOR"})

ATLAS_PATH.parent.mkdir(parents=True, exist_ok=True)
atlas.filepath_raw = str(ATLAS_PATH)
atlas.file_format = "PNG"
atlas.save()

material = final_material(atlas)
trunk.data.materials.clear()
trunk.data.materials.append(material)
projection = trunk.data.uv_layers.get(SOURCE_UV)
if projection is not None:
    trunk.data.uv_layers.remove(projection)
trunk.data.uv_layers.active = trunk.data.uv_layers[TARGET_UV]
trunk["bark_material_stage"] = "repacked full UV fused-buttress atlas 1K v2"
trunk["full_uv_atlas_path"] = str(ATLAS_PATH)
bpy.context.scene["banyan_trunk_uv_stage"] = "repacked full 1K atlas baked; no tiling"
bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath)

print("BANYAN_TRUNK_FULL_UV_BAKE_COMPLETE", str(ATLAS_PATH), MATERIAL_NAME)
