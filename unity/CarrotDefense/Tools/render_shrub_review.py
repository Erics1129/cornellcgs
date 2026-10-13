import bpy,math
from mathutils import Vector
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];src=ROOT/'Assets/Resources/Carrot/RealNature';out=Path('/Users/eric/Claude/carrot-defense-preproduction/art/model-review-shrub.png')
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
for name,pos in [('Shrub',(0,0,0))]:
 bpy.ops.import_scene.fbx(filepath=str(src/'Source'/(name+'.fbx')))
 obj=bpy.context.selected_objects[0];obj.location=pos;group='MossRock'if name.startswith('MossRock')else name
 dims=obj.dimensions;scale=2.0/max(dims.x,dims.y);obj.scale*=scale
 m=bpy.data.materials.new(name+' scanned PBR');m.use_nodes=True;n=m.node_tree.nodes;links=m.node_tree.links;bs=n.get('Principled BSDF');bs.inputs['Roughness'].default_value=.6
 def tex(suffix,linear=False):
  node=n.new('ShaderNodeTexImage');node.image=bpy.data.images.load(str(src/'Textures'/(group+suffix+'.png')));node.image.colorspace_settings.name='Non-Color'if linear else'sRGB';return node
 al=tex('Albedo');normal=tex('Normal',True);rough=tex('Roughness',True);ao=tex('AO',True)
 mult=n.new('ShaderNodeMixRGB');mult.blend_type='MULTIPLY';mult.inputs[0].default_value=.7;links.new(al.outputs['Color'],mult.inputs[1]);links.new(ao.outputs['Color'],mult.inputs[2]);links.new(mult.outputs[0],bs.inputs['Base Color']);links.new(rough.outputs['Color'],bs.inputs['Roughness']);norm=n.new('ShaderNodeNormalMap');norm.inputs['Strength'].default_value=.8;links.new(normal.outputs['Color'],norm.inputs['Color']);links.new(norm.outputs[0],bs.inputs['Normal'])
 if name in ['Fern','Shrub']:links.new(al.outputs['Alpha'],bs.inputs['Alpha'])
 obj.data.materials.clear();obj.data.materials.append(m)
bpy.ops.mesh.primitive_plane_add(size=200);plane=bpy.context.object;plane.location.z=-.025;mat=bpy.data.materials.new('Neutral ground');mat.diffuse_color=(.13,.15,.12,1);plane.data.materials.append(mat)
world=bpy.data.worlds.new('World')if bpy.context.scene.world is None else bpy.context.scene.world;bpy.context.scene.world=world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.2,.25,.3,1);world.node_tree.nodes['Background'].inputs[1].default_value=.45
for name,loc,power,size in [('Key',(-3,-4,7),1100,5),('Rim',(4,4,6),900,4)]:
 light=bpy.data.lights.new(name,'AREA');light.energy=power;light.shape='DISK';light.size=size;obj=bpy.data.objects.new(name,light);bpy.context.collection.objects.link(obj);obj.location=loc;obj.rotation_euler=(-obj.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(4,-6,3.2));cam=bpy.context.object;cam.rotation_euler=(Vector((0,0,1))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=3.4
scene=bpy.context.scene;scene.camera=cam;scene.render.engine='CYCLES';scene.cycles.samples=48;scene.render.resolution_x=1400;scene.render.resolution_y=1100;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.render.filepath=str(out);scene.view_settings.view_transform='AgX';bpy.ops.render.render(write_still=True);print('SCANNED_NATURE_REVIEW',out)
