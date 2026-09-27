"""Physical tabletop films. The caller owns scene initialization and rendering.

All poses are baked through frame 241: frames 1..240 are the delivered loop,
and 241 is its matching endpoint. No handlers, external textures or sim caches.
"""

import math

import bpy
from mathutils import Vector

import common


TAU = math.tau


def _empty(name, location=(0, 0, 0), parent=None):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    obj.parent = parent
    return obj


def _parent(obj, parent):
    # Geometry is authored in its mechanism's local coordinates.
    obj.parent = parent
    return obj


def _smooth(x):
    x = max(0.0, min(1.0, x))
    return x * x * x * (x * (6.0 * x - 15.0) + 10.0)


def _ramp(nodes, stops):
    node = nodes.new('ShaderNodeValToRGB')
    ramp = node.color_ramp
    for element in list(ramp.elements)[2:]:
        ramp.elements.remove(element)
    ramp.elements[0].position, ramp.elements[0].color = stops[0]
    ramp.elements[1].position, ramp.elements[1].color = stops[-1]
    for position, color in stops[1:-1]:
        ramp.elements.new(position).color = color
    return node


def _grain(name, low, high, scale=(2, 70, 5), roughness=.32,
           metal=0, bump=.06, distance=.018):
    """Real 3D anisotropic grain, in object space, at two physical scales."""
    mat = common.material(name, low, metal=metal, rough=roughness)
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = nodes.get('Principled BSDF')
    bsdf.inputs['Coat Weight'].default_value = .055
    tex = nodes.new('ShaderNodeTexCoord')
    stretch = nodes.new('ShaderNodeVectorMath')
    stretch.operation = 'MULTIPLY'
    stretch.inputs[1].default_value = scale
    links.new(tex.outputs['Object'], stretch.inputs[0])
    noise = nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 3.4
    noise.inputs['Detail'].default_value = 5
    noise.inputs['Roughness'].default_value = .72
    noise.inputs['Distortion'].default_value = .28
    links.new(stretch.outputs['Vector'], noise.inputs['Vector'])
    ramp = _ramp(nodes, [(.18, (*low, 1)), (.82, (*high, 1))])
    links.new(noise.outputs['Fac'], ramp.inputs[0])
    links.new(ramp.outputs['Color'], bsdf.inputs['Base Color'])
    micro = nodes.new('ShaderNodeTexNoise')
    micro.inputs['Scale'].default_value = 110
    micro.inputs['Detail'].default_value = 2
    links.new(stretch.outputs['Vector'], micro.inputs['Vector'])
    fine = nodes.new('ShaderNodeBump')
    fine.inputs['Strength'].default_value = .10
    fine.inputs['Distance'].default_value = .0008
    links.new(micro.outputs['Fac'], fine.inputs['Height'])
    grain = nodes.new('ShaderNodeBump')
    grain.inputs['Strength'].default_value = bump
    grain.inputs['Distance'].default_value = distance
    links.new(noise.outputs['Fac'], grain.inputs['Height'])
    links.new(fine.outputs['Normal'], grain.inputs['Normal'])
    links.new(grain.outputs['Normal'], bsdf.inputs['Normal'])
    if metal:
        bsdf.inputs['Anisotropic'].default_value = .55
        bsdf.inputs['Coat Weight'].default_value = .12
    return mat


