"""Decimated levels of detail for the scanned nature props; Blender background script, no network.

Reads the verified scans in Assets/Resources/Carrot/RealNature/Source (already pivot-normalized by prepare_scanned_nature.py) and
writes two reductions beside each: <Name>Small.fbx, the mesh the level places about a hundred times at 18-40 px on screen, and
<Name>Caster.fbx, an even coarser shadow-only mesh. The eight hero anchors of a level keep the full scan. Same FBX conventions
as the source export (Y up, -Z forward, unit scale), so CarrotNaturalAssets imports all three the same way.
"""
import bpy,json,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'Assets/Resources/Carrot/RealNature/Source'
# name: (small triangles, caster triangles)
# Giant update: the Small placements are 18-40 px on screen, so they drop to roughly 60 % (rocks 55 %) and casters to 300, which keeps
# the Low-tier board inside its triangle budget with a hundred mobs on the paths (characters.md, triangle budget).
targets={'Fern':(1000,300),'Shrub':(2400,500),'MossRockA':(820,300),'MossRockB':(820,300),'Stump':(1400,300)}
results=[]
for name,(small,caster) in targets.items():
 for suffix,budget in (('Small',small),('Caster',caster)):
  bpy.ops.wm.read_factory_settings(use_empty=True)
  bpy.ops.import_scene.fbx(filepath=str(SOURCE/(name+'.fbx')))
  meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
  assert len(meshes)==1,(name,len(meshes))
  obj=meshes[0];bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
  obj.data.calc_loop_triangles();before=len(obj.data.loop_triangles)
  if before>budget:
   dec=obj.modifiers.new('Level of detail','DECIMATE');dec.ratio=max(.02,(budget-20)/before);dec.use_collapse_triangulate=True;bpy.ops.object.modifier_apply(modifier=dec.name)
  for face in obj.data.polygons:face.use_smooth=True
  obj.name=name+suffix;obj.data.name=name+suffix+'Mesh';obj.data.calc_loop_triangles();after=len(obj.data.loop_triangles)
  path=SOURCE/(name+suffix+'.fbx')
  bpy.ops.export_scene.fbx(filepath=str(path),use_selection=True,object_types={'MESH'},apply_unit_scale=True,apply_scale_options='FBX_SCALE_UNITS',axis_forward='-Z',axis_up='Y',bake_anim=False,add_leaf_bones=False,use_mesh_modifiers=True,path_mode='STRIP')
  results.append({'name':name+suffix,'source':name+'.fbx','sourceTriangles':before,'triangles':after})
  print('DECIMATED',name+suffix,before,after)
(ROOT/'Assets/Resources/Carrot/RealNature/lod-provenance.json').write_text(json.dumps(results,indent=2)+'\n')
print('SCAN_LODS_READY')
