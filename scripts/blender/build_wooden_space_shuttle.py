"""Run named stages through Blender MCP in the visible application (meters)."""
from pathlib import Path
import bpy, math, json
from mathutils import Vector
ROOT = Path('/Users/tingcongmai/workspace/4lite')
SOURCE = ROOT / 'assets/source/blender/wooden-space-shuttle'
REPORT = ROOT / 'docs/reports/wooden-space-shuttle'
MODEL = ROOT / 'public/assets/models/wooden-space-shuttle/wooden-space-shuttle-v01.glb'

def material(name, color, roughness, metallic=0):
    m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF'); p.inputs['Base Color'].default_value=(*color,1)
    p.inputs['Roughness'].default_value=roughness; p.inputs['Metallic'].default_value=metallic
    return m

def setup():
    global WHITE, BLACK, IRON, PARTS
    WHITE=material('Shuttle | smooth white enamel',(.88,.865,.82),.24)
    BLACK=material('Shuttle | black painted details',(.012,.015,.018),.28)
    IRON=material('Shuttle | single iron-wire support',(.10,.115,.13),.26,.78)
    PARTS=[]
    bpy.context.scene.unit_settings.system='METRIC'
    bpy.context.scene.world=bpy.data.worlds.new('Shuttle studio')
    bpy.context.scene.world.use_nodes=True
    bpy.context.scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.28,.28,.28,1)
    bpy.context.scene.world.node_tree.nodes['Background'].inputs[1].default_value=.55

def mesh(name, verts, faces, mat, smooth=False):
    data=bpy.data.meshes.new(name); data.from_pydata(verts,[],faces); data.update()
    obj=bpy.data.objects.new(name,data); bpy.context.scene.collection.objects.link(obj)
    data.materials.append(mat); PARTS.append(obj)
    for p in data.polygons:p.use_smooth=smooth
    return obj

def profile(name, rings, center=(0,0), mat=None, n=40):
    # rings: height, x-radius, y-radius; cap using tiny nonzero rings.
    verts=[(center[0]+rx*math.cos(2*math.pi*i/n),(center[1](z) if callable(center[1]) else center[1])+ry*math.sin(2*math.pi*i/n),z) for z,rx,ry in rings for i in range(n)]
    faces=[tuple(reversed(range(n)))]
    for k in range(len(rings)-1):
        for i in range(n):faces.append((k*n+i,k*n+(i+1)%n,(k+1)*n+(i+1)%n,(k+1)*n+i))
    faces.append(tuple((len(rings)-1)*n+i for i in range(n)))
    return mesh(name,verts,faces,mat or WHITE,True)

def bevel(obj,width=.001,segments=2):
    m=obj.modifiers.new('Sanded wooden edges','BEVEL');m.width=width;m.segments=segments
    m=obj.modifiers.new('Weighted corner normals','WEIGHTED_NORMAL')
    return obj

def box(name,loc,size,mat):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=name
    o.scale=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    o.data.materials.append(mat);PARTS.append(o);return bevel(o)

def line(name,pts,r=.00035,mat=None,cyclic=False):
    c=bpy.data.curves.new(name,'CURVE');c.dimensions='3D';c.bevel_depth=r;c.bevel_resolution=0;c.resolution_u=1
    s=c.splines.new('POLY');s.points.add(len(pts)-1)
    for p,co in zip(s.points,pts):p.co=(*co,1)
    s.use_cyclic_u=cyclic
    o=bpy.data.objects.new(name,c);bpy.context.scene.collection.objects.link(o);o.data.materials.append(mat or BLACK);PARTS.append(o)
    return o

def ring(name,x,y,z,radius,r=.00055):
    # Surface paint band, not a four-sided tube: same visible width, fewer faces.
    n=28
    verts=[(x+radius*math.cos(i*2*math.pi/n),y+radius*math.sin(i*2*math.pi/n),h) for h in [z-r,z+r] for i in range(n)]
    return mesh(name,verts,[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)],BLACK,True)


def show_view(direction=(.8,-1.6,.65)):
    target=Vector((0,-.02,.20));q=Vector(direction).to_track_quat('Z','Y')
    for area in bpy.context.screen.areas:
        if area.type=='VIEW_3D':
            area.spaces.active.region_3d.view_rotation=q
            area.spaces.active.region_3d.view_distance=.75
            area.spaces.active.region_3d.view_location=target
            area.spaces.active.clip_start=.001
            area.spaces.active.shading.type='MATERIAL'
            area.spaces.active.overlay.show_overlays=False
    bpy.context.view_layer.update()

