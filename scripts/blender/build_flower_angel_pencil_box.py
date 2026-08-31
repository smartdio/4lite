"""Build the review-candidate flower-angel tin pencil box and export GLB.

Run with:
  Blender --background --python scripts/blender/build_flower_angel_pencil_box.py
"""

import math
from pathlib import Path

import bpy
import mathutils


ROOT = Path(__file__).resolve().parents[2]
TEXTURES = ROOT / "assets/source/textures/pencil-box/runtime"
BLEND_PATH = ROOT / "assets/source/blender/flower-angel-pencil-box-v01.blend"
GLB_PATH = ROOT / "public/assets/models/pencil-box/flower-angel-pencil-box-game-v01.glb"
PREVIEW_DIR = ROOT / "docs/reports/pencil-box"


def reset_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.images):
        for block in list(datablocks):
            if block.users == 0:
                datablocks.remove(block)


def principled_material(name, color, metallic, roughness):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    return material


def texture_material(name, path, metallic, roughness):
    material = principled_material(name, (1, 1, 1), metallic, roughness)
    nodes = material.node_tree.nodes
    texture = nodes.new("ShaderNodeTexImage")
    texture.image = bpy.data.images.load(str(path), check_existing=True)
    texture.image.colorspace_settings.name = "sRGB"
    material.node_tree.links.new(texture.outputs["Color"], nodes["Principled BSDF"].inputs["Base Color"])
    return material


def rounded_box(name, size, location, material, bevel=0.0007, parent=None):
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        modifier = obj.modifiers.new("Stamped edge bevel", "BEVEL")
        modifier.width = bevel
        modifier.segments = 4
        modifier.limit_method = "ANGLE"
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
        normal = obj.modifiers.new("Weighted face normals", "WEIGHTED_NORMAL")
        normal.keep_sharp = True
        bpy.ops.object.modifier_apply(modifier=normal.name)
    obj.data.materials.append(material)
    if parent:
        obj.parent = parent
    return obj


def rounded_prism(name, size, location, material, corner_radius, edge_bevel=0.0006, parent=None, segments=10):
    width, depth, height = size
    radius = min(corner_radius, width / 2 - 1e-5, depth / 2 - 1e-5)
    centers = (
        (width / 2 - radius, -depth / 2 + radius, -math.pi / 2, 0),
        (width / 2 - radius, depth / 2 - radius, 0, math.pi / 2),
        (-width / 2 + radius, depth / 2 - radius, math.pi / 2, math.pi),
        (-width / 2 + radius, -depth / 2 + radius, math.pi, math.pi * 1.5),
    )
    outline = []
    for cx, cy, start, end in centers:
        for index in range(segments + 1):
            angle = start + (end - start) * index / segments
            outline.append((cx + math.cos(angle) * radius, cy + math.sin(angle) * radius))
    count = len(outline)
    vertices = [(x, y, -height / 2) for x, y in outline] + [(x, y, height / 2) for x, y in outline]
    faces = [tuple(reversed(range(count))), tuple(range(count, count * 2))]
    for index in range(count):
        following = (index + 1) % count
        faces.append((index, following, following + count, index + count))
    mesh = bpy.data.meshes.new(f"{name}Mesh")
    mesh.from_pydata(vertices, [], faces);mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    obj.data.materials.append(material)
    if parent:
        obj.parent = parent
    if edge_bevel:
        modifier = obj.modifiers.new("Small pressed-sheet edge bevel", "BEVEL")
        modifier.width = edge_bevel
        modifier.segments = 3
        modifier.limit_method = "ANGLE"
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
        normal = obj.modifiers.new("Weighted pressed-sheet normals", "WEIGHTED_NORMAL")
        normal.keep_sharp = True
        bpy.ops.object.modifier_apply(modifier=normal.name)
    return obj


