"""Build seven candidate 1980s student stationery types and review renders.

Run with:
  /Applications/Blender.app/Contents/MacOS/Blender --background \
    --python scripts/blender/build_student_stationery.py
"""

import math
from pathlib import Path

import bpy
import mathutils


ROOT = Path(__file__).resolve().parents[2]
ATLAS = ROOT / "assets/source/textures/student-stationery/runtime/student-stationery-atlas-v01.png"
PENCIL_LABEL_ATLAS = ROOT / "assets/source/textures/student-stationery/runtime/pencil-label-atlas-v01.png"
CHARACTER_ERASER_ATLAS = ROOT / "assets/source/textures/student-stationery/character-erasers/character-eraser-atlas-v01.jpg"
BLEND_PATH = ROOT / "assets/source/blender/student-stationery-library-v01.blend"
GLB_PATH = ROOT / "public/assets/models/student-stationery/student-stationery-library-v01.glb"
PENCIL_BOX_BLEND = ROOT / "assets/source/blender/flower-angel-pencil-box-v01.blend"
PREVIEW_DIR = ROOT / "docs/reports/student-stationery"


def reset_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for blocks in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.images):
        for block in list(blocks):
            if block.users == 0:
                blocks.remove(block)


def material(name, color, metallic=0.0, roughness=0.5):
    value = bpy.data.materials.new(name)
    value.use_nodes = True
    bsdf = value.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    return value


def atlas_material():
    value = material("shared faded stationery print atlas", (1, 1, 1), 0.0, 0.45)
    nodes = value.node_tree.nodes
    texture = nodes.new("ShaderNodeTexImage")
    texture.image = bpy.data.images.load(str(ATLAS), check_existing=True)
    texture.image.colorspace_settings.name = "sRGB"
    value.node_tree.links.new(texture.outputs["Color"], nodes["Principled BSDF"].inputs["Base Color"])
    return value


def pencil_label_material():
    value = material("transparent period pencil markings", (1, 1, 1), 0.0, 0.48)
    nodes = value.node_tree.nodes
    texture = nodes.new("ShaderNodeTexImage")
    texture.image = bpy.data.images.load(str(PENCIL_LABEL_ATLAS), check_existing=True)
    texture.image.colorspace_settings.name = "sRGB"
    bsdf = nodes["Principled BSDF"]
    value.node_tree.links.new(texture.outputs["Color"], bsdf.inputs["Base Color"])
    value.node_tree.links.new(texture.outputs["Alpha"], bsdf.inputs["Alpha"])
    value.surface_render_method = "DITHERED"
    return value


def character_eraser_atlas_material():
    value = material("shared original period character eraser atlas", (1, 1, 1), 0.0, 0.72)
    nodes = value.node_tree.nodes
    texture = nodes.new("ShaderNodeTexImage")
    texture.image = bpy.data.images.load(str(CHARACTER_ERASER_ATLAS), check_existing=True)
    texture.image.colorspace_settings.name = "sRGB"
    value.node_tree.links.new(texture.outputs["Color"], nodes["Principled BSDF"].inputs["Base Color"])
    return value


def cylinder(name, radius, depth, location, mat, vertices=16, parent=None):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location, rotation=(0, math.pi / 2, 0))
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    for polygon in obj.data.polygons:
        polygon.use_smooth = vertices > 8
    if parent:
        obj.parent = parent
    return obj


def cone(name, radius1, radius2, depth, location, mat, vertices=12, parent=None):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=radius1, radius2=radius2, depth=depth, location=location, rotation=(0, math.pi / 2, 0))
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    if parent:
        obj.parent = parent
    return obj


def rounded_box(name, size, location, mat, bevel, parent=None):
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    modifier = obj.modifiers.new("soft worn edges", "BEVEL")
    modifier.width = bevel
    modifier.segments = 3
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    if parent:
        obj.parent = parent
    return obj