def stage_tanks():
    setup()
    box('White painted wooden display base',(0,-.018,.0075),(.22,.18,.015),WHITE)
    profile('Single iron wire post',[(.014,.0016,.0016),(.088,.0016,.0016)],mat=IRON,n=16)
    profile('External tank carved wood',[(.075,.025,.025),(.079,.033,.033),(.09,.036,.036),(.326,.036,.036),(.347,.033,.033),(.367,.026,.026),(.385,.014,.014),(.397,.003,.003),(.4,.0003,.0003)])
    for s,label in [(-1,'Left'),(1,'Right')]:
        x=s*.053
        profile(label+' solid rocket booster',[(.065,.014,.014),(.072,.015,.015),(.085,.013,.013),(.304,.013,.013),(.320,.012,.012),(.336,.007,.007),(.347,.0004,.0004)],(x,0),n=32)
        profile(label+' booster nozzle',[(.061,.012,.012),(.066,.010,.010),(.07,.01,.01)],(x,0),BLACK,24)
        for z in [.08,.108,.208,.304]:ring(label+' black segment line',x,0,z,.01315)
        for z in [.112,.285]:box(label+' white wooden connector',(s*.036,0,z),(.012,.014,.01),WHITE)
    for label in ['Left','Right']:
        old=bpy.data.objects.get(label+' booster nozzle');PARTS.remove(old);bpy.data.objects.remove(old,do_unlink=True)
    update_booster_nozzles()
    ring('External tank shoulder seam',0,0,.326,.0361)
    show_view()

BODY=[(.080,.023,.020),(.105,.021,.018),(.145,.0195,.0175),(.235,.0195,.0175),(.250,.019,.0178),(.263,.019,.0185),(.275,.018,.0185),(.285,.016,.0155),(.294,.014,.012),(.3025,.0128,.0085),(.308,.0112,.0072),(.314,.0082,.0054),(.317,.0056,.0037),(.320,.0027,.0018),(.322,.00025,.0002)]
CY=-.0558

def body_y(z):
    # Low blunt nose slopes into the flight deck; long narrow payload section.
    return CY + max(0,z-.275)*.30

def body_r(z):
    for (a,rx,ry),(b,sx,sy) in zip(BODY,BODY[1:]):
        if a<=z<=b:
            t=(z-a)/(b-a);return rx+(sx-rx)*t,ry+(sy-ry)*t
    return BODY[-1][1:]

def cockpit_upper_scale(angle,z):
    # Only the dorsal cabin narrows; the lower nose retains the fuselage width.
    weight=max(0,min(1,(z-.250)/.013,(.294-z)/.012))
    return 1-weight*max(0,math.cos(angle))**2/3

def skin(angle,z,offset=.00022):
    rx,ry=body_r(z);return ((rx+offset)*math.sin(angle)*cockpit_upper_scale(angle,z),body_y(z)-(ry+offset)*math.cos(angle),z)

def prism(name,poly,depth):
    # poly in x,z plane, slab thickness along y; front side negative y.
    verts=[(x,y,z) for y in [-.045-depth/2,-.045+depth/2] for x,z in poly]
    n=len(poly);faces=[tuple(reversed(range(n))),tuple(range(n,2*n))]
    faces +=[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    return bevel(mesh(name,verts,faces,WHITE),.0008)

def create_fuselage():
    body=profile('Orbiter carved fuselage',BODY,(0,body_y))
    for v in body.data.vertices:
        rx,ry=body_r(v.co.z)
        angle=math.atan2(v.co.x/max(rx,.0001),-(v.co.y-body_y(v.co.z))/max(ry,.0001))
        v.co.x*=cockpit_upper_scale(angle,v.co.z)
    body.data.update()
    body.data.materials.append(BLACK)
    # Paint the existing nose surface; no separate cap geometry or raised lip.
    for p in body.data.polygons:
        center=sum((body.data.vertices[i].co for i in p.vertices),Vector())/len(p.vertices)
        z=center.z;rx,ry=body_r(z)
        belly=(center.y-body_y(z))/max(ry,.0001)
        if z>=.294 or belly> (-.10 if z>.275 else .20):p.material_index=1
    return body

def stage_orbiter():
    create_fuselage()
    for s,label in [(-1,'Left'),(1,'Right')]:
        create_wing(s,label)
        # Raised OMS pods either side of central tail, independent solid bodies.
        profile(label+' bulging orbital engine pod',[(.082,.007,.008),(.09,.010,.012),(.117,.010,.013),(.131,.008,.010),(.140,.003,.004)],(s*.024,-.069),n=28)
        profile(label+' orbital engine nozzle',[(.074,.006,.006),(.082,.0043,.0043)],(s*.025,-.072),BLACK,n=20)
    # Vertical tail projects forward out of dorsal skin when model is upright.
    verts=[(x,y,z) for x in [-.0017,.0017] for y,z in [(-.068,.149),(-.107,.092),(-.111,.073),(-.068,.086)]]
    tail=mesh('Single plywood vertical tail',verts,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],WHITE)
    bevel(tail,.0006)
    for s in [-1,1]:line('Black tail outline',[(s*.0018,y,z) for y,z in [(-.068,.149),(-.107,.092),(-.111,.073),(-.068,.086)]],.0006,cyclic=True)
    # Three large open engine bells; center one dorsal, two lower/ventral.
    for i,(x,y) in enumerate([(0,-.079),(-.017,-.046),(.017,-.046)]):
        nozzle('Main engine bell '+str(i+1),x,y)
    show_view()

