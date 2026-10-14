"""Render the official private Unity-evaluated Asuna pose with its original PBR maps.
Run after CarrotAsunaPoseExport.Export. The only public output is the rendered portrait.
"""
import bpy, json, math, sys
from pathlib import Path
from mathutils import Vector

repo=Path(__file__).resolve().parents[3]
source=repo/'private-assets/Asuna/portrait-pose.json'
document=json.loads(source.read_text())
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)

def rgba(c): return (c['r'],c['g'],c['b'],c['a'])
def xyz(v): return (v['x'],-v['z'],v['y'])
def texture(nodes,path,kind='color'):
    if not path:return None
    node=nodes.new('ShaderNodeTexImage');node.image=bpy.data.images.load(path,check_existing=True)
    node.image.colorspace_settings.name='sRGB' if kind=='color' else 'Non-Color'
    node.interpolation='Linear';return node

materials=[]
for data in document['materials']:
    m=bpy.data.materials.new(data['name']);m.use_nodes=True
    n=m.node_tree.nodes;l=m.node_tree.links;p=n.get('Principled BSDF')
    p.inputs['Base Color'].default_value=rgba(data['color']);p.inputs['Metallic'].default_value=data['metallic'];p.inputs['Roughness'].default_value=1-data['smoothness']
    color=texture(n,data['baseMap']);alpha=None
    if color:
        multiply=n.new('ShaderNodeMixRGB');multiply.blend_type='MULTIPLY';multiply.inputs[0].default_value=1;multiply.inputs[2].default_value=rgba(data['color']);l.new(color.outputs['Color'],multiply.inputs[1]);l.new(multiply.outputs[0],p.inputs['Base Color']);alpha=color.outputs['Alpha']
    if data['transparent'] or data['cutout']:
        if alpha:
            node=n.new('ShaderNodeMath');node.operation='GREATER_THAN' if data['cutout'] else 'MULTIPLY';node.inputs[1].default_value=data['cutoff'] if data['cutout'] else data['color']['a'];l.new(alpha,node.inputs[0]);l.new(node.outputs[0],p.inputs['Alpha'])
        else:p.inputs['Alpha'].default_value=data['color']['a']
    normal=texture(n,data['normalMap'],'linear')
    if normal:
        nn=n.new('ShaderNodeNormalMap');nn.inputs['Strength'].default_value=data['normalScale'];l.new(normal.outputs['Color'],nn.inputs['Color']);l.new(nn.outputs[0],p.inputs['Normal'])
    packed=texture(n,data['metallicMap'],'linear')
    if packed:
        separate=n.new('ShaderNodeSeparateColor');l.new(packed.outputs['Color'],separate.inputs[0]);l.new(separate.outputs['Red'],p.inputs['Metallic'])
        scale=n.new('ShaderNodeMath');scale.operation='MULTIPLY';scale.inputs[1].default_value=data['smoothness'];l.new(packed.outputs['Alpha'],scale.inputs[0])
        inv=n.new('ShaderNodeMath');inv.operation='SUBTRACT';inv.inputs[0].default_value=1;l.new(scale.outputs[0],inv.inputs[1]);l.new(inv.outputs[0],p.inputs['Roughness'])
    emission=texture(n,data['emissionMap'])
    if emission:
        multiply=n.new('ShaderNodeMixRGB');multiply.blend_type='MULTIPLY';multiply.inputs[0].default_value=1;multiply.inputs[2].default_value=rgba(data['emission']);l.new(emission.outputs['Color'],multiply.inputs[1]);l.new(multiply.outputs[0],p.inputs['Emission Color']);p.inputs['Emission Strength'].default_value=1
    materials.append(m)

for part in document['parts']:
    vertices=[xyz(v) for v in part['vertices']];normals=[Vector(xyz(n)) for n in part['normals']];faces=[];indices=[]
    for sub in part['submeshes']:
        tris=sub['triangles']
        for i in range(0,len(tris),3):
            a,b,c=tris[i:i+3]
            # Unity and Blender differ in face winding; agree with the audited transformed vertex normals.
            cross=(Vector(vertices[b])-Vector(vertices[a])).cross(Vector(vertices[c])-Vector(vertices[a]))
            if cross.dot(normals[a]+normals[b]+normals[c])<0:b,c=c,b
            faces.append((a,b,c));indices.append(sub['material'])
    mesh=bpy.data.meshes.new(part['name']);mesh.from_pydata(vertices,[],faces);mesh.update()
    obj=bpy.data.objects.new(part['name'],mesh);bpy.context.collection.objects.link(obj)
    for m in materials:mesh.materials.append(m)
    uv=mesh.uv_layers.new(name='UVMap')
    for poly,mi in zip(mesh.polygons,indices):
        poly.material_index=mi;poly.use_smooth=True
        for loop in poly.loop_indices:
            v=mesh.loops[loop].vertex_index;source_uv=part['uv'][v];uv.data[loop].uv=(source_uv['x'],source_uv['y'])
    mesh.normals_split_custom_set_from_vertices(normals)

def aim(obj,point):obj.rotation_euler=(Vector(point)-obj.location).to_track_quat('-Z','Y').to_euler()
def area(name,position,power,size,color):
    data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size;data.color=color
    obj=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(obj);obj.location=position;aim(obj,(0,0,1.7))
area('Large soft daylight',(-3,-4,5),650,4,(1,.96,.91))
area('Open sky fill',(3,-2,3.2),350,3,(.78,.87,1))
area('Daylight rim',(-2,2,4),600,2,(.91,.95,1))
world=bpy.data.worlds.new('Bright overcast sky');world.use_nodes=True;world.node_tree.nodes['Background'].inputs['Color'].default_value=(.75,.83,1,1);world.node_tree.nodes['Background'].inputs['Strength'].default_value=.45;bpy.context.scene.world=world
# Soft neutral backdrop, physically lit; no altered character artwork or generated pixels.
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,2,1.5),rotation=(math.pi/2,0,0));back=bpy.context.object;back.name='Portrait background';mat=bpy.data.materials.new('Sky gray');mat.diffuse_color=(.71,.79,.85,1);mat.use_nodes=True;mat.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(.71,.79,.85,1);mat.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=1;back.data.materials.append(mat)
cam_data=bpy.data.cameras.new('Portrait');cam=bpy.data.objects.new('Portrait',cam_data);bpy.context.collection.objects.link(cam);cam.location=(1.3,-2.3,1.97);aim(cam,(-.04,0,1.84));cam_data.lens=132;cam_data.dof.use_dof=True;cam_data.dof.focus_distance=(Vector((-.04,-.12,1.92))-cam.location).length;cam_data.dof.aperture_fstop=9;bpy.context.scene.camera=cam
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=96;scene.cycles.use_denoising=True;scene.cycles.max_bounces=8;scene.cycles.transparent_max_bounces=12
scene.render.resolution_x=1024;scene.render.resolution_y=1024;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.render.film_transparent=False
scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast';scene.view_settings.exposure=0
scene.render.filepath=str(repo/'public/assets/minigames/carrot/46-asuna-portrait.png')
# Save the render setup only under the ignored licensed subtree, never in web assets.
bpy.ops.wm.save_as_mainfile(filepath=str(repo/'private-assets/Asuna/portrait.blend'))
bpy.ops.render.render(write_still=True)
print('OFFICIAL_ASUNA_PORTRAIT',scene.render.filepath)
