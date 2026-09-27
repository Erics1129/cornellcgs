"""Three tactile, physically modelled, eight-second gallery films.

Public entry point: ``build(id)``.  The caller owns scene reset, render engine,
sampling, colour management, saving and rendering.  No handlers, simulations,
external textures or frame-dependent Python are required after construction.
All motion is baked into ordinary transform/shape-key F-curves, including the
matching endpoint at frame 241 (only frames 1..240 belong in the deliverable).
"""

import math
import random

import bpy
from mathutils import Vector

import common


TAU = math.tau
FRAME_COUNT = 240
NAVY = (0.013, 0.028, 0.050)
IVORY = (0.71, 0.665, 0.55)
OCHRE = (0.46, 0.235, 0.063)


def _ramp(nodes, name, lo, hi, positions=(0.12, 0.88)):
    node = nodes.new('ShaderNodeValToRGB')
    node.label = name
    for element, position, color in zip(node.color_ramp.elements, positions, (lo, hi)):
        element.position = position
        element.color = (*color[:3], 1)
    return node


def _noise(nodes, name, scale, detail=3, roughness=0.65):
    node = nodes.new('ShaderNodeTexNoise')
    node.label = name
    node.inputs['Scale'].default_value = scale
    node.inputs['Detail'].default_value = detail
    node.inputs['Roughness'].default_value = roughness
    return node


def _surface(name, color, kind='stone'):
    """Meter-scale pores, material-specific grain and independent roughness."""
    ceramic = kind == 'ceramic'
    wood = kind == 'wood'
    bark = kind == 'bark'
    mat = common.material(name, color, rough=0.33 if ceramic else 0.56)
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = nodes.get('Principled BSDF')
    bsdf.inputs['Coat Weight'].default_value = 0.20 if ceramic else 0.025
    bsdf.inputs['Coat Roughness'].default_value = 0.30
    tex = nodes.new('ShaderNodeTexCoord')
    scale = nodes.new('ShaderNodeVectorMath')
    scale.operation = 'MULTIPLY'
    scale.inputs[1].default_value = (5, 5, 0.6) if wood or bark else (1.4, 1.4, 7)
    links.new(tex.outputs['Object'], scale.inputs[0])
    grain = _noise(nodes, 'Kiln mottling' if ceramic else 'Natural mineral strata', 3.8, 5)
    links.new(scale.outputs['Vector'], grain.inputs['Vector'])
    colors = _ramp(nodes, 'Subtle integral colour', tuple(c * 0.79 for c in color),
                   tuple(min(c * 1.10, 1) for c in color))
    links.new(grain.outputs['Fac'], colors.inputs['Fac'])
    links.new(colors.outputs['Color'], bsdf.inputs['Base Color'])
    rough = _ramp(nodes, 'Roughness variation', (0.24,) * 3 if ceramic else (0.43,) * 3,
                  (0.39,) * 3 if ceramic else (0.68,) * 3)
    links.new(grain.outputs['Fac'], rough.inputs['Fac'])
    links.new(rough.outputs['Color'], bsdf.inputs['Roughness'])
    fine = _noise(nodes, 'Fine fired clay' if ceramic else 'Grain and pores',
                  155 if ceramic else (24 if bark else 72), 3)
    links.new(scale.outputs['Vector'], fine.inputs['Vector'])
    bump = nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.19 if ceramic else 0.31
    bump.inputs['Distance'].default_value = 0.008 if ceramic else (0.038 if bark else 0.012)
    links.new(fine.outputs['Fac'], bump.inputs['Height'])
    if not ceramic and not wood and not bark:
        pore = nodes.new('ShaderNodeTexVoronoi')
        pore.inputs['Scale'].default_value = 105
        links.new(scale.outputs['Vector'], pore.inputs['Vector'])
        cavities = _ramp(nodes, 'Travertine pinholes', (0.05,) * 3, (0.7,) * 3,
                         (0.07, 0.18))
        links.new(pore.outputs['Distance'], cavities.inputs['Fac'])
        relief = nodes.new('ShaderNodeBump')
        relief.inputs['Strength'].default_value = 0.32
        relief.inputs['Distance'].default_value = 0.009
        links.new(cavities.outputs['Color'], relief.inputs['Height'])
        links.new(bump.outputs['Normal'], relief.inputs['Normal'])
        links.new(relief.outputs['Normal'], bsdf.inputs['Normal'])
    else:
        links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
    return mat


