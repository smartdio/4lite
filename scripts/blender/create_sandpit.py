import bpy
import math
import sys
from pathlib import Path
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
MODEL_DIR = ROOT / "public" / "assets" / "models" / "sandpit"
PREVIEW_DIR = ROOT / "docs" / "references"
BLEND_PATH = MODEL_DIR / "sandpit-recessed-v01.blend"
GLB_PATH = MODEL_DIR / "sandpit-recessed-game-v01.glb"
PREVIEW_PATH = PREVIEW_DIR / "024-sandpit-blender-preview-v01.png"
ATLAS_PATH = MODEL_DIR / "textures" / "sandpit-square-top-atlas-v01.png"
RIM_TEXTURE_PATH = MODEL_DIR / "textures" / "sandpit-cement-rim-albedo-v01.png"

OUTER = 6.0
RIM = 0.20
INNER = OUTER - RIM * 2
DEPTH = 0.20
SAND_BASE = -0.14
RIM_TEXTURE_TILE = 1.20
RIM_WALL_TEXTURE_TILE = DEPTH


def material(name, color, roughness=0.9):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1.0)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    return mat


def image_material(name, image_path, uv_name, roughness=0.9):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    shader = nodes.new("ShaderNodeBsdfPrincipled")
    uv = nodes.new("ShaderNodeUVMap")
    uv.uv_map = uv_name
    texture = nodes.new("ShaderNodeTexImage")
    texture.image = bpy.data.images.load(str(image_path), check_existing=True)
    texture.interpolation = "Linear"
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Specular IOR Level"].default_value = 0.24
    links.new(uv.outputs["UV"], texture.inputs["Vector"])
    links.new(texture.outputs["Color"], shader.inputs["Base Color"])
    links.new(shader.outputs["BSDF"], output.inputs["Surface"])
    return mat


def apply_atlas_uvs(rim, sand):
    rim.data.materials.clear()
    rim.data.materials.append(RIM_SIDE)
    atlas_uv = rim.data.uv_layers.new(name="SandpitAtlasUV")
    side_uv = rim.data.uv_layers.new(name="SandpitRimUV")
    for poly in rim.data.polygons:
        poly.material_index = 0
        for loop_index in poly.loop_indices:
            co = rim.data.vertices[rim.data.loops[loop_index].vertex_index].co
            atlas_uv.data[loop_index].uv = (
                0.022 + ((co.x + OUTER / 2) / OUTER) * 0.956,
                0.022 + ((co.y + OUTER / 2) / OUTER) * 0.956,
            )
            if poly.normal.z > 0.42:
                side_uv.data[loop_index].uv = (
                    (co.x + OUTER / 2) / RIM_TEXTURE_TILE,
                    (co.y + OUTER / 2) / RIM_TEXTURE_TILE,
                )
            else:
                along = co.y if abs(poly.normal.x) > abs(poly.normal.y) else co.x
                # Keep the same world-space texel density on the vertical faces as
                # each wall's height. Mapping a complete square texture over every
                # 6 m x 0.2 m wall made the aggregate appear as long streaks.
                side_uv.data[loop_index].uv = (
                    (along + OUTER / 2) / RIM_WALL_TEXTURE_TILE,
                    (co.z + DEPTH) / RIM_WALL_TEXTURE_TILE,
                )

    sand.data.materials.clear()
    sand.data.materials.append(TOP_ATLAS)
    atlas_uv = sand.data.uv_layers.new(name="SandpitAtlasUV")
    xs = [vertex.co.x for vertex in sand.data.vertices]
    ys = [vertex.co.y for vertex in sand.data.vertices]
    xmin, xmax, ymin, ymax = min(xs), max(xs), min(ys), max(ys)
    for poly in sand.data.polygons:
        poly.material_index = 0
        for loop_index in poly.loop_indices:
            co = sand.data.vertices[sand.data.loops[loop_index].vertex_index].co
            atlas_uv.data[loop_index].uv = (
                0.058 + ((co.x - xmin) / (xmax - xmin)) * 0.884,
                0.058 + ((co.y - ymin) / (ymax - ymin)) * 0.884,
            )


