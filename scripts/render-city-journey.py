#!/usr/bin/env python3
"""Deterministic 3D city journey; run with Blender 4.5+.

  Blender -b -t 12 --python scripts/render-city-journey.py -- --mode preview
  Blender -b -t 12 --python scripts/render-city-journey.py -- --mode render
  Blender -b -t 12 --python scripts/render-city-journey.py -- --mode render --blend output/city-journey-v3/city-journey.blend
  Blender -b -t 12 --python scripts/render-city-journey.py -- --mode encode

Native 3840x2160, 16-sample masters; 1080p and mobile are downsampled encodes.
No image-plane camera tricks: each numbered PNG is a new view of one 3D scene.
Scene, previews, source copies and frame provenance stay outside public/.
"""
import argparse
import bpy
import json
import hashlib
import math
import random
import shutil
import struct
import sys
import time
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'output/city-journey-v4'
PUBLIC = ROOT / 'public/assets/sequences'
FPS, DURATION, COUNT = 24, 20, 480
WIDTH, HEIGHT = 3840, 2160
ASSET = 'city-journey-v4'
MAX_VIDEO_BYTES = 95_000_000  # Safely below GitHub's 100 MiB per-file limit.
SEED = 91827
LENS_MM = 17.5
GAZE_RISE = 3.4
CYAN = (0.08, 0.68, 1.0, 1)
ICE = (0.43, 0.76, 1.0, 1)
VIOLET = (0.29, 0.13, 1.0, 1)
BATCHES = {}
AI_MATS = []
RNG = random.Random(SEED)


def material(name, color, metallic=0, roughness=.35, emission=0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = color
    mat.use_nodes = True
    bs = mat.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value = color
    bs.inputs['Metallic'].default_value = metallic
    bs.inputs['Roughness'].default_value = roughness
    if emission:
        bs.inputs['Emission Color'].default_value = color
        bs.inputs['Emission Strength'].default_value = emission
    return mat


def mesh(name, vertices, faces, mat):
    entry = BATCHES.setdefault(mat.name, [mat, [], []])
    off = len(entry[1])
    entry[1].extend(vertices)
    entry[2].extend(tuple(i+off for i in face) for face in faces)


def box(name, x, y, z, w, d, h, mat):
    a,b,c = w/2,d/2,h/2
    mesh(name, [(x+dx*a,y+dy*b,z+dz*c) for dx,dy,dz in
         [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]],
         [(0,3,2,1),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7),(4,5,6,7)], mat)


def line(name, points, radius, mat):
    curve = bpy.data.curves.new(name, 'CURVE')
    curve.dimensions='3D'
    curve.resolution_u=1
    curve.bevel_depth=radius
    curve.bevel_resolution=1
    p=curve.splines.new('POLY')
    p.points.add(len(points)-1)
    for dest,src in zip(p.points, points): dest.co=(*src,1)
    obj=bpy.data.objects.new(name,curve)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    return obj


