"""Report connected components in the fused banyan wood mesh."""

from __future__ import annotations

import json

import bpy
from mathutils import Vector


OBJECT_NAME = "Banyan_Wood_Branches_Fused_UV"
obj = bpy.data.objects[OBJECT_NAME]
mesh = obj.data

adjacency = [set() for _ in mesh.vertices]
for edge in mesh.edges:
    a, b = edge.vertices
    adjacency[a].add(b)
    adjacency[b].add(a)

unvisited = set(range(len(mesh.vertices)))
components = []
while unvisited:
    seed = unvisited.pop()
    stack = [seed]
    vertices = {seed}
    while stack:
        current = stack.pop()
        for neighbor in adjacency[current]:
            if neighbor in unvisited:
                unvisited.remove(neighbor)
                vertices.add(neighbor)
                stack.append(neighbor)
    components.append(vertices)

vertex_component = {}
for component_index, vertices in enumerate(components):
    for vertex_index in vertices:
        vertex_component[vertex_index] = component_index

face_counts = [0] * len(components)
for polygon in mesh.polygons:
    component_index = vertex_component[polygon.vertices[0]]
    face_counts[component_index] += 1

records = []
for component_index, vertices in enumerate(components):
    points = [mesh.vertices[index].co for index in vertices]
    minimum = Vector((min(p.x for p in points), min(p.y for p in points), min(p.z for p in points)))
    maximum = Vector((max(p.x for p in points), max(p.y for p in points), max(p.z for p in points)))
    center = (minimum + maximum) * 0.5
    dimensions = maximum - minimum
    records.append(
        {
            "index": component_index,
            "vertices": len(vertices),
            "faces": face_counts[component_index],
            "min": [round(value, 3) for value in minimum],
            "max": [round(value, 3) for value in maximum],
            "center": [round(value, 3) for value in center],
            "dimensions": [round(value, 3) for value in dimensions],
        }
    )

records.sort(key=lambda record: record["vertices"], reverse=True)
print(
    "BANYAN_WOOD_COMPONENTS",
    json.dumps(
        {
            "object": OBJECT_NAME,
            "component_count": len(records),
            "vertices": len(mesh.vertices),
            "faces": len(mesh.polygons),
            "components": records,
        }
    ),
)