def _textile(name, color):
    mat = common.material(name, color, rough=0.40)
    n, l = mat.node_tree.nodes, mat.node_tree.links
    bs = n.get('Principled BSDF')
    bs.inputs['Coat Weight'].default_value = 0.035
    bs.inputs['Sheen Weight'].default_value = 0.16
    bs.inputs['Sheen Roughness'].default_value = 0.42
    bs.inputs['Anisotropic'].default_value = 0.25
    uv = n.new('ShaderNodeTexCoord')
    grain = _noise(n, 'Yarn dye variation', 6.5, 4)
    l.new(uv.outputs['UV'], grain.inputs['Vector'])
    colors = _ramp(n, 'Yarn colour', tuple(c * 0.67 for c in color),
                   tuple(c * 1.15 for c in color))
    l.new(grain.outputs['Fac'], colors.inputs['Fac'])
    l.new(colors.outputs['Color'], bs.inputs['Base Color'])
    waves = []
    for axis, scale in (('X', 38), ('Y', 57)):
        wave = n.new('ShaderNodeTexWave')
        wave.label = 'Individual ' + ('warp' if axis == 'X' else 'weft') + ' filaments'
        wave.wave_type = 'BANDS'
        wave.bands_direction = axis
        wave.inputs['Scale'].default_value = scale
        wave.inputs['Distortion'].default_value = 0.08
        wave.inputs['Detail Scale'].default_value = 5
        l.new(uv.outputs['UV'], wave.inputs['Vector'])
        waves.append(wave)
    product = n.new('ShaderNodeMath')
    product.operation = 'MULTIPLY'
    l.new(waves[0].outputs['Color'], product.inputs[0])
    l.new(waves[1].outputs['Color'], product.inputs[1])
    bump = n.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.23
    bump.inputs['Distance'].default_value = 0.0018
    l.new(product.outputs[0], bump.inputs['Height'])
    l.new(bump.outputs['Normal'], bs.inputs['Normal'])
    roughness = _ramp(n, 'Satin fibre roughness', (0.31,) * 3, (0.45,) * 3)
    l.new(grain.outputs['Fac'], roughness.inputs['Fac'])
    l.new(roughness.outputs['Color'], bs.inputs['Roughness'])
    tangent = n.new('ShaderNodeTangent')
    tangent.direction_type = 'UV_MAP'
    tangent.uv_map = 'Material coordinates'
    l.new(tangent.outputs['Tangent'], bs.inputs['Tangent'])
    return mat


def _uv(obj, values, wrap_rows=None, row_size=None):
    layer = obj.data.uv_layers.new(name='Material coordinates')
    for polygon in obj.data.polygons:
        seam = wrap_rows and any(i < row_size for i in polygon.vertices) and any(
            i >= (wrap_rows - 1) * row_size for i in polygon.vertices)
        for loop_index in polygon.loop_indices:
            vertex_index = obj.data.loops[loop_index].vertex_index
            u, v = values[vertex_index]
            if seam and vertex_index < row_size:
                v = 1.0
            layer.data[loop_index].uv = (u, v)


def _linear_animation(data):
    if data.animation_data and data.animation_data.action:
        # Legacy F-curve access remains available in the parent renderer's 4.5.
        for curve in data.animation_data.action.fcurves:
            for key in curve.keyframe_points:
                key.interpolation = 'LINEAR'


def _deform(obj, modes):
    """Exact periodic Fourier deformation, with real editable vertex positions.

    Each mode is (name, displacement(vertex, index), temporal coefficient).
    Endpoints coincide in position AND analytic velocity. Frame-by-frame keys
    make exported blend files self-contained; negative relative keys are valid.
    """
    obj.shape_key_add(name='Rest geometry')
    base = [v.co.copy() for v in obj.data.vertices]
    for name, displacement, coefficient in modes:
        block = obj.shape_key_add(name=name)
        block.slider_min, block.slider_max = -1.0, 1.0
        for index, co in enumerate(base):
            block.data[index].co = co + Vector(displacement(co, index))
        for frame in range(1, FRAME_COUNT + 2):
            phase = TAU * (frame - 1) / FRAME_COUNT
            block.value = coefficient(phase)
            block.keyframe_insert(data_path='value', frame=frame)
    _linear_animation(obj.data.shape_keys)
    obj['physical_deformation'] = True
    obj['loop_endpoint'] = 241


def _shell(obj, thickness, bevel):
    solid = obj.modifiers.new('Real material thickness', 'SOLIDIFY')
    solid.thickness = thickness
    solid.offset = 0
    solid.use_even_offset = True
    edge = obj.modifiers.new('Soft finished edges', 'BEVEL')
    edge.width, edge.segments = bevel, 3


def _world(color, strength):
    scene = bpy.context.scene
    if scene.world is None:
        scene.world = bpy.data.worlds.new('Gallery atmosphere')
    scene.world.use_nodes = True
    bg = scene.world.node_tree.nodes.get('Background')
    bg.inputs['Color'].default_value = (*color, 1)
    bg.inputs['Strength'].default_value = strength


def _sun(name, rotation, energy=2.0, angle=0.035):
    data = bpy.data.lights.new(name, 'SUN')
    data.energy, data.angle = energy, angle
    data.color = (1.0, 0.88, 0.70)
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.rotation_euler = rotation
    return obj


def _camera(loc, target, lens, portrait, fstop):
    cam = common.camera(loc, target, lens)
    cam.data.sensor_fit = 'VERTICAL' if portrait else 'HORIZONTAL'
    cam.data.sensor_height = 36
    cam.data.dof.use_dof = True
    cam.data.dof.focus_distance = (Vector(loc) - Vector(target)).length
    cam.data.dof.aperture_fstop = fstop
    cam.data.dof.aperture_blades = 9
    cam.data.lens = lens
    return cam


def _paving(name, x_range, y_range, tile, material, z=0, seed=12):
    """Real joints and bevels rather than a flat checkerboard shader."""
    rng = random.Random(seed)
    nx = math.ceil((x_range[1] - x_range[0]) / tile)
    ny = math.ceil((y_range[1] - y_range[0]) / tile)
    variants = [material]
    for i, factor in enumerate((0.94, 1.035, 1.07)):
        variant = material.copy()
        variant.name = f'{material.name} / slab tone {i + 1}'
        ramp = next(n for n in variant.node_tree.nodes
                    if n.type == 'VALTORGB' and n.label == 'Subtle integral colour')
        for element in ramp.color_ramp.elements:
            element.color = (*[c * factor for c in element.color[:3]], 1)
        variants.append(variant)
    for iy in range(ny):
        for ix in range(nx):
            x0, y0 = x_range[0] + ix * tile, y_range[0] + iy * tile
            x1, y1 = min(x0 + tile, x_range[1]), min(y0 + tile, y_range[1])
            common.box(f'{name} {ix:02d}-{iy:02d}',
                       ((x0 + x1) / 2, (y0 + y1) / 2, z - 0.056),
                       (x1 - x0 - 0.007, y1 - y0 - 0.007, 0.11),
                       rng.choice(variants), 0.007)