def decal(name, size, location, uv_box, mat, parent=None, atlas_size=(1024, 1024)):
    width, depth = size
    vertices = [(-width/2, -depth/2, 0), (width/2, -depth/2, 0), (width/2, depth/2, 0), (-width/2, depth/2, 0)]
    mesh = bpy.data.meshes.new(f"{name}Mesh")
    mesh.from_pydata(vertices, [], [(0, 1, 2, 3)])
    mesh.update()
    layer = mesh.uv_layers.new(name="UVMap")
    x1, y1, x2, y2 = uv_box
    atlas_width, atlas_height = atlas_size
    u1, u2 = x1/atlas_width, (x2+1)/atlas_width
    # PIL's top-left coordinates become glTF bottom-left UVs.
    v1, v2 = 1-(y2+1)/atlas_height, 1-y1/atlas_height
    for loop, uv in zip(mesh.loops, ((u1, v1), (u2, v1), (u2, v2), (u1, v2))):
        layer.data[loop.index].uv = uv
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    obj.data.materials.append(mat)
    if parent:
        obj.parent = parent
    return obj


def empty(name, parent=None, location=(0, 0, 0)):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    if parent:
        obj.parent = parent
    return obj


def set_render_recursive(obj, visible):
    obj.hide_render = not visible
    for child in obj.children_recursive:
        child.hide_render = not visible


def make_pencil(name, length, body_mat, label_uv, mats, parent, ferrule_eraser=False, sharpened=False):
    group = empty(name, parent)
    group["candidateRestoration"] = True
    group["workingLengthMeters"] = length
    group["endTreatment"] = "used-sharpened-point" if sharpened else "both-ends-flat-cut"
    radius = 0.0036
    taper_length = .018 if sharpened else 0
    painted_length = length-taper_length
    cylinder(f"{name}-HexagonalPaintedWood", radius, painted_length, (-taper_length/2, 0, 0), body_mat, 6, group)
    if sharpened:
        cone(f"{name}-SharpenedBareWood", radius, .00072, taper_length,
             (length/2-taper_length/2, 0, 0), mats["wood"], 12, group)
        # Only about 1.4 mm projects beyond the wood. The graphite overlaps the
        # wooden taper slightly so the point reads as a sharpened pencil rather
        # than a mechanical-pencil lead.
        cone(f"{name}-ShortGraphitePoint", .00072, .00010, .0018,
             (length/2+.0005, 0, 0), mats["graphite"], 10, group)
        cylinder(f"{name}-FlatGraphiteEnd-Rear", .0009, .00016,
                 (-length/2+.00004, 0, 0), mats["graphite"], 12, group)
    else:
        # A small minority remain unused, with the old flat factory-cut ends.
        for side in (-1, 1):
            cylinder(f"{name}-FlatGraphiteEnd-{side:+d}", .0009, .00016, (side*(length/2+.00004), 0, 0), mats["graphite"], 12, group)
    if ferrule_eraser:
        ferrule_length = .018
        eraser_length = .010
        ferrule_center = -length/2 + .003
        cylinder(f"{name}-CrimpedMetalFerrule", .00425, ferrule_length, (ferrule_center, 0, 0), mats["silver"], 20, group)
        # Three shallow rolled bands reproduce the pressed rings visible in the
        # user's reference without resorting to a high-frequency normal map.
        for index, offset in enumerate((-.0048, -.0018, .0012)):
            cylinder(f"{name}-FerrulePressedRing-{index+1}", .00443, .00075, (ferrule_center+offset, 0, 0), mats["silver"], 20, group)
        eraser_center = ferrule_center-ferrule_length/2-eraser_length*.34
        cylinder(f"{name}-FixedPinkRubberEraser", .00395, eraser_length, (eraser_center, 0, 0), mats["eraser_pink"], 20, group)
        group["eraserAttachment"] = "fixed-pink-eraser-in-crimped-metal-ferrule"
    decal(f"{name}-PrintedMarking", (.060, .0047), (-.020, 0, radius+.000025),
          label_uv, mats["pencil_labels"], group, atlas_size=(512, 128))
    return group


