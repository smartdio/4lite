import bpy
import math
from pathlib import Path
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
MODEL_DIR = ROOT / "public" / "assets" / "models" / "activity-sand"
SANDPIT_TEXTURE_DIR = ROOT / "public" / "assets" / "models" / "sandpit" / "textures"
PREVIEW_DIR = ROOT / "docs" / "references"
SIDE_CEMENT_TEXTURE = SANDPIT_TEXTURE_DIR / "sandpit-cement-rim-albedo-v01.png"

ASSETS = [
    {
        "id": "north",
        "label": "old-classroom-front",
        "size": (12.0, 5.0),
        "rim": 0.16,
        "depth": 0.20,
        "sand_level": -0.105,
        "relief": 0.022,
        "atlas": MODEL_DIR / "textures" / "activity-sand-north-thin-rim-top-atlas-v04.png",
        "side_tint": (0.78, 0.76, 0.70, 1.0),
    },
    {
        "id": "south",
        "label": "between-south-casuarinas",
        "size": (7.0, 3.0),
        "rim": 0.15,
        "depth": 0.20,
        "sand_level": -0.115,
        "relief": 0.016,
        "atlas": MODEL_DIR / "textures" / "activity-sand-south-dark-thin-rim-top-atlas-v04.png",
        "side_tint": (0.47, 0.46, 0.43, 1.0),
    },
]


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.meshes, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
        for datablock in list(datablocks):
            if datablock.users == 0:
                datablocks.remove(datablock)


def look_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def image_material(name, image_path, tint=(1, 1, 1, 1), roughness=0.96):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    shader = nodes.new("ShaderNodeBsdfPrincipled")
    texture = nodes.new("ShaderNodeTexImage")
    tint_mix = nodes.new("ShaderNodeMixRGB")
    tint_mix.blend_type = "MULTIPLY"
    tint_mix.inputs[0].default_value = 1.0
    tint_mix.inputs[2].default_value = tint
    texture.image = bpy.data.images.load(str(image_path), check_existing=True)
    texture.interpolation = "Linear"
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Specular IOR Level"].default_value = 0.20
    links.new(texture.outputs["Color"], tint_mix.inputs[1])
    links.new(tint_mix.outputs["Color"], shader.inputs["Base Color"])
    links.new(shader.outputs["BSDF"], output.inputs["Surface"])
    return material


def top_uv(x, y, width, depth):
    return ((x + width / 2) / width, (y + depth / 2) / depth)


def create_ring(config, top_material, side_material):
    width, depth = config["size"]
    rim, wall_depth = config["rim"], config["depth"]
    ohx, ohy = width / 2, depth / 2
    ihx, ihy = ohx - rim, ohy - rim
    outer = [(-ohx, -ohy), (ohx, -ohy), (ohx, ohy), (-ohx, ohy)]
    inner = [(-ihx, -ihy), (ihx, -ihy), (ihx, ihy), (-ihx, ihy)]
    verts = []
    for z, loop in [(0.018, outer), (0.018, inner), (-wall_depth, outer), (-wall_depth, inner)]:
        verts.extend((x, y, z) for x, y in loop)
    faces, top_face_count = [], 0
    for index in range(4):
        nxt = (index + 1) % 4
        faces.append((index, nxt, 4 + nxt, 4 + index))
        top_face_count += 1
        faces.append((8 + index, 12 + index, 12 + nxt, 8 + nxt))
        faces.append((index, 8 + index, 8 + nxt, nxt))
        faces.append((4 + index, 4 + nxt, 12 + nxt, 12 + index))
    mesh = bpy.data.meshes.new(f"ActivitySand_{config['id']}_ThinCementRimMesh")
    mesh.from_pydata(verts, [], faces)
    mesh.materials.append(top_material)
    mesh.materials.append(side_material)
    mesh.update()
    # Faces are emitted top/bottom/outer/inner for each side.
    for index, polygon in enumerate(mesh.polygons):
        polygon.material_index = 0 if index % 4 == 0 else 1
    uv_layer = mesh.uv_layers.new(name="ActivitySandUV")
    for polygon in mesh.polygons:
        for loop_index in polygon.loop_indices:
            co = mesh.vertices[mesh.loops[loop_index].vertex_index].co
            if polygon.material_index == 0:
                uv = top_uv(co.x, co.y, width, depth)
            else:
                along = co.y if abs(polygon.normal.x) > abs(polygon.normal.y) else co.x
                uv = (along / 2.2, (co.z + wall_depth) / wall_depth)
            uv_layer.data[loop_index].uv = uv
    obj = bpy.data.objects.new(f"Activity_Sand_{config['id'].title()}_Thin_Cement_Rim", mesh)
    bpy.context.collection.objects.link(obj)
    bevel = obj.modifiers.new("Subtle worn cement edge", "BEVEL")
    bevel.width = 0.012
    bevel.segments = 2
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    obj.select_set(False)
    return obj


def sand_height(config, x, y):
    relief = config["relief"]
    value = config["sand_level"]
    value += relief * 0.44 * math.sin(x * 0.82 + 0.35) * math.cos(y * 1.18 - 0.25)
    value += relief * 0.24 * math.sin(x * 1.58 - y * 0.52)
    value += relief * 0.16 * math.cos(x * 0.36 + y * 1.82)
    inner_x = config["size"][0] / 2 - config["rim"]
    inner_y = config["size"][1] / 2 - config["rim"]
    edge_ratio = max(abs(x) / inner_x, abs(y) / inner_y)
    value -= relief * 0.18 * max(0.0, (edge_ratio - 0.78) / 0.22)
    # No footprint or landing-pit terms: the basin is continuously full of clean sand.
    return min(-0.072, max(-0.142, value))


