"""Remove all current banyan branches and aerial roots, keeping the trunk/base."""

from __future__ import annotations

import json

import bmesh
import bpy


WOOD_OBJECT = "Banyan_Wood_Branches_Fused_UV"
EXPECTED_COMPONENT_COUNTS = {33, 67}
PROTECTED_OBJECTS = (
    "Banyan_Soil_Fused_UV",
    *(f"Banyan_Stone_Independent_{index:02d}" for index in range(1, 20)),
    *(f"Banyan_StemBundle_Long_{index:02d}" for index in range(1, 9)),
    *(f"Banyan_StemBundle_Short_{letter}" for letter in "ABCD"),
)


def connected_components(mesh: bpy.types.Mesh) -> list[set[int]]:
    adjacency = [set() for _ in mesh.vertices]
    for edge in mesh.edges:
        first, second = edge.vertices
        adjacency[first].add(second)
        adjacency[second].add(first)

    visited = [False] * len(mesh.vertices)
    components: list[set[int]] = []
    for seed in range(len(mesh.vertices)):
        if visited[seed]:
            continue
        visited[seed] = True
        stack = [seed]
        component = {seed}
        while stack:
            current = stack.pop()
            for neighbor in adjacency[current]:
                if not visited[neighbor]:
                    visited[neighbor] = True
                    component.add(neighbor)
                    stack.append(neighbor)
        components.append(component)
    return components


for name in PROTECTED_OBJECTS:
    if name not in bpy.data.objects:
        raise RuntimeError(f"Required protected object is missing: {name}")

wood = bpy.data.objects[WOOD_OBJECT]
mesh = wood.data
components = connected_components(mesh)
if len(components) not in EXPECTED_COMPONENT_COUNTS:
    raise RuntimeError(
        f"Expected one of {sorted(EXPECTED_COMPONENT_COUNTS)} wood component counts, "
        f"found {len(components)}"
    )

original_vertices = len(mesh.vertices)
original_faces = len(mesh.polygons)
remove_vertices = set().union(*components[1:])

bm = bmesh.new()
bm.from_mesh(mesh)
bm.verts.ensure_lookup_table()
bmesh.ops.delete(
    bm,
    geom=[bm.verts[index] for index in sorted(remove_vertices)],
    context="VERTS",
)
bm.to_mesh(mesh)
bm.free()
mesh.update()

if len(connected_components(mesh)) != 1:
    raise RuntimeError("The retained trunk mesh is not a single connected component")

branch_source_objects = [
    obj
    for obj in list(bpy.data.objects)
    if obj.name == "Banyan_Leader_Center"
    or obj.name.startswith("Banyan_LowArc_")
    or obj.name.startswith("Banyan_LowArcTwig_")
    or obj.name.startswith("Banyan_Secondary_")
]
aerial_root_objects = [
    obj
    for obj in list(bpy.data.objects)
    if obj.name.startswith("Banyan_AerialRoot_")
    or obj.name.startswith("Banyan_LowAerial_")
]


def remove_objects(objects: list[bpy.types.Object]) -> None:
    for obj in objects:
        source_mesh = obj.data if obj.type == "MESH" else None
        bpy.data.objects.remove(obj, do_unlink=True)
        if source_mesh is not None and source_mesh.users == 0:
            bpy.data.meshes.remove(source_mesh)


remove_objects(branch_source_objects)
remove_objects(aerial_root_objects)

aerial_collection = bpy.data.collections.get("BANYAN_AERIAL_ROOTS")
if aerial_collection is not None:
    if aerial_collection.objects:
        raise RuntimeError("BANYAN_AERIAL_ROOTS still contains objects")
    bpy.data.collections.remove(aerial_collection)

for name in PROTECTED_OBJECTS:
    if name not in bpy.data.objects:
        raise RuntimeError(f"Protected object was removed: {name}")

remaining_branches = [
    obj.name
    for obj in bpy.data.objects
    if obj.name == "Banyan_Leader_Center"
    or obj.name.startswith("Banyan_LowArc_")
    or obj.name.startswith("Banyan_LowArcTwig_")
    or obj.name.startswith("Banyan_Secondary_")
]
remaining_aerial_roots = [
    obj.name
    for obj in bpy.data.objects
    if obj.name.startswith("Banyan_AerialRoot_")
    or obj.name.startswith("Banyan_LowAerial_")
]
if remaining_branches or remaining_aerial_roots:
    raise RuntimeError(
        f"Cleanup incomplete: branches={remaining_branches}, aerial_roots={remaining_aerial_roots}"
    )

wood["construction"] = "retained original fused trunk only; all generated branches removed"
wood["branch_tubes_before"] = 65
wood["branch_tubes_after"] = 0
wood["branch_reduction_percent"] = 100.0

summary = {
    "removed_fused_components": len(components) - 1,
    "removed_branch_tubes": len(components) - 2,
    "removed_branch_source_objects": len(branch_source_objects),
    "removed_aerial_roots": len(aerial_root_objects),
    "retained_stem_bundles": len(
        [obj for obj in bpy.data.objects if obj.name.startswith("Banyan_StemBundle_")]
    ),
    "vertices_before": original_vertices,
    "vertices_after": len(mesh.vertices),
    "faces_before": original_faces,
    "faces_after": len(mesh.polygons),
    "uv_layers": [layer.name for layer in mesh.uv_layers],
    "materials": [material.name for material in mesh.materials if material],
}

bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath)
print("BANYAN_BRANCH_ROOT_STRIP_COMPLETE", json.dumps(summary, ensure_ascii=False))