def make_plastic_sleeve_pencil(name, length, body_mat, mats, parent):
    """Period plastic-bodied pencil with a ribbed slip-on eraser sleeve."""
    group = empty(name, parent)
    group["candidateRestoration"] = True
    group["workingLengthMeters"] = length
    group["construction"] = "plastic-pencil-with-ribbed-eraser-sleeve"
    radius = .0038
    nose_length = .018
    body_length = length-nose_length
    cylinder(f"{name}-ColoredHexagonalBody", radius, body_length, (-nose_length/2, 0, 0), body_mat, 6, group)
    cone(f"{name}-ColoredTaperedNose", radius, .00125, nose_length, (length/2-nose_length/2, 0, 0), body_mat, 12, group)
    cylinder(f"{name}-ExposedThinLead", .00065, .0022, (length/2+.0011, 0, 0), mats["graphite"], 10, group)

    sleeve_length = .022
    sleeve_center = -length/2+.004
    cylinder(f"{name}-MilkyPlasticSleeve", .0050, sleeve_length, (sleeve_center, 0, 0), mats["milky_plastic"], 20, group)
    for index, offset in enumerate((-.0045, -.0022, 0, .0022, .0045)):
        cylinder(f"{name}-SleeveGripRib-{index+1}", .00516, .00055, (sleeve_center+offset, 0, 0), mats["milky_plastic"], 20, group)
    rounded_box(f"{name}-SleeveSideTab", (.014, .0017, .0050), (sleeve_center+.001, -.0050, 0), mats["milky_plastic"], .00045, group)
    eraser_length = .011
    eraser_center = sleeve_center-sleeve_length/2-eraser_length*.32
    cylinder(f"{name}-ExposedPinkEraser", .0038, eraser_length, (eraser_center, 0, 0), mats["eraser_pink"], 20, group)
    return group


def make_exposed_nib(name, start_x, mats, parent):
    length = .022
    width = .0060
    thickness = .00075
    vertices = [
        (start_x, -width/2, -thickness/2), (start_x, width/2, -thickness/2),
        (start_x+length, 0, -thickness/2),
        (start_x, -width/2, thickness/2), (start_x, width/2, thickness/2),
        (start_x+length, 0, thickness/2),
    ]
    faces = [(0, 1, 2), (3, 5, 4), (0, 3, 4, 1), (1, 4, 5, 2), (2, 5, 3, 0)]
    mesh = bpy.data.meshes.new(f"{name}Mesh")
    mesh.from_pydata(vertices, [], faces);mesh.update()
    nib = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(nib)
    nib.data.materials.append(mats["silver"])
    nib.parent = parent
    rounded_box(f"{name}-InkSlit", (.013, .00035, .00020), (start_x+.0065, 0, thickness/2+.0001), mats["ink"], .00008, parent)
    return nib


def add_barrel_ribs(name, center_x, length, radius, mat, parent):
    for index, y in enumerate((-.0029, 0, .0029)):
        rounded_box(f"{name}-LongitudinalRib-{index+1}", (length, .00038, .00030), (center_x, y, radius+.00012), mat, .00010, parent)


def add_stripe_band(name, center_x, radius, accent_mat, parent):
    for index, y in enumerate((-.0030, -.0010, .0010, .0030)):
        rounded_box(f"{name}-CapBandStripe-{index+1}", (.015, .00095, .00032), (center_x, y, radius+.00017), accent_mat, .00010, parent)