def create_sand(config, material):
    width, depth = config["size"]
    half_x = width / 2 - config["rim"] - 0.008
    half_y = depth / 2 - config["rim"] - 0.008
    nx = max(32, round((half_x * 2) / 0.18))
    ny = max(18, round((half_y * 2) / 0.18))
    verts, faces, uvs = [], [], []
    for iy in range(ny + 1):
        y = -half_y + 2 * half_y * iy / ny
        for ix in range(nx + 1):
            x = -half_x + 2 * half_x * ix / nx
            verts.append((x, y, sand_height(config, x, y)))
            uvs.append(top_uv(x, y, width, depth))
    row = nx + 1
    for iy in range(ny):
        for ix in range(nx):
            a = iy * row + ix
            faces.append((a, a + 1, a + row + 1, a + row))
    mesh = bpy.data.meshes.new(f"ActivitySand_{config['id']}_CleanRecessedSandMesh")
    mesh.from_pydata(verts, [], faces)
    mesh.materials.append(material)
    uv_layer = mesh.uv_layers.new(name="ActivitySandUV")
    for polygon in mesh.polygons:
        polygon.use_smooth = True
        for loop_index in polygon.loop_indices:
            vertex_index = mesh.loops[loop_index].vertex_index
            uv_layer.data[loop_index].uv = uvs[vertex_index]
    mesh.update()
    obj = bpy.data.objects.new(f"Activity_Sand_{config['id'].title()}_Recessed_Sand_No_Footprints", mesh)
    bpy.context.collection.objects.link(obj)
    return obj


def create_asset(config):
    atlas = image_material(f"Activity {config['id']} ImageGen top atlas no footprints", config["atlas"])
    side = image_material(f"Activity {config['id']} cement inner and outer walls", SIDE_CEMENT_TEXTURE, config["side_tint"])
    root = bpy.data.objects.new(f"Activity_Sand_{config['id'].title()}_Recessed_Root", None)
    bpy.context.collection.objects.link(root)
    ring = create_ring(config, atlas, side)
    surface = create_sand(config, atlas)
    ring.parent = root
    surface.parent = root
    root["asset_type"] = "recessed_activity_sandpit_with_thin_cement_rim"
    root["placement"] = config["label"]
    root["width_m"], root["depth_m"] = config["size"]
    root["rim_width_m"] = config["rim"]
    root["recess_depth_m"] = abs(config["sand_level"])
    root["footprints"] = False
    root["top_texture_source"] = "ImageGen orthographic UV atlas"
    root["cement_tone"] = "darker" if config["id"] == "south" else "standard"
    return root, [ring, surface]


def add_preview_scene(config):
    width, depth = config["size"]
    ground_material = bpy.data.materials.new("Preview highland ground")
    ground_material.diffuse_color = (0.50, 0.46, 0.38, 1.0)
    surround = 1.4
    blocks = [
        ((width + surround * 2, surround), (0, -depth / 2 - surround / 2)),
        ((width + surround * 2, surround), (0, depth / 2 + surround / 2)),
        ((surround, depth), (-width / 2 - surround / 2, 0)),
        ((surround, depth), (width / 2 + surround / 2, 0)),
    ]
    for index, (size, center) in enumerate(blocks):
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(center[0], center[1], -0.035))
        ground = bpy.context.object
        ground.name = f"Preview_Ground_{index}_Not_Exported"
        ground.dimensions = (size[0], size[1], 0.07)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        ground.data.materials.append(ground_material)
    camera_data = bpy.data.cameras.new("PreviewCamera")
    camera = bpy.data.objects.new("PreviewCamera", camera_data)
    bpy.context.collection.objects.link(camera)
    camera.location = (width * 0.60, -depth * 1.85, max(3.8, width * 0.46))
    camera_data.lens = 55
    look_at(camera, (0, 0, -0.06))
    bpy.context.scene.camera = camera
    sun_data = bpy.data.lights.new("SummerSun", "SUN")
    sun_data.energy = 2.0
    sun_data.angle = math.radians(20)
    sun = bpy.data.objects.new("SummerSun", sun_data)
    bpy.context.collection.objects.link(sun)
    sun.rotation_euler = (math.radians(30), math.radians(-18), math.radians(-32))
    fill_data = bpy.data.lights.new("SoftFill", "AREA")
    fill_data.energy = 650
    fill_data.size = 5.0
    fill = bpy.data.objects.new("SoftFill", fill_data)
    bpy.context.collection.objects.link(fill)
    fill.location = (-width * 0.35, -depth, 4.8)
    look_at(fill, (0, 0, -0.08))


def save_preview_export(config, root, objects):
    asset_name = f"activity-sand-{config['id']}-{int(config['size'][0])}x{int(config['size'][1])}-v02"
    blend_path = MODEL_DIR / f"{asset_name}.blend"
    glb_path = MODEL_DIR / f"{asset_name}.glb"
    preview_path = PREVIEW_DIR / f"025-{asset_name}-preview.png"
    add_preview_scene(config)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1200
    scene.render.resolution_y = 700
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.world.color = (0.72, 0.68, 0.58)
    scene.render.filepath = str(preview_path)
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
    bpy.ops.render.render(write_still=True)
    bpy.ops.object.select_all(action="DESELECT")
    root.select_set(True)
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = root
    bpy.ops.export_scene.gltf(
        filepath=str(glb_path), export_format="GLB", use_selection=True,
        export_apply=True, export_yup=True, export_materials="EXPORT", export_attributes=True,
    )
    print(f"GLB={glb_path}")
    print(f"PREVIEW={preview_path}")


def main():
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
    for config in ASSETS:
        clear_scene()
        root, objects = create_asset(config)
        save_preview_export(config, root, objects)


if __name__ == "__main__":
    main()