def _elliptic_plinth(name, rx, ry, height, mat):
    vertices, faces = [], []
    rings = ((0, 0.96), (0.025, 1), (height - 0.025, 1), (height, 0.96))
    for z, scale in rings:
        for i in range(128):
            angle = TAU * i / 128
            vertices.append((rx * scale * math.cos(angle), ry * scale * math.sin(angle), z))
    for j in range(len(rings) - 1):
        for i in range(128):
            k = (i + 1) % 128
            faces.append((j * 128 + i, j * 128 + k, (j + 1) * 128 + k, (j + 1) * 128 + i))
    faces.append(tuple(reversed(range(128))))
    faces.append(tuple(range(384, 512)))
    obj = common.mesh(name, vertices, faces, mat)
    obj.data.polygons[-1].use_smooth = False
    obj.data.polygons[-2].use_smooth = False
    return obj


def _sculpture_band(name, sign, mat):
    """A broad, irregular Solomon-link band; never a torus primitive.

    Radial separation and depth exchange quadrature: the two bands weave
    past each other with clearance instead of intersecting at the crossings.
    """
    count, cross = 384, 12
    vertices, faces, uvs = [], [], []
    for i in range(count):
        t = TAU * i / count
        radial = sign * 0.43 * math.sin(2 * t)
        center = Vector(((1.17 + radial) * math.sin(t),
                         sign * 0.62 * math.cos(2 * t) + 0.07 * math.sin(3 * t),
                         2.22 + (1.76 + radial) * math.cos(t)))
        outward = Vector((math.sin(t), 0, math.cos(t)))
        twist = 0.36 * math.sin(t) + sign * 0.19 * math.sin(2 * t)
        across = outward * math.cos(twist) + Vector((0, math.sin(twist), 0))
        width = 0.57 + 0.10 * math.cos(t - sign * 0.5) ** 2 + 0.025 * math.sin(3 * t)
        for j in range(cross + 1):
            u = j / cross - 0.5
            crown = (1 - (2 * u) ** 2) * 0.022
            point = center + across * (u * width) + Vector((0, sign * crown, 0))
            vertices.append(tuple(point))
            uvs.append((j / cross, i / count))
    # Each foot is actually seated on the plinth, not suspended above it.
    min_z = min(v[2] for v in vertices)
    vertices = [(x, y, z - min_z + 0.258) for x, y, z in vertices]
    for i in range(count):
        ni = (i + 1) % count
        for j in range(cross):
            a, b = i * (cross + 1) + j, ni * (cross + 1) + j
            faces.append((a, a + 1, b + 1, b))
    obj = common.mesh(name, vertices, faces, mat)
    _uv(obj, uvs, count, cross + 1)

    def expand(p, unused):
        envelope = max(0, min(1, (p.z - 0.29) / 1.6)) ** 2
        return (0.13 * p.x * envelope, 0.23 * p.y * envelope, 0.06 * envelope)

    def breathe(p, unused):
        envelope = max(0, min(1, (p.z - 0.29) / 1.9)) ** 2
        return (0.035 * math.sin(p.z * 1.3) * envelope,
                0.047 * p.x * envelope, 0.033 * envelope * math.sin(p.z))

    _deform(obj, [('Unfurl and nest', expand, lambda t: 0.5 - 0.5 * math.cos(t)),
                  ('Slow ceramic flexure', breathe, math.sin)])
    _shell(obj, 0.052, 0.018)
    return obj