def make_pen_state(name, length, radius, body_mat, accent_mat, mats, parent, state, charm=False):
    group = empty(name, parent)
    group["state"] = state
    group["workingLengthMeters"] = length
    rear = -length/2
    barrel_length = .100
    barrel_center = rear+barrel_length/2
    grip_center = rear+barrel_length+.013
    nib_start = rear+barrel_length+.026
    if state == "capped":
        cylinder(f"{name}-RibbedPlasticBody", radius, barrel_length, (barrel_center, 0, 0), body_mat, 20, group)
        add_barrel_ribs(name, barrel_center, barrel_length*.80, radius, body_mat, group)
        cap_length = .061
        cap_center = nib_start-cap_length*.23
        cylinder(f"{name}-MatchingScrewCap", radius*1.08, cap_length, (cap_center, 0, 0), body_mat, 20, group)
        add_barrel_ribs(f"{name}-Cap", cap_center, cap_length*.78, radius*1.08, body_mat, group)
        add_stripe_band(name, cap_center-cap_length*.33, radius*1.08, accent_mat, group)
    else:
        cylinder(f"{name}-RibbedPlasticBody", radius, barrel_length, (barrel_center, 0, 0), body_mat, 20, group)
        add_barrel_ribs(name, barrel_center, barrel_length*.80, radius, body_mat, group)
        cylinder(f"{name}-ColoredGrip", radius*.84, .026, (grip_center, 0, 0), body_mat, 20, group)
        add_stripe_band(name, grip_center-.007, radius*.84, accent_mat, group)
        make_exposed_nib(f"{name}-ExposedSteelNib", nib_start, mats, group)
        if state == "posted":
            cylinder(f"{name}-PostedMatchingCap", radius*1.08, .052, (rear-.017, 0, 0), body_mat, 20, group)
            add_stripe_band(name, rear-.031, radius*1.08, accent_mat, group)
        else:
            cylinder(f"{name}-LooseMatchingCap", radius*1.08, .061, (-.010, -.026, 0), body_mat, 20, group)
            add_stripe_band(name, -.030, radius*1.08, accent_mat, group)
    return group


def make_pen(name, length, radius, body_mat, accent_mat, mats, parent, charm=False):
    group = empty(name, parent)
    group["candidateRestoration"] = True
    group["construction"] = "ordinary-ribbed-plastic-student-fountain-pen"
    for state in ("capped", "writing", "posted"):
        child = make_pen_state(f"{name}-{state.title()}", length, radius, body_mat, accent_mat, mats, group, state, charm)
        set_render_recursive(child, state == "capped")
    return group


def make_silver_cap_pen_state(name, length, radius, body_mat, mats, parent, state):
    """Slender period candidate with a separate silver slip cap."""
    group = empty(name, parent)
    group["state"] = state
    group["workingLengthMeters"] = length
    rear = -length / 2
    barrel_length = .105
    barrel_center = rear + barrel_length / 2
    grip_center = rear + barrel_length + .012
    nib_start = rear + barrel_length + .024
    cylinder(f"{name}-DarkSlenderBarrel", radius, barrel_length, (barrel_center, 0, 0), body_mat, 18, group)
    add_barrel_ribs(name, barrel_center, barrel_length * .74, radius, body_mat, group)
    cylinder(f"{name}-TaperedGrip", radius * .79, .024, (grip_center, 0, 0), body_mat, 18, group)
    cylinder(f"{name}-SilverWaistRing", radius * .89, .0016, (rear + barrel_length - .001, 0, 0), mats["silver"], 18, group)
    if state == "capped":
        cap_length = .061
        cap_center = nib_start - cap_length * .24
        cylinder(f"{name}-SilverMetalCap", radius * 1.02, cap_length, (cap_center, 0, 0), mats["silver"], 18, group)
        rounded_box(f"{name}-StraightPocketClip", (.044, .0010, .0011), (cap_center + .004, -radius * 1.05, 0), mats["silver"], .00028, group)
    else:
        make_exposed_nib(f"{name}-ExposedSteelNib", nib_start, mats, group)
        cap_x = rear - .014 if state == "posted" else -.012
        cap_y = 0 if state == "posted" else -.024
        cylinder(f"{name}-SilverMetalCap", radius * 1.02, .061, (cap_x, cap_y, 0), mats["silver"], 18, group)
    return group


