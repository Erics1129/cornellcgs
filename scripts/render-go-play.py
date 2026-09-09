"""Render the empty Go board, transparent stones, and projection metadata.

Run from any directory:
  /Applications/Blender.app/Contents/MacOS/Blender -b --python scripts/render-go-play.py
Optional arguments after ``--``: --output-dir /path/to/scenes --samples 32

Reuses render-go-scene.py's procedural geometry, materials, lighting, and
camera without running its final still-render block. Blender 4.5 / Cycles;
PNG and WebP are written directly by Blender, with no external dependencies.

Projection uses row-major clipMatrix multiplied by a world-space column
vector [x, y, z, 1]. Divide clip x/y by clip w, then map to image pixels:
  px = (ndc_x + 1) * width / 2
  py = (1 - ndc_y) * height / 2
Apply the consuming canvas's cover transform afterward. A sprite's full
square spans spriteWorldSize along cameraRight/cameraUp; its transparent
padding is intentional. Contact shadows belong to the consuming canvas.
"""

import argparse
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[1]


def arguments():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output-dir', type=Path,
                        default=ROOT / 'public/assets/scenes')
    parser.add_argument('--samples', type=int, choices=range(32, 49), default=48)
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    return parser.parse_args(argv)


def load_study_scene():
    source_path = ROOT / 'scripts/render-go-scene.py'
    source = source_path.read_text()
    setup, separator, _ = source.rpartition('\nargs = ')
    if not separator:
        raise RuntimeError('Cannot locate render-go-scene.py final render block')
    scope = {'__file__': str(source_path), '__name__': '__go_scene_setup__'}
    exec(compile(setup, str(source_path), 'exec'), scope)
    bpy.context.view_layer.update()
    return scope['scene'], scope['camera']


def projection_metadata(scene, camera):
    projection = camera.calc_matrix_camera(
        bpy.context.evaluated_depsgraph_get(),
        x=scene.render.resolution_x,
        y=scene.render.resolution_y,
        scale_x=scene.render.pixel_aspect_x,
        scale_y=scene.render.pixel_aspect_y,
    )
    clip = projection @ camera.matrix_world.inverted()
    basis = camera.matrix_world.to_3x3()
    metadata = {
        'width': 1536,
        'height': 1024,
        'clipMatrix': [value for row in clip for value in row],
        'cameraRight': list(basis.col[0].normalized()),
        'cameraUp': list(basis.col[1].normalized()),
        'step': .42,
        'surfaceZ': .222,
        'stoneCenterZ': .308,
        'spriteWorldSize': .52,
        'spriteWidth': 256,
        'spriteHeight': 256,
    }
    assert len(metadata['clipMatrix']) == 16
    assert all(math.isfinite(value) for value in metadata['clipMatrix'])
    for key in ('cameraRight', 'cameraUp'):
        assert all(math.isfinite(value) for value in metadata[key])
        assert abs(Vector(metadata[key]).length - 1) < 1e-6
    # Reject any non-finite number, including future metadata additions.
    json.dumps(metadata, allow_nan=False)
    return metadata


def render_pair(scene, output, transparent=False):
    scene.render.film_transparent = transparent
    settings = scene.render.image_settings
    settings.file_format = 'PNG'
    settings.color_mode = 'RGBA' if transparent else 'RGB'
    settings.color_depth = '8'
    scene.render.filepath = str(output.with_suffix('.png'))
    bpy.ops.render.render(write_still=True)
    settings.file_format = 'WEBP'
    settings.quality = 100 if transparent else 92
    bpy.data.images['Render Result'].save_render(
        str(output.with_suffix('.webp')), scene=scene,
    )
    print(f'GO_PLAY: rendered {output.name}.png and .webp', flush=True)


def main():
    args = arguments()
    output_dir = args.output_dir.expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    scene, camera = load_study_scene()
    scene.cycles.samples = args.samples
    scene.cycles.use_denoising = True
    scene.cycles.seed = 0
    scene.cycles.use_animated_seed = False
    scene.render.resolution_x = 1536
    scene.render.resolution_y = 1024
    scene.render.resolution_percentage = 100

    templates = {}
    for obj in scene.objects:
        if obj.type == 'MESH':
            for name, prefix in [('black', 'Obsidian'), ('white', 'Porcelain')]:
                if obj.name.startswith(prefix):
                    templates.setdefault(name, obj)
                    obj.hide_render = True
    if set(templates) != {'black', 'white'}:
        raise RuntimeError('Expected Obsidian and Porcelain stone meshes')

    metadata = projection_metadata(scene, camera)
    camera_rotation = camera.matrix_world.to_quaternion()
    render_pair(scene, output_dir / 'go-play-board')

    # Hide all surfaces and original stones, retaining the original light rig
    # and world illumination. The sprite therefore contains no baked shadow.
    for obj in scene.objects:
        if obj.type == 'MESH':
            obj.hide_render = True

    sprite_camera_data = bpy.data.cameras.new('Go play sprite camera')
    sprite_camera = bpy.data.objects.new('Go play sprite camera', sprite_camera_data)
    scene.collection.objects.link(sprite_camera)
    sprite_camera.rotation_mode = 'QUATERNION'
    sprite_camera.rotation_quaternion = camera_rotation
    sprite_camera.location = camera_rotation @ Vector((0, 0, 10))
    sprite_camera_data.type = 'ORTHO'
    sprite_camera_data.ortho_scale = metadata['spriteWorldSize']
    sprite_camera_data.dof.use_dof = False
    scene.camera = sprite_camera
    scene.render.resolution_x = 256
    scene.render.resolution_y = 256

    for color in ('black', 'white'):
        # Copy the exact smooth 48 x 24 UV sphere, including its applied
        # (.198, .198, .091) scale and original material.
        sprite = templates[color].copy()
        sprite.data = templates[color].data.copy()
        sprite.name = f'Go play {color} isolated stone'
        sprite.location = (0, 0, 0)
        sprite.hide_render = False
        scene.collection.objects.link(sprite)
        bpy.context.view_layer.update()
        render_pair(scene, output_dir / f'go-play-{color}', transparent=True)
        sprite.hide_render = True

    metadata_path = output_dir / 'go-play-projection.json'
    metadata_path.write_text(json.dumps(metadata, indent=2, allow_nan=False) + '\n')
    print(f'GO_PLAY: projection metadata saved to {metadata_path}', flush=True)


if __name__ == '__main__':
    main()