def _graphite():
    mat = _grain('Honed graphite / mineral grain', (.024, .031, .035),
                 (.075, .087, .091), (1, 1, 1), .43, bump=.14)
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    tex = nodes.new('ShaderNodeTexCoord')
    veins = nodes.new('ShaderNodeTexVoronoi')
    veins.feature = 'DISTANCE_TO_EDGE'
    veins.inputs['Scale'].default_value = 2.8
    links.new(tex.outputs['Object'], veins.inputs['Vector'])
    vein_ramp = _ramp(nodes, [
        (.001, (.16, .17, .16, 1)),
        (.009, (.052, .061, .064, 1)),
        (.04, (.033, .044, .047, 1)),
    ])
    links.new(veins.outputs['Distance'], vein_ramp.inputs[0])
    bsdf = nodes.get('Principled BSDF')
    original = bsdf.inputs['Base Color'].links[0].from_socket
    mix = nodes.new('ShaderNodeMixRGB')
    mix.blend_type = 'MIX'
    mix.inputs[0].default_value = .28
    links.new(original, mix.inputs[1])
    links.new(vein_ramp.outputs['Color'], mix.inputs[2])
    links.new(mix.outputs[0], bsdf.inputs['Base Color'])
    return mat


def _lathe(name, profile, material, location=(0, 0, 0), segments=96):
    vertices, faces = [], []
    for radius, z in profile:
        vertices.extend((radius * math.cos(TAU * j / segments),
                         radius * math.sin(TAU * j / segments), z)
                        for j in range(segments))
    for row in range(len(profile) - 1):
        for j in range(segments):
            nxt = (j + 1) % segments
            faces.append((row * segments + j, row * segments + nxt,
                          (row + 1) * segments + nxt,
                          (row + 1) * segments + j))
    obj = common.mesh(name, vertices, faces, material)
    obj.location = location
    return obj


def _rod(name, start, end, radius, material, parent=None):
    start, end = Vector(start), Vector(end)
    delta = end - start
    obj = common.cylinder(name, (start + end) * .5, radius,
                          delta.length, material)
    obj.rotation_euler = delta.to_track_quat('Z', 'Y').to_euler()
    obj.parent = parent
    return obj


def _camera(location, target, lens=60, fstop=8):
    cam = common.camera(location, target, lens)
    # Explicit sensor fit keeps the intended portrait framing independent of
    # the caller's preview resolution. Camera and focus remain completely still.
    cam.data.sensor_fit = 'HORIZONTAL'
    cam.data.sensor_width = 36
    focus = _empty('Fixed optical focus', target)
    cam.data.dof.use_dof = True
    cam.data.dof.focus_object = focus
    cam.data.dof.aperture_fstop = fstop
    cam.data.dof.aperture_blades = 9
    return cam


def _table(name, dimensions, material):
    common.box(name, (0, 0, .20), dimensions, material, .10)


def _light_grade(power=.58, ambient=.16):
    """Keep the shared softboxes below the clipping point on dark surfaces."""
    scene = bpy.context.scene
    for obj in scene.objects:
        if obj.type == 'LIGHT':
            obj.data.energy *= power
    scene.world.node_tree.nodes.get('Background').inputs['Strength'].default_value = ambient


def _go_legal(sequence):
    """Check liberties, turn order and occupancy of the depicted exchange.

    This sequence deliberately contains no captures: every visible stone stays
    on the board until the explicit, continuous reverse choreography.
    """
    board = {}

    def neighbors(point):
        x, y = point
        return [(u, v) for u, v in ((x - 1, y), (x + 1, y),
                                   (x, y - 1), (x, y + 1))
                if 0 <= u < 19 and 0 <= v < 19]

    def liberties(point):
        group, stack, liberty = {point}, [point], set()
        while stack:
            current = stack.pop()
            for adj in neighbors(current):
                if adj not in board:
                    liberty.add(adj)
                elif board[adj] == board[point] and adj not in group:
                    group.add(adj)
                    stack.append(adj)
        return liberty

    for turn, point in enumerate(sequence):
        if point in board or not all(0 <= c < 19 for c in point):
            raise ValueError('Illegal Go intersection')
        board[point] = turn % 2
        if not liberties(point) or any(not liberties(p) for p in neighbors(point)
                                       if p in board):
            raise ValueError('Go exchange must be legal and capture-free')


