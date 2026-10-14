"""Render actual exported expansion FBXs, not concept art or painted proxies."""
import bpy,sys,os,math,re
from pathlib import Path
from mathutils import Vector
sys.path.insert(0,os.path.dirname(__file__))
import build_carrot_models as g
from build_portal_towers import KINDS
from build_portal_creatures import REGULAR,MINIS

mode=sys.argv[sys.argv.index('--')+1] if '--'in sys.argv else'towers'
names=[k+'-4' for k in KINDS];columns=5;spacing=1.9
if mode=='supers':names=[k+'-'+str(t)for k in KINDS for t in [4,5]];columns=5;spacing=1.95
if mode=='tiers':names=[k+'-'+str(t)for k in KINDS for t in range(1,6)];columns=5;spacing=1.95
if mode=='mobs':names=REGULAR;columns=4;spacing=1.35
if mode=='minibosses':names=MINIS;columns=5;spacing=2.05
if mode=='portal':names=['portal'];columns=1;spacing=3
rows=math.ceil(len(names)/columns)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)

atlas=bpy.data.images.load(str(g.ROOT/'Assets/Resources/Carrot/Textures/PortalBioAtlas.png'),check_existing=True)
categories=['PortalChitin','PortalCap','PortalBamboo','PortalPeel']
def surface(material):
 material.use_nodes=True;nodes=material.node_tree.nodes;links=material.node_tree.links;bs=nodes.get('Principled BSDF')
 attr=nodes.new('ShaderNodeVertexColor');attr.layer_name='Color';links.new(attr.outputs['Color'],bs.inputs['Base Color'])
 category=material.name.split('.')[0];bs.inputs['Roughness'].default_value=.52
 if category in ['Glow','SuperGlow']:
  links.new(attr.outputs['Color'],bs.inputs['Emission Color']);bs.inputs['Emission Strength'].default_value=.55 if category=='Glow'else 1.4
 if category=='Metal':bs.inputs['Metallic'].default_value=.82;bs.inputs['Roughness'].default_value=.34
 if category in categories:
  index=categories.index(category);uv=nodes.new('ShaderNodeTexCoord');frac=nodes.new('ShaderNodeVectorMath');frac.operation='FRACTION';links.new(uv.outputs['UV'],frac.inputs[0]);scale=nodes.new('ShaderNodeVectorMath');scale.operation='SCALE';scale.inputs[3].default_value=.495;links.new(frac.outputs[0],scale.inputs[0]);offset=nodes.new('ShaderNodeVectorMath');offset.operation='ADD';offset.inputs[1].default_value=((index%2)*.5+.0025,(1-index//2)*.5+.0025,0);links.new(scale.outputs[0],offset.inputs[0]);tex=nodes.new('ShaderNodeTexImage');tex.image=atlas;links.new(offset.outputs[0],tex.inputs['Vector'])
  gray=nodes.new('ShaderNodeRGBToBW');links.new(tex.outputs['Color'],gray.inputs[0]);mul=nodes.new('ShaderNodeMath');mul.operation='MULTIPLY_ADD';mul.inputs[1].default_value=.34;mul.inputs[2].default_value=.72;links.new(gray.outputs[0],mul.inputs[0]);mix=nodes.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1;links.new(attr.outputs['Color'],mix.inputs[1]);links.new(mul.outputs[0],mix.inputs[2]);links.new(mix.outputs[0],bs.inputs['Base Color'])
  noise=nodes.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=75 if index in [1,3]else 35;noise.inputs['Detail'].default_value=2;links.new(uv.outputs['Generated'],noise.inputs['Vector']);bump=nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.12;bump.inputs['Distance'].default_value=.006;links.new(noise.outputs['Fac'],bump.inputs['Height']);links.new(bump.outputs[0],bs.inputs['Normal']);bs.inputs['Roughness'].default_value=[.48,.79,.52,.35][index]
 elif category in ['Stone','Bark','Metal']:
  pbr=g.ROOT/'Assets/Resources/Carrot/Textures/PBR';normal=pbr/(category+'Normal.png');rough=pbr/(category+'Roughness.jpg')
  if normal.exists():
   tex=nodes.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(str(normal),check_existing=True);tex.image.colorspace_settings.name='Non-Color';bump=nodes.new('ShaderNodeNormalMap');bump.inputs['Strength'].default_value=.8;links.new(tex.outputs['Color'],bump.inputs['Color']);links.new(bump.outputs[0],bs.inputs['Normal'])
  if rough.exists():
   tex=nodes.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(str(rough),check_existing=True);tex.image.colorspace_settings.name='Non-Color';links.new(tex.outputs['Color'],bs.inputs['Roughness'])

for i,name in enumerate(names):
 before=set(bpy.context.scene.objects);actions=set(bpy.data.actions);bpy.ops.import_scene.fbx(filepath=str(g.OUT/(name+'.fbx')));objects=set(bpy.context.scene.objects)-before
 for ob in objects:
  if ob.type=='MESH':
   for m in ob.data.materials:surface(m)
  if ob.type=='ARMATURE':
   idle=next((a for a in bpy.data.actions if a not in actions and 'Idle'in a.name),None)
   if idle:
    ob.animation_data_create();ob.animation_data.action=idle
    if hasattr(idle,'slots') and len(idle.slots):ob.animation_data.action_slot=idle.slots[0]
   if ob.animation_data:
    for track in ob.animation_data.nla_tracks:track.mute=True
 placement=g.empty('ReviewPlacement')
 for ob in objects:
  if ob.parent is None:ob.parent=placement
 placement.location=((i%columns-(columns-1)/2)*spacing,(rows-1-i//columns)*spacing*1.30,0)
 # Labels belong to the actual rendered scene, not baked concept-image captions.
 bpy.ops.object.text_add(location=(placement.location.x,placement.location.y-.65,.02));label=bpy.context.object;label.name='ReviewLabel';label.data.body=re.sub(r'([a-z])([A-Z])',r'\1 \2',name).replace('-5',' · SUPER').replace('-4',' · IV');label.data.align_x='CENTER';label.data.size=.105 if mode!='portal'else.16;label.rotation_euler=(math.radians(22),0,0);lm=bpy.data.materials.get('Labels')or bpy.data.materials.new('Labels');lm.diffuse_color=(.56,.65,.68,1);label.data.materials.append(lm)
bpy.context.scene.frame_set(1)
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.012));floor=bpy.context.object;material=bpy.data.materials.new('ReviewFloor');material.diffuse_color=(.018,.032,.036,1);material.use_nodes=True;material.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.018,.032,.036,1);material.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.63;floor.data.materials.append(material)
world=bpy.context.scene.world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.15,.21,.25,1);world.node_tree.nodes['Background'].inputs[1].default_value=.35
target=Vector((0,(rows-1)*spacing*.65,.62 if mode!='portal'else 1.08))
for loc,power,size,color in [((-4,-5,8),1450,5,(1,.79,.58)),((6,4,7),1700,5,(.43,.73,1)),((-1,5,4),750,4,(.39,1,.66))]:
 bpy.ops.object.light_add(type='AREA',location=Vector(loc)+Vector((0,target.y,0)));o=bpy.context.object;o.data.energy=power;o.data.size=size;o.data.color=color;o.rotation_euler=(target-o.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=target+Vector((.65,-10,7)));camera=bpy.context.object;camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=max(columns*spacing+.7,rows*spacing*1.10+1)
scene=bpy.context.scene;scene.camera=camera;scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True;scene.render.resolution_x=1800 if columns>1 else 1200;scene.render.resolution_y=1100 if rows<=2 else 1500
if mode=='tiers':scene.render.resolution_x=1600;scene.render.resolution_y=3000;camera.data.ortho_scale=20
if mode=='portal':scene.render.resolution_y=1200;camera.data.ortho_scale=2.9;camera.location=target+Vector((.50,-8,4));camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.view_settings.view_transform='AgX'
out=g.ROOT.parent.parent/'docs/carrot-defense/screenshots'/('portal-review-'+mode+'.png');out.parent.mkdir(parents=True,exist_ok=True);scene.render.filepath=str(out);bpy.ops.render.render(write_still=True);print('ACTUAL_MODEL_REVIEW',out)