def area(name, loc, color, power, size, target):
    data=bpy.data.lights.new(name,'AREA'); data.color=color[:3]; data.energy=power; data.shape='DISK'; data.size=size
    obj=bpy.data.objects.new(name,data); bpy.context.collection.objects.link(obj); obj.location=loc
    obj.rotation_euler=(Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()
    return obj


def text_label(body, loc, size, mat, rotation=(math.pi/2,0,0)):
    data=bpy.data.curves.new(body,'FONT'); data.body=body; data.size=size; data.extrude=0
    data.space_character=1.15
    obj=bpy.data.objects.new(body,data); bpy.context.collection.objects.link(obj)
    obj.location=loc; obj.rotation_euler=rotation; obj.data.materials.append(mat)
    return obj


def image_material(name, path, reflective=False):
    mat=bpy.data.materials.new(name); mat.use_nodes=True
    n=mat.node_tree.nodes; l=mat.node_tree.links; n.clear()
    tex=n.new('ShaderNodeTexImage'); tex.image=bpy.data.images.load(str(path),check_existing=True); tex.image.pack(); tex.interpolation='Linear'; tex.extension='EXTEND'
    out=n.new('ShaderNodeOutputMaterial')
    if reflective:
        bs=n.new('ShaderNodeBsdfPrincipled'); bs.inputs['Metallic'].default_value=.45; bs.inputs['Roughness'].default_value=.19
        bs.inputs['Coat Weight'].default_value=.35
        l.new(tex.outputs['Color'],bs.inputs['Base Color']); l.new(tex.outputs['Color'],bs.inputs['Emission Color']); bs.inputs['Emission Strength'].default_value=.38
    else:
        bs=n.new('ShaderNodeEmission'); l.new(tex.outputs['Color'],bs.inputs['Color']); bs.inputs['Strength'].default_value=.85
    l.new(bs.outputs[0],out.inputs['Surface'])
    return mat


def photo_quad(name, vertices, uv, mat):
    data=bpy.data.meshes.new(name); data.from_pydata(vertices,[],[(0,1,2,3)]); data.materials.append(mat)
    layer=data.uv_layers.new(name='Architectural crop')
    for i,value in enumerate(uv): layer.data[i].uv=value
    obj=bpy.data.objects.new(name,data); bpy.context.collection.objects.link(obj)
    return obj


def facade(x,y,w,d,h, style, mats):
    glass, metal, edge, window_mats = mats
    # Structural piers, distinct stepped crowns, reflective curtain-wall glass.
    box('glass tower',x,y,h/2+.45,w,d,h,glass)
    # Generated photographs are actual architectural surface materials. The UV
    # crops isolate tower facades; near geometry still yields real view parallax.
    if AI_MATS:
        crop=[(.252,.70),(.372,.70),(.372,.985),(.252,.985)] if style%2==0 else [(.322,.70),(.395,.70),(.395,.99),(.322,.99)]
        for face in range(4):
            xx=w/2+.033; yy=d/2+.033
            verts=[(x-xx,y-yy,1.3),(x+xx,y-yy,1.3),(x+xx,y-yy,h),(x-xx,y-yy,h)] if face==0 else [(x+xx,y+yy,1.3),(x-xx,y+yy,1.3),(x-xx,y+yy,h),(x+xx,y+yy,h)] if face==1 else [(x-xx,y+yy,1.3),(x-xx,y-yy,1.3),(x-xx,y-yy,h),(x-xx,y+yy,h)] if face==2 else [(x+xx,y-yy,1.3),(x+xx,y+yy,1.3),(x+xx,y+yy,h),(x+xx,y-yy,h)]
            photo_quad('generated facade / '+str(style)+' / '+str(face),verts,crop,AI_MATS[style%2])
    box('stone plinth',x,y,.6,w+.65,d+.65,1.2,metal)
    for sx in [-1,1]:
        for sy in [-1,1]:
            box('corner mullion',x+sx*w/2,y+sy*d/2,h/2,.15,.15,h,metal)
            if RNG.random()<.92:
                box('vertical light fin',x+sx*(w/2+.018),y+sy*(d/2+.018),h*.46,.075,.075,h*.89,edge)
    for z in [3.6,h*.38,h*.72,h]:
        box('floor belt',x,y,z,w+.1,d+.1,.10,metal)
    rows=max(2,int((h-4)/1.9)); colsx=max(2,int(w/.85)); colsy=max(2,int(d/.85))
    for face in range(4):
        count=colsx if face<2 else colsy
        span=w if face<2 else d
        for col in range(count):
            # Fine full-height vertical mullions define the dark glazing.
            coord=-span/2+(col+.5)*span/count
            if face<2: box('mullion',x+coord,y+(-1 if face==0 else 1)*(d/2+.014),h/2,.032,.025,h,metal)
            else: box('mullion',x+(-1 if face==2 else 1)*(w/2+.014),y+coord,h/2,.025,.032,h,metal)
            for row in range(rows):
                if RNG.random()>.11: continue
                z=4+row*1.9
                wm=RNG.choices(window_mats,weights=[10,4,1,1])[0]
                ww=span/count*.21
                hh=RNG.choice([.21,.29,.40])
                if face<2:
                    yy=y+(-1 if face==0 else 1)*(d/2+.052)
                    mesh('window',[(x+coord-ww/2,yy,z),(x+coord+ww/2,yy,z),(x+coord+ww/2,yy,z+hh),(x+coord-ww/2,yy,z+hh)],[(0,1,2,3)],wm)
                else:
                    xx=x+(-1 if face==2 else 1)*(w/2+.052)
                    mesh('window',[(xx,y+coord-ww/2,z),(xx,y+coord+ww/2,z),(xx,y+coord+ww/2,z+hh),(xx,y+coord-ww/2,z+hh)],[(0,1,2,3)],wm)
    if style%3==0:
        box('recessed crown',x,y,h+2.0,w*.66,d*.66,4,glass)
        box('crown light',x,y,h+4,w*.68,d*.68,.055,edge)
        box('spire',x,y,h+6,.12,.12,7,metal)
        box('spire tip',x,y,h+9.4,.07,.07,.5,edge)
    elif style%3==1:
        box('roof blade',x-w*.3,y,h+3,.15,d*.82,6,glass)
        box('roof blade light',x-w*.3,y,h+6,.06,d*.82,.06,edge)


def make_ground(glass, metal):
    ground=material('wet charcoal stone',(0.015,.022,.038,1),.77,.19)
    n=ground.node_tree.nodes; l=ground.node_tree.links; bs=n.get('Principled BSDF')
    coord=n.new('ShaderNodeTexCoord'); noise=n.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value=9; noise.inputs['Detail'].default_value=3
    l.new(coord.outputs['Generated'],noise.inputs['Vector'])
    mapping=n.new('ShaderNodeVectorMath'); mapping.operation='MULTIPLY'; mapping.inputs[1].default_value=(85,360,4)
    l.new(coord.outputs['Generated'],mapping.inputs[0]); l.new(mapping.outputs['Vector'],noise.inputs['Vector'])
    bump=n.new('ShaderNodeBump'); bump.inputs['Strength'].default_value=.18; bump.inputs['Distance'].default_value=.07
    l.new(noise.outputs['Fac'],bump.inputs['Height']); l.new(bump.outputs['Normal'],bs.inputs['Normal'])
    ramp=n.new('ShaderNodeMapRange'); ramp.inputs['From Min'].default_value=0; ramp.inputs['From Max'].default_value=1; ramp.inputs['To Min'].default_value=.14; ramp.inputs['To Max'].default_value=.27
    l.new(noise.outputs['Fac'],ramp.inputs['Value']); l.new(ramp.outputs['Result'],bs.inputs['Roughness'])
    box('reflective city floor',20,35,-.18,440,500,.3,ground)
    joints=material('paving joints',(.004,.008,.018,1),.25,.4)
    # Staggered large architectural slabs; all are real world-space geometry.
    for yy in range(-90,180,4):
        box('horizontal stone seam',20,yy,-.016,205,.026,.014,joints)
    for xx in range(-85,130,4):
        box('long stone seam',xx,40,-.014,.021,260,.014,joints)
    return ground


def build_scene(engine='EEVEE', samples=16):
    bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
    scene=bpy.context.scene
    scene.render.engine='CYCLES' if engine=='CYCLES' else 'BLENDER_EEVEE_NEXT'
    if engine=='CYCLES':
        prefs=bpy.context.preferences.addons['cycles'].preferences
        prefs.compute_device_type='METAL'; prefs.get_devices()
        for d in prefs.devices: d.use=d.type=='METAL'
        scene.cycles.device='GPU'; scene.cycles.samples=samples; scene.cycles.use_denoising=True
        scene.cycles.max_bounces=5; scene.cycles.glossy_bounces=3; scene.cycles.diffuse_bounces=2
        scene.cycles.use_light_tree=True
    else:
        scene.eevee.taa_render_samples=samples
        scene.eevee.use_raytracing=True
        scene.eevee.ray_tracing_options.resolution_scale='1'
        scene.eevee.ray_tracing_options.screen_trace_quality=.75
        scene.eevee.ray_tracing_options.screen_trace_thickness=.3
        scene.eevee.use_gtao=True; scene.eevee.gtao_distance=3
        scene.eevee.use_fast_gi=True
        scene.eevee.volumetric_tile_size='8'; scene.eevee.volumetric_samples=32
    scene.render.resolution_x=WIDTH; scene.render.resolution_y=HEIGHT; scene.render.resolution_percentage=100
    scene.render.fps=FPS; scene.frame_start=1; scene.frame_end=COUNT
    scene.render.image_settings.file_format='PNG'; scene.render.image_settings.color_mode='RGB'; scene.render.image_settings.color_depth='8'; scene.render.image_settings.compression=25
    scene.render.use_file_extension=True
    scene.render.film_transparent=False
    scene.render.use_persistent_data=True
    scene.render.use_motion_blur=True; scene.render.motion_blur_shutter=.3
    scene.view_settings.view_transform='AgX'
    scene.view_settings.look='AgX - Medium High Contrast'
    scene.view_settings.exposure=.30
    world=bpy.data.worlds.new('midnight blue atmosphere'); scene.world=world; world.use_nodes=True
    world.node_tree.nodes['Background'].inputs[0].default_value=(.012,.025,.065,1)
    world.node_tree.nodes['Background'].inputs[1].default_value=.45
    glass=material('midnight cobalt architectural glass',(.024,.05,.105,1),.72,.18)
    glass.node_tree.nodes['Principled BSDF'].inputs['Coat Weight'].default_value=.6
    glass.node_tree.nodes['Principled BSDF'].inputs['Coat Roughness'].default_value=.10
    metal=material('graphite anodized frames',(.018,.03,.051,1),.8,.3)
    cyan=material('cyan edge lighting',CYAN,0,.25,5)
    violet=material('violet edge lighting',VIOLET,0,.25,4)
    ice=material('cold white lighting',ICE,0,.25,3)
    windows=[material('windows blue dim',(.12,.27,.45,1),.1,.3,.9),material('windows cyan',CYAN,.1,.3,1.8),material('windows white',ICE,.1,.3,2.2),material('windows violet',VIOLET,.1,.3,1.6)]
    make_ground(glass,metal)
    AI_MATS.extend([image_material('generated corner glass facade',OUT/'materials/corner.png',True),image_material('generated plaza glass facade',OUT/'materials/plaza.png',True)])
    # Distant city plates are fixed in world space, behind the traversable 3D
    # streets. They never move or zoom with the camera, and cast real reflections.
    for name,path,verts,uv in [
        ('avenue distant city',ROOT/'public/assets/scenes/code-city-v1.webp',[(-156,225,-.08),(156,225,-.08),(156,225,146),(-156,225,146)],[(0,.305),(1,.305),(1,1),(0,1)]),
        ('generated corner distant city',OUT/'materials/corner.png',[(172,246.5,-.08),(172,-63.5,-.08),(172,-63.5,136),(172,246.5,136)],[(0,.338),(1,.338),(1,1),(0,1)]),
        ('generated plaza distant city',OUT/'materials/plaza.png',[(-154,186,-.08),(144,186,-.08),(144,186,132),(-154,186,132)],[(0,.380),(1,.380),(1,1),(0,1)]),
    ]:
        photo_quad(name,verts,uv,image_material(name,path))
    # Planar reflections capture offscreen facades and generated skyline too.
    probe_data=bpy.data.lightprobes.new('avenue planar reflection','PLANE')
    probe=bpy.data.objects.new('avenue planar reflection',probe_data); bpy.context.collection.objects.link(probe); probe.location=(24,35,.04); probe.scale=(170,200,1)
    probe_data.influence_distance=.4

    # Three connected streets: northbound avenue, eastbound gallery, northbound plaza.
    for i,x in enumerate([-80,-59,-38,-20,21,76,97,120]):
        for j,y in enumerate([-73,-51,-29,-7,50,76,101,127,154]):
            w=RNG.uniform(10.5,15.0); d=RNG.uniform(11,15)
            if x==21 and y==50: w=12; d=12
            h=RNG.uniform(38,85)
            if abs(x)>80 or y>120: h=RNG.uniform(50,120)
            if x==76 and y in [50,76]: h=RNG.uniform(27,42)
            if x==76 and y==50: continue
            facade(x+RNG.uniform(-.6,.6),y,w,d,h,i+j,(glass,metal,violet if (i+j)%7==0 else cyan,windows))
    # Additional gallery walls / middle block, clear of the turning envelope.
    for j,y in enumerate([-61,-39,-17]):
        facade(48,y,13,14,48+j*4,j,(glass,metal,cyan,windows))
    # Sidewalk ledges outline the streets without an abstract floor grid.
    for x in [-11,11]:
        box('avenue curb',x,-35,.11,.42,96,.22,metal)
        box('avenue cyan guide',x,-35,.232,.042,96,.025,cyan)
    for y in [13,35]:
        box('gallery curb',26,y,.10,31,.4,.20,metal)
        box('gallery guide',26,y,.212,31,.045,.022,cyan if y==13 else violet)
    for x in [39,61]:
        box('plaza approach curb',x,92,.10,.4,110,.2,metal)
        box('plaza approach guide',x,92,.212,.045,110,.022,cyan)
    # Lane marks are subdued and broken, leaving a glossy central avenue.
    for y in range(-85,15,9):
        for x in [-5.8,5.8]: box('avenue inset',x,y,.013,.04,3.5,.015,ice)
    for x in range(13,43,8):
        for y in [18.2,29.8]: box('gallery inset',x,y,.013,3,.04,.015,ice)
    for y in range(39,146,9):
        for x in [44.2,55.8]: box('plaza inset',x,y,.013,.04,3.5,.015,ice)
    # Rounded light guides follow the actual street corners.
    for center,start,end,rad in [((12,12),math.pi,math.pi/2,23),((38,36),-math.pi/2,0,23)]:
        pts=[(center[0]+rad*math.cos(start+(end-start)*k/48),center[1]+rad*math.sin(start+(end-start)*k/48),.22) for k in range(49)]
        line('curved curb light',pts,.022,cyan)
    # Walkway bridges with dark structural decks, glass balustrades, luminous undersides.
    for x,y,w,d,z in [(0,-12,31,3.0,28),(0,57,31,3.3,18),(29,24,2.6,33,17),(50,110,36,3.0,21)]:
        box('skybridge deck',x,y,z,w,d,.45,metal)
        if w>d:
            for side in [-1,1]: box('skybridge underside light',x,y+side*d*.35,z-.245,w*.97,.09,.035,ice)
        else:
            for side in [-1,1]: box('skybridge underside light',x+side*w*.35,y,z-.245,.09,d*.97,.035,ice)
        if w>d:
            for sy in [-1,1]:
                box('bridge glass railing',x,y+sy*d/2,z+1,w,.08,1.5,glass)
                box('bridge rail light',x,y+sy*d/2,z+1.8,w,.045,.04,cyan)
                for xx in range(int(x-w/2),int(x+w/2),2): box('bridge posts',xx,y+sy*d/2,z+1,.07,.07,1.8,metal)
        else:
            for sx in [-1,1]:
                box('bridge glass railing',x+sx*w/2,y,z+1,.08,d,1.5,glass)
                box('bridge rail light',x+sx*w/2,y,z+1.8,.045,d,.04,violet)
                for yy in range(int(y-d/2),int(y+d/2),2): box('bridge posts',x+sx*w/2,yy,z+1,.07,.07,1.8,metal)
    # Street-scale fixtures and code panels give motion legible parallax and scale.
    for y in range(-64,14,13):
        for x in [-10.1,10.1]:
            box('bollard',x,y,.53,.2,.2,1.06,metal)
            box('bollard light',x,y,.85,.215,.215,.18,ice)
    panels=[(-11.8,-16,math.pi/2),(11.8,2,-math.pi/2),(23,36,0),(62,48,-math.pi/2),(62,78,-math.pi/2)]
    for idx,(x,y,rot) in enumerate(panels):
        # Panel local horizontal vector aligns with the facade.
        direction=Vector((math.cos(rot),math.sin(rot),0)); normal=Vector((math.sin(rot),-math.cos(rot),0))
        origin=Vector((x,y,0))
        verts=[]
        for u,z in [(-2.8,2), (2.8,2),(2.8,10),(-2.8,10)]: verts.append(tuple(origin+direction*u+Vector((0,0,z))))
        mesh('code display glass',verts,[(0,1,2,3)],glass)
        for row in range(22):
            left=-2.4+(.38 if row%4 else 0)
            for col in range(RNG.randint(2,5)):
                length=RNG.uniform(.24,.83)
                a=origin+direction*left+normal*.03+Vector((0,0,9.2-row*.29))
                b=a+direction*length
                line('luminous code line',[tuple(a),tuple(b)],.026,violet if row%6==0 else cyan)
                left+=length+.13
        text_label(['STRATEGY / 01','COMPUTE / 02','POLICY / 03','SEARCH / 04','EQUITY / 05'][idx],tuple(origin-direction*2.5+normal*.05+Vector((0,0,2.3))),.22,ice,(math.pi/2,0,rot))
    # Plaza: a framed light sculpture and shallow reflecting basins beside the route.
    for x,y in [(29,67),(64,67)]:
        box('plaza basin rim',x,y,.30,10,15,.6,metal)
        box('plaza water',x,y,.62,9.5,14.5,.04,glass)
        for off in [-4.8,4.8]: box('basin edge',x+off,y,.66,.035,14.6,.028,cyan)
    bpy.ops.mesh.primitive_torus_add(major_radius=4.8,minor_radius=.16,major_segments=72,minor_segments=8,location=(64,67,7.2),rotation=(math.pi/2,0,math.pi/6))
    obj=bpy.context.object; obj.name='plaza violet halo sculpture'; obj.data.materials.append(violet)
    for poly in obj.data.polygons: poly.use_smooth=True
    box('halo pedestal',64,67,1.0,3.6,3.6,2,metal)
    # A distant slender landmark draws the gaze into the final district.
    facade(31,135,7,10,94,0,(glass,metal,cyan,windows))
    # A layered, monumental skyline remains legible through the broad avenue.
    # These are full 3D towers, not a crop/scale change to the playback image.
    for x,y,w,d,h,style in [(-7,169,10,14,142,0),(64,170,9,13,130,0),
                           (-47,177,12,15,156,1),(104,163,11,14,138,0)]:
        facade(x,y,w,d,h,style,(glass,metal,cyan,windows))
    # Cool architectural illumination; palette stays independent of page themes.
    area('moon softbox',(0,15,100),(.29,.43,1),95000,110,(20,40,0))
    for i,(x,y) in enumerate([(0,-35),(0,5),(24,24),(50,49),(50,83),(50,122)]):
        area('street wash',(x,y,15),CYAN if i%3 else (.34,.24,1),450,18,(x,y,0))
    for y in [-44,-7,49,78]:
        area('glass side wash',(-8 if y<20 else 57,y,7),CYAN,220,8,(-18 if y<20 else 75,y,12))
    # Very light depth haze, contained and height limited.
    fog=bpy.data.materials.new('blue distance haze'); fog.use_nodes=True
    ns=fog.node_tree.nodes; ns.clear(); out=ns.new('ShaderNodeOutputMaterial'); vol=ns.new('ShaderNodeVolumePrincipled')
    vol.inputs['Color'].default_value=(.12,.24,.43,1); vol.inputs['Density'].default_value=.0009; vol.inputs['Anisotropy'].default_value=.25
    fog.node_tree.links.new(vol.outputs['Volume'],out.inputs['Volume'])
    box('atmosphere',20,70,52,370,400,105,fog)
    for name,(mat,verts,faces) in BATCHES.items():
        data=bpy.data.meshes.new(name); data.from_pydata(verts,[],faces); data.materials.append(mat); data.update()
        obj=bpy.data.objects.new(name,data); bpy.context.collection.objects.link(obj)
    camdata=bpy.data.cameras.new('street eye-level camera'); cam=bpy.data.objects.new('street eye-level camera',camdata); bpy.context.collection.objects.link(cam)
    camdata.lens=LENS_MM; camdata.sensor_width=36; camdata.clip_end=650; camdata.clip_start=.08
    scene.camera=cam
    # Every frame has an explicit transform, computed by arc length rather than
    # unequal Bezier time. Heading eases into each real 90 degree street turn.
    route=[]
    for frame in range(1,COUNT+1):
        t=(frame-1)/(COUNT-1)
        p=route_position(t)
        ahead=route_position(min(1,t+.014))
        behind=route_position(max(0,t-.006))
        tangent=(ahead-behind).normalized()
        cam.location=p
        # An architectural camera: eye level and a slight constant upward gaze.
        target=p+tangent*18+Vector((0,0,GAZE_RISE))
        cam.rotation_euler=(target-p).to_track_quat('-Z','Y').to_euler()
        cam.keyframe_insert('location',frame=frame); cam.keyframe_insert('rotation_euler',frame=frame)
        route.append({'frame':frame,'seconds':round((frame-1)/FPS,5),'position':[round(v,5) for v in p], 'heading_degrees':round(math.degrees(math.atan2(tangent.x,tangent.y)),5)})
    if cam.animation_data:
        for fc in cam.animation_data.action.fcurves:
            for key in fc.keyframe_points: key.interpolation='LINEAR'
    scene.use_nodes=True; ns=scene.node_tree.nodes; ns.clear()
    inp=ns.new('CompositorNodeRLayers'); glow=ns.new('CompositorNodeGlare'); glow.glare_type='FOG_GLOW'; glow.quality='HIGH'; glow.threshold=1.5; glow.size=7; glow.mix=-.86
    out=ns.new('CompositorNodeComposite'); scene.node_tree.links.new(inp.outputs['Image'],glow.inputs['Image']); scene.node_tree.links.new(glow.outputs['Image'],out.inputs['Image'])
    OUT.mkdir(parents=True,exist_ok=True)
    (OUT/'camera-route.json').write_text(json.dumps(route,indent=2))
    return scene


LENGTHS=[50,12*math.pi/2,26,12*math.pi/2,48]
TOTAL=sum(LENGTHS)
def route_position(t):
    distance=max(0,min(1,t))*TOTAL
    if distance<=50: return Vector((0,-38+distance,2.15))
    distance-=50
    if distance<=LENGTHS[1]:
        a=math.pi-distance/12
        return Vector((12+12*math.cos(a),12+12*math.sin(a),2.15))
    distance-=LENGTHS[1]
    if distance<=26: return Vector((12+distance,24,2.15))
    distance-=26
    if distance<=LENGTHS[3]:
        a=-math.pi/2+distance/12
        return Vector((38+12*math.cos(a),36+12*math.sin(a),2.15))
    distance-=LENGTHS[3]
    return Vector((50,36+distance,2.15))


def fast_start_mp4(path):
    """Relocate the MP4 movie index before media, updating its chunk offsets.

    Equivalent container-only fast-start operation; encoded H.264 bytes are
    untouched. Blender ships FFmpeg libraries, but no standalone ffmpeg binary.
    """
    data=path.read_bytes()
    def atoms(buf,begin=0,end=None):
        end=len(buf) if end is None else end
        cursor=begin
        while cursor+8<=end:
            size,kind=struct.unpack_from('>I4s',buf,cursor); header=8
            if size==1: size=struct.unpack_from('>Q',buf,cursor+8)[0]; header=16
            if size==0: size=end-cursor
            if size<header or cursor+size>end: raise RuntimeError('Invalid MP4 atom boundary')
            yield kind,cursor,size,header
            cursor+=size
    top=list(atoms(data)); movie=next(a for a in top if a[0]==b'moov'); media=next(a for a in top if a[0]==b'mdat')
    if movie[1]<media[1]: return
    _,old,size,header=movie; insert=media[1]; moov=bytearray(data[old:old+size])
    containers={b'moov',b'trak',b'mdia',b'minf',b'stbl'}
    def patch(begin,end):
        for kind,pos,length,h in atoms(moov,begin,end):
            if kind in containers: patch(pos+h,pos+length)
            elif kind in {b'stco',b'co64'}:
                count=struct.unpack_from('>I',moov,pos+h+4)[0]
                stride=4 if kind==b'stco' else 8; fmt='>I' if stride==4 else '>Q'
                for i in range(count):
                    at=pos+h+8+stride*i; off=struct.unpack_from(fmt,moov,at)[0]
                    if insert<=off<old: struct.pack_into(fmt,moov,at,off+size)
    patch(0,len(moov))
    temp=path.with_suffix('.faststart.mp4')
    temp.write_bytes(data[:insert]+moov+data[insert:old]+data[old+size:])
    temp.replace(path)


def png_dimensions(path):
    with path.open('rb') as image:
        header = image.read(24)
    if header[:8] != b'\x89PNG\r\n\x1a\n':
        raise RuntimeError(f'Not a PNG render: {path}')
    return struct.unpack('>II', header[16:24])


def encode(mobile_only=False):
    frames=sorted((OUT/'frames').glob('frame-*.png'))
    expected=[f'frame-{i:04d}.png' for i in range(1,COUNT+1)]
    if [f.name for f in frames]!=expected: raise RuntimeError(f'Expected {COUNT} contiguous frames, found {len(frames)}')
    # Reject stale / reduced-scale frames: the 4K asset must come from native
    # 3840x2160 renders, never an enlargement of a previous movie or sequence.
    for frame in frames:
        if png_dimensions(frame) != (WIDTH, HEIGHT):
            raise RuntimeError(f'Native {WIDTH}x{HEIGHT} required: {frame}')
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene=bpy.context.scene; scene.render.engine='BLENDER_EEVEE_NEXT'
    scene.render.resolution_x=WIDTH; scene.render.resolution_y=HEIGHT; scene.render.resolution_percentage=100
    scene.render.fps=FPS; scene.frame_start=1; scene.frame_end=COUNT-FPS
    editor=scene.sequence_editor_create()
    strip=editor.strips.new_image('Numbered 3D camera renders',str(frames[0]),1,1-FPS)
    for frame in frames[1:]: strip.elements.append(frame.name)
    strip.frame_final_duration=COUNT
    # A 24-frame dissolve is baked into the one decoder-friendly output. The
    # first output frame is source 25; the final frame arrives at source 24.
    # This also avoids an extra runtime video decoder / memory spike at the seam.
    seam=editor.strips.new_image('One-second loop dissolve',str(frames[0]),2,COUNT-2*FPS+1)
    for frame in frames[1:FPS]: seam.elements.append(frame.name)
    seam.frame_final_duration=FPS; seam.blend_type='ALPHA_OVER'
    seam.blend_alpha=0; seam.keyframe_insert('blend_alpha',frame=COUNT-2*FPS+1)
    seam.blend_alpha=1; seam.keyframe_insert('blend_alpha',frame=COUNT-FPS)
    # VSE Standard preserves the display transform already baked into PNG files.
    scene.view_settings.view_transform='Standard'; scene.view_settings.look='None'
    scene.render.image_settings.file_format='FFMPEG'
    scene.render.ffmpeg.format='MPEG4'; scene.render.ffmpeg.codec='H264'
    scene.render.ffmpeg.constant_rate_factor='HIGH'; scene.render.ffmpeg.ffmpeg_preset='GOOD'
    scene.render.ffmpeg.audio_codec='NONE'; scene.render.ffmpeg.gopsize=48
    PUBLIC.mkdir(parents=True,exist_ok=True)
    streams = [('4k', WIDTH, HEIGHT), ('1080', 1920, 1080), ('mobile', 960, 540)]
    if mobile_only:
        streams = streams[-1:]
    encoded = {}
    for label, width, height in streams:
        scene.render.resolution_x=width; scene.render.resolution_y=height
        # Each VSE image keeps its original source dimensions. Scaling explicitly
        # downsamples both strips together; no crop, changed lens, or extra zoom.
        for image_strip in (strip, seam):
            image_strip.transform.scale_x=width/WIDTH
            image_strip.transform.scale_y=height/HEIGHT
        path=PUBLIC/f'{ASSET}-{label}.mp4'
        # Finish and size-check each encode before exposing the public asset.
        # Compression may change to meet hosting limits; native dimensions do not.
        candidate=OUT/f'{ASSET}-{label}-encoding.mp4'
        qualities=['PERC_LOSSLESS','HIGH','MEDIUM'] if label=='4k' else ['HIGH','MEDIUM']
        for quality in qualities:
            scene.render.ffmpeg.constant_rate_factor=quality
            scene.render.filepath=str(candidate)
            bpy.ops.render.render(animation=True)
            fast_start_mp4(candidate)
            size=candidate.stat().st_size
            print(f'CITY_ENCODE_SIZE {label} {quality} {size}/{MAX_VIDEO_BYTES}',flush=True)
            if size < MAX_VIDEO_BYTES:
                candidate.replace(path)
                break
        else:
            raise RuntimeError(f'{label} exceeds the 95 MB asset ceiling; adjust compression, never upscale or shorten the route')
        encoded[label]={'path':str(path),'width':width,'height':height,
                        'bytes':path.stat().st_size,'quality':scene.render.ffmpeg.constant_rate_factor,
                        'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}
    if not mobile_only:
        poster=bpy.data.images.load(str(frames[FPS]))
        poster.scale(1920,1080)
        scene.render.image_settings.file_format='WEBP'
        scene.render.image_settings.quality=92
        poster.save_render(str(PUBLIC/f'{ASSET}.webp'),scene=scene)
    data=json.loads((OUT/'manifest.json').read_text())
    data.update({'rendered_frame_count':len(frames),'native_render_width':WIDTH,
                 'native_render_height':HEIGHT,'upscaled':False,
                 'encoded_frame_count':COUNT-FPS,'encoded_duration_seconds':(COUNT-FPS)/FPS,
                 'loop_dissolve_frames':FPS,'poster':str(PUBLIC/f'{ASSET}.webp'),
                 'fast_start':True,'max_video_bytes':MAX_VIDEO_BYTES,
                 'encoder':'Blender bundled FFmpeg / H.264 CRF (quality recorded per stream), yuv420p, no audio',
                 'loop':'One-second baked dissolve: output begins at source frame 25, ends at source frame 24. 480 source renders become a 456-frame / 19-second seamless loop.'})
    data.setdefault('streams',{}).update(encoded)
    data['source_sha256']=hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    (OUT/'manifest.json').write_text(json.dumps(data,indent=2))
    print('CITY_ENCODE_COMPLETE',json.dumps(data),flush=True)


def prepare_materials():
    """Bootstrap ignored scratch inputs from versioned public artwork.

    Existing PNGs are retained for interrupted render reproducibility. A clean
    checkout only needs the two committed WebP files, never a local Codex cache.
    A neutral Standard view preserves the WebP's sRGB appearance in PNG.
    """
    target=OUT/'materials'; target.mkdir(parents=True,exist_ok=True)
    for district in ('corner','plaza'):
        dest=target/f'{district}.png'
        if dest.exists(): continue
        source=PUBLIC/'city'/f'{district}.webp'
        if not source.is_file():
            raise FileNotFoundError(f'Missing versioned city material: {source}')
        img=bpy.data.images.load(str(source),check_existing=False)
        conversion=bpy.data.scenes.new('City material conversion')
        conversion.view_settings.view_transform='Standard'
        conversion.view_settings.look='None'
        conversion.render.image_settings.file_format='PNG'
        conversion.render.image_settings.color_mode='RGB'
        img.save_render(str(dest),scene=conversion)
        bpy.data.images.remove(img)
        bpy.data.scenes.remove(conversion)
        print(f'CITY_MATERIAL {source} -> {dest}',flush=True)


def main():
    p=argparse.ArgumentParser(); p.add_argument('--mode',choices=['preview','render','encode'],default='preview'); p.add_argument('--engine',choices=['EEVEE','CYCLES'],default='EEVEE'); p.add_argument('--samples',type=int,default=16); p.add_argument('--start',type=int,default=1); p.add_argument('--end',type=int,default=COUNT); p.add_argument('--preview-frames',default='1,235,370'); p.add_argument('--scale',type=int,default=100); p.add_argument('--mobile-only',action='store_true',help='In encode mode, rebuild only the mobile stream and manifest')
    p.add_argument('--blend',type=Path,help='Reuse the original scene and camera animation without rebuilding geometry')
    args=p.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    OUT.mkdir(parents=True,exist_ok=True); (OUT/'frames').mkdir(exist_ok=True); (OUT/'previews').mkdir(exist_ok=True)
    if args.mode=='encode':
        shutil.copy2(__file__,OUT/'render-city-journey.py')
        encode(mobile_only=args.mobile_only); return
    if args.mode == 'render' and args.scale != 100:
        p.error('Production renders must be native 3840x2160; --scale is preview-only')
    prepare_materials()
    start=time.monotonic()
    if args.blend:
        bpy.ops.wm.open_mainfile(filepath=str(args.blend.resolve()))
        scene=bpy.context.scene
        if scene.render.engine != ('CYCLES' if args.engine == 'CYCLES' else 'BLENDER_EEVEE_NEXT'):
            p.error('--engine must match the reused scene')
        if args.engine == 'CYCLES': scene.cycles.samples=args.samples
        else: scene.eevee.taa_render_samples=args.samples
        route=args.blend.parent/'camera-route.json'
        if route.resolve() != (OUT/'camera-route.json').resolve():
            shutil.copy2(route,OUT/'camera-route.json')
    else:
        scene=build_scene(args.engine,args.samples)
    scene.render.resolution_x=WIDTH; scene.render.resolution_y=HEIGHT
    scene.render.resolution_percentage=args.scale
    shutil.copy2(__file__,OUT/'render-city-journey.py')
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'city-journey.blend'))
    frames=[int(s) for s in args.preview_frames.split(',')] if args.mode=='preview' else range(args.start,args.end+1)
    timings=[]
    for frame in frames:
        folder='previews' if args.mode=='preview' else 'frames'
        path=OUT/folder/f'frame-{frame:04d}.png'
        if args.mode=='render' and path.exists():
            if png_dimensions(path) != (WIDTH, HEIGHT):
                raise RuntimeError(f'Remove stale non-native frame before resuming: {path}')
            continue
        before=time.monotonic(); scene.frame_set(frame); scene.render.filepath=str(path)
        bpy.ops.render.render(write_still=True)
        elapsed=time.monotonic()-before; timings.append({'frame':frame,'render_seconds':round(elapsed,3)})
        print(f'CITY_FRAME {frame}/{COUNT} {elapsed:.2f}s',flush=True)
    (OUT/f'{args.mode}-timings-{args.start}.json').write_text(json.dumps(timings,indent=2))
    manifest={'seed':SEED,'engine':args.engine,'samples':args.samples,'fps':FPS,'duration_seconds':DURATION,'width':int(WIDTH*args.scale/100),'height':int(HEIGHT*args.scale/100),'resolution_percentage':args.scale,'native_render':args.scale==100,'expected_frame_count':COUNT,'rendered_frame_count':len(list((OUT/'frames').glob('frame-*.png'))),'frame_pattern':str(OUT/'frames/frame-%04d.png'),'scene':str(OUT/'city-journey.blend'),'source':str(ROOT/'scripts/render-city-journey.py'),'route':str(OUT/'camera-route.json'),'ai_materials':['materials/corner.png','materials/plaza.png'],'ai_material_use':'World-space distant architecture and cropped glass facade materials; packed into .blend','camera_height_m':2.15,'lens_mm':LENS_MM,'horizontal_fov_degrees':round(math.degrees(2*math.atan(36/(2*LENS_MM))),3),'gaze_rise_m':GAZE_RISE,'skyline_landmark_heights_m':[142,130,156,138],'route_length_m':round(TOTAL,3),'route_timing':[{'district':'glass avenue','seconds':[0,round(50/TOTAL*20,2)]},{'district':'right turn','seconds':[round(50/TOTAL*20,2),round((50+LENGTHS[1])/TOTAL*20,2)]},{'district':'bridge gallery','seconds':[round((50+LENGTHS[1])/TOTAL*20,2),round((76+LENGTHS[1])/TOTAL*20,2)]},{'district':'left turn into plaza','seconds':[round((76+LENGTHS[1])/TOTAL*20,2),round((76+2*LENGTHS[1])/TOTAL*20,2)]},{'district':'plaza','seconds':[round((76+2*LENGTHS[1])/TOTAL*20,2),20]}],'elapsed_seconds':round(time.monotonic()-start,2)}
    (OUT/'manifest.json').write_text(json.dumps(manifest,indent=2))
    print('CITY_RUN_COMPLETE',json.dumps(manifest),flush=True)

if __name__=='__main__': main()
