import sys,os,math,json,random
sys.path.insert(0,os.path.dirname(__file__))
from build_carrot_models import *
from mathutils import Vector,Matrix

ROSTER=[('nibble','mushnub',.70),('dash','bunny',.91),('shell','spider',.67),('swarm','green-blob',.51),('moth','armabee',.77),('shaman','mushroom-king',.95),('burrow','yeti',.67),('crystal','spiky-blob',.73),('garden','mushroom-king',2.05),('marsh','squidle',1.90),('frost','mushroom-king',2.05),('orchard','mushroom-king',2.15),('zombie','mushroom-king',2.3)]

def bounds(meshes):
 dg=bpy.context.evaluated_depsgraph_get();pts=[]
 for ob in meshes:
  o=ob.evaluated_get(dg);pts += [o.matrix_world@Vector(c) for c in o.bound_box]
 return Vector(tuple(min(v[i] for v in pts) for i in range(3))),Vector(tuple(max(v[i] for v in pts) for i in range(3)))

def append_skin(o,arm,root,source_center,factor,bone=None):
 # Rigid-bind hand-authored detail to a real animated source bone. Compute bind
 # coordinates from the displayed idle pose, avoiding source rest-pose offsets.
 bpy.context.view_layer.update()
 source_world=Matrix.Translation(source_center)@Matrix.Scale(1/factor,4)
 if bone is None:
  center=sum((Vector(v.co) for v in o.data.vertices),Vector())/max(1,len(o.data.vertices));center=source_world@(o.matrix_world@center)
  candidates=[p for p in arm.pose.bones if not any(w in p.name for w in ['Target','Root','Pinky','Thumb','Index','Middle'])]
  bone=min(candidates,key=lambda b:(arm.matrix_world@b.matrix.translation-center).length).name
 if any(k in o.name for k in ['ContinuousYeti','LivingTrunk','TwistedArm','LegMuscle','GuardianArm']):
  candidates=[p for p in arm.pose.bones if any(k in p.name for k in ['Body','Hips','Torso','Abdomen','Neck','Head','UpperArm','LowerArm','Shoulder','UpperLeg','LowerLeg','Foot'])]
  info=[]
  for pb in candidates:
   point=arm.matrix_world@pb.matrix.translation;delta=arm.matrix_world@pb.matrix@arm.data.bones[pb.name].matrix_local.inverted()@arm.matrix_world.inverted();info.append((pb.name,point,delta))
  groups={name:o.vertex_groups.new(name=name) for name,_,_ in info}
  source_transform=source_world@o.matrix_world
  for v in o.data.vertices:
   world=source_transform@v.co;near=sorted(info,key=lambda item:(world-item[1]).length_squared)[:3];weights=[1/max(.012,(world-item[1]).length_squared)**2 for item in near];total=sum(weights);weights=[w/total for w in weights]
   blend=Matrix(((0,0,0,0),)*4)
   for (name,point,delta),weight in zip(near,weights):
    blend+=delta*weight;groups[name].add([v.index],weight,'REPLACE')
   v.co=blend.inverted_safe()@world
  o.parent=root;o.matrix_world=Matrix.Identity(4);o.modifiers.new('Blended anatomical skin','ARMATURE').object=arm;return o
 pb=arm.pose.bones.get(bone) or arm.pose.bones[0];b=arm.data.bones[pb.name]
 inv_pose=(arm.matrix_world@pb.matrix@b.matrix_local.inverted()@arm.matrix_world.inverted()).inverted()
 transform=inv_pose@source_world@o.matrix_world
 for v in o.data.vertices:v.co=transform@v.co
 o.parent=root;o.matrix_world=Matrix.Identity(4)
 # Vertices are in source world; armature modifier object transform agrees.
 vg=o.vertex_groups.new(name=pb.name);vg.add(list(range(len(o.data.vertices))),1,'REPLACE');mod=o.modifiers.new('Original bone binding','ARMATURE');mod.object=arm
 return o

