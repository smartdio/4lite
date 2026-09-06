"""Author the two review birds. No production asset is installed before visual approval.

Blender --background --python scripts/blender/create_campus_birds.py
Coordinates below are metres, Y up, +Z forward (converted to Blender at authoring).
"""
import json
import math
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'assets/source/blender/campus-birds'
OUT = ROOT / 'previews/birds-v01/assets'
REPORT = ROOT / 'docs/reports/campus-birds'
for directory in (SOURCE, OUT, REPORT):
    directory.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)


def xyz(v):
    return (v[0], -v[2], v[1])


material = bpy.data.materials.new('Bird_Matte_Vertex_Color')
material.use_nodes = True
bsdf = material.node_tree.nodes.get('Principled BSDF')
bsdf.inputs['Roughness'].default_value = .94
bsdf.inputs['Metallic'].default_value = 0
color_node = material.node_tree.nodes.new('ShaderNodeVertexColor')
color_node.layer_name = 'Color'
material.node_tree.links.new(color_node.outputs['Color'], bsdf.inputs['Base Color'])


def empty(name, parent=None, position=(0, 0, 0)):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.parent = parent
    obj.location = xyz(position)
    return obj


class Part:
    def __init__(self, name, parent, origin, length):
        self.name, self.parent, self.origin, self.length = name, parent, origin, length
        self.vertices, self.faces, self.colors = [], [], []

    def mesh(self, vertices, faces, color):
        offset = len(self.vertices)
        self.vertices.extend(vertices)
        for face in faces:
            self.faces.append(tuple(offset + i for i in face))
            self.colors.append(color)

    def ellipsoid(self, center, radii, color, segments=8, rings=4, underside=None):
        vs = [(center[0], center[1] + radii[1], center[2])]
        for ring in range(1, rings):
            phi = math.pi * ring / rings
            for j in range(segments):
                theta = math.tau * j / segments
                vs.append((center[0] + radii[0] * math.sin(phi) * math.cos(theta),
                           center[1] + radii[1] * math.cos(phi),
                           center[2] + radii[2] * math.sin(phi) * math.sin(theta)))
        vs.append((center[0], center[1] - radii[1], center[2]))
        faces = []
        for j in range(segments):
            faces.append((0, 1 + (j + 1) % segments, 1 + j))
        for ring in range(rings - 2):
            a, b = 1 + ring * segments, 1 + (ring + 1) * segments
            for j in range(segments):
                k = (j + 1) % segments
                faces.extend([(a + j, a + k, b + k), (a + j, b + k, b + j)])
        last = 1 + (rings - 2) * segments
        for j in range(segments):
            faces.append((last + j, last + (j + 1) % segments, len(vs) - 1))
        for face in faces:
            tint = underside if underside and sum(vs[i][1] for i in face) / 3 < center[1] else color
            self.mesh([vs[i] for i in face], [(0, 1, 2)], tint)

    def prism(self, outline, thickness, color):
        # Planar outline in X/Z; every wing has thickness and works from both sides.
        n = len(outline)
        vertices = [(x, y + dy, z) for dy in (-thickness / 2, thickness / 2) for x, y, z in outline]
        faces = []
        for i in range(1, n - 1):
            faces.extend([(0, i + 1, i), (n, n + i, n + i + 1)])
        for i in range(n):
            j = (i + 1) % n
            faces.extend([(i, j, n + j), (i, n + j, n + i)])
        self.mesh(vertices, faces, color)

    def rod(self, a, b, radius, color):
        av, bv = Vector(a), Vector(b)
        axis = (bv - av).normalized()
        u = axis.cross(Vector((0, 1, 0)))
        if u.length < .01:
            u = axis.cross(Vector((1, 0, 0)))
        u.normalize()
        v = axis.cross(u).normalized()
        vertices = [tuple(center + radius * (math.cos(i * math.tau / 4) * u + math.sin(i * math.tau / 4) * v))
                    for center in (av, bv) for i in range(4)]
        faces = [(i, (i + 1) % 4, 4 + (i + 1) % 4, 4 + i) for i in range(4)]
        faces.extend([(3, 2, 1, 0), (4, 5, 6, 7)])
        self.mesh(vertices, faces, color)

    def finish(self):
        vertices = [xyz(tuple(value * self.length for value in v)) for v in self.vertices]
        mesh = bpy.data.meshes.new(self.name)
        mesh.from_pydata(vertices, [], self.faces)
        mesh.update()
        colors = mesh.color_attributes.new(name='Color', type='FLOAT_COLOR', domain='CORNER')
        for polygon, color in zip(mesh.polygons, self.colors):
            for index in polygon.loop_indices:
                colors.data[index].color_srgb = (*color, 1)
        mesh.materials.append(material)
        obj = bpy.data.objects.new(self.name, mesh)
        bpy.context.collection.objects.link(obj)
        obj.parent = self.parent
        obj.location = xyz(tuple(value * self.length for value in self.origin))
        # Recalculate normals after authoring; no smoothing/subdivision modifier.
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.mesh.normals_make_consistent(inside=False)
        bpy.ops.object.mode_set(mode='OBJECT')
        obj.select_set(False)
        return obj