def make_silver_cap_pen(name, length, radius, body_mat, mats, parent):
    group = empty(name, parent)
    group["candidateRestoration"] = True
    group["construction"] = "slender-dark-barrel-with-separate-silver-metal-cap"
    for state in ("capped", "writing", "posted"):
        child = make_silver_cap_pen_state(f"{name}-{state.title()}", length, radius, body_mat, mats, group, state)
        set_render_recursive(child, state == "capped")
    return group


def make_eraser(name, size, core_mat, mats, parent, sleeve=None):
    group = empty(name, parent)
    group["candidateRestoration"] = True
    group["workingDimensionsMeters"] = list(size)
    rounded_box(f"{name}-WornRubberCore", size, (0, 0, 0), core_mat, .0016, group)
    if sleeve:
        sleeve_size = (size[0]*.62, size[1]+.0007, size[2]+.0005)
        rounded_box(f"{name}-FadedPaperSleeve", sleeve_size, (0, 0, 0), mats["paper"], .00045, group)
        uv = (512, 256, 767, 639) if sleeve == "blue" else (768, 256, 1023, 639)
        decal(f"{name}-SleevePrint", (sleeve_size[0]*.84, sleeve_size[1]*.72), (0, 0, sleeve_size[2]/2+.00006), uv, mats["atlas"], group)
    else:
        decal(f"{name}-GraphiteSmudges", (size[0]*.58, size[1]*.55), (.004, 0, size[2]/2+.00006), (0, 384, 511, 639), mats["atlas"], group)
    return group