def recolor_source(meshes,kind):
 palette={'nibble':(.66,.31,.11,1),'dash':(.67,.53,.34,1),'shell':(.30,.18,.05,1),'swarm':(.24,.65,.36,1),'moth':(.36,.31,.47,1),'shaman':(.43,.18,.26,1),'burrow':(.36,.24,.17,1),'crystal':(.31,.63,.75,1),'garden':(.32,.39,.22,1),'marsh':(.13,.53,.51,1),'frost':(.87,.92,.92,1),'orchard':(.55,.42,.25,1),'zombie':(.46,.55,.38,1)}
 for o in meshes:
  old=list(o.data.materials);a=o.data.color_attributes.get('Color') or o.data.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='CORNER')
  for p in o.data.polygons:
   oc=old[p.material_index].diffuse_color if old and p.material_index<len(old) else (.5,.5,.5,1)
   # Preserve dark pupils, bright eyeballs and mouth contrast; replace costume/body palette.
   lum=sum(oc[:3])/3;col=tuple(oc) if lum<.075 or (min(oc[:3])>.8) else palette[kind]
   if lum>=.075 and min(oc[:3])<=.8:
    v=.76+.28*lum;col=tuple(c*v for c in col[:3])+(1,)
   for li in p.loop_indices:a.data[li].color=col
   p.material_index=0;p.use_smooth=True
  o.data.materials.clear();o.data.materials.append(mat('Organic'))

