"""Reimport exports in Blender and verify real geometry, weights and animation.
Unity import/render validation is separate and is owned by the game build.
"""
import bpy,sys,os,json,hashlib
from pathlib import Path
from mathutils import Vector
sys.path.insert(0,os.path.dirname(__file__))
import build_carrot_models as g
from build_portal_towers import KINDS
from build_portal_creatures import REGULAR,MINIS

names=[k+'-'+str(t)for k in KINDS for t in range(1,6)]+REGULAR+MINIS+['portal'];report=[]
for name in names:
 bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
 for a in list(bpy.data.actions):bpy.data.actions.remove(a)
 path=g.OUT/(name+'.fbx');bpy.ops.import_scene.fbx(filepath=str(path))
 meshes=[o for o in bpy.context.scene.objects if o.type=='MESH'];arms=[o for o in bpy.context.scene.objects if o.type=='ARMATURE']
 entry={'name':name,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'bytes':path.stat().st_size,'meshes':len(meshes),'vertices':sum(len(o.data.vertices)for o in meshes),'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons)for o in meshes),'allHaveVertexColors':all(bool(o.data.color_attributes)for o in meshes),'allHaveUVs':all(bool(o.data.uv_layers)for o in meshes)}
 if name in REGULAR+MINIS:
  assert len(arms)==1,(name,'armature');arm=arms[0];actions=list(bpy.data.actions)
  entry['clips']=[a.name.rsplit('|',1)[-1]for a in actions];entry['bones']=len(arm.data.bones);entry['unweightedVertices']=sum(sum(not v.groups for v in o.data.vertices)for o in meshes)
  assert set(entry['clips'])=={'Idle','Walk','Attack','Hit','Death'},(name,entry['clips'])
  assert entry['unweightedVertices']==0,(name,'missing skin weights')
  walk=next(a for a in actions if a.name.rsplit('|',1)[-1]=='Walk');arm.animation_data.action=walk
  # Blender 4.5's FBX import creates slotted actions; replacing the action does
  # not automatically bind its slot, which would falsely report a frozen rig.
  if hasattr(walk,'slots') and len(walk.slots):arm.animation_data.action_slot=walk.slots[0]
  for tr in arm.animation_data.nla_tracks:tr.mute=True
  samples=[]
  for frame in [1,7]:
   bpy.context.scene.frame_set(frame);bpy.context.view_layer.update();deps=bpy.context.evaluated_depsgraph_get();sample=[]
   for o in meshes:
    evaluated=o.evaluated_get(deps);mesh=evaluated.to_mesh();sample.extend([evaluated.matrix_world@mesh.vertices[i].co for i in range(0,len(mesh.vertices),max(1,len(mesh.vertices)//100))]);evaluated.to_mesh_clear()
   samples.append(sample)
  delta=max((a-b).length for a,b in zip(samples[0],samples[1]));entry['walkMaxVertexMotion']=delta
  assert delta>.0001,(name,'frozen animation')
 assert entry['allHaveVertexColors']and entry['allHaveUVs'],(name,'surface channels')
 report.append(entry);print('PORTAL_AUDITED',name,flush=True)
output=g.ROOT/'Tools/portal-model-audit.json';output.write_text(json.dumps(report,indent=2)+'\n');print('AUDIT_COMPLETE',len(report),output,flush=True)