def _who_we_are():
    stone = _surface('Gallery / warm limestone', (0.47, 0.427, 0.353))
    plaster = _surface('Gallery / ivory mineral plaster', (0.55, 0.51, 0.43))
    navy = _surface('Midnight blue satin-fired ceramic', NAVY, 'ceramic')
    ivory = _surface('Ivory porcelain / unglazed fine chamotte', IVORY, 'ceramic')
    bronze = common.material('Patinated bronze architectural detail', (0.18, 0.12, 0.06),
                             metal=0.76, rough=0.30)
    _world((0.72, 0.79, 0.93), 0.22)
    _paving('Gallery limestone paver', (-8, 8), (-7, 8), 2, stone)
    # Broad curved alcove behind the work: masonry thickness and no flat backdrop.
    verts, faces = [], []
    for i in range(97):
        angle = math.pi * i / 96
        for z in (0, 6.8):
            verts.append((5.1 * math.cos(angle), 2.8 + 1.55 * math.sin(angle), z))
    for i in range(96):
        faces.append((2 * i, 2 * i + 1, 2 * i + 3, 2 * i + 2))
    wall = common.mesh('Continuous curved gallery apse', verts, faces, plaster)
    _shell(wall, 0.22, 0.025)
    for x in (-3.95, -2.92, 2.92, 3.95):
        common.box('Apse fluted stone pier', (x, 2.83, 3.15), (0.14, 0.20, 6.3), stone, 0.025)
        common.box('Pier bronze foot', (x, 2.78, 0.09), (0.16, 0.22, 0.18), bronze, 0.012)
    common.box('Gallery cornice shadow reveal', (0, 3.15, 6.2), (9.3, 0.45, 0.16), stone, 0.028)
    # Off-camera clerestory mullions cast a photographic sun pattern across the room.
    for y in (-1.8, -0.45, 0.9, 2.25):
        common.box('Clerestory timber baffle', (-3.7, y, 5.9), (2.9, 0.13, 0.19), plaster, 0.02)
    _elliptic_plinth('Low elliptical limestone sculpture base', 1.70, 1.16, 0.23, stone)
    bands = [_sculpture_band('Ivory / interlaced sculptural ribbon', 1, ivory),
             _sculpture_band('Navy / interlaced sculptural ribbon', -1, navy)]
    common.area('Tall gallery window', (-3.8, -3.4, 6.2), 650, (1, 0.88, 0.70),
                3.2, (0, 0, 2.2), 5.8)
    common.area('Silk overhead diffusion', (2.2, 1.1, 6.3), 230, (0.79, 0.87, 1),
                3.3, (0, 0, 2.4), 4.2)
    common.area('Long ceramic reflection card', (3, -3, 3.1), 85, (1, 0.94, 0.84),
                0.9, (0, 0, 2.4), 4)
    _sun('Gallery afternoon sun', (0.46, -0.53, -0.45), 1.80, 0.045)
    _camera((5.8, -12.4, 5.4), (0, 0.05, 2.30), 67, True, 7.1)
    return {
        'title': 'A shared form',
        'description': 'Two seated ceramic bands unfurl, interlace and breathe in a sunlit limestone gallery.',
        'animated_objects': [o.name for o in bands],
        'motion': 'Vertex deformation of two linked ribbons; fixed camera; fixed, grounded feet.',
    }


def _cloth_modes():
    def weight(p):
        return max(0, 1 - (p.x / 4.25) ** 2) * max(0, 1 - (p.y / 4.25) ** 2)

    # Both crossing directions share a displacement field. Their over/under
    # ordering cannot reverse when the cloth billows.
    return [
        ('Travelling billow / sine',
         lambda p, i: (0, 0, 0.16 * weight(p) * math.cos(1.32 * p.x + 0.71 * p.y)), math.sin),
        ('Travelling billow / cosine',
         lambda p, i: (0, 0, 0.16 * weight(p) * math.sin(1.32 * p.x + 0.71 * p.y)), math.cos),
        ('Small crossgrain ripple / sine',
         lambda p, i: (0, 0, 0.032 * weight(p) * math.cos(3.8 * p.x - 2.1 * p.y)),
         lambda t: math.sin(2 * t)),
        ('Small crossgrain ripple / cosine',
         lambda p, i: (0, 0, 0.032 * weight(p) * math.sin(3.8 * p.x - 2.1 * p.y)),
         lambda t: math.cos(2 * t)),
    ]


def _cloth_point(axis, strand, length, across):
    spacing = 0.96
    width = 0.71 + 0.072 * math.sin(1.8 * length + strand * 1.2)
    center = strand * spacing
    u, v = center + across * width, length
    if axis == 1:
        u, v = length, center + across * width
    envelope = max(0, 1 - (length / 4.25) ** 8)
    surface = 0.59 + 0.085 * math.sin(0.9 * u + 0.5 * v) + 0.045 * math.cos(1.7 * v)
    relief = (1 if axis == 0 else -1) * (-1) ** strand
    relief *= 0.245 * math.cos(math.pi * length / spacing) * envelope
    cup = 0.048 * ((2 * across) ** 2 - 0.5) * math.sin(2.5 * length + strand)
    crinkle = 0.0045 * math.sin(across * 48 + length * 2.2 + strand) * envelope
    # A shared, gently sheared drape bends the whole weave into broad folds.
    # Its XY map stays monotone, preserving every alternating crossing.
    drape = max(0, 1 - (u / 4.25) ** 2) * max(0, 1 - (v / 4.25) ** 2)
    x = u + 0.38 * drape * math.sin(0.86 * v + 0.25 * u)
    y = v + 0.27 * drape * math.sin(0.95 * u - 0.32 * v)
    z = surface + relief + cup + crinkle
    z += drape * (0.33 + 0.36 * math.sin(0.96 * u + 0.59 * v))
    return (x, y, z)


def _selvedge(name, points, mat):
    vertices, faces, uv = [], [], []
    for i, p in enumerate(points):
        tangent = Vector(points[min(i + 1, len(points) - 1)]) - Vector(points[max(i - 1, 0)])
        tangent.normalize()
        side = tangent.cross(Vector((0, 0, 1))).normalized()
        up = tangent.cross(side).normalized()
        for j in range(5):
            angle = TAU * j / 5
            vertices.append(Vector(p) + 0.0045 * (math.cos(angle) * side + math.sin(angle) * up))
            uv.append((j / 5 * 0.025, i / (len(points) - 1) * 8.5))
    for i in range(len(points) - 1):
        for j in range(5):
            nj = (j + 1) % 5
            faces.append((i * 5 + j, i * 5 + nj, (i + 1) * 5 + nj, (i + 1) * 5 + j))
    obj = common.mesh(name, vertices, faces, mat)
    _uv(obj, uv)
    _deform(obj, _cloth_modes())
    return obj