def make(kind,source,height):
 clear()
 for a in list(bpy.data.actions):bpy.data.actions.remove(a)
 bpy.ops.import_scene.gltf(filepath=str(SOURCE/(source+'.glb')))
 arm=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE');meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
 # Remove detachable props unrelated to the silhouette (e.g. MushroomKing held mushroom).
 main=max(meshes,key=lambda o:len(o.data.polygons))
 for o in list(meshes):
  if o!=main and len(o.data.polygons)<len(main.data.polygons)*.22:bpy.data.objects.remove(o,do_unlink=True);meshes.remove(o)
 idle=next((a for a in bpy.data.actions if a.name.endswith('|Idle') or 'Flying_Idle' in a.name),bpy.data.actions[0])
 arm.animation_data_create()
 for track in arm.animation_data.nla_tracks:track.mute=True
 arm.animation_data.action=idle;bpy.context.scene.frame_set(0);bpy.context.view_layer.update()
 lo,hi=bounds(meshes);center=Vector(((lo.x+hi.x)/2,(lo.y+hi.y)/2,lo.z));factor=height/max(.01,hi.z-lo.z)
 root=empty(kind);source_objects=[o for o in bpy.context.scene.objects if o!=root and o.parent is None]
 for o in source_objects:o.parent=root
 recolor_source(meshes,kind)
 details=empty('OriginalDetails')
 if kind=='nibble':
  # Sculpted mushroom spots, rim gills and sprout on cap.
  for i in range(7):a=i*2.4;ellipsoid('CapSpot',(.20*cos(a),.12*sin(a),.58+.07*sin(a)),(.05,.035,.018),CREAM,details,10,6)
  for s in [-1,1]:leaf('Sprout',(.06,0,.63),(s*.14,0,.87),.065,LEAF,details,.08)
 elif kind=='dash':
  for s in [-1,1]:leaf('LeafEar',(s*.09,0,.59),(s*.18,.045,.91),.075,LEAF,details,.04)
  ring('SeedCollar',.125,.38,BRASS,details,.018,24)
 elif kind=='shell':
  lathe('AcornShell',[(.12,.23),(.28,.34),(.27,.47),(.17,.61),(.025,.67)],BARK,details,segments=28,lobes=8)
  lathe('AcornCap',[(.29,.37),(.28,.44),(.23,.49)],GOLD,details,segments=28)
  for i in range(14):a=i*2*pi/14;tube('ShellRidge',[(.24*cos(a),.24*sin(a),.44),(.19*cos(a),.19*sin(a),.54),(.08*cos(a),.08*sin(a),.64)],[.015,.012,.003],BRASS,details,5)
  for s in [-1,1]:tube('Antenna',[(s*.1,-.18,.36),(s*.16,-.28,.47),(s*.21,-.29,.51)],[.015,.01,.002],DARK,details)
 elif kind=='swarm':
  for s in [-1,1]:ellipsoid('JellyBubble',(s*.10,-.16,.31),(.035,.018,.038),(.77,.95,.71,1),details,12,8)
  leaf('SlimeSprout',(0,.015,.44),(.07,.01,.61),.045,LEAF,details,.025)
 elif kind=='moth':
  for s in [-1,1]:
   for j in range(2):leaf('LanternWing',(s*.06,.02,.38),(s*(.43-.06*j),.07-.22*j,.66-.13*j),.15,(.76,.61,.32,1),details,.08)
   ellipsoid('WingEye',(s*.28,-.075,.47),(.055,.014,.065),(.22,.15,.29,1),details,12,8)
  ellipsoid('LanternAbdomen',(0,.10,.34),(.12,.16,.14),(.98,.58,.13,1),details,20,12,'Glow')
 elif kind=='shaman':
  tube('LanternStaff',[(.28,0,.12),(.28,0,.65),(.28,0,1.0),(.39,0,1.05)],[.025,.026,.02,.012],BARK,details,8)
  lathe('StaffLantern',[(.025,0),(.065,.05),(.06,.16),(.025,.20)],BRASS,details,(.39,0,.72),16,material='Metal');ellipsoid('Glow',( .39,0,.82),(.048,.047,.065),(.98,.54,.12,1),details,12,8,'Glow')
  for s in [-1,1]:leaf('Shawl',(s*.05,.05,.55),(s*.25,.09,.28),.11,GREEN,details,.03)
 elif kind=='burrow':
  ellipsoid('MoleNose',(0,-.24,.39),(.115,.085,.065),(.52,.29,.24,1),details,20,12)
  for s in [-1,1]:
   for j in range(3):tube('DiggingClaw',[(s*(.19+j*.025),-.13,.22),(s*(.21+j*.025),-.24,.15),(s*(.21+j*.025),-.27,.12)],[.015,.012,.001],CREAM,details,6)
  for i in range(7):a=i*2.4;leaf('LeafPack',(.09*cos(a),.12,.40),(.21*cos(a),.19,.67),.065,GREEN,details,.05)
 elif kind=='crystal':
  for i in range(7):a=i*2.4;crystal('CrystalCarapace',(.19*cos(a),.14*sin(a),.39),.060,.25+.06*(i%2),ICE,details)
  for s in [-1,1]:
   for j in range(2):tube('CrystalLeg',[(s*.16,.14-j*.22,.32),(s*.31,.15-j*.24,.22),(s*.34,.17-j*.27,.07)],[.043,.03,.012],(.26,.50,.66,1),details,7)
 elif kind in ['garden','marsh','frost','orchard','zombie']:
  if kind=='zombie':
   from sculpt_challenge_bosses import zombie
   zombie(details)
  else:
   from sculpt_carrot_details import build_boss
   build_boss(kind,details)
  for source_mesh in meshes:bpy.data.objects.remove(source_mesh,do_unlink=True)
  meshes=[]
 # Bind details to closest practical bone in the idle pose; source rig animations retained.
 originals=list(o for o in bpy.context.scene.objects if o.type=='MESH' and o not in meshes)
 for o in originals:append_skin(o,arm,root,center,factor)
 bpy.data.objects.remove(details,do_unlink=True)
 # Combine skinned meshes by material; retain all source bone weights.
 groups={}
 for o in list(bpy.context.scene.objects):
  if o.type=='MESH':groups.setdefault(o.data.materials[0].name,[]).append(o)
 for name,obs in groups.items():
  bpy.ops.object.select_all(action='DESELECT')
  for o in obs:o.select_set(True)
  bpy.context.view_layer.objects.active=obs[0]
  if len(obs)>1:bpy.ops.object.join()
  o=obs[0];world=o.matrix_world.copy();o.parent=root;o.matrix_world=world
  if not any(m.type=='ARMATURE' for m in o.modifiers):o.modifiers.new('Rig','ARMATURE').object=arm
 root.scale=(factor,)*3;root.location=-center*factor
 # Preserve the named normalized root for Unity. Height/readability differs per species.
 export(root,kind,True)

selection=sys.argv[sys.argv.index('--')+1] if '--' in sys.argv else 'all'
for kind,source,height in ROSTER:
 if selection=='all' or kind in selection.split(','):make(kind,source,height)
manifest_path=ROOT/'Tools/character-model-manifest.json'
if selection!='all' and manifest_path.exists():
 # A partial build replaces only the rebuilt entries; the rest of the roster keeps its recorded data.
 previous=json.loads(manifest_path.read_text());built={m['name'] for m in manifest}
 manifest=[m for m in previous if m['name'] not in built]+manifest
 order={kind:i for i,(kind,_,_) in enumerate(ROSTER)};manifest.sort(key=lambda m:order.get(m['name'],99))
manifest_path.write_text(json.dumps(manifest,indent=2))