def create_ring():
    oh = OUTER / 2
    ih = INNER / 2
    outer = [(-oh, -oh), (oh, -oh), (oh, oh), (-oh, oh)]
    inner = [(-ih, -ih), (ih, -ih), (ih, ih), (-ih, ih)]
    verts = []
    for z, loop in [(0.0, outer), (0.0, inner), (-DEPTH, outer), (-DEPTH, inner)]:
        verts.extend((x, y, z) for x, y in loop)
    faces = []
    for i in range(4):
        n = (i + 1) % 4
        faces.append((i, n, 4 + n, 4 + i))             # top
        faces.append((8 + i, 12 + i, 12 + n, 8 + n))   # bottom
        faces.append((i, 8 + i, 8 + n, n))              # outer wall
        faces.append((4 + i, 4 + n, 12 + n, 12 + i))    # inner wall
    mesh = bpy.data.meshes.new("SandpitConcreteRimMesh")
    mesh.from_pydata(verts, [], faces)
    mesh.materials.append(CONCRETE)
    mesh.update()
    obj = bpy.data.objects.new("Sandpit_Concrete_Rim", mesh)
    bpy.context.collection.objects.link(obj)
    bevel = obj.modifiers.new("Worn edge softness", "BEVEL")
    bevel.width = 0.025
    bevel.segments = 2
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    obj.select_set(False)
    return obj


FOOTPRINTS = [
    (-1.70, -1.82, -0.20, 0.13, 0.25), (-1.42, -1.58, -0.13, 0.12, 0.24),
    (-0.96, -2.02, 0.18, 0.13, 0.26), (-0.68, -1.73, 0.22, 0.12, 0.24),
    (-0.25, -1.48, -0.08, 0.13, 0.25), (0.05, -1.27, -0.02, 0.12, 0.23),
    (0.62, -2.08, 0.12, 0.14, 0.27), (0.88, -1.75, 0.08, 0.12, 0.24),
    (1.38, -1.58, -0.24, 0.13, 0.25), (1.62, -1.31, -0.18, 0.12, 0.23),
    (-1.28, -0.95, 0.08, 0.12, 0.24), (1.12, -0.84, -0.12, 0.12, 0.24),
]

LANDING_PITS = [
    (-1.15, -2.00, 0.50, 0.34, 0.068),
    (0.00, -1.72, 0.62, 0.40, 0.082),
    (1.10, -2.02, 0.52, 0.35, 0.072),
]


def gaussian(x, y, cx, cy, sx, sy):
    return math.exp(-(((x - cx) / sx) ** 2 + ((y - cy) / sy) ** 2) * 2.0)


def sand_height(x, y):
    z = SAND_BASE
    z += 0.038 * math.sin(x * 1.25 + 0.4) * math.cos(y * 1.08 - 0.2)
    z += 0.024 * math.sin(x * 2.1 - y * 0.65)
    z += 0.072 * gaussian(x, y, -1.28, 0.92, 1.05, 0.78)
    z += 0.062 * gaussian(x, y, 1.32, 0.36, 0.92, 0.68)
    z += 0.050 * gaussian(x, y, -0.10, -0.20, 0.78, 0.56)
    z += 0.042 * gaussian(x, y, 0.65, 1.66, 0.70, 0.48)
    z -= 0.030 * gaussian(x, y, -0.55, 1.52, 0.62, 0.48)
    for cx, cy, angle, sx, sy in FOOTPRINTS:
        ca, sa = math.cos(angle), math.sin(angle)
        dx, dy = x - cx, y - cy
        rx, ry = dx * ca + dy * sa, -dx * sa + dy * ca
        z -= 0.034 * math.exp(-((rx / sx) ** 2 + (ry / sy) ** 2) * 2.2)
    for cx, cy, sx, sy, amount in LANDING_PITS:
        z -= amount * gaussian(x, y, cx, cy, sx, sy)
    edge = max(abs(x), abs(y)) / (INNER / 2)
    z = z * (1 - max(0.0, edge - 0.84) / 0.16) + (-0.155) * max(0.0, edge - 0.84) / 0.16
    return min(-0.035, max(-0.220, z))


def create_sand():
    segments = 64
    half = INNER / 2 - 0.025
    verts = []
    colors = []
    for iy in range(segments + 1):
        y = -half + (2 * half) * iy / segments
        for ix in range(segments + 1):
            x = -half + (2 * half) * ix / segments
            z = sand_height(x, y)
            verts.append((x, y, z))
            tone = 0.92 + 0.06 * math.sin(ix * 0.73 + iy * 1.17)
            colors.append((0.76 * tone, 0.57 * tone, 0.31 * tone, 1.0))
    faces = []
    row = segments + 1
    for iy in range(segments):
        for ix in range(segments):
            a = iy * row + ix
            faces.append((a, a + 1, a + row + 1, a + row))
    mesh = bpy.data.meshes.new("SandpitSandMesh")
    mesh.from_pydata(verts, [], faces)
    color_layer = mesh.color_attributes.new(name="SandVariation", type="BYTE_COLOR", domain="POINT")
    for item, color in zip(color_layer.data, colors):
        item.color = color
    mesh.materials.append(SAND)
    mesh.update()
    obj = bpy.data.objects.new("Sandpit_Recessed_Sand", mesh)
    bpy.context.collection.objects.link(obj)
    for poly in mesh.polygons:
        poly.use_smooth = True
    return obj