def _people():
    navy, ochre = _textile('Indigo / woven silk and linen', NAVY), _textile('Ochre / woven silk and linen', OCHRE)
    stone = _surface('Worktable / warm honed sandstone', (0.49, 0.44, 0.35))
    wood = _surface('Loom / blackened oak', (0.10, 0.065, 0.035), 'wood')
    _world((0.64, 0.72, 0.85), 0.27)
    common.box('Solid textile worktable', (0, 0, -0.11), (14, 14, 0.22), stone, 0.08)
    animated = []
    count, cross = 272, 20
    for axis, mat in ((0, navy), (1, ochre)):
        # Seven strands leave unwoven tails before the tension frame, avoiding
        # edge-to-edge pinching where the two outermost bindings would meet.
        for strand in range(-3, 4):
            vertices, faces, uv = [], [], []
            for i in range(count + 1):
                length = -4.25 + 8.5 * i / count
                for j in range(cross + 1):
                    across = j / cross - 0.5
                    vertices.append(_cloth_point(axis, strand, length, across))
                    uv.append((j / cross * 0.72, length + 4.25))
            for i in range(count):
                for j in range(cross):
                    a = i * (cross + 1) + j
                    face = (a, a + 1, a + cross + 2, a + cross + 1)
                    faces.append(face if axis == 0 else tuple(reversed(face)))
            label = f'{"Indigo warp" if axis == 0 else "Ochre weft"} {strand + 4:02d}'
            obj = common.mesh(label, vertices, faces, mat)
            _uv(obj, uv)
            _deform(obj, _cloth_modes())
            _shell(obj, 0.018, 0.006)
            animated.append(obj.name)
            # Raised woven selvages catch actual grazing highlights and cast
            # tiny shadows; these are geometry, not lines painted onto a plane.
            for edge in (-0.493, 0.493):
                points = [_cloth_point(axis, strand, -4.25 + 8.5 * i / count, edge)
                          for i in range(count + 1)]
                _selvedge(label + (' / left binding' if edge < 0 else ' / right binding'), points, mat)
    for side in (-1, 1):
        common.box('Oak tension frame / side', (side * 4.40, 0, 0.46), (0.34, 9.1, 0.50), wood, 0.055)
        common.box('Oak tension frame / end', (0, side * 4.40, 0.46), (8.5, 0.34, 0.50), wood, 0.055)
    common.area('Macro / large silk key', (-3.3, -1.8, 7), 850, (1, 0.87, 0.67),
                3.1, (0, 0, 0.5), 5)
    common.area('Macro / cool long reflection', (3.7, 2.3, 4.5), 420, (0.75, 0.84, 1),
                1.4, (0, 0, 0.5), 4.2)
    common.area('Macro / broad front fill', (1, -5, 4), 115, (1, 0.93, 0.81),
                3.5, (0, 0, 0.5), 3.5)
    _camera((2.30, -3.60, 7.90), (0.05, 0, 0.99), 88, True, 7.1)
    return {
        'title': 'Woven together',
        'description': 'A macro study of indigo and ochre silk-linen ribbons, with true alternating crossings and travelling cloth ripples.',
        'animated_objects': animated,
        'motion': 'Four periodic vertex modes, real thickness and raised selvages; loom-supported cloth and fixed macro camera.',
    }


def _empty(name, location=(0, 0, 0), parent=None):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.parent = parent
    obj.location = location
    return obj


def _child_box(name, parent, location, size, mat, bevel=0.01):
    obj = common.box(name, location, size, mat, bevel)
    obj.parent = parent
    return obj


def _leaf_material():
    mat = common.material('Olive / dusty silver-green living leaves', (0.14, 0.20, 0.075), rough=0.51)
    n, l = mat.node_tree.nodes, mat.node_tree.links
    bs = n.get('Principled BSDF')
    bs.inputs['Coat Weight'].default_value = 0.08
    bs.inputs['Subsurface Weight'].default_value = 0.065
    bs.inputs['Subsurface Radius'].default_value = (0.32, 0.5, 0.16)
    geo = n.new('ShaderNodeNewGeometry')
    mix = n.new('ShaderNodeMixRGB')
    mix.inputs[1].default_value = (0.13, 0.205, 0.065, 1)
    mix.inputs[2].default_value = (0.32, 0.38, 0.22, 1)
    l.new(geo.outputs['Backfacing'], mix.inputs[0])
    l.new(mix.outputs['Color'], bs.inputs['Base Color'])
    tex = n.new('ShaderNodeTexNoise')
    tex.inputs['Scale'].default_value = 145
    bump = n.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.16
    bump.inputs['Distance'].default_value = 0.002
    l.new(tex.outputs['Fac'], bump.inputs['Height'])
    l.new(bump.outputs['Normal'], bs.inputs['Normal'])
    return mat


