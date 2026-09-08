"""Render the AlphaGo still from procedural geometry and materials only.

/Applications/Blender.app/Contents/MacOS/Blender -b --python scripts/render-go-scene.py
Optional output: ... -- /absolute/path/go-study.png
No external assets or add-ons are required. Blender 4.5 / Cycles.
"""
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = 80
scene.cycles.use_denoising = True
scene.cycles.max_bounces = 7
scene.cycles.diffuse_bounces = 3
scene.cycles.glossy_bounces = 4
# Use Metal where available; CPU remains a deterministic fallback.
try:
    prefs = bpy.context.preferences.addons['cycles'].preferences
    prefs.compute_device_type = 'METAL'
    prefs.get_devices()
    gpu = [d for d in prefs.devices if d.type == 'METAL']
    for device in prefs.devices:
        device.use = device in gpu
    if gpu:
        scene.cycles.device = 'GPU'
except Exception:
    pass

scene.render.resolution_x = 1536
scene.render.resolution_y = 1024
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGB'
scene.render.image_settings.color_depth = '8'
scene.render.film_transparent = False
scene.view_settings.view_transform = 'AgX'
scene.view_settings.look = 'AgX - Medium High Contrast'
scene.view_settings.exposure = .35
scene.world.use_nodes = True
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (.09, .12, .19, 1)
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .16


def material(name, color, roughness, metallic=0, coat=0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*color, 1)
    shader.inputs['Roughness'].default_value = roughness
    shader.inputs['Metallic'].default_value = metallic
    shader.inputs['Coat Weight'].default_value = coat
    shader.inputs['Coat Roughness'].default_value = .16
    return mat


board_mat = material('Satin charcoal ash', (.014, .019, .028), .61, 0, 0)
nodes = board_mat.node_tree.nodes
links = board_mat.node_tree.links
tex = nodes.new('ShaderNodeTexNoise')
tex.inputs['Scale'].default_value = 165
tex.inputs['Detail'].default_value = 2
tex.inputs['Roughness'].default_value = .68
coords = nodes.new('ShaderNodeTexCoord')
scale = nodes.new('ShaderNodeVectorMath')
scale.operation = 'MULTIPLY'
scale.inputs[1].default_value = (.10, 1, 1)
links.new(coords.outputs['Generated'], scale.inputs[0])
links.new(scale.outputs[0], tex.inputs['Vector'])
bump = nodes.new('ShaderNodeBump')
bump.inputs['Strength'].default_value = .1
bump.inputs['Distance'].default_value = .012
links.new(tex.outputs['Fac'], bump.inputs['Height'])
links.new(bump.outputs['Normal'], nodes['Principled BSDF'].inputs['Normal'])

edge_mat = material('Graphite lower edge', (.012, .016, .023), .34, .15)
grid_mat = material('Pewter engraved grid', (.10, .125, .17), .62, .15)
white_mat = material('Warm white porcelain', (.80, .82, .80), .26, 0, .16)
black_mat = material('Polished obsidian', (.005, .008, .013), .25, 0, .14)
floor_mat = material('Dark studio ground', (.004, .007, .013), .65, 0)


def box(name, location, dimensions, mat, bevel=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    if bevel:
        mod = obj.modifiers.new('Machined soft edge', 'BEVEL')
        mod.width = bevel
        mod.segments = 4
        normals = obj.modifiers.new('Weighted normals', 'WEIGHTED_NORMAL')
        normals.keep_sharp = True
    return obj


box('Board solid ash slab', (0, 0, 0), (8.6, 8.6, .44), board_mat, .065)
box('Board recessed plinth', (0, 0, -.27), (8.28, 8.28, .12), edge_mat, .05)
box('Studio floor', (0, 0, -.37), (200, 200, .08), floor_mat)

step = .42
half = 9 * step
# A genuine 19 x 19 grid. The nine star points sit at 4-10-16 intersections.
for i in range(19):
    p = (i - 9) * step
    box(f'Grid file {i + 1}', (p, 0, .222), (.009, half * 2, .002), grid_mat)
    box(f'Grid rank {i + 1}', (0, p, .222), (half * 2, .009, .002), grid_mat)
for x in (-6, 0, 6):
    for y in (-6, 0, 6):
        bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=.028, depth=.002, location=(x * step, y * step, .223))
        bpy.context.object.name = f'Hoshi {x} {y}'
        bpy.context.object.data.materials.append(grid_mat)

# An illustrative legal position, not a reconstruction of a historical game.
black = [(-6, -6), (-5, -4), (-3, -4), (-3, -2), (-1, -2), (0, 0),
         (2, 0), (4, -1), (5, -3), (6, 5), (5, 4), (-6, 5), (-5, 6), (6, -6)]
white = [(-6, -4), (-4, -3), (-2, -3), (-2, -1), (0, -1), (1, 1),
         (3, 0), (5, 0), (6, 4), (6, 3), (-5, 5), (-4, 6), (5, -5)]
for color, positions, mat in [('Obsidian', black, black_mat), ('Porcelain', white, white_mat)]:
    for x, y in positions:
        bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=24, radius=1, location=(x * step, y * step, .308))
        stone = bpy.context.object
        stone.name = f'{color} {x + 10}-{y + 10}'
        stone.scale = (.198, .198, .091)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        stone.data.materials.append(mat)
        for poly in stone.data.polygons:
            poly.use_smooth = True


def point_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat('-Z', 'Y').to_euler()


def area(name, location, target, power, color, size, size_y):
    data = bpy.data.lights.new(name, 'AREA')
    data.energy = power
    data.color = color
    data.shape = 'RECTANGLE'
    data.size = size
    data.size_y = size_y
    obj = bpy.data.objects.new(name, data)
    scene.collection.objects.link(obj)
    obj.location = location
    point_at(obj, target)


area('Silver overhead softbox', (-2, -1, 9), (0, 0, 0), 850, (.78, .86, 1), 7, 3)
area('Porcelain side key', (5, -4, 6), (1, 0, 0), 850, (.92, .95, 1), 5, 4)
area('Blue edge strip', (1, 6, 4), (0, 0, 0), 700, (.47, .65, 1), 7, 1)
area('Low front bounce', (-5, -6, 3), (0, 0, 0), 120, (.73, .83, 1), 4, 4)

camera_data = bpy.data.cameras.new('Study camera')
camera = bpy.data.objects.new('Study camera', camera_data)
scene.collection.objects.link(camera)
camera.location = (-8.5, -12.5, 12.5)
point_at(camera, (-1.5, 1.15, .1))
camera_data.type = 'PERSP'
camera_data.lens = 52
camera_data.dof.use_dof = True
focus = bpy.data.objects.new('Focus on central stones', None)
scene.collection.objects.link(focus)
focus.location = (0, -.42, .3)
camera_data.dof.focus_object = focus
camera_data.dof.aperture_fstop = 8
scene.camera = camera

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
output = Path(args[0]) if args else Path(__file__).resolve().parents[1] / 'public/assets/scenes/go-study.png'
output.parent.mkdir(parents=True, exist_ok=True)
scene.render.filepath = str(output)
bpy.ops.render.render(write_still=True)
print(f'Go scene rendered: {output}')