def bird(species, length):
    root = empty(species)
    body_pivot = empty(f'{species}_body', root)
    pigeon = species == 'pigeon'
    body_drop = .06  # Keep a natural short-legged stance after lifting the belly.
    back = (.45, .49, .52) if pigeon else (.43, .31, .20)
    belly = (.65, .66, .63) if pigeon else (.74, .67, .54)
    wing = (.38, .42, .45) if pigeon else (.36, .28, .20)
    dark = (.22, .25, .27) if pigeon else (.23, .18, .13)
    feet = (.52, .35, .31) if pigeon else (.43, .34, .26)
    torso = Part(f'{species}_torso', body_pivot, (0, 0, 0), length)
    torso.ellipsoid((0, .33, -.035), (.185, .23, .31), back, segments=10, rings=6, underside=belly)
    # v02 feedback: the spherical lower body looked overfed. Keep the chest
    # and shoulder attachment, but lift the belly and taper toward the rump.
    # This reshapes the authored full mesh; it is not a runtime scale/LOD.
    shaped = []
    for x, y, z in torso.vertices:
        lower = max(0, (.33 - y) / .23)
        rear = max(0, (-.035 - z) / .31)
        x *= (.83 if pigeon else .85) * (1 - .20 * rear - .10 * lower)
        if y < .33:
            y = .33 + (y - .33) * .60
        shaped.append((x, y - body_drop, z))
    torso.vertices = shaped
    if pigeon:
        # v03: retain the neck base at the chest, extend its upper section,
        # and lift the head 2.4 cm without changing the v02 slim abdomen.
        torso.ellipsoid((0, .51 - body_drop, .18), (.100, .20, .115), (.43, .49, .45), segments=8, rings=3)
    torso.finish()
    head = empty(f'{species}_head', body_pivot)
    head.location = xyz((0, (.55 - body_drop + (.08 if pigeon else 0)) * length, .23 * length))
    part = Part(f'{species}_head_mesh', head, (0, 0, 0), length)
    part.ellipsoid((0, 0, 0), (.12, .13, .13), back, rings=5, underside=belly)
    # Small eyes are geometry, not a texture request.
    for sign in (-1, 1):
        part.ellipsoid((sign * .086, .025, .065), (.014, .014, .014), (.065, .06, .05), segments=4, rings=2)
        if not pigeon:
            part.ellipsoid((sign * .098, -.035, -.009), (.016, .036, .04), dark, segments=4, rings=2)
    part.mesh([(-.036, -.014, .115), (.036, -.014, .115), (0, .018, .12), (0, -.02, .235)],
              [(0, 2, 1), (0, 1, 3), (1, 2, 3), (2, 0, 3)], dark)
    part.finish()
    tail = empty(f'{species}_tail', body_pivot, (0, (.26 - body_drop) * length, -.27 * length))
    part = Part(f'{species}_tail_mesh', tail, (0, 0, 0), length)
    part.prism([(-.075, 0, 0), (.075, 0, 0), (.11, .015, -.26), (-.11, .015, -.26)], .017, dark)
    part.finish()
    for sign, side in ((-1, 'left'), (1, 'right')):
        shoulder = empty(f'{species}_{side}_wing', body_pivot, (sign * .12 * length, (.43 - body_drop) * length, .035 * length))
        part = Part(f'{species}_{side}_wing_mesh', shoulder, (0, 0, 0), length)
        part.prism([(0, 0, .06), (sign * .37, 0, -.015), (sign * .35, -.02, -.24), (0, -.01, -.20)], .022, wing)
        if pigeon:
            for x in (.19, .28):
                part.prism([(sign * x, .014, -.01), (sign * (x + .025), .014, -.015),
                            (sign * (x + .025), .014, -.23), (sign * x, .014, -.23)], .002, dark)
        part.finish()
        tip = empty(f'{species}_{side}_tip', shoulder, (sign * .35 * length, 0, -.025 * length))
        part = Part(f'{species}_{side}_tip_mesh', tip, (0, 0, 0), length)
        part.prism([(0, 0, .01), (sign * .49, -.014, -.13), (sign * .43, -.014, -.22),
                    (sign * .30, -.01, -.25), (0, 0, -.22)], .012, dark)
        part.finish()
        foot = empty(f'{species}_{side}_foot', body_pivot, (sign * .075 * length, .18 * length, .015 * length))
        part = Part(f'{species}_{side}_foot_mesh', foot, (0, 0, 0), length)
        part.rod((0, 0, 0), (0, -.16, .025), .012, feet)
        for toe in (-1, 1):
            part.rod((0, -.16, .025), (toe * .032, -.17, .105), .006, feet)
        part.rod((0, -.16, .025), (0, -.17, -.025), .006, feet)
        part.finish()
    root['bodyLengthMetres'] = length
    root['forward'] = '+Z'
    root['reviewStatus'] = 'approved-2026-09-06'
    root['revision'] = 'pigeon-neck-v03' if pigeon else 'slimmer-abdomen-v02'
    return root


roots = [bird('sparrow', .15), bird('pigeon', .30)]
report = {'reviewStatus': 'approved-2026-09-06', 'revision': 'pigeon-neck-v03', 'species': {}, 'textures': 0, 'materials': 1}
for root in roots:
    meshes = [obj for obj in root.children_recursive if obj.type == 'MESH']
    triangles = 0
    for obj in meshes:
        obj.data.calc_loop_triangles()
        triangles += len(obj.data.loop_triangles)
    limit = 600 if root.name == 'sparrow' else 900
    assert triangles <= limit, (root.name, triangles, limit)
    report['species'][root.name] = {'triangles': triangles, 'meshes': len(meshes), 'bodyLengthMetres': root['bodyLengthMetres']}
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE / 'campus-birds-v01.blend'))
bpy.ops.export_scene.gltf(filepath=str(OUT / 'campus-birds-v01.glb'), export_format='GLB',
                          export_yup=True, export_animations=False, export_extras=True)
report['glbBytes'] = (OUT / 'campus-birds-v01.glb').stat().st_size
(REPORT / 'asset-metrics.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report))
