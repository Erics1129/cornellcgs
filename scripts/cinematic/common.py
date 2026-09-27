"""Shared physical materials, lighting and geometry for the CGS motion films."""
import bpy, math, random
from mathutils import Vector
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
TAU=math.tau
FPS=30
FRAMES=240

def material(name, color, metal=0, rough=.3, transmission=0, emission=0, texture=0):
    m=bpy.data.materials.new(name); m.diffuse_color=(*color[:3],1); m.use_nodes=True
    n=m.node_tree.nodes; l=m.node_tree.links; bs=n.get('Principled BSDF')
    bs.inputs['Base Color'].default_value=(*color[:3],1)
    bs.inputs['Metallic'].default_value=metal; bs.inputs['Roughness'].default_value=rough
    bs.inputs['Coat Weight'].default_value=.25
    bs.inputs['Transmission Weight'].default_value=transmission
    if emission:
        bs.inputs['Emission Color'].default_value=(*color[:3],1);bs.inputs['Emission Strength'].default_value=emission
    if texture:
        noise=n.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=120;noise.inputs['Detail'].default_value=3
        bump=n.new('ShaderNodeBump');bump.inputs['Strength'].default_value=texture;bump.inputs['Distance'].default_value=.015
        l.new(noise.outputs['Fac'],bump.inputs['Height']);l.new(bump.outputs['Normal'],bs.inputs['Normal'])
    return m

def finish(obj,name,mat,smooth=True):
    obj.name=name
    if mat:obj.data.materials.append(mat)
    if smooth and obj.type=='MESH':
        for p in obj.data.polygons:p.use_smooth=True
    return obj

def box(name, loc, scale, mat, bevel=.05):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.scale=scale
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    finish(o,name,mat,False)
    if bevel:
        b=o.modifiers.new('Machined radii','BEVEL');b.width=bevel;b.segments=4
        o.modifiers.new('Surface normals','WEIGHTED_NORMAL')
    return o

def sphere(name,loc,radius,mat,scale=None):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=48,ring_count=24,radius=radius,location=loc)
    o=finish(bpy.context.object,name,mat)
    if scale:o.scale=scale
    return o

def curve(name, points, radius, mat):
    d=bpy.data.curves.new(name,'CURVE');d.dimensions='3D';d.resolution_u=2;d.bevel_depth=radius;d.bevel_resolution=3
    s=d.splines.new('POLY');s.points.add(len(points)-1)
    for p,v in zip(s.points,points):p.co=(*v,1)
    o=bpy.data.objects.new(name,d);bpy.context.collection.objects.link(o);d.materials.append(mat);return o

def ring(name,loc,major,minor,mat,rotation=(0,0,0)):
    bpy.ops.mesh.primitive_torus_add(major_segments=96,minor_segments=12,location=loc,major_radius=major,minor_radius=minor,rotation=rotation)
    return finish(bpy.context.object,name,mat)

def cylinder(name,loc,radius,depth,mat,rotation=(0,0,0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=64,radius=radius,depth=depth,location=loc,rotation=rotation)
    o=finish(bpy.context.object,name,mat);b=o.modifiers.new('Edge finishing','BEVEL');b.width=min(.025,depth/4);b.segments=3;return o

def area(name,loc,power,color,size,target=(0,0,0),size_y=None):
    d=bpy.data.lights.new(name,'AREA');d.energy=power;d.color=color;d.shape='RECTANGLE' if size_y else 'DISK';d.size=size
    if size_y:d.size_y=size_y
    o=bpy.data.objects.new(name,d);bpy.context.collection.objects.link(o);o.location=loc;o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler();return o

def camera(loc,target=(0,0,1),lens=55):
    d=bpy.data.cameras.new('Photographic lens');o=bpy.data.objects.new('Photographic lens',d);bpy.context.collection.objects.link(o)
    o.location=loc;o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler();d.lens=lens;d.sensor_width=36;d.clip_end=200
    bpy.context.scene.camera=o
    return o

def studio(dark=False):
    floor=material('Charcoal microcement' if dark else 'Warm honed limestone',(.026,.032,.042) if dark else (.60,.57,.49),rough=.47,texture=.16)
    box('Continuous studio floor',(0,0,-.18),(200,200,.3),floor,0)
    world=bpy.context.scene.world;world.color=(.03,.03,.03);world.use_nodes=True
    bg=world.node_tree.nodes.get('Background');bg.inputs[0].default_value=(.08,.11,.18,1) if dark else (.65,.71,.82,1);bg.inputs[1].default_value=.22 if dark else .4
    area('Large window',(-5,-3,9),1800 if dark else 1400,(.83,.91,1),6,(0,0,1),4)
    area('Warm edge',(5,2,6),2100,(1,.72,.42),5,(0,0,1),3)
    area('Front bounce',(0,-7,3),650,(.69,.8,1),4,(0,0,1),7)

def keys(obj,fn,frames=FRAMES,properties=('location','rotation_euler','scale')):
    # Every frame has a new actual geometric pose; endpoint omitted for seamless loop.
    for f in range(1,frames+2):
        fn((f-1)/frames)
        for prop in properties:obj.keyframe_insert(prop,frame=f)
    if obj.animation_data:
        for fc in obj.animation_data.action.fcurves:
            for k in fc.keyframe_points:k.interpolation='LINEAR'

def look_at(cam,target):cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler()

def mesh(name,vertices,faces,mat):
    d=bpy.data.meshes.new(name);d.from_pydata(vertices,[],faces);d.update();o=bpy.data.objects.new(name,d);bpy.context.collection.objects.link(o);finish(o,name,mat);return o
