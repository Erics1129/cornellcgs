import sys,os,json
sys.path.insert(0,os.path.dirname(__file__))
from build_carrot_models import *
SOURCE=Path('/Users/eric/Claude/carrot-defense-preproduction/source-assets/kenney-nature-kit/unpacked/Models/GLTF format')
NATURE=ROOT/'Assets/Resources/Carrot/Nature/Source';NATURE.mkdir(parents=True,exist_ok=True)
assets={'TreeOak':'tree_detailed','TreeAutumn':'tree_detailed_fall','TreePine':'tree_pineTallB_detailed','Rock':'rock_largeA','RockTall':'rock_tallA','Pebble':'rock_smallA','FlowerWhite':'flower_yellowA','FlowerPurple':'flower_purpleB','Bridge':'bridge_woodRound','Stump':'stump_roundDetailed'}
for name,file in assets.items():
 p=SOURCE/(file+'.glb')
 if not p.exists():print('MISSING',p);continue
 clear();bpy.ops.import_scene.gltf(filepath=str(p));root=empty(name)
 for o in list(bpy.context.scene.objects):
  if o!=root and o.parent is None:o.parent=root
  if o.type=='MESH':
   old=list(o.data.materials);images={};attr=o.data.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='CORNER')
   for poly in o.data.polygons:
    material=old[poly.material_index];c=tuple(material.diffuse_color)
    if material.use_nodes:
     bs=material.node_tree.nodes.get('Principled BSDF')
     if bs:c=tuple(bs.inputs['Base Color'].default_value)
    for li in poly.loop_indices:
     pixel=c
     tex=next((n for n in material.node_tree.nodes if n.type=='TEX_IMAGE' and n.image),None) if material.use_nodes else None
     if tex and o.data.uv_layers:
      img=tex.image
      if img.name not in images:images[img.name]=(list(img.pixels),img.size[:])
      pix,size=images[img.name];uv=o.data.uv_layers.active.data[li].uv;x=min(size[0]-1,max(0,int(uv.x*size[0])));y=min(size[1]-1,max(0,int(uv.y*size[1])));idx=(y*size[0]+x)*4;pixel=tuple(pix[idx+k]*c[k] for k in range(4))
     attr.data[li].color=pixel
    poly.material_index=0;poly.use_smooth=True
   o.data.materials.clear();o.data.materials.append(mat())
 join_parts();bpy.ops.object.select_all(action='SELECT');bpy.ops.export_scene.fbx(filepath=str(NATURE/(name+'.fbx')),use_selection=True,object_types={'EMPTY','MESH'},axis_forward='-Z',axis_up='Y',bake_anim=False,add_leaf_bones=False)
 print('NATURE_READY',name)