def nozzle(name,x,y,booster=False):
    # Open bell with a narrow throat, curved flare and rolled mouth edge.
    if booster:
        rings=[(.063,.006),(.056,.007),(.049,.0095),(.043,.012),(.042,.012),(.042,.0108),(.048,.0084),(.055,.0055)]
    else:
        rings=[(.086,.0055),(.080,.0058),(.074,.0072),(.066,.0094),(.058,.0118),(.054,.0128),(.053,.0128),(.053,.0116),(.058,.0107),(.066,.0083),(.074,.006)]
    n=28;v=[(x+r*math.cos(i*2*math.pi/n),y+r*math.sin(i*2*math.pi/n),z) for z,r in rings for i in range(n)]
    f=[(k*n+i,k*n+(i+1)%n,(k+1)*n+(i+1)%n,(k+1)*n+i) for k in range(len(rings)-1) for i in range(n)]
    f.append(tuple((len(rings)-1)*n+i for i in range(n)))
    result=mesh(name,v,f,BLACK,True)
    if not booster:
        for z,r in [(.058,.0118),(.063,.01025),(.068,.00885)]:
            ring(name+' raised circumferential rib',x,y,z,r,.00032)
    return result


def paint_cockpit():
    # Three mirrored pairs: front trapezoids, sloping shoulders, small side panes.
    shapes=[[(.055,.278),(.36,.2775),(.40,.2725),(.055,.2725)],
            [(.43,.277),(.86,.2738),(.80,.2697),(.44,.272)],
            [(.91,.273), (1.28,.2705),(1.28,.2648),(.95,.2655)]]
    for sign in [-1,1]:
        for i,corners in enumerate(shapes):
            pts=[];rows=4;cols=4
            for r in range(rows+1):
                t=r/rows
                left=tuple(corners[0][k]*(1-t)+corners[3][k]*t for k in range(2))
                right=tuple(corners[1][k]*(1-t)+corners[2][k]*t for k in range(2))
                for j in range(cols+1):
                    u=j/cols;angle=left[0]*(1-u)+right[0]*u;z=left[1]*(1-u)+right[1]*u
                    angle=math.asin(math.sin(angle)/1.46)
                    z=.276+(z-.272)*1.02
                    pts.append(skin(sign*angle,z,.0006))
            faces=[(r*5+j,r*5+j+1,(r+1)*5+j+1,(r+1)*5+j) for r in range(rows) for j in range(cols)]
            mesh('Black painted cockpit pane '+str(sign)+' '+str(i),pts,faces,BLACK,True)
    for sign in [-1,1]:
        pts=[skin(sign*a,z,.0006) for a,z in [(.12,.259),(.28,.259),(.28,.256),(.12,.256)]]
        mesh('Cockpit aft small painted hatch',pts,[(0,1,2,3)],BLACK)

def create_wing(sign,label):
    outline=[(sign*.013,.231),(sign*.034,.165),(sign*.096,.109),(sign*.098,.087),(sign*.014,.073)]
    wing=prism(label+' plywood delta wing',outline,.0045)
    wing.data.materials.append(BLACK)
    for face in wing.data.polygons:
        if face.index!=0:face.material_index=1
    line(label+' painted wing perimeter',[(x,-.0476,z) for x,z in outline],.00085,cyclic=True)

def paint_wings():
    for sign,label in [(-1,'Left'),(1,'Right')]:
        # Shallow swept hinge band; two elevons with a deeper inboard trailing edge.
        def hinge(x):return .090+(x-.025)/.071*.006
        def trailing(x):return .073+(x-.014)/.084*.014
        poly=[(sign*x,-.0478,hinge(x)+d) for x,d in [(.025,.005),(.097,.005),(.097,0),(.025,0)]]
        mesh(label+' wing trailing black band',poly,[(0,1,2,3)],BLACK)
        for i in range(1,15):
            x=.025+.072*i/15;z=hinge(x)
            line(label+' wing band division',[(sign*x,-.0481,z+.0004),(sign*x,-.0481,z+.0046)],.00015,WHITE)
        x=.060
        line(label+' elevon panel division',[(sign*x,-.0478,trailing(x)+.0007),(sign*x,-.0478,hinge(x))],.00035)


def update_booster_nozzles():
    for sign,label in [(-1,'Left'),(1,'Right')]:
        x=sign*.053
        profile(label+' booster white skirt',[(.056,.018,.018),(.068,.0135,.0135),(.077,.013,.013)],(x,0),WHITE,n=28)
        nozzle(label+' booster nozzle',x,0,booster=True)