def _olive(name, origin, scale, bark, leaves, seed):
    """Seeded botanical branching with attached, curled lanceolate leaf pairs."""
    rng = random.Random(seed)
    verts, faces, leaf_verts, leaf_faces, flutter = [], [], [], [], []

    def tube(points, radius):
        start = len(verts)
        sides = 9
        for i, p in enumerate(points):
            tangent = points[min(i + 1, len(points) - 1)] - points[max(0, i - 1)]
            tangent.normalize()
            side = tangent.cross(Vector((0, 1, 0))).normalized()
            up = tangent.cross(side).normalized()
            r = radius * (1 - 0.77 * i / (len(points) - 1))
            for j in range(sides):
                a = TAU * j / sides
                irregular = 1 + 0.12 * math.sin(3 * a + i * 0.9)
                verts.append(p + r * irregular * (side * math.cos(a) + up * math.sin(a)))
        for i in range(len(points) - 1):
            for j in range(sides):
                nj = (j + 1) % sides
                a, b = start + i * sides, start + (i + 1) * sides
                faces.append((a + j, a + nj, b + nj, b + j))
        faces.append(tuple(start + (len(points) - 1) * sides + j for j in range(sides)))

    def leaf(base, direction, length, phase):
        direction.normalize()
        side = direction.cross(Vector((0.15, 0.1, 1))).normalized()
        normal = side.cross(direction).normalized()
        start = len(leaf_verts)
        for k in range(7):
            t = k / 6
            width = math.sin(math.pi * t) ** 0.85 * length * 0.145 + 0.0003
            for j in (-1, 0, 1):
                p = base + direction * (length * t) + side * (width * j)
                p += normal * (0.035 * length * math.sin(math.pi * t) * (1 - abs(j))
                               - 0.10 * length * t * t)
                leaf_verts.append(p)
                flutter.append((normal, t * t * length * 0.13, phase))
        for k in range(6):
            for j in range(2):
                a = start + k * 3 + j
                leaf_faces.append((a, a + 1, a + 4, a + 3))

    def branch(start, direction, length, radius, depth):
        direction.normalize()
        bend = Vector((rng.uniform(-0.18, 0.18), rng.uniform(-0.18, 0.18), 0.17))
        points = [start + direction * length * (i / 7) + bend * length * (i / 7) ** 2 for i in range(8)]
        tube(points, radius)
        if depth:
            for k in (3, 5, 7):
                azimuth = rng.uniform(0, TAU)
                spread = Vector((math.cos(azimuth), math.sin(azimuth), rng.uniform(0.2, 0.7)))
                child_direction = (0.36 * direction + 0.75 * spread).normalized()
                branch(points[k], child_direction, length * rng.uniform(0.55, 0.73),
                       radius * 0.46, depth - 1)
        else:
            for k in range(2, 8):
                p = points[k]
                azimuth = rng.uniform(0, TAU)
                for sign in (-1, 1):
                    outward = Vector((sign * math.cos(azimuth), sign * math.sin(azimuth), rng.uniform(-0.25, 0.55)))
                    leaf(p, outward + direction * 0.35, rng.uniform(0.15, 0.235), azimuth)

    trunk = [Vector((0.055 * math.sin(i * 0.8), 0.08 * math.sin(i * 0.6), 0.29 * i)) for i in range(8)]
    tube(trunk, 0.17)
    for i in range(7):
        a = TAU * i / 7 + 0.25
        start = trunk[3 + i % 4]
        branch(start, Vector((0.75 * math.cos(a), 0.75 * math.sin(a), 0.52)),
               rng.uniform(0.9, 1.23), 0.08, 3)
    # Root flare is embedded in the planted bed.
    for i in range(5):
        a = TAU * i / 5
        tube([Vector((0.36 * math.cos(a), 0.36 * math.sin(a), 0)),
              Vector((0.16 * math.cos(a), 0.16 * math.sin(a), 0.12)), trunk[1]], 0.055)
    wood = common.mesh(name + ' / trunk and attached twigs', verts, faces, bark)
    canopy = common.mesh(name + ' / paired olive leaves', leaf_verts, leaf_faces, leaves)

    def wind_sin(p, i):
        w = max(0, p.z / 3.7) ** 1.6
        return (0.065 * w * math.cos(p.z * 0.6), 0.025 * w * math.cos(p.x), 0)

    def wind_cos(p, i):
        w = max(0, p.z / 3.7) ** 1.6
        return (0.065 * w * math.sin(p.z * 0.6), 0.025 * w * math.sin(p.x), 0)

    modes = [('Breeze / sine', wind_sin, math.sin), ('Breeze / cosine', wind_cos, math.cos)]
    _deform(wood, modes)
    _deform(canopy, modes + [
        ('Leaf flutter / sine', lambda p, i: flutter[i][0] * flutter[i][1] * math.cos(flutter[i][2]),
         lambda t: math.sin(3 * t)),
        ('Leaf flutter / cosine', lambda p, i: flutter[i][0] * flutter[i][1] * math.sin(flutter[i][2]),
         lambda t: math.cos(3 * t)),
    ])
    for obj in (wood, canopy):
        obj.location, obj.scale = origin, (scale,) * 3
    return wood, canopy


