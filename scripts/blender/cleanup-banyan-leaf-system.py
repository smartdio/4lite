"""Remove the legacy banyan foliage system while preserving the wood and base.

Run from Blender's Python console while the v42 banyan source is open:
    exec(open("/absolute/path/to/cleanup-banyan-leaf-system.py").read())

The script removes Blender data blocks only. It never deletes external texture
files from disk.
"""

from __future__ import annotations

import json

import bpy


LEAF_KEYS = (
    "foliage",
    "leaf",
    "crown",
    "clump",
    "fishscale",
    "horizontalcrown",
)
LEAF_MATERIAL_EXTRA_KEYS = ("horizontalslices", "unifiedanime")
LEAF_COLLECTIONS = ("BANYAN_FOLIAGE", "BANYAN_LEAF_CARDS")
PROTECTED_OBJECTS = (
    "Banyan_Wood_Branches_Fused_UV",
    "Banyan_Soil_Fused_UV",
)


def contains_any(value: str, keys: tuple[str, ...]) -> bool:
    lowered = value.lower()
    return any(key in lowered for key in keys)


for name in PROTECTED_OBJECTS:
    if name not in bpy.data.objects:
        raise RuntimeError(f"Required protected object is missing: {name}")

leaf_objects = [
    obj for obj in bpy.data.objects if contains_any(obj.name, LEAF_KEYS)
]
leaf_meshes = {
    obj.data for obj in leaf_objects if obj.type == "MESH" and obj.data is not None
}
leaf_materials = [
    material
    for material in bpy.data.materials
    if contains_any(material.name, LEAF_KEYS + LEAF_MATERIAL_EXTRA_KEYS)
]
leaf_images = [
    image
    for image in bpy.data.images
    if contains_any(f"{image.name} {image.filepath}", LEAF_KEYS)
]

summary = {
    "objects": len(leaf_objects),
    "meshes": len(leaf_meshes),
    "materials": len(leaf_materials),
    "images": len(leaf_images),
    "collections": [],
}

for obj in leaf_objects:
    bpy.data.objects.remove(obj, do_unlink=True)

for mesh in leaf_meshes:
    if mesh.users == 0:
        bpy.data.meshes.remove(mesh)

for material in leaf_materials:
    if material.users != 0:
        raise RuntimeError(
            f"Leaf material still has {material.users} users: {material.name}"
        )
    bpy.data.materials.remove(material)

for image in leaf_images:
    if image.users == 0:
        bpy.data.images.remove(image)

for name in LEAF_COLLECTIONS:
    collection = bpy.data.collections.get(name)
    if collection is not None:
        if collection.objects:
            raise RuntimeError(f"Leaf collection still contains objects: {name}")
        bpy.data.collections.remove(collection)
        summary["collections"].append(name)

remaining_leaf_objects = [
    obj.name for obj in bpy.data.objects if contains_any(obj.name, LEAF_KEYS)
]
if remaining_leaf_objects:
    raise RuntimeError(f"Leaf objects remain after cleanup: {remaining_leaf_objects}")

for name in PROTECTED_OBJECTS:
    if name not in bpy.data.objects:
        raise RuntimeError(f"Protected object was removed: {name}")

bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath)
print("BANYAN_LEAF_CLEANUP_COMPLETE", json.dumps(summary, ensure_ascii=False))