def stage_paint():
    # Closed double payload doors: long outer edges, center seam and transverse ribs.
    lo,hi=.147,.257
    for a in [-1.08,0,1.08]:
        line('Payload door longitudinal paint', [skin(a,z) for z in [lo,.193,.235,hi]],.00055)
    for z in [lo,.166,.193,.221,hi]:
        line('Payload door transverse paint',[skin(-1.08+2.16*i/16,z) for i in range(17)],.00055)
    paint_cockpit()
    paint_wings()
    for a in [-1.23,1.23]:
        line('Fuselage side access panel',[skin(a,.198),skin(a,.219),skin(a+.18,.219),skin(a+.18,.198)],.00032,cyclic=True)
        line('Aft fuselage panel line',[skin(a,.096),skin(a,.135)],.00032)
    for idx,angle in enumerate([-.48,0,.48]):
        points=[skin(angle+.09*math.cos(i*2*math.pi/12),.307+.0018*math.sin(i*2*math.pi/12),.00065) for i in range(12)]
        mesh('White painted nose RCS mark '+str(idx+1),points,[tuple(range(12))],WHITE)
    for angle in [-.7,-.35,0,.35,.7]:
        points=[skin(angle-.13,.298,.00065),skin(angle+.13,.298,.00065),skin(angle+.13,.300,.00065),skin(angle-.13,.300,.00065)]
        mesh('White nose paint band',points,[(0,1,2,3)],WHITE)
    show_view()

def studio():
    scene=bpy.context.scene
    scene.render.engine='CYCLES';scene.cycles.samples=32
    scene.render.resolution_x=1100;scene.render.resolution_y=1100;scene.render.resolution_percentage=100
    scene.view_settings.view_transform='AgX'
    def area(name,loc,power,size):
        data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size
        o=bpy.data.objects.new(name,data);scene.collection.objects.link(o);o.location=loc;o.rotation_euler=(Vector((0,0,.20))-o.location).to_track_quat('-Z','Y').to_euler()
    area('Review soft key',(.35,-.55,.8),35,.5)
    area('Review fill',(-.4,-.2,.4),12,.4)
    area('Review rim',(.2,.4,.7),25,.3)
    camera=bpy.data.objects.new('Shuttle review camera',bpy.data.cameras.new('Shuttle review camera'))
    scene.collection.objects.link(camera);camera.location=(.47,-.86,.43)
    camera.rotation_euler=(Vector((0,-.025,.205))-camera.location).to_track_quat('-Z','Y').to_euler()
    camera.data.type='ORTHO';camera.data.ortho_scale=.48;camera.data.lens=55;scene.camera=camera
    scene.render.film_transparent=False

def save_and_export():
    SOURCE.mkdir(parents=True,exist_ok=True);REPORT.mkdir(parents=True,exist_ok=True);MODEL.parent.mkdir(parents=True,exist_ok=True)
    # Write only this scene and dependencies, leaving protected previous scenes out of asset source.
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'wooden-space-shuttle-v01.blend'))
    # Build evaluated export copy, merged by material into three draw objects.
    export=bpy.data.collections.new('Shuttle runtime export');bpy.context.scene.collection.children.link(export)
    dg=bpy.context.evaluated_depsgraph_get();groups={}
    for o in PARTS:
        evaluated=o.evaluated_get(dg);data=bpy.data.meshes.new_from_object(evaluated)
        if not len(data.vertices):continue
        duplicate=bpy.data.objects.new(o.name+' export',data);duplicate.matrix_world=o.matrix_world.copy();export.objects.link(duplicate)
        groups.setdefault('painted-body' if len(o.data.materials)>1 else o.data.materials[0].name,[]).append(duplicate)
    objects=[o for group in groups.values() for o in group]
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:o.select_set(True)
    bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join()
    o=bpy.context.object;o.name='Wooden space shuttle | three paint materials'
    combined=[o]
    bpy.ops.export_scene.gltf(filepath=str(MODEL),export_format='GLB',use_selection=True,export_yup=True,export_materials='EXPORT',export_cameras=False,export_lights=False)
    tris=0
    for o in combined:o.data.calc_loop_triangles();tris+=len(o.data.loop_triangles)
    stats={'triangles':tris,'drawObjects':len({m.name for o in combined for m in o.data.materials}),'bytes':MODEL.stat().st_size,'textures':0,'heightMeters':.4,'sourceParts':len(PARTS)}
    (REPORT/'asset-metrics.json').write_text(json.dumps(stats,indent=2))
    for o in combined:bpy.data.objects.remove(o,do_unlink=True)
    bpy.data.collections.remove(export)
    print(json.dumps(stats))
    show_view()
