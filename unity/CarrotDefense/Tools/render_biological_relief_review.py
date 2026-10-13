"""Controlled before/after render of actual exported actor meshes, not gameplay."""
import bpy
import math
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[1]
RESOURCE=ROOT/'Assets/Resources/Carrot'
OUT=Path('/Users/eric/Claude/carrot-defense-preproduction/art')
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
biological=[]
strength={'Carrot':.68,'Leaf':.72,'Fur':.82,'Scale':.86}

for index,name in enumerate(['Carrot','blossom-4','frost','marsh']):
    before=set(bpy.context.scene.objects);before_actions=set(bpy.data.actions)
    bpy.ops.import_scene.fbx(filepath=str(RESOURCE/'Models/Source'/(name+'.fbx')))
    objects=set(bpy.context.scene.objects)-before
    for o in objects:
        if o.type=='ARMATURE' and o.animation_data:
            for track in o.animation_data.nla_tracks:track.mute=True
            idle=next((a for a in bpy.data.actions if a not in before_actions and 'Idle' in a.name),None)
            if idle:o.animation_data.action=idle
        if o.name.split('.')[0] in ['MouthHurt','MouthHappy'] or o.name.startswith('BitePatch'):o.hide_render=True
        if o.type!='MESH':continue
        for slot in o.material_slots:
            source=slot.material
            if not source:continue
            category=source.name.split('.')[0];m=source.copy();slot.material=m;m.use_nodes=True
            nodes=m.node_tree.nodes;links=m.node_tree.links;bs=nodes.get('Principled BSDF')
            tint=nodes.new('ShaderNodeVertexColor');tint.layer_name='Color'
            links.new(tint.outputs['Color'],bs.inputs['Base Color'])
            roughness=.16 if category=='Metal' else .32 if category=='Scale' else .60 if category=='Carrot' else .84 if category=='Fur' else .72
            bs.inputs['Roughness'].default_value=roughness
            if category=='Metal':bs.inputs['Metallic'].default_value=.65
            uv=nodes.new('ShaderNodeTexCoord');scale=nodes.new('ShaderNodeVectorMath');scale.operation='MULTIPLY';scale.inputs[1].default_value=(3 if category=='Carrot' else 2,2,1);links.new(uv.outputs['UV'],scale.inputs[0])
            pbr=RESOURCE/'Textures/PBR';detail=RESOURCE/'Models/Materials'/(category+'Detail.png')
            albedo=next((p for p in [pbr/(category+'Albedo.png'),pbr/(category+'Albedo.jpg')] if p.exists()),None)
            path=albedo if category in strength else detail if detail.exists() else albedo
            if path:
                tex=nodes.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(str(path),check_existing=True);links.new(scale.outputs[0],tex.inputs['Vector'])
                mix=nodes.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1;links.new(tint.outputs['Color'],mix.inputs[1]);links.new(tex.outputs['Color'],mix.inputs[2]);links.new(mix.outputs[0],bs.inputs['Base Color'])
            if category in strength:
                normal=nodes.new('ShaderNodeTexImage');normal.image=bpy.data.images.load(str(RESOURCE/'Models/Materials'/(category+'MicroNormal.png')),check_existing=True);normal.image.colorspace_settings.name='Non-Color';links.new(scale.outputs[0],normal.inputs['Vector'])
                mapped=nodes.new('ShaderNodeNormalMap');mapped.inputs['Strength'].default_value=strength[category];links.new(normal.outputs['Color'],mapped.inputs['Color'])
                rough=nodes.new('ShaderNodeTexImage');rough.image=bpy.data.images.load(str(RESOURCE/'Models/Materials'/(category+'MicroRoughness.png')),check_existing=True);rough.image.colorspace_settings.name='Non-Color';links.new(scale.outputs[0],rough.inputs['Vector'])
                biological.append((m,bs,mapped,rough))
    placement=bpy.data.objects.new('Review '+name,None);bpy.context.collection.objects.link(placement)
    for o in objects:
        if o.parent is None:o.parent=placement
    bpy.context.scene.frame_set(1);bpy.context.view_layer.update()
    points=[o.matrix_world@Vector(p) for o in objects if o.type=='MESH' and not o.hide_render for p in o.bound_box]
    zmin=min(v.z for v in points);zmax=max(v.z for v in points)
    uniform=2.7/(zmax-zmin);placement.scale=(uniform,)*3;placement.location=((index-1.5)*3.4,0,-zmin*uniform)

bpy.ops.mesh.primitive_plane_add(size=200);ground=bpy.context.object;ground.location.z=-.04
mat=bpy.data.materials.new('Neutral ground');mat.diffuse_color=(.065,.075,.08,1);ground.data.materials.append(mat)
world=bpy.context.scene.world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.22,.25,.28,1);world.node_tree.nodes['Background'].inputs[1].default_value=.36
for loc,power,size in [((-5,-5,8),1600,4),((7,-2,5),1000,3),((0,5,8),1700,5)]:
    light=bpy.data.lights.new('Softbox','AREA');light.energy=power;light.shape='DISK';light.size=size
    obj=bpy.data.objects.new('Softbox',light);bpy.context.collection.objects.link(obj);obj.location=loc;obj.rotation_euler=(Vector((0,0,1.3))-obj.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(3,-19,8));camera=bpy.context.object;camera.rotation_euler=(Vector((0,0,1.4))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=14.6
scene=bpy.context.scene;scene.camera=camera;scene.render.engine='CYCLES';scene.cycles.samples=16;scene.cycles.use_denoising=True;scene.render.resolution_x=1800;scene.render.resolution_y=680;scene.render.resolution_percentage=100;scene.view_settings.view_transform='AgX'
scene.render.filepath=str(OUT/'model-relief-before.png');bpy.ops.render.render(write_still=True)
for material,bs,normal,rough in biological:
    material.node_tree.links.new(normal.outputs['Normal'],bs.inputs['Normal']);material.node_tree.links.new(rough.outputs['Color'],bs.inputs['Roughness'])
scene.render.filepath=str(OUT/'model-relief-after.png');bpy.ops.render.render(write_still=True)