def _doors(wood, bronze):
    animated = []
    for sign in (-1, 1):
        side = 'West' if sign < 0 else 'East'
        inward = -sign
        pivot = _empty(side + ' gate / anchored hinge', (sign * 1.64, 4.76, 0.10))
        width, height = 1.615, 3.73
        for x in (0.045, width - 0.045):
            _child_box(side + ' / bronze stile', pivot, (inward * x, 0, height / 2),
                       (0.09, 0.125, height), bronze, 0.012)
        for z in (0.055, height - 0.055):
            _child_box(side + ' / bronze rail', pivot, (inward * width / 2, 0, z),
                       (width, 0.125, 0.11), bronze, 0.014)
        for k in range(10):
            x = inward * (0.165 + k * 0.143)
            louver = _empty(f'{side} louver {k + 1:02d} / pivot', (x, 0, height / 2), pivot)
            _child_box(side + ' / solid oak louver', louver, (0, 0, 0),
                       (0.115, 0.048, height - 0.25), wood, 0.012)
            for z in (-height / 2 + 0.135, height / 2 - 0.135):
                axle = common.cylinder(side + ' / louver spindle', (0, 0, z), 0.016, 0.065, bronze)
                axle.parent = louver

            def louver_pose(t, obj=louver, s=sign):
                obj.rotation_euler.z = s * (0.22 + 0.64 * (0.5 - 0.5 * math.cos(TAU * t)))

            common.keys(louver, louver_pose, properties=('rotation_euler',))
            animated.append(louver.name)
        # Full-height pull with actual stand-offs, attached to the swinging leaf.
        handle_x = inward * (width - 0.18)
        _child_box(side + ' / bronze pull', pivot, (handle_x, -0.145, 1.84),
                   (0.027, 0.03, 0.84), bronze, 0.013)
        for z in (1.48, 2.20):
            _child_box(side + ' / pull stand-off', pivot, (handle_x, -0.09, z),
                       (0.026, 0.12, 0.026), bronze, 0.008)
        for z in (0.38, 1.87, 3.34):
            common.cylinder(side + ' / fixed hinge barrel', (sign * 1.64, 4.76, z + 0.10),
                            0.049, 0.19, bronze)
            common.box(side + ' / hinge mortise', (sign * 1.70, 4.81, z + 0.10),
                       (0.18, 0.065, 0.12), bronze, 0.007)

        def gate_pose(t, obj=pivot, s=sign):
            openness = 0.5 - 0.5 * math.cos(TAU * t)
            obj.rotation_euler.z = -s * math.radians(12 + 64 * openness)

        common.keys(pivot, gate_pose, properties=('rotation_euler',))
        animated.append(pivot.name)
    return animated


def _join():
    stone = _surface('Courtyard / vein-cut warm travertine', (0.46, 0.39, 0.28))
    pale = _surface('Courtyard / pale honed coping', (0.57, 0.51, 0.40))
    wood = _surface('Gate / quarter-sawn smoked oak', (0.22, 0.125, 0.057), 'wood')
    bark = _surface('Olive / fissured grey-brown bark', (0.155, 0.13, 0.083), 'bark')
    bronze = common.material('Gate / aged warm bronze', (0.22, 0.14, 0.065), metal=0.78, rough=0.31)
    soil = _surface('Garden / dark mineral soil', (0.048, 0.040, 0.026))
    leaves = _leaf_material()
    _world((0.67, 0.78, 1), 0.43)
    # A procedural daylight sky appears above the open roof and beyond the gate.
    nodes, links = bpy.context.scene.world.node_tree.nodes, bpy.context.scene.world.node_tree.links
    sky = nodes.new('ShaderNodeTexSky')
    sky.sky_type = 'NISHITA'
    sky.sun_elevation = math.radians(36)
    sky.sun_rotation = math.radians(125)
    sky.sun_disc = False  # The explicit sun below owns all moving direct shadows.
    sky.air_density, sky.dust_density = 1.15, 1.65
    links.new(sky.outputs['Color'], nodes.get('Background').inputs['Color'])
    nodes.get('Background').inputs['Strength'].default_value = 0.20
    _paving('Courtyard travertine slab', (-6, 6), (-8, 14), 1.5, stone)
    common.box('Courtyard masonry / left', (-5.4, 1.7, 2.5), (0.5, 9, 5), stone, 0.035)
    common.box('Courtyard masonry / right', (5.4, 1.7, 2.5), (0.5, 9, 5), stone, 0.035)
    # Deep rear portal: two piers, lintel, reveals, threshold, and a real view through.
    for sign in (-1, 1):
        common.box('Rear travertine pier', (sign * 3.50, 5.07, 2.5), (3.50, 0.65, 5), stone, 0.035)
        common.box('Portal jamb / honed reveal', (sign * 1.735, 5.01, 1.985),
                   (0.19, 0.87, 3.97), pale, 0.019)
        common.box('Portal bronze stop', (sign * 1.635, 5.04, 1.98),
                   (0.027, 0.075, 3.76), bronze, 0.006)
        common.box('Rear wall coping', (sign * 3.50, 5.05, 5.035), (3.52, 0.76, 0.12), pale, 0.022)
    common.box('Portal stone lintel', (0, 5.07, 4.44), (3.75, 0.85, 1.13), pale, 0.024)
    common.box('Portal threshold / shallow eased step', (0, 4.97, 0.043), (3.43, 1.0, 0.086), pale, 0.022)
    for sign in (-1, 1):
        # Shallow stone coursing joints and cap details establish human scale.
        for z in (1.25, 2.50, 3.75):
            common.box('Rear masonry recessed bed joint', (sign * 3.55, 4.741, z),
                       (3.26, 0.007, 0.010), soil, 0.001)
        common.box('Side wall cap', (sign * 5.4, 1.7, 5.04), (0.64, 9, 0.14), pale, 0.025)
    # Near portico creates a shaded architectural foreground without roofing
    # over the courtyard. The broad central opening remains entirely outdoors.
    for sign in (-1, 1):
        common.box('Foreground portico pier', (sign * 5.35, -3.3, 2.65), (0.58, 0.64, 5.3), stone, 0.04)
    common.box('Foreground portico lintel', (0, -3.3, 5.30), (11.25, 0.66, 0.46), pale, 0.035)
    for y in (-2.9, -1.95, -1.0, -0.05, 0.9, 1.85, 2.8, 3.75):
        common.box('West pergola / open stone fin', (-4.0, y, 4.87), (2.52, 0.16, 0.22), pale, 0.027)
    # A welcoming bench, planted olive bed and gravel remain physically grounded.
    common.box('Travertine bench seat', (2.75, 2.8, 0.53), (1.85, 0.74, 0.15), pale, 0.055)
    for x in (2.12, 3.38):
        common.box('Bench stone leg', (x, 2.8, 0.235), (0.19, 0.57, 0.47), stone, 0.025)
    common.box('Olive planting bed soil', (-2.18, 0.9, 0.12), (2.22, 2.22, 0.23), soil, 0.025)
    for x in (-3.37, -0.99):
        common.box('Planting bed stone rim', (x, 0.9, 0.15), (0.16, 2.54, 0.30), pale, 0.025)
    for y in (-0.29, 2.09):
        common.box('Planting bed stone rim', (-2.18, y, 0.15), (2.24, 0.16, 0.30), pale, 0.025)
    rng = random.Random(933)
    for i in range(36):
        x, y = rng.uniform(-3.23, -1.13), rng.uniform(-0.13, 1.93)
        if (x + 2.18) ** 2 + (y - 0.9) ** 2 < 0.20:
            continue
        common.sphere('Tumbled limestone in olive bed', (x, y, 0.255), rng.uniform(0.025, 0.057),
                      pale, (1.3, 0.8, 0.5))
    tree, canopy = _olive('Courtyard olive', (-2.18, 0.90, 0.235), 1.04, bark, leaves, 41)
    # Distant planted court is visible through the opening as its gates unfold.
    for sign in (-1, 1):
        common.box('Beyond / low garden wall', (sign * 3.5, 10.4, 1), (4, 0.42, 2), stone, 0.04)
    common.box('Beyond / enclosed garden wall', (0, 13.7, 1.6), (12, 0.45, 3.2), stone, 0.04)
    common.box('Beyond / garden wall coping', (0, 13.7, 3.23), (12.12, 0.57, 0.14), pale, 0.025)
    for x in (-2.1, 2.1):
        common.box('Beyond / planted garden earth', (x, 10.2, 0.065), (1.7, 4.3, 0.13), soil, 0.018)
        for edge in (-0.90, 0.90):
            common.box('Beyond / garden bed coping', (x + edge, 10.2, 0.115), (0.10, 4.5, 0.23), pale, 0.015)
    _olive('Beyond / young olive', (1.8, 9.3, 0.13), 0.84, bark, leaves, 79)
    _olive('Beyond / shaded olive', (-1.45, 11.3, 0.13), 1.02, bark, leaves, 108)
    animated = _doors(wood, bronze)
    sun = _sun('Courtyard / moving afternoon sunlight', (0.49, -0.62, -0.68), 2.4, 0.045)

    def sun_pose(t):
        phase = TAU * t
        sun.rotation_euler = (0.49 + 0.038 * math.sin(phase),
                              -0.62 + 0.048 * (1 - math.cos(phase)),
                              -0.68 + 0.09 * math.sin(phase))

    common.keys(sun, sun_pose, properties=('rotation_euler',))
    common.area('Open sky / broad courtyard fill', (0, 1, 8.5), 550, (0.76, 0.86, 1),
                8, (0, 1, 0), 7)
    common.area('Portico / soft reflected stone light', (0, -5, 3.4), 140, (1, 0.92, 0.78),
                6, (0, 3, 1.8), 3)
    _camera((2.9, -10.0, 3.15), (-0.40, 2.8, 2.50), 54, True, 9)
    animated += [tree.name, canopy.name, sun.name]
    return {
        'title': 'An open invitation',
        'description': 'An open-roof travertine courtyard, articulated oak-and-bronze gates, shifting sun shadows and living olive foliage.',
        'animated_objects': animated,
        'motion': 'Two hinged gates and twenty pivoting louvers, moving direct sunlight, deforming branches and leaves; fixed architectural camera.',
    }