def image_plane(name, size, location, material, normal_down=False, parent=None):
    bpy.ops.mesh.primitive_plane_add(size=2, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = (size[0] / 2, size[1] / 2, 1)
    if normal_down:
        obj.rotation_euler.x = math.pi
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    if parent:
        obj.parent = parent
    return obj


def rounded_image_plane(name, size, location, material, corner_radius, normal_down=False, parent=None, segments=12):
    width, depth = size
    radius = min(corner_radius, width / 2 - 1e-5, depth / 2 - 1e-5)
    centers = (
        (width / 2 - radius, -depth / 2 + radius, -math.pi / 2, 0),
        (width / 2 - radius, depth / 2 - radius, 0, math.pi / 2),
        (-width / 2 + radius, depth / 2 - radius, math.pi / 2, math.pi),
        (-width / 2 + radius, -depth / 2 + radius, math.pi, math.pi * 1.5),
    )
    vertices = []
    for cx, cy, start, end in centers:
        for index in range(segments + 1):
            angle = start + (end - start) * index / segments
            vertices.append((cx + math.cos(angle) * radius, cy + math.sin(angle) * radius, 0))
    indices = list(range(len(vertices)))
    face = tuple(reversed(indices)) if normal_down else tuple(indices)
    mesh = bpy.data.meshes.new(f"{name}Mesh")
    mesh.from_pydata(vertices, [], [face]);mesh.update()
    uv_layer = mesh.uv_layers.new(name="UVMap")
    for loop in mesh.loops:
        vertex = mesh.vertices[loop.vertex_index].co
        u = vertex.x / width + 0.5
        v = vertex.y / depth + 0.5
        # A downward-facing decal is viewed from the reverse side of the lid.
        # Flip only the vertical texture axis so printed text remains upright
        # and left-to-right when the lid is opened, matching an X-rotated plane.
        if normal_down:
            v = 1.0 - v
        uv_layer.data[loop.index].uv = (u, v)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    obj.data.materials.append(material)
    if parent:
        obj.parent = parent
    return obj


def cylinder(name, radius, depth, location, material, parent=None):
    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=radius, depth=depth, location=location, rotation=(0, math.pi / 2, 0))
    obj = bpy.context.object
    obj.name = name
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    obj.data.materials.append(material)
    if parent:
        obj.parent = parent
    return obj


def join_objects(objects, name):
    if not objects:
        return None
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    objects[0].name = name
    return objects[0]


def apply_boolean(target, cutter, operation, name):
    modifier = target.modifiers.new(name, "BOOLEAN")
    modifier.operation = operation
    modifier.solver = "EXACT"
    modifier.object = cutter
    bpy.context.view_layer.objects.active = target
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    bpy.data.objects.remove(cutter, do_unlink=True)
    return target


def point_camera(camera, target):
    direction = mathutils.Vector(target) - camera.location
    camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def render_previews(lid):
    PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene
    scene.render.resolution_x = 1200
    scene.render.resolution_y = 700
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.world.color = (0.012, 0.009, 0.006)

    floor_material = principled_material("preview desk surface", (0.035, 0.020, 0.010), 0.0, 0.72)
    rounded_box("PreviewSurface", (0.52, 0.36, 0.012), (0, 0, -0.008), floor_material, 0.003)

    bpy.ops.object.light_add(type="AREA", location=(-0.18, -0.16, 0.32))
    key = bpy.context.object
    key.name = "PreviewKey"
    key.data.energy = 45
    key.data.shape = "DISK"
    key.data.size = 0.24
    key.data.color = (1.0, 0.80, 0.60)
    bpy.ops.object.light_add(type="AREA", location=(0.20, 0.10, 0.22))
    fill = bpy.context.object
    fill.name = "PreviewFill"
    fill.data.energy = 22
    fill.data.size = 0.20
    fill.data.color = (0.64, 0.78, 1.0)

    bpy.ops.object.camera_add(location=(0.265, -0.285, 0.205))
    camera = bpy.context.object
    camera.name = "PreviewCamera"
    camera.data.lens = 58
    point_camera(camera, (0, 0, 0.025))
    scene.camera = camera

    lid.rotation_euler.x = 0
    scene.render.filepath = str(PREVIEW_DIR / "flower-angel-pencil-box-blender-closed-v01.png")
    bpy.ops.render.render(write_still=True)

    lid.rotation_euler.x = math.radians(-110)
    point_camera(camera, (0, 0.020, 0.065))
    scene.render.filepath = str(PREVIEW_DIR / "flower-angel-pencil-box-blender-open-v01.png")
    bpy.ops.render.render(write_still=True)

    lid.rotation_euler.x = math.radians(-72)
    camera.location = (0, -0.225, 0.037)
    camera.data.lens = 72
    point_camera(camera, (0, -0.033, 0.017))
    scene.render.filepath = str(PREVIEW_DIR / "flower-angel-pencil-box-latch-detail-v01.png")
    bpy.ops.render.render(write_still=True)
    lid.rotation_euler.x = 0


