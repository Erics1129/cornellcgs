import bpy,sys,os,math
from mathutils import Vector
from pathlib import Path
sys.path.insert(0,os.path.dirname(__file__))
from build_carrot_models import mat,ROOT
base=ROOT/'Assets/Resources/Carrot/Models/Source'
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
mode=sys.argv[sys.argv.index('--')+1] if '--' in sys.argv else 'towers'
KINDS=['seed','frost','mortar','prism','storm','blossom','starfruit','gravity','book','thunder']
names=['Carrot']+[k+'-4' for k in KINDS] if mode=='towers' else ['nibble','dash','shell','swarm','moth','shaman','burrow','crystal','garden','marsh','frost']
if mode=='bosses':names=['garden','marsh','frost','orchard']
if mode=='priority':names=['Carrot','seed-4','frost-4']
if mode=='super':names=[k+'-'+t for k in KINDS for t in ['4','5']]
if mode=='challenge':names=['tornado','zombie','eyeball']
for idx,name in enumerate(names):
 before_actions=set(bpy.data.actions);before=set(bpy.context.scene.objects);bpy.ops.import_scene.fbx(filepath=str(base/(name+'.fbx')));obs=set(bpy.context.scene.objects)-before
 for o in obs:
  if o.type=='ARMATURE' and o.animation_data:
   for tr in o.animation_data.nla_tracks:tr.mute=True
   idle=next((a for a in bpy.data.actions if a not in before_actions and 'Idle' in a.name),None)
   if idle:o.animation_data.action=idle
  if o.name in ['MouthHurt','MouthHappy'] or o.name.startswith('BitePatch'):o.hide_render=True
  if o.type=='MESH':
   for i,m in enumerate(o.data.materials):
    m.use_nodes=True;bs=m.node_tree.nodes.get('Principled BSDF');att=m.node_tree.nodes.new('ShaderNodeVertexColor');att.layer_name='Color';m.node_tree.links.new(att.outputs['Color'],bs.inputs['Base Color']);bs.inputs['Roughness'].default_value=.65
    category=m.name.split('.')[0];pbr=base.parent.parent/'Textures/PBR';detail=base.parent/'Materials'/(category+'Detail.png')
    if category=='SuperGlow':
     m.node_tree.links.new(att.outputs['Color'],bs.inputs['Emission Color']);bs.inputs['Emission Strength'].default_value=2.0;bs.inputs['Metallic'].default_value=.6;bs.inputs['Roughness'].default_value=.18
    elif category=='Glow':
     m.node_tree.links.new(att.outputs['Color'],bs.inputs['Emission Color']);bs.inputs['Emission Strength'].default_value=.6
    albedo=next((p for p in [pbr/(category+'Albedo.png'),pbr/(category+'Albedo.jpg')] if p.exists()),None)
    texture_path=albedo if category in ['Carrot','Leaf','Fur','Scale'] else detail if detail.exists() else albedo
    if texture_path:
     tex=m.node_tree.nodes.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(str(texture_path),check_existing=True);mix=m.node_tree.nodes.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1;m.node_tree.links.new(att.outputs['Color'],mix.inputs[1]);m.node_tree.links.new(tex.outputs['Color'],mix.inputs[2]);m.node_tree.links.new(mix.outputs[0],bs.inputs['Base Color'])
    normal_path=pbr/(category+'Normal.png')
    if normal_path.exists():
     tex=m.node_tree.nodes.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(str(normal_path),check_existing=True);tex.image.colorspace_settings.name='Non-Color';normal=m.node_tree.nodes.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=.8;m.node_tree.links.new(tex.outputs['Color'],normal.inputs['Color']);m.node_tree.links.new(normal.outputs['Normal'],bs.inputs['Normal'])
    rough_path=pbr/(category+'Roughness.jpg')
    if rough_path.exists():
     tex=m.node_tree.nodes.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(str(rough_path),check_existing=True);tex.image.colorspace_settings.name='Non-Color';m.node_tree.links.new(tex.outputs['Color'],bs.inputs['Roughness'])
    if category=='Metal':bs.inputs['Metallic'].default_value=.72
 root=bpy.data.objects.new('ReviewPlacement',None);bpy.context.collection.objects.link(root)
 for o in obs:
  if o.parent is None:o.parent=root
 root.location=((idx%4-1.5)*2.5,(idx//4)*3.2,0)
 if mode!='towers' and idx>=8:root.scale=(.75,)*3
 if mode in ['bosses','priority']:root.location=((idx-1.5)*3.3,0,0)
 if mode=='super':
  # Pairs: kind-4 left, kind-5 right, five pairs per row.
  pair=idx//2;root.location=((pair%5-2)*3.9+(idx%2)*1.7-.85,(1-pair//5)*3.6,0)
 if mode=='challenge':root.location=((idx-1)*4.0,0,0)
bpy.context.scene.frame_set(1)
bpy.ops.mesh.primitive_plane_add(size=200);plane=bpy.context.object;plane.location.z=-.04;m=bpy.data.materials.new('Ground');m.diffuse_color=(.07,.085,.08,1);plane.data.materials.append(m)
world=bpy.context.scene.world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.25,.28,.31,1);world.node_tree.nodes['Background'].inputs[1].default_value=.5
for loc,power,size in [((-4,-6,11),1900,7),((8,3,8),1500,6)]:
 bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.data.energy=power;o.data.shape='DISK';o.data.size=size;o.rotation_euler=(Vector((0,2,0))-o.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(7,-14,15));camera=bpy.context.object;camera.rotation_euler=(Vector((0,3,0.7))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=12.8
if mode in ['bosses','priority']:
 camera.location=(3,-12,8);camera.rotation_euler=(Vector((0,0,1.0))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.ortho_scale=10
if mode=='super':
 camera.location=(2,-16,13);camera.rotation_euler=(Vector((0,1.8,.9))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.ortho_scale=21
if mode=='challenge':
 # The game camera: pitch 34 degrees, yaw -9 degrees (CarrotView cameraAngle), perspective 30 degree lens.
 pitch=math.radians(34);yaw=math.radians(-9);d=19;camera.location=(d*math.cos(pitch)*math.sin(yaw),-d*math.cos(pitch)*math.cos(yaw),d*math.sin(pitch)+1.3);camera.rotation_euler=(Vector((0,0,1.3))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='PERSP';camera.data.lens_unit='FOV';camera.data.angle=math.radians(34)
scene=bpy.context.scene;scene.camera=camera;scene.render.engine='CYCLES';scene.cycles.samples=16;scene.render.resolution_x=1400 if mode not in ['super','challenge'] else (2000 if mode=='super' else 1600);scene.render.resolution_y=900 if mode in ['bosses','priority','challenge'] else (1200 if mode!='super' else 1000);scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG'
out=ROOT.parent.parent/'docs/carrot-defense/screenshots'/('model-review-'+('challenge-bosses' if mode=='challenge' else mode)+'.png') if mode in ['super','challenge'] else Path('/Users/eric/Claude/carrot-defense-preproduction/art/model-review-'+mode+'.png')
scene.render.filepath=str(out);scene.view_settings.view_transform='AgX';bpy.ops.render.render(write_still=True);print('REVIEW_PLATE',out,flush=True)