def create_footprint_accents():
    objects = []
    for index, (x, y, angle, sx, sy) in enumerate(FOOTPRINTS):
        verts = [(x + math.cos(t) * sx * 0.72, y + math.sin(t) * sy * 0.72, 0.0) for t in [i * math.tau / 12 for i in range(12)]]
        ca, sa = math.cos(angle), math.sin(angle)
        verts = [(x + (vx - x) * ca - (vy - y) * sa, y + (vx - x) * sa + (vy - y) * ca, vz) for vx, vy, vz in verts]
        verts = [(vx, vy, sand_height(vx, vy) + 0.003) for vx, vy, _ in verts]
        mesh = bpy.data.meshes.new(f"FootprintAccentMesh_{index:02d}")
        mesh.from_pydata(verts, [], [tuple(range(12))])
        mesh.materials.append(DISTURBED_SAND)
        obj = bpy.data.objects.new(f"Sandpit_Footprint_{index:02d}", mesh)
        bpy.context.collection.objects.link(obj)
        objects.append(obj)
    return objects


def look_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def add_preview_camera_and_lights():
    cam_data = bpy.data.cameras.new("PreviewCamera")
    cam = bpy.data.objects.new("PreviewCamera", cam_data)
    bpy.context.collection.objects.link(cam)
    cam.location = (7.8, -8.8, 6.2)
    cam_data.lens = 52
    look_at(cam, (0, 0, -0.12))
    bpy.context.scene.camera = cam

    sun_data = bpy.data.lights.new("WarmSun", "SUN")
    sun_data.energy = 2.0
    sun_data.angle = math.radians(24)
    sun = bpy.data.objects.new("WarmSun", sun_data)
    bpy.context.collection.objects.link(sun)
    sun.rotation_euler = (math.radians(28), math.radians(-22), math.radians(-35))

    area_data = bpy.data.lights.new("SoftFill", "AREA")
    area_data.energy = 700
    area_data.shape = "DISK"
    area_data.size = 5.0
    area = bpy.data.objects.new("SoftFill", area_data)
    bpy.context.collection.objects.link(area)
    area.location = (-4.5, -1.5, 6.5)
    look_at(area, (0, 0, 0))


def main():
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)

    global CONCRETE, SAND, DISTURBED_SAND, TOP_ATLAS, RIM_SIDE
    CONCRETE = material("Aged warm-gray cement", (0.48, 0.45, 0.37), 0.94)
    SAND = material("Warm compacted sand", (0.67, 0.48, 0.25), 0.98)
    DISTURBED_SAND = material("Compressed footprint sand", (0.28, 0.18, 0.08), 1.0)
    TOP_ATLAS = image_material("Sandpit Top Atlas UV", ATLAS_PATH, "SandpitAtlasUV", 0.86)
    RIM_SIDE = image_material("Sandpit Cement Rim UV", RIM_TEXTURE_PATH, "SandpitRimUV", 0.92)

    root = bpy.data.objects.new("Sandpit_Root", None)
    bpy.context.collection.objects.link(root)
    rim = create_ring()
    sand = create_sand()
    footprint_objects = create_footprint_accents()
    apply_atlas_uvs(rim, sand)
    for obj in footprint_objects:
        obj.hide_viewport = True
        obj.hide_render = True
        obj["export_to_glb"] = False
    asset_objects = [rim, sand, *footprint_objects]
    for obj in asset_objects:
        obj.parent = root
    root["asset_type"] = "recessed_school_long_jump_sandpit"
    root["outer_size_m"] = OUTER
    root["sand_depth_m"] = abs(SAND_BASE)
    root["south_side"] = "Blender -Y / glTF +Z"

    add_preview_camera_and_lights()
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1024
    scene.render.resolution_y = 768
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.world.color = (0.78, 0.73, 0.62)
    scene.render.filepath = str(PREVIEW_PATH)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
    bpy.ops.render.render(write_still=True)

    bpy.ops.object.select_all(action="DESELECT")
    root.select_set(True)
    for obj in (rim, sand):
        obj.select_set(True)
    bpy.context.view_layer.objects.active = root
    bpy.ops.export_scene.gltf(
        filepath=str(GLB_PATH),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_materials="EXPORT",
        export_attributes=True,
    )
    print(f"BLEND={BLEND_PATH}")
    print(f"GLB={GLB_PATH}")
    print(f"PREVIEW={PREVIEW_PATH}")
    print(f"OBJECTS={len(asset_objects)}")


if __name__ == "__main__":
    main()