def make_two_tone_eraser(name, size, mats, parent):
    """Period two-compound eraser with cream and dark-grey rubber halves."""
    group = empty(name, parent)
    group["candidateRestoration"] = True
    group["workingDimensionsMeters"] = list(size)
    group["construction"] = "bonded-two-compound-cream-and-dark-grey-rubber"
    skew = .0065
    y = size[1] / 2
    z = size[2] / 2
    left = -size[0] / 2
    right = size[0] / 2
    vertices = [
        (left, -y, -z), (left, y, -z), (left + skew, y, z), (left + skew, -y, z),
        (right, -y, -z), (right, y, -z), (right + skew, y, z), (right + skew, -y, z),
    ]
    faces = [(0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (3, 2, 6, 7), (1, 5, 6, 2), (0, 3, 7, 4)]
    mesh = bpy.data.meshes.new(f"{name}ContinuousMesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    uv_layer = mesh.uv_layers.new(name="UVMap")
    # Map the dedicated atlas strip by world-length coordinate. This keeps the
    # visual division vertical while the single side-profile mesh remains skewed.
    for loop in mesh.loops:
        vx, _, vz = mesh.vertices[loop.vertex_index].co
        u_local = max(0.0, min(1.0, (vx + size[0] / 2) / size[0]))
        v_local = (vz + size[2] / 2) / size[2]
        uv_layer.data[loop.index].uv = (.002 + u_local * .494, 1.0 - (644 + v_local * 375) / 1024)
    obj = bpy.data.objects.new(f"{name}-ContinuousTexturedBody", mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mats["atlas"])
    obj.parent = group
    bevel = obj.modifiers.new("continuous worn edges", "BEVEL")
    bevel.width = .00075
    bevel.segments = 2
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    # Bevel creates new loops; remap all final loops so their generated edge
    # faces cannot fall back to the atlas origin and create a light seam.
    final_uv = obj.data.uv_layers.get("UVMap") or obj.data.uv_layers.new(name="UVMap")
    for polygon in obj.data.polygons:
        is_top = polygon.normal.z > .70
        for loop_index in polygon.loop_indices:
            loop = obj.data.loops[loop_index]
            vx, vy, _ = obj.data.vertices[loop.vertex_index].co
            u_local = max(0.0, min(1.0, (vx + size[0] / 2) / size[0]))
            if is_top:
                # The dedicated lettering is centered across the top face.
                y_local = max(0.0, min(1.0, (vy + size[1] / 2) / size[1]))
                atlas_y = 660 + y_local * 340
            else:
                # Side/end/bevel faces sample the quiet upper strip so the
                # lettering cannot wrap down onto the long side.
                atlas_y = 655
            final_uv.data[loop.index].uv = (.002 + u_local * .494, 1.0 - atlas_y / 1024)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    group["geometry"] = "single-watertight-side-parallelogram-mesh"
    group["colourDivision"] = "texture-only"
    group["factoryStamp"] = "reserved-for-dedicated-period-style-decal"
    return group


def make_colored_stripe_eraser(name, size, mats, parent):
    group = empty(name, parent)
    group["candidateRestoration"] = True
    group["workingDimensionsMeters"] = list(size)
    group["construction"] = "single-rounded-body-with-five-longitudinal-colour-bands"
    obj = rounded_box(f"{name}-ContinuousStripedBody", size, (0, 0, 0), mats["atlas"], .0021, group)
    uv = obj.data.uv_layers.get("UVMap") or obj.data.uv_layers.new(name="UVMap")
    for polygon in obj.data.polygons:
        normal = polygon.normal
        for loop_index in polygon.loop_indices:
            loop = obj.data.loops[loop_index]
            vx, vy, vz = obj.data.vertices[loop.vertex_index].co
            u_local = max(0.0, min(1.0, (vx + size[0] / 2) / size[0]))
            if abs(normal.y) > .70:
                # Long sides resolve to the outer pink/cyan layers.
                band_local = 0.03 if normal.y < 0 else .97
            else:
                # Top, bottom and both ends show all five longitudinal bands.
                band_local = max(0.0, min(1.0, (vy + size[1] / 2) / size[1]))
            uv.data[loop.index].uv = (.504 + u_local * .492, 1.0 - (644 + band_local * 375) / 1024)
    return group


def make_character_eraser(name, uv_box, mats, parent):
    size = (.042, .028, .008)
    group = empty(name, parent)
    group["candidateRestoration"] = True
    group["workingDimensionsMeters"] = list(size)
    group["printSource"] = "user-supplied-period-object-reference"
    rounded_box(f"{name}-WarmIvoryRubberBody", size, (0, 0, 0), mats["rubber"], .00125, group)
    print_decal = decal(f"{name}-OriginalFrontPrint", (.0255, .038), (0, 0, size[2]/2+.00007), uv_box, mats["character_atlas"], group, atlas_size=(512, 512))
    print_decal.rotation_euler.z = math.radians(90)
    return group


def point_camera(camera, target):
    camera.rotation_euler = (mathutils.Vector(target)-camera.location).to_track_quat("-Z", "Y").to_euler()


def setup_render():
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1400
    scene.render.resolution_y = 820
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.world.color = (.018, .014, .010)
    floor = material("preview warm school desk", (.17, .075, .028), 0.0, .72)
    rounded_box("PreviewDesk", (.62, .40, .012), (0, 0, -.012), floor, .004)
    bpy.ops.object.light_add(type="AREA", location=(-.24, -.20, .40))
    bpy.context.object.data.energy = 55
    bpy.context.object.data.size = .30
    bpy.context.object.data.color = (1.0, .84, .64)
    bpy.ops.object.light_add(type="AREA", location=(.28, .16, .26))
    bpy.context.object.data.energy = 30
    bpy.context.object.data.size = .24
    bpy.context.object.data.color = (.64, .78, 1.0)
    bpy.ops.object.camera_add(location=(.42, -.52, .43))
    camera = bpy.context.object
    camera.data.lens = 58
    point_camera(camera, (0, 0, .015))
    scene.camera = camera
    return camera


def render_individuals(scene, camera, items):
    slugs = (
        "zhonghua-101-pencil", "red-black-pencil", "yellow-student-pencil", "metal-ferrule-eraser-pencil", "plastic-sleeve-eraser-pencil",
        "plain-cream-eraser", "paper-sleeve-eraser",
        "two-tone-cream-grey-eraser",
        "colored-stripe-eraser",
        "character-eraser-student-tree", "character-eraser-traffic-attendant", "character-eraser-running-dog", "character-eraser-blue-bear",
    )
    original_locations = [obj.location.copy() for obj in items]
    original_visibility = {node: node.hide_render for obj in items for node in (obj, *obj.children_recursive)}
    for item, slug in zip(items, slugs):
        for other in items:
            set_render_recursive(other, False)
        for node in (item, *item.children_recursive):
            node.hide_render = original_visibility[node]
        item.location = (0, 0, .010)
        camera.location = (.20, -.25, .17)
        camera.data.lens = 64
        point_camera(camera, (0, 0, .008))
        scene.render.filepath = str(PREVIEW_DIR / f"student-stationery-{slug}-v01.png")
        bpy.ops.render.render(write_still=True)
        item.location = original_locations[items.index(item)]
    for node, hidden in original_visibility.items():
        node.hide_render = hidden


def append_pencil_box():
    with bpy.data.libraries.load(str(PENCIL_BOX_BLEND), link=False) as (source, target):
        target.objects = list(source.objects)
    appended = [obj for obj in target.objects if obj]
    for obj in appended:
        if obj.name not in bpy.context.scene.objects:
            bpy.context.collection.objects.link(obj)
    return next(obj for obj in appended if obj.name == "FlowerAngelPencilBoxRoot")


def build():
    reset_scene()
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.length_unit = "METERS"
    root = empty("StudentStationeryLibraryRoot")
    root["status"] = "candidate-restoration"
    root["historicalSource"] = "unverified"
    root["stationeryTypes"] = 13

    mats = {
        "atlas": atlas_material(),
        "pencil_labels": pencil_label_material(),
        "character_atlas": character_eraser_atlas_material(),
        "green": material("faded dark green pencil lacquer", (.075, .24, .13), 0.0, .39),
        "red": material("faded school red lacquer", (.52, .07, .045), 0.0, .42),
        "yellow": material("ochre yellow pencil lacquer", (.78, .43, .07), 0.0, .43),
        "black": material("soft black painted wood", (.022, .018, .016), 0.0, .48),
        "wood": material("freshly sharpened cedar", (.72, .47, .24), 0.0, .66),
        "graphite": material("graphite core", (.035, .038, .04), .08, .42),
        "silver": material("brushed-looking silver without normal map", (.68, .71, .70), .88, .31),
        "rubber": material("aged warm cream rubber", (.77, .70, .53), 0.0, .78),
        "eraser_grey": material("aged charcoal abrasive rubber", (.022, .020, .018), 0.0, .90),
        "eraser_pink": material("faded pink fixed pencil eraser", (.64, .22, .24), 0.0, .72),
        "milky_plastic": material("aged milky eraser sleeve plastic", (.72, .69, .58), 0.0, .58),
        "paper": material("faded paper sleeve base", (.72, .62, .43), 0.0, .72),
    }

    # Pencil-and-eraser Gate A batch. Fountain pens are removed and will be
    # rebuilt and reviewed later in a separate asset library.
    items = [
        make_pencil("Pencil-Zhonghua101", .175, mats["green"], (0, 0, 511, 41), mats, root),
        make_pencil("Pencil-RedBlack", .108, mats["red"], (0, 43, 511, 83), mats, root, sharpened=True),
        make_pencil("Pencil-YellowStudent", .142, mats["yellow"], (0, 85, 511, 127), mats, root, sharpened=True),
        make_pencil("Pencil-MetalFerruleEraser", .122, mats["yellow"], (0, 85, 511, 127), mats, root, ferrule_eraser=True, sharpened=True),
        make_plastic_sleeve_pencil("Pencil-PlasticSleeveEraser", .118, mats["red"], mats, root),
        make_eraser("Eraser-PlainCream", (.042, .018, .009), mats["rubber"], mats, root),
        make_eraser("Eraser-PaperSleeve", (.045, .019, .010), mats["rubber"], mats, root, sleeve="blue"),
        make_two_tone_eraser("Eraser-TwoToneCreamGrey", (.050, .018, .009), mats, root),
        make_colored_stripe_eraser("Eraser-ColoredStripes", (.058, .020, .010), mats, root),
        make_character_eraser("Eraser-Character-StudentTree", (0, 0, 255, 255), mats, root),
        make_character_eraser("Eraser-Character-TrafficAttendant", (256, 0, 511, 255), mats, root),
        make_character_eraser("Eraser-Character-RunningDog", (0, 256, 255, 511), mats, root),
        make_character_eraser("Eraser-Character-BlueBear", (256, 256, 511, 511), mats, root),
    ]
    review_positions = [
        (-.20, .10, .006), (-.10, .10, .006), (0, .10, .006), (.10, .10, .007), (.20, .10, .007),
        (-.15, 0, .007), (-.05, 0, .007), (.05, 0, .007), (.15, 0, .007),
        (-.15, -.10, .007), (-.05, -.10, .007), (.05, -.10, .007), (.15, -.10, .007),
    ]
    for obj, location in zip(items, review_positions):
        obj.location = location

    BLEND_PATH.parent.mkdir(parents=True, exist_ok=True)
    GLB_PATH.parent.mkdir(parents=True, exist_ok=True)
    PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
    bpy.ops.export_scene.gltf(
        filepath=str(GLB_PATH), export_format="GLB", export_yup=True,
        export_texcoords=True, export_normals=True, export_materials="EXPORT",
        export_image_format="AUTO", export_extras=True, export_cameras=False,
        export_lights=False,
    )

    camera = setup_render()
    render_individuals(scene, camera, items)
    camera.location = (.42, -.52, .43)
    camera.data.lens = 58
    point_camera(camera, (0, 0, .015))
    scene.render.filepath = str(PREVIEW_DIR / "student-stationery-pencil-eraser-lineup-v09.png")
    bpy.ops.render.render(write_still=True)

    # The second gate image uses the actual approved pencil-box source and a
    # representative pencil-only kit at physically valid local heights.
    for obj in items:
        set_render_recursive(obj, False)
    bpy.data.objects["PreviewDesk"].hide_render = False
    box_root = append_pencil_box()
    lid = next(obj for obj in bpy.context.scene.objects if obj.name == "PencilBoxLidPivot")
    lid.rotation_euler.x = math.radians(-110)
    combo = empty("ReviewPencilBoxStationeryKit")
    p1 = make_pencil("Review-Zhonghua101", .168, mats["green"], (0, 0, 511, 41), mats, combo)
    p2 = make_pencil("Review-YellowStudent", .158, mats["yellow"], (0, 85, 511, 127), mats, combo, sharpened=True)
    p3 = make_pencil("Review-MetalFerruleEraser", .150, mats["red"], (0, 43, 511, 83), mats, combo, ferrule_eraser=True, sharpened=True)
    e1 = make_eraser("Review-PlainCreamEraser", (.040, .017, .008), mats["rubber"], mats, combo)
    p1.location = (-.012, -.018, .0060)
    p2.location = (-.020, .005, .0070)
    p3.location = (-.026, .024, .0070)
    e1.location = (-.075, .028, .0060)
    camera.location = (.285, -.31, .235)
    camera.data.lens = 60
    point_camera(camera, (0, .012, .045))
    scene.render.filepath = str(PREVIEW_DIR / "student-stationery-in-approved-tin-box-v01.png")
    bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    build()
