"""Replace all banyan stone materials with one compact, quiet 1K surface."""

from __future__ import annotations

from pathlib import Path

import bpy


ROOT = Path(__file__).resolve().parents[2]
TEXTURE_PATH = ROOT / "assets/source-textures/banyan/banyan-stone-simplified-seamless-basecolor-1k-v3-optimized.png"
MATERIAL_NAME = "MAT_Banyan_Stone_Simplified_1K_V3"


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
principled.inputs["Roughness"].default_value = 0.91
principled.inputs["Specular IOR Level"].default_value = 0.18
texture = nodes.new("ShaderNodeTexImage")
texture.location = (-330, 80)
texture.extension = "REPEAT"
texture.interpolation = "Linear"
texture.image = bpy.data.images.load(str(TEXTURE_PATH), check_existing=True)
texture.image.colorspace_settings.name = "sRGB"
uv_map = nodes.new("ShaderNodeUVMap")
uv_map.location = (-540, 80)
uv_map.uv_map = "UVMap"
bump = nodes.new("ShaderNodeBump")
bump.location = (-10, -150)
bump.inputs["Strength"].default_value = 0.025
bump.inputs["Distance"].default_value = 0.035

links.new(uv_map.outputs["UV"], texture.inputs["Vector"])
links.new(texture.outputs["Color"], principled.inputs["Base Color"])
links.new(texture.outputs["Color"], bump.inputs["Height"])
links.new(bump.outputs["Normal"], principled.inputs["Normal"])
links.new(principled.outputs["BSDF"], output.inputs["Surface"])

stones = sorted(
    (obj for obj in bpy.data.objects if obj.type == "MESH" and obj.name.startswith("Banyan_Stone_")),
    key=lambda obj: obj.name,
)
for index, obj in enumerate(stones):
    obj.data.materials.clear()
    obj.data.materials.append(material)
    uv_layer = obj.data.uv_layers.get("UVMap")
    if uv_layer is not None and not obj.get("simplified_stone_uv_offset_v3", False):
        offset_u = (index * 0.173) % 1.0
        offset_v = (index * 0.117) % 1.0
        for loop_uv in uv_layer.data:
            loop_uv.uv = (loop_uv.uv.x + offset_u, loop_uv.uv.y + offset_v)
        obj["simplified_stone_uv_offset_v3"] = True
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    obj["stone_material_stage"] = "single simplified seamless 1K v3"

bpy.context.scene["banyan_stone_material_stage"] = "all stones share simplified seamless 1K v3"
bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath)
print("BANYAN_STONE_SIMPLIFIED_COMPLETE", len(stones), str(TEXTURE_PATH), MATERIAL_NAME)