def build(id):
    """Construct the requested film in the caller's current, initialized scene.

    Sets the delivery dimensions/timeline but does not reset, save or render.
    Returns JSON-safe metadata so a parent may choose its own render settings.
    """
    builders = {'who-we-are': _who_we_are, 'people': _people, 'join': _join}
    if id not in builders:
        raise ValueError(f'Unknown gallery scene {id!r}; expected one of {tuple(builders)}')
    portrait = True
    width, height = 2160, 3840
    scene = bpy.context.scene
    scene.frame_start, scene.frame_end = 1, FRAME_COUNT
    scene.render.fps, scene.render.fps_base = 30, 1.0
    scene.render.resolution_x, scene.render.resolution_y = width, height
    # Preserve the parent's preview percentage (native dimensions stay 4K).
    scene.render.pixel_aspect_x = scene.render.pixel_aspect_y = 1
    metadata = builders[id]()
    scene.frame_set(1)
    metadata.update({
        'id': id,
        'width': width,
        'height': height,
        'resolution': [width, height],
        'orientation': 'portrait' if portrait else 'landscape',
        'aspect': '9:16' if portrait else '16:9',
        'fps': 30,
        'frames': FRAME_COUNT,
        'duration': 8,
        'frame_start': 1,
        'frame_end': FRAME_COUNT,
        'loop_endpoint': FRAME_COUNT + 1,
        'camera': scene.camera.name,
        'seamless': True,
        'render_recommendation': {
            'engine': 'BLENDER_EEVEE_NEXT', 'samples': 16, 'use_raytracing': True,
            'view_transform': 'AgX',
        },
    })
    scene['gallery_scene'] = id
    scene['gallery_loop_endpoint'] = FRAME_COUNT + 1
    return metadata