def build():
    reset_scene()
    bpy.context.scene.unit_settings.system = "METRIC"
    bpy.context.scene.unit_settings.length_unit = "METERS"
    bpy.context.scene.render.engine = "BLENDER_EEVEE"

    root = bpy.data.objects.new("FlowerAngelPencilBoxRoot", None)
    bpy.context.collection.objects.link(root)
    root["workingDimensionsMeters"] = [0.210, 0.075, 0.022]
    root["status"] = "candidate-restoration"
    root["historicalSource"] = "unverified"

    painted = principled_material("pale golden brass-toned tin shell", (0.98, 0.81, 0.34), 0.40, 0.34)
    bright_metal = principled_material("silver hinge sleeves", (0.70, 0.73, 0.72), 0.93, 0.29)
    cover = texture_material(
        "flower angel candidate printed lacquer",
        TEXTURES / "flower-angel-cover-runtime-v01.png",
        0.08,
        0.31,
    )
    inner_print = texture_material(
        "faded multiplication table on tin",
        TEXTURES / "multiplication-inner-runtime-v01.png",
        0.42,
        0.37,
    )
    inner_floor_stained = texture_material(
        "subtly stained brass-toned inner tin floor",
        TEXTURES / "inner-metal-stains-runtime-v01.png",
        0.58,
        0.39,
    )

    # Base: one continuous rounded solid. A flattened rounded rim is unioned to
    # it first, then one continuous rounded cutter hollows the entire tray.
    base = bpy.data.objects.new("PencilBoxBase", None)
    bpy.context.collection.objects.link(base)
    base.parent = root
    base_shell = rounded_prism("BaseContinuousStampedShell", (0.207, 0.072, 0.0140), (0, 0, 0.0070), painted, 0.0100, 0.00045, base)
    base_rim = rounded_prism("BaseRolledRimSolid", (0.209, 0.074, 0.0016), (0, 0, 0.01335), painted, 0.0105, 0.00025)
    base_rim_inner = rounded_prism("BaseRolledRimInnerCutter", (0.2066, 0.0716, 0.0030), (0, 0, 0.01335), painted, 0.0093, 0.00012)
    apply_boolean(base_rim, base_rim_inner, "DIFFERENCE", "Hollow flattened base rim")
    apply_boolean(base_shell, base_rim, "UNION", "Union rolled rim with base body")
    base_cavity = rounded_prism("BaseContinuousCavityCutter", (0.2054, 0.0704, 0.0160), (0, 0, 0.0088), painted, 0.0092, 0.00012)
    apply_boolean(base_shell, base_cavity, "DIFFERENCE", "Cut continuous base cavity")
    rounded_prism("BaseInnerMetalFloor", (0.2042, 0.0692, 0.00025), (0, 0, 0.00094), inner_floor_stained, 0.0086, 0.00008, base)

    # The lid pivot is the actual rear hinge axis. Runtime rotates this object.
    lid = bpy.data.objects.new("PencilBoxLidPivot", None)
    bpy.context.collection.objects.link(lid)
    lid.location = (0, 0.0375, 0.0140)
    lid.parent = root
    lid["closedAngleDegrees"] = 0.0
    lid["openAngleDegrees"] = 110.0

    lid_shell = rounded_prism("LidContinuousStampedShell", (0.210, 0.075, 0.0080), (0, -0.0375, 0.0040), painted, 0.0105, 0.00045, lid)
    # The lid roll belongs below the lid skirt, not across its middle. Only a
    # narrow overlap enters the shell so the Boolean union remains continuous.
    lid_rim = rounded_prism("LidRolledRimSolid", (0.211, 0.076, 0.0013), (0, -0.0375, -0.00005), painted, 0.0109, 0.00022, lid)
    lid_rim_inner = rounded_prism("LidRolledRimInnerCutter", (0.2086, 0.0736, 0.0024), (0, -0.0375, -0.00005), painted, 0.0097, 0.00010, lid)
    apply_boolean(lid_rim, lid_rim_inner, "DIFFERENCE", "Hollow flattened lid rim")
    apply_boolean(lid_shell, lid_rim, "UNION", "Union rolled rim with lid body")
    lid_cavity = rounded_prism("LidContinuousCavityCutter", (0.2084, 0.0734, 0.0090), (0, -0.0375, 0.0031), painted, 0.0097, 0.00010, lid)
    apply_boolean(lid_shell, lid_cavity, "DIFFERENCE", "Cut continuous lid cavity")
    rounded_image_plane("FlowerAngelPrintedCover", (0.202, 0.067), (0, -0.0375, 0.00812), cover, 0.0065, parent=lid)
    rounded_image_plane("MultiplicationTableInnerLid", (0.2065, 0.0715), (0, -0.0375, 0.00748), inner_print, 0.0062, normal_down=True, parent=lid)
    lid_metal = []
    for x in (-0.060, 0.060):
        lid_metal.append(cylinder(f"LidHingeSleeve-{x:+.3f}", 0.0015, 0.024, (x, -0.0003, 0), bright_metal, lid))
    join_objects(lid_metal, "LidLeftRightSilverHingeSleeves")

    # Export metadata used by runtime audits.
    for obj in bpy.context.scene.objects:
        if obj.type == "MESH":
            obj["castsCampusShadow"] = False

    BLEND_PATH.parent.mkdir(parents=True, exist_ok=True)
    GLB_PATH.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
    bpy.ops.export_scene.gltf(
        filepath=str(GLB_PATH),
        export_format="GLB",
        export_yup=True,
        export_apply=False,
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
        export_image_format="AUTO",
        export_extras=True,
        export_cameras=False,
        export_lights=False,
    )
    render_previews(lid)


if __name__ == "__main__":
    build()