def _go():
    common.studio(dark=True)
    walnut = _grain('Smoked walnut / long open pores', (.042, .022, .013),
                    (.115, .063, .030), (.28, 7.5, 4), .43)
    graphite = _graphite()
    bronze = _grain('Brushed champagne bronze', (.24, .15, .07),
                    (.44, .33, .18), (1, 120, 1), .25, .76, .025, .002)
    engraving = common.material('Pale silver grid inlay', (.31, .34, .32),
                                metal=.48, rough=.36)
    rubber = common.material('Recessed felt and underside', (.009, .012, .014),
                              rough=.83, texture=.05)
    black = common.material('Black urushi lacquer', (.006, .009, .012),
                             rough=.13, texture=.006)
    white = common.material('Warm ivory shell polish', (.82, .79, .67),
                             rough=.20, texture=.011)
    for mat in (black, white):
        bsdf = mat.node_tree.nodes.get('Principled BSDF')
        bsdf.inputs['Coat Weight'].default_value = .52
        bsdf.inputs['Coat Roughness'].default_value = .10
    _table('Dark walnut playing table', (18, 20, .42), walnut)
    for x in (-2.8, 2.8):
        for y in (-2.9, 2.9):
            common.cylinder('Inset board foot', (x, y, .46), .16, .10, rubber)
    common.box('Graphite board / lower eased shoulder', (0, 0, .65),
               (7.54, 7.72, .35), graphite, .095)
    common.box('Fine bronze seam beneath board', (0, 0, .802),
               (7.48, 7.66, .026), bronze, .040)
    common.box('Graphite board / playing surface', (0, 0, .898),
               (7.52, 7.70, .17), graphite, .065)
    surface, spacing = .983, .377
    extent = 9 * spacing
    for index in range(19):
        p = (index - 9) * spacing
        common.curve('19x19 inlaid vertical %02d' % index,
                     [(p, -extent, surface + .001),
                      (p, extent, surface + .001)], .0053, engraving)
        common.curve('19x19 inlaid horizontal %02d' % index,
                     [(-extent, p, surface + .001),
                      (extent, p, surface + .001)], .0053, engraving)
    for x in (3, 9, 15):
        for y in (3, 9, 15):
            common.cylinder('Inlaid hoshi / star point',
                            ((x - 9) * spacing, (y - 9) * spacing,
                             surface + .001), .026, .002, engraving)

    initial = [(3, 3), (15, 15), (3, 15), (15, 3), (9, 3), (9, 15),
               (5, 6), (6, 6), (5, 7), (6, 7), (4, 7), (7, 7),
               (10, 11), (11, 11), (11, 12), (12, 12),
               (8, 8), (9, 8), (7, 8), (10, 8)]
    moves = [(8, 9), (9, 9), (7, 9), (10, 9),
             (8, 7), (9, 10), (6, 8), (11, 9)]
    _go_legal(initial + moves)
    # A slightly flattened lenticular profile gives a real contact patch rather
    # than the visually floating point contact of a scaled sphere.
    profile = [(0, .001), (.060, .001), (.112, .016), (.152, .039),
               (.171, .066), (.169, .082), (.151, .107), (.108, .131),
               (.055, .143), (0, .148)]
    for i, (x, y) in enumerate(initial):
        _lathe('Settled %s stone %02d' % ('black' if i % 2 == 0 else 'white', i),
               profile, black if i % 2 == 0 else white,
               ((x - 9) * spacing, (y - 9) * spacing, surface), 64)

    for sign in (-1, 1):
        common.box('Stone tray / brushed bronze lip', (sign * 1.27, 4.43, .50),
                   (2.17, .75, .16), bronze, .09)
        common.box('Stone tray / graphite insert', (sign * 1.27, 4.43, .586),
                   (2.04, .62, .025), rubber, .06)
    for i, (x, y) in enumerate(moves):
        color = i % 2
        sign = -1 if color == 0 else 1
        start = Vector((sign * (.56 + .46 * (i // 2)), 4.43, .603))
        end = Vector(((x - 9) * spacing, (y - 9) * spacing, surface))
        stone = _lathe('Played %02d / %s' % (i + 1, 'black' if color == 0 else 'white'),
                       profile, black if color == 0 else white, start, 64)
        stone['intersection'] = '%d,%d' % (x + 1, y + 1)
        stone['move_number'] = len(initial) + i + 1
        play_start, play_end = .06 + i * .059, .112 + i * .059
        back_start = .60 + (len(moves) - 1 - i) * .047
        back_end = back_start + .044

        def pose(t, obj=stone, a=start, b=end, lo=play_start, hi=play_end,
                 rlo=back_start, rhi=back_end, side=sign):
            if t < lo:
                q = 0.0
            elif t < hi:
                q = _smooth((t - lo) / (hi - lo))
            elif t < rlo:
                q = 1.0
            elif t < rhi:
                q = 1.0 - _smooth((t - rlo) / (rhi - rlo))
            else:
                q = 0.0
            arch = math.sin(math.pi * q)
            obj.location = a.lerp(b, q) + Vector((side * .13 * arch,
                                                 0, .94 * arch))
            obj.rotation_euler = (.15 * arch, side * .11 * arch, side * .24 * arch)

        common.keys(stone, pose, properties=('location', 'rotation_euler'))

    # A low turned vessel supplies a secondary scale cue and real rim highlights.
    bowl_profile = [(0, 0), (.49, 0), (.60, .09), (.68, .34), (.66, .43),
                    (.61, .43), (.60, .33), (.51, .12), (0, .09)]
    _lathe('Turned graphite stone bowl', bowl_profile, graphite, (-2.8, 5.0, .42))
    common.ring('Stone bowl / bronze rim', (-2.8, 5.0, .84), .636, .015, bronze)
    common.area('Go / long silk reflection', (-2, 2.8, 7.7), 1100,
                (1, .91, .76), 2.3, (0, 0, .9), 6)
    common.area('Go / cool graphite rake', (5.0, -1.5, 3.2), 520,
                (.64, .76, 1), 1.3, (0, 0, .9), 5)
    _light_grade(.54, .11)
    _camera((4.8, -7.0, 7.7), (-.4, -.3, .9), 65, 7.1)
    return {'subject': 'Graphite 19×19 Go board and lacquer stones',
            'duration': common.FRAMES / common.FPS,
            'motion': 'Eight alternating legal moves; stones arc back to their trays in reverse order.'}


def _domino_trajectory(count, height, depth, spacing):
    """Small deterministic contact solver, baked once rather than live physics.

    Each slab pivots on its leading bottom edge. Its leading top corner cannot
    pass the rear face of the next slab. Contact transfers angular velocity;
    reverse playback retraces the same supported configurations without scaling
    or penetrating the table. Stored at 360 Hz, independently of rendering FPS.
    """
    rate, duration = 360, 3.6
    dt = 1.0 / rate
    angles, speeds = [0.0] * count, [0.0] * count
    active = [False] * count
    history = [tuple(angles)]
    tipping_angle = math.atan(depth / height)
    for tick in range(1, round(duration * rate) + 1):
        time = tick * dt
        if time < .30:
            q = time / .30
            target = .8 * q * q * (3 - 2 * q)
            velocity = .8 * 6 * q * (1 - q) / .30
            if target > angles[0]:
                angles[0] = target
                speeds[0] = max(speeds[0], velocity)
                active[0] = True
        for i in range(count):
            if active[i]:
                acceleration = 3 * 9.81 / (2 * height) * math.sin(angles[i] - tipping_angle)
                speeds[i] = max(0.0, speeds[i] + dt * acceleration)
                angles[i] += speeds[i] * dt
        if angles[-1] >= math.pi / 2:
            angles[-1], speeds[-1] = math.pi / 2, 0.0
        for i in range(count - 2, -1, -1):
            beta = angles[i + 1]
            sine = (spacing * math.cos(beta) - depth) / height
            limit = beta + math.asin(max(-1.0, min(1.0, sine)))
            if angles[i] > limit:
                if not active[i + 1]:
                    speeds[i + 1] = .96 * speeds[i]
                    active[i + 1] = True
                angles[i] = limit
                derivative = 1 - spacing * math.sin(beta) / height / math.sqrt(1 - sine * sine)
                speeds[i] = min(speeds[i], max(0.0, speeds[i + 1] * derivative))
        history.append(tuple(angles))
    if not all(active) or angles[-1] < math.pi / 2 - .001:
        raise RuntimeError('Domino contact wave did not finish')
    return history


_PIPS = {
    1: [(0, 0)],
    2: [(-1, -1), (1, 1)],
    3: [(-1, -1), (0, 0), (1, 1)],
    4: [(-1, -1), (-1, 1), (1, -1), (1, 1)],
    5: [(-1, -1), (-1, 1), (0, 0), (1, -1), (1, 1)],
    6: [(x, y) for x in (-1, 1) for y in (-1, 0, 1)],
}


def _events():
    common.studio(dark=True)
    wood = _grain('Bookmatched American walnut / open pores', (.035, .014, .006),
                  (.17, .069, .023), (.28, 7.5, 4), .39, bump=.12, distance=.012)
    wood_bsdf = wood.node_tree.nodes.get('Principled BSDF')
    wood_bsdf.inputs['Coat Weight'].default_value = .015
    wood_bsdf.inputs['Specular IOR Level'].default_value = .24
    wood_bsdf.inputs['Roughness'].default_value = .44
    _table('Solid walnut event table', (13, 20, .42), wood)
    seam = common.material('Walnut joint shadow', (.028, .013, .007), rough=.52)
    for x in (-4.2, -2.1, 2.1, 4.2):
        common.curve('Fine bookmatched plank seam', [(x, -9.8, .411), (x, 9.8, .411)],
                     .0045, seam)
    # Polished, pigment-filled cast resin: its depth comes from the coat and
    # shallow subsurface response, avoiding stochastic refraction grain in the
    # parent's real-time renderer at the intended 16-sample production setting.
    amber = common.material('Cognac amber cast resin / polished', (.34, .11, .024),
                             rough=.19, texture=0)
    amber_bsdf = amber.node_tree.nodes.get('Principled BSDF')
    amber_bsdf.inputs['IOR'].default_value = 1.49
    amber_bsdf.inputs['Coat Weight'].default_value = .36
    amber_bsdf.inputs['Coat Roughness'].default_value = .14
    amber_bsdf.inputs['Subsurface Weight'].default_value = .025
    ivory = common.material('Ivory resin / softly worn polish', (.80, .735, .58),
                             rough=.235, texture=.018)
    ivory.node_tree.nodes.get('Principled BSDF').inputs['Subsurface Weight'].default_value = .035
    dark = common.material('Onyx pip inlays', (.012, .014, .014), rough=.24)
    brass = _grain('Satin brass divider and inlay rims', (.26, .16, .068),
                    (.49, .36, .15), (1, 95, 1), .25, .80, .03, .002)

    count, height, depth, spacing, width = 19, 1.18, .18, .53, .65
    history = _domino_trajectory(count, height, depth, spacing)
    # A single straight run makes the contact solution exact, while the camera
    # looks obliquely across its faces and long diagonal table shadows.
    for i in range(count):
        hinge = _empty('Domino %02d / leading contact edge' % (i + 1),
                       (0, 4.8 - spacing * i, .411))
        hinge.rotation_euler.z = math.pi
        hinge['height'], hinge['depth'], hinge['spacing'] = height, depth, spacing
        mat = ivory if i % 4 == 2 else amber
        _parent(common.box('Domino %02d / solid slab' % (i + 1),
                           (0, -depth / 2, height / 2), (width, depth, height),
                           mat, .027), hinge)
        # Both faces are modeled: the return reveals the back face as well.
        for face, side in enumerate((-depth - .002, .002)):
            _parent(common.curve('Inlaid divider / domino %02d' % (i + 1),
                                 [(-width * .42, side, height / 2),
                                  (width * .42, side, height / 2)], .0065, brass), hinge)
            for half, value in enumerate((1 + i % 6, 1 + (i * 3 + 4) % 6)):
                for x, z in _PIPS[value]:
                    center = (x * .172, side, height * (.25 + .5 * half) + z * .117)
                    pip = common.cylinder('Flush onyx pip / domino %02d' % (i + 1),
                                           center, .037, .005, dark,
                                           rotation=(math.pi / 2, 0, 0))
                    _parent(pip, hinge)

        def pose(t, obj=hinge, index=i):
            # Cosine time gives zero velocity at both turnaround and loop seam.
            sample = .5 * (1 - math.cos(TAU * t)) * (len(history) - 1)
            left = min(int(sample), len(history) - 2)
            fraction = sample - left
            angle = history[left][index] * (1 - fraction) + history[left + 1][index] * fraction
            obj.rotation_euler = (-angle, 0, math.pi)

        common.keys(hinge, pose, properties=('rotation_euler',))

    # A small, open storage case in the background is built from solid rails.
    case = _empty('Open walnut domino case', (1.42, 5.05, .43))
    _parent(common.box('Case / bottom', (0, 0, .035), (1.8, 2.5, .07), wood, .035), case)
    for x in (-.88, .88):
        _parent(common.box('Case / side rail', (x, 0, .17), (.09, 2.5, .30), wood, .025), case)
    for y in (-1.21, 1.21):
        _parent(common.box('Case / end rail', (0, y, .17), (1.8, .09, .30), wood, .025), case)
    common.area('Domino / amber transmission strip', (-3.5, 2.5, 4.7), 1550,
                (1, .77, .47), 1.1, (0, -.5, 1.0), 7)
    common.area('Domino / tall ivory softbox', (3.0, -4, 6), 1150,
                (.80, .88, 1), 3.0, (0, -.7, .8), 6)
    scene = bpy.context.scene
    if scene.render.resolution_x > scene.render.resolution_y:
        # The parent also delivers the events hero in landscape. Compose the
        # same physical chain across that frame, retaining the portrait setup.
        _camera((11, -6.2, 7.7), (0, -.50, .70), 44, 8)
    else:
        _camera((4, -11, 14), (0, -.30, .75), 84, 8)
    _light_grade(.52, .12)
    return {'subject': 'Amber and ivory dominoes on figured walnut',
            'duration': common.FRAMES / common.FPS,
            'motion': 'Contact-driven falling chain; a smooth second-half rewind restores every slab.'}


def _hub(name, location, chrome, dark, parent, radius=.105):
    """Turned universal-joint housing: bearing, annular races and socket bolt."""
    _parent(common.sphere(name + ' / bearing', location, radius, chrome,
                          scale=(1, .78, 1)), parent)
    x, y, z = location
    for side in (-1, 1):
        ring = common.ring(name + ' / machined race', (x, y + side * radius * .57, z),
                           radius * .74, .012, dark, (math.pi / 2, 0, 0))
        _parent(ring, parent)
        cap = common.cylinder(name + ' / recessed axle cap',
                              (x, y + side * radius * .70, z), radius * .48,
                              .016, chrome, (math.pi / 2, 0, 0))
        _parent(cap, parent)
        bolt = common.cylinder(name + ' / socket inset',
                               (x, y + side * radius * .79, z), radius * .15,
                               .004, dark, (math.pi / 2, 0, 0))
        _parent(bolt, parent)


def _strut(name, start, end, chrome, dark, parent, radius=.028):
    _rod(name + ' / rigid chrome shaft', start, end, radius, chrome, parent)
    start, end = Vector(start), Vector(end)
    axis = (end - start).normalized()
    for point, sign in ((start, 1), (end, -1)):
        a = point + axis * (sign * .085)
        b = point + axis * (sign * .165)
        _rod(name + ' / threaded end collar', a, b, radius * 1.70, dark, parent)
        # Thin polished bands catch traveling highlights as the joint turns.
        _rod(name + ' / turned collar lip', a, a + axis * (sign * .014),
             radius * 1.84, chrome, parent)


def _hinge_motion(obj, amplitude, phase, twist=.045):
    def pose(t):
        angle = TAU * t
        obj.rotation_euler = (twist * math.sin(angle + phase),
                              amplitude * math.sin(angle + phase),
                              .045 * math.sin(2 * angle + phase))
    common.keys(obj, pose, properties=('rotation_euler',))


def _advisors():
    common.studio(dark=False)
    chrome = _grain('Precision chrome / axial micro-brushing', (.36, .40, .44),
                     (.64, .69, .74), (140, 140, 1), .20, .98, .026, .0012)
    dark = _grain('Recessed titanium joint collars', (.055, .069, .075),
                   (.13, .16, .17), (80, 80, 1), .27, .88, .028, .001)
    stone = _grain('Warm limestone / microscopic pores', (.38, .35, .29),
                    (.62, .58, .49), (1, 1, 1), .53, bump=.12, distance=.009)
    common.box('Honed limestone mobile plinth', (0, .1, .20), (4.2, 3.4, .43), stone, .045)
    common.box('Recessed plinth shadow foot', (0, .1, -.01), (3.8, 3.0, .10), dark, .018)
    backdrop = common.material('Warm seamless studio backdrop', (.18, .17, .15), rough=.91)
    backdrop.node_tree.nodes.get('Principled BSDF').inputs['Coat Weight'].default_value = 0
    common.box('Full height matte studio wall', (0, 7, 7), (36, .20, 18), backdrop, 0)

    # One overhead suspension and a tree of pinned rigid triangular frames.
    # Shared hinge origins are exact; no rods stretch to fake a breathing form.
    anchor = (0, 0, 5.75)
    _rod('Single stainless suspension filament', (0, 0, 8.8), anchor,
         .010, chrome)
    common.cylinder('Suspension swivel / turned barrel', (0, 0, 5.91),
                    .078, .29, chrome)
    for z in (5.82, 5.86, 5.97, 6.01):
        common.ring('Swivel / lathed groove', (0, 0, z), .079, .004, dark)
    root = _empty('Mobile / upper universal joint', anchor)
    _hinge_motion(root, .075, 0, .045)
    _hub('Upper pivot', (0, 0, 0), chrome, dark, root, .14)

    # Intentionally asymmetric, tapered negative spaces rather than a ball grid.
    frames = [
        ((-.36, .04, -1.26), (-1.33, .10, -.61), (.93, -.12, -.52)),
        ((.44, -.08, -1.29), (-.86, .13, -.70), (1.22, .05, -.47)),
        ((-.17, .07, -1.31), (-1.09, -.08, -.43), (1.02, .16, -.78)),
    ]
    pivot = root
    for level, (bottom, left, right) in enumerate(frames):
        points = [(0, 0, 0), bottom, left, right]
        # Two rigid, open triangular cells meet at the same upper/lower bearings.
        for edge, (a, b) in enumerate(((0, 2), (2, 1), (1, 0), (0, 3), (3, 1))):
            _strut('Level %d / strut %d' % (level + 1, edge + 1),
                    points[a], points[b], chrome, dark, pivot,
                    .030 if edge == 2 else .024)
        for label, point in (('left', left), ('right', right)):
            _hub('Level %d / %s bearing' % (level + 1, label),
                 point, chrome, dark, pivot, .105)
            wing = _empty('Level %d / %s articulated outrigger' % (level + 1, label),
                          point, pivot)
            side = -1 if label == 'left' else 1
            tip = (side * (.48 if level == 1 else .38), -.07, -.46)
            brace = (side * .10, .06, -.66)
            for edge, (a, b) in enumerate((((0, 0, 0), tip), (tip, brace),
                                           (brace, (0, 0, 0)))):
                _strut('Outrigger %d %s / %d' % (level, label, edge),
                        a, b, chrome, dark, wing, .017)
            _hub('Outrigger tip bearing', tip, chrome, dark, wing, .073)
            # Flattened turned counterweight, distinctly machined rather than
            # an oversized decorative ball. Its center is supported by rods.
            weight = common.cylinder('Lenticular chrome balance weight', brace,
                                      .16 if level != 1 else .19, .065, chrome,
                                      (math.pi / 2, 0, 0))
            _parent(weight, wing)
            _parent(common.ring('Counterweight / recessed circumference', brace,
                                 .148 if level != 1 else .178, .008, dark,
                                 (math.pi / 2, 0, 0)), wing)
            _hinge_motion(wing, side * .20, level * .72 + side * .35, .035)

        next_pivot = _empty('Level %d / lower universal joint' % (level + 1), bottom, pivot)
        _hub('Level %d / central axle' % (level + 1), (0, 0, 0),
             chrome, dark, next_pivot, .15 if level == 1 else .12)
        # The concentric gimbal follows the actual joint, including in depth.
        _parent(common.ring('Central gimbal / polished outer race', (0, 0, 0),
                             .225 if level == 1 else .175, .023, chrome,
                             (math.pi / 2, 0, 0)), next_pivot)
        _hinge_motion(next_pivot, -.13 if level % 2 == 0 else .16,
                      .55 + level * .82, .055)
        pivot = next_pivot

    _rod('Lower trim weight / stem', (0, 0, 0), (0, 0, -.26), .024, dark, pivot)
    _parent(common.cylinder('Lower trim weight / turned chrome puck', (0, 0, -.32),
                            .22, .14, chrome), pivot)
    for z in (-.28, -.32, -.36):
        _parent(common.ring('Lower trim weight / concentric machining',
                             (0, 0, z), .221, .005, dark), pivot)

    # Physical studio cards and softboxes provide moving reflection bands as
    # the mechanism articulates; no emissive signal graphics or moving camera.
    flag = common.material('Black reflection flag fabric', (.007, .009, .010), rough=.91)
    card = common.material('White reflection card', (.83, .82, .77), rough=.86)
    common.box('Tall black reflection flag', (-4.4, 1.1, 4.1), (.13, 3.4, 8.0), flag, 0)
    common.box('Tall white bounce card', (4.9, 2.4, 4.0), (.10, 4.5, 8.0), card, 0)
    common.area('Mobile / slender chrome strip', (-3, -.5, 5), 950,
                (.84, .92, 1), .65, (0, 0, 3.5), 7)
    common.area('Mobile / warm vertical silk', (3.7, 1.0, 5), 1250,
                (1, .86, .67), 1.8, (0, 0, 3.5), 7)
    common.area('Mobile / overhead diffusion', (0, 0, 8.2), 850,
                (1, .97, .92), 4, (0, 0, 3.1), 3)
    _light_grade(.62, .22)
    _camera((4.3, -11.4, 6.0), (0, 0, 3.3), 106, 7.1)
    return {'subject': 'Articulated chrome network mobile with machined bearings',
            'duration': common.FRAMES / common.FPS,
            'motion': 'Coupled harmonic hinges breathe through rigid connected frames and traveling reflections.'}


def build(id):
    """Construct one scene in the caller's initialized Blender 4.5 scene."""
    builders = {'what-we-do': _go, 'events': _events, 'advisors': _advisors}
    if id not in builders:
        raise ValueError('Unsupported tabletop cinematic id: %r' % id)
    scene = bpy.context.scene
    scene.frame_start, scene.frame_end = 1, common.FRAMES
    scene.render.fps = common.FPS
    metadata = builders[id]()
    scene.frame_set(1)
    return metadata
