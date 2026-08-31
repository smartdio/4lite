"""Reduce the fused banyan branch system from 65 to 31 branches.

The retained structure keeps the leader, primary transitions, low horizontal
scaffold, ten secondary branches, and eight lower support branches. Existing
UVs and materials on retained geometry are preserved.
"""

from __future__ import annotations

import json

import bmesh
import bpy


WOOD_OBJECT = "Banyan_Wood_Branches_Fused_UV"
EXPECTED_COMPONENTS = 67  # trunk + tiny legacy island + 65 branch tubes
REMOVE_COMPONENTS = set(range(3, 21)) | set(range(47, 59)) | {29, 32, 39, 40}
REMOVE_SOURCE_OBJECTS = {
    *(f"Banyan_LowArcTwig_{group:02d}_{twig:02d}" for group in range(1, 7) for twig in range(1, 4)),
    "Banyan_Secondary_03",
    "Banyan_Secondary_06",
    "Banyan_Secondary_13",
    "Banyan_Secondary_14",
}


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


wood = bpy.data.objects[WOOD_OBJECT]
mesh = wood.data
components_before = connected_components(mesh)
if len(components_before) != EXPECTED_COMPONENTS:
    raise RuntimeError(
        f"Expected {EXPECTED_COMPONENTS} wood components, found {len(components_before)}"
    )

original_vertices = len(mesh.vertices)
original_faces = len(mesh.polygons)
remove_vertices = set().union(
    *(components_before[index] for index in sorted(REMOVE_COMPONENTS))
)

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

removed_source_objects = []
for name in sorted(REMOVE_SOURCE_OBJECTS):
    source = bpy.data.objects.get(name)
    if source is None:
        raise RuntimeError(f"Expected hidden source branch is missing: {name}")
    source_mesh = source.data if source.type == "MESH" else None
    bpy.data.objects.remove(source, do_unlink=True)
    if source_mesh is not None and source_mesh.users == 0:
        bpy.data.meshes.remove(source_mesh)
    removed_source_objects.append(name)

components_after = connected_components(mesh)
expected_after = EXPECTED_COMPONENTS - len(REMOVE_COMPONENTS)
if len(components_after) != expected_after:
    raise RuntimeError(
        f"Expected {expected_after} components after simplification, found {len(components_after)}"
    )

wood["branch_simplification"] = "65 branch tubes reduced to 31; main scaffold preserved"
wood["branch_tubes_before"] = 65
wood["branch_tubes_after"] = 31
wood["branch_reduction_percent"] = round((65 - 31) / 65 * 100, 1)

summary = {
    "branch_tubes_before": 65,
    "branch_tubes_after": 31,
    "reduction_percent": round((65 - 31) / 65 * 100, 1),
    "removed_components": len(REMOVE_COMPONENTS),
    "removed_source_objects": len(removed_source_objects),
    "vertices_before": original_vertices,
    "vertices_after": len(mesh.vertices),
    "faces_before": original_faces,
    "faces_after": len(mesh.polygons),
    "uv_layers": [layer.name for layer in mesh.uv_layers],
    "materials": [material.name for material in mesh.materials if material],
}

bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath)
print("BANYAN_BRANCH_SIMPLIFICATION_COMPLETE", json.dumps(summary, ensure_ascii=False))
