"""Optimize verified Poly Haven CC0 scans; Blender background script, no network."""
import bpy,json,hashlib,math,sys
from pathlib import Path
from mathutils import Vector,Matrix
ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT.parents[2]/'carrot-defense-preproduction/source-assets/polyhaven-models'
if not SOURCE.exists():SOURCE=Path('/Users/eric/Claude/carrot-defense-preproduction/source-assets/polyhaven-models')
DEST=ROOT/'Assets/Resources/Carrot/RealNature'
choices=[('fern_02','fern_02_b','Fern',2384),('tree_stump_01','tree_stump_01','Stump',8000),('rock_moss_set_01','rock_moss_set_01_rock04','MossRockA',7000),('rock_moss_set_01','rock_moss_set_01_rock03','MossRockB',5000),('shrub_02','shrub_02_a+shrub_02_b+shrub_02_d','Shrub',18020)]
onlyShrub="--shrub"in sys.argv
if onlyShrub:choices=choices[-1:]
results=json.loads((DEST/"mesh-provenance.json").read_text())if onlyShrub else []
if onlyShrub:results=[r for r in results if r["name"]!="Shrub"]
for asset,part,name,budget in choices:
 bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
 bpy.ops.import_scene.gltf(filepath=str(SOURCE/asset/(asset+'_1k.gltf')))
 if '+' in part:
  joined=[]
  for index,key in enumerate(part.split('+')):
   member=bpy.data.objects[key];member.data.transform(member.matrix_world);member.matrix_world=Matrix.Identity(4)
   pts=[v.co for v in member.data.vertices];origin=Vector(((min(v.x for v in pts)+max(v.x for v in pts))*.5,(min(v.y for v in pts)+max(v.y for v in pts))*.5,min(v.z for v in pts)))
   member.data.transform(Matrix.Translation(-origin));member.rotation_euler.z=index*math.tau/3;member.location=(math.cos(index*math.tau/3)*.13,math.sin(index*math.tau/3)*.13,0);joined.append(member)
  bpy.ops.object.select_all(action='DESELECT')
  for member in joined:member.select_set(True)
  bpy.context.view_layer.objects.active=joined[0];bpy.ops.object.join();obj=bpy.context.object
 else:obj=bpy.data.objects[part]
 bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
 obj.data.transform(obj.matrix_world);obj.matrix_world=Matrix.Identity(4)
 points=[v.co for v in obj.data.vertices];mn=Vector((min(v.x for v in points),min(v.y for v in points),min(v.z for v in points)));mx=Vector((max(v.x for v in points),max(v.y for v in points),max(v.z for v in points)))
 center=Vector(((mn.x+mx.x)*.5,(mn.y+mx.y)*.5,mn.z));obj.data.transform(Matrix.Translation(-center))
 obj.data.calc_loop_triangles();before=len(obj.data.loop_triangles)
 if before>budget:
  dec=obj.modifiers.new('WebGL scan reduction','DECIMATE');dec.ratio=(budget-30)/before;dec.use_collapse_triangulate=True;bpy.ops.object.modifier_apply(modifier=dec.name)
 for face in obj.data.polygons:face.use_smooth=True
 obj.name=name;obj.data.name=name+'Mesh';obj.data.calc_loop_triangles();after=len(obj.data.loop_triangles)
 assert after<(20000 if name=="Shrub"else 10000),(name,after)
 path=DEST/'Source'/(name+'.fbx')
 bpy.ops.export_scene.fbx(filepath=str(path),use_selection=True,object_types={'MESH'},apply_unit_scale=True,apply_scale_options='FBX_SCALE_UNITS',axis_forward='-Z',axis_up='Y',bake_anim=False,add_leaf_bones=False,use_mesh_modifiers=True,path_mode='STRIP')
 results.append({'name':name,'source':asset,'sourceObject':part,'sourceTriangles':before,'triangles':after,'materials':len(obj.data.materials),'boundsMeters':list(mx-mn),'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'resource':'Carrot/RealNature/'+name})
 print('OPTIMIZED',name,before,after)
(DEST/'mesh-provenance.json').write_text(json.dumps(results,indent=2))
print('SCANNED_NATURE_READY')
