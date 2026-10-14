"""Giant-update character refinements (Blender 4.5, background). Imported by the existing builders.

- refine_nibble_face(): the mushnub's eyes sat high on the stem, under the cap overhang, so the 34 degree game camera
  saw the cap and not the face. The eye islands move down the stem (re-seated on its surface) and tilt 12 degrees up
  toward the camera. Weights, bones and clips are untouched.
- tornado_v2(): the Giant Tornado as a dark opaque dust core inside three nested translucent wind shells (FxAlpha,
  wind-streak sheet), a rolled storm lip, a debris band and the storm face. The pivots keep the names the view spins
  (FunnelTier0..4, DebrisRing0..2). The slate the view used to lerp in every frame is baked into the vertex colours.
Geometry is authored in metres, Z up, front -Y (the convention of build_carrot_models.py).
"""
import bpy, bmesh, math
from math import sin, cos, pi
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

# Camera direction seen from a creature walking toward the game camera (pitch 34 degrees, front -Y).
CAMERA = Vector((0, -math.cos(math.radians(34)), math.sin(math.radians(34))))


def _material_faces(o, names):
    idx = {i for i, m in enumerate(o.data.materials) if m and m.name in names}
    return [p for p in o.data.polygons if p.material_index in idx]


def _occluded_fraction(o, eye_verts, blockers):
    """Share of eye vertices whose ray toward the camera hits the blocking (cap) faces."""
    mw = o.matrix_world
    tris = [[(mw @ o.data.vertices[i].co) for i in p.vertices] for p in blockers]
    verts = [v for t in tris for v in t]
    polys = []
    k = 0
    for t in tris:
        polys.append(tuple(range(k, k + len(t)))); k += len(t)
    tree = BVHTree.FromPolygons(verts, polys)
    hit = 0
    for i in eye_verts:
        p = mw @ o.data.vertices[i].co
        loc, _, _, _ = tree.ray_cast(p + CAMERA * 1e-3, CAMERA)
        if loc is not None:
            hit += 1
    return hit / max(1, len(eye_verts))


def refine_nibble_face(meshes, report=None):
    """Lower and tilt the mushnub's eyes so the default camera sees the face. Returns the chosen drop (source units)."""
    o = next(m for m in meshes if any(mt and mt.name == 'Eye_White' for mt in m.data.materials))
    eye_faces = _material_faces(o, {'Eye_White', 'Eye_Black'})
    cap_faces = _material_faces(o, {'MushroomKing_Secondary'})
    stem_faces = _material_faces(o, {'MushroomKing_Main'})
    eye_verts = sorted({i for p in eye_faces for i in p.vertices})
    white_verts = sorted({i for p in _material_faces(o, {'Eye_White'}) for i in p.vertices})
    mw = o.matrix_world; inv = mw.inverted()
    # Stem surface in world space, for re-seating the eyes after the drop.
    sv = [mw @ o.data.vertices[i].co for p in stem_faces for i in p.vertices]
    sp = []; k = 0
    for p in stem_faces:
        sp.append(tuple(range(k, k + len(p.vertices)))); k += len(p.vertices)
    stem = BVHTree.FromPolygons(sv, sp)
    original = {i: o.data.vertices[i].co.copy() for i in eye_verts}
    before = _occluded_fraction(o, white_verts, cap_faces)
    height = max(v.z for v in sv) - min(v.z for v in sv)

    def place(drop):
        for side in (-1, 1):
            group = [i for i in eye_verts if (mw @ original[i]).x * side > 0]
            c = sum((mw @ original[i] for i in group), Vector()) / len(group)
            out = Vector((c.x, c.y, 0)).normalized()
            axis_hi = Vector((0, 0, c.z)); axis_lo = Vector((0, 0, c.z - drop))
            hi, _, _, _ = stem.ray_cast(axis_hi, out); lo, _, _, _ = stem.ray_cast(axis_lo, out)
            if hi is None or lo is None:
                raise RuntimeError('nibble stem ray missed')
            shift = lo - hi
            new_c = c + shift
            # Tilt the eye 12 degrees about its own horizontal axis so it faces up toward the camera.
            tilt = Matrix.Rotation(math.radians(-12), 4, out.cross(Vector((0, 0, 1))).normalized())
            for i in group:
                w = mw @ original[i] + shift
                w = tilt @ (w - new_c) + new_c
                o.data.vertices[i].co = inv @ w
        o.data.update()

    chosen = None
    for step in range(0, 13):
        drop = height * .02 * step
        place(drop)
        frac = _occluded_fraction(o, white_verts, cap_faces)
        if frac <= .01:
            chosen = (drop, frac)
            break
    if chosen is None:
        chosen = (drop, frac)
    # One more step of margin so walking bob and the idle squash never tuck the eyes back under the cap.
    final = chosen[0] + height * .02
    place(final)
    after = _occluded_fraction(o, white_verts, cap_faces)
    msg = 'NIBBLE_FACE drop=%.3f of height %.3f (%.1f%%) occluded before=%.3f after=%.3f' % (final, height, final / height * 100, before, after)
    print(msg, flush=True)
    if report is not None:
        report.update({'nibbleEyeDrop': round(final / height, 4), 'nibbleOccludedBefore': round(before, 4), 'nibbleOccludedAfter': round(after, 4)})
    return final


def _srgb2lin(c):
    return c / 12.92 if c <= .04045 else ((c + .055) / 1.055) ** 2.4


def _lin2srgb(c):
    return c * 12.92 if c <= .0031308 else 1.055 * c ** (1 / 2.4) - .055


# The view tinted the funnel with lerp(white, (.58,.64,.76), .75) every frame; baking it keeps the shipped colour.
_TINT = tuple(1 - .75 * (1 - t) for t in (.58, .64, .76))
SLATE = (.30, .33, .40); PALE = (.78, .82, .88)


def baked(z, z0=.05, z1=2.76, alpha=1.0, darken=1.0):
    t = max(0, min(1, (z - z0) / (z1 - z0)))
    srgb = [SLATE[k] + (PALE[k] - SLATE[k]) * t for k in range(3)]
    out = [_lin2srgb(_srgb2lin(srgb[k]) * _srgb2lin(_TINT[k]) * darken) for k in range(3)]
    return (out[0], out[1], out[2], alpha)


def funnel_radius(z, H=2.72):
    u = max(0, min(1, z / H))
    return .20 + 1.22 * u ** 1.55


def _shell(g, name, parent, scale, alpha, twist, material, rows=22, segments=40, lobes=5, phase=0.0, H=2.72):
    """Open, double-sided lathe with cylindrical UVs (mesh() writes u = angle, v = z); vertex alpha fades at the ground and the lip."""
    vs = []; fs = []
    for j in range(rows + 1):
        v = j / rows; z = .04 + v * (H - .04)
        r = funnel_radius(z, H) * scale
        for i in range(segments):
            a = 2 * pi * i / segments + twist * v
            rr = r * (1 + .07 * sin(a * lobes + phase + v * 5) + .03 * sin(a * 11 - v * 9 + phase))
            vs.append((rr * cos(a), rr * sin(a), z + .025 * sin(a * 3 + v * 7 + phase)))
    for j in range(rows):
        for i in range(segments):
            k = j * segments + i; n = j * segments + (i + 1) % segments
            fs.append((k, n, n + segments, k + segments))
    o = g.mesh(name, vs, fs, (1, 1, 1, 1), parent, material)
    col = o.data.color_attributes.get('Color')
    for poly in o.data.polygons:
        for li in poly.loop_indices:
            co = o.data.vertices[o.data.loops[li].vertex_index].co
            v = (co.z - .04) / (H - .04)
            fade = min(1, v / .10) * (1 - .55 * max(0, (v - .88) / .12))
            col.data[li].color = baked(co.z, alpha=alpha * fade)
    # Cylindrical UV seam: mesh() writes atan2-based u; re-write with wrap so the streak sheet tiles cleanly.
    uv = o.data.uv_layers.active
    for poly in o.data.polygons:
        us = []
        for li in poly.loop_indices:
            co = o.data.vertices[o.data.loops[li].vertex_index].co
            us.append(math.atan2(co.y, co.x) / (2 * pi) + .5)
        if max(us) - min(us) > .5:
            us = [u + 1 if u < .5 else u for u in us]
        for li, u in zip(poly.loop_indices, us):
            co = o.data.vertices[o.data.loops[li].vertex_index].co
            uv.data[li].uv = (u, (co.z - .04) / (H - .04))
    return o


def tornado_v2(g):
    """Giant Tornado v2. g is the build_carrot_models module (helpers, export)."""
    g.clear(); root = g.empty('tornado'); H = 2.72
    # FunnelTier0: the opaque dust column (casts the shadow, spins fastest).
    core = g.empty('FunnelTier0', root)
    # Open-topped column (no cap disc to catch the key light), closed at the ground, ending inside the inner shell.
    vs = []; fs = []; seg = 30; rows = 15
    for j in range(rows):
        u = j / (rows - 1); z = .03 + u * (H - .55)
        r = funnel_radius(z, H) * .46 * (1 + .05 * sin(u * 17))
        for i in range(seg):
            a = 2 * pi * i / seg; rr = r * (1 + .055 * cos(a * 6 + u * 4))
            vs.append((rr * cos(a), rr * sin(a), z))
    for j in range(rows - 1):
        for i in range(seg):
            k = j * seg + i; n = j * seg + (i + 1) % seg; fs.append((k, n, n + seg, k + seg))
    fs.append(tuple(range(seg - 1, -1, -1)))
    m = g.mesh('DustColumn', vs, fs, (1, 1, 1, 1), core, 'TornadoDust')
    col = m.data.color_attributes.get('Color')
    for poly in m.data.polygons:
        for li in poly.loop_indices:
            z = m.data.vertices[m.data.loops[li].vertex_index].co.z
            col.data[li].color = baked(z, darken=.5)
    for v in m.data.vertices:
        v.co.x += .02 * sin(v.co.z * 6.5); v.co.y += .02 * cos(v.co.z * 5.1)
    # FunnelTier1..3: nested wind shells (inner to outer), counter-rotated by the view; each a different twist and lobe count.
    for k, (scale, alpha, twist, lobes) in enumerate([(.72, .90, 2.4, 4), (.92, .78, -1.9, 5), (1.12, .62, 1.5, 7)]):
        tier = g.empty('FunnelTier%d' % (k + 1), root)
        _shell(g, 'WindShell', tier, scale, alpha, twist, 'TornadoShell%d' % (k + 1), lobes=lobes, phase=k * 1.7, H=H)
    # FunnelTier4: the rolled storm lip, a torus of cloud at the mouth.
    lip = g.empty('FunnelTier4', root)
    vs = []; fs = []; seg = 44; ring = 10; R = funnel_radius(H, H) * 1.08; rr = .16
    for i in range(seg):
        a = 2 * pi * i / seg
        for j in range(ring):
            b = 2 * pi * j / ring; wob = 1 + .18 * sin(a * 6 + j)
            x = (R + rr * wob * cos(b)) * cos(a); y = (R + rr * wob * cos(b)) * sin(a); z = H - .05 + rr * wob * sin(b)
            vs.append((x, y, z))
    for i in range(seg):
        for j in range(ring):
            a0 = i * ring + j; a1 = ((i + 1) % seg) * ring + j; b0 = i * ring + (j + 1) % ring; b1 = ((i + 1) % seg) * ring + (j + 1) % ring
            fs.append((a0, a1, b1, b0))
    o = g.mesh('StormLip', vs, fs, (1, 1, 1, 1), lip, 'TornadoShell4')
    c = o.data.color_attributes.get('Color')
    for poly in o.data.polygons:
        for li in poly.loop_indices:
            c.data[li].color = baked(H, alpha=.42)
    # Debris band: planks, pebbles, torn leaves and a pumpkin orbit inside the outer shell (same pieces as before).
    for i, (z, r) in enumerate([(.95, .70), (1.75, 1.02), (2.40, 1.30)]):
        dr = g.empty('DebrisRing%d' % i, root, (0, 0, z))
        for k in range(3):
            a = 2 * pi * k / 3 + i * .7
            b = g.box('Plank', (r * cos(a), r * sin(a), .05 * sin(k + i)), (.40, .085, .045), g.BARK, dr, .012, 'Bark'); b.rotation_euler = (.3 * sin(a), .4, a)
            g.ellipsoid('Pebble', ((r - .18) * cos(a + 1.1), (r - .18) * sin(a + 1.1), -.1 + .08 * k), (.07, .06, .05), g.STONE, dr, 8, 5, 'Stone')
            for q in range(3):
                aa = a + .35 + q * .4
                g.leaf('TornLeaf', ((r + .08) * cos(aa), (r + .08) * sin(aa), .1 * sin(q)), ((r + .26) * cos(aa + .3), (r + .26) * sin(aa + .3), .22 + .1 * sin(q)), .05,
                       [(.95, .45, .08, 1), (.88, .22, .08, 1), (.96, .70, .12, 1)][q], dr, .03, 'Petal', N=5)
        g.ellipsoid('Pumpkin', ((r - .05) * cos(i * 2.1 + .2), (r - .05) * sin(i * 2.1 + .2), .02), (.15, .15, .11), g.GOLD, dr, 14, 8, 'Metal')
    # The storm face rides the root (static yaw drift only) on the front (-Y), just inside the outer shell.
    ye = -(funnel_radius(2.42, H) * 1.02)
    for s in [-1, 1]:
        g.ellipsoid('StormSocket', (s * .46, ye + .10, 2.42), (.34, .14, .19), (.08, .07, .08, 1), root, 14, 8)
        e = g.ellipsoid('StormEye', (s * .44, ye, 2.42), (.28, .14, .14), (1, .55, .06, 1), root, 18, 10, 'Glow')
        cc = Vector((s * .44, ye, 2.42)); rot = Matrix.Rotation(s * .28, 4, 'Y')
        for v in e.data.vertices:
            v.co = rot @ (v.co - cc) + cc
        g.ellipsoid('StormEye', (s * .40, ye - .12, 2.38), (.07, .045, .06), (.18, .07, .02, 1), root, 8, 5, 'Glow')
    g.ellipsoid('StormMaw', (0, -(funnel_radius(2.16, H) * .99), 2.16), (.32, .11, .10), (.12, .09, .08, 1), root, 14, 8)
    # Lightning veins between the core and the inner shell.
    for i in range(5):
        a0 = 2 * pi * i / 5; pts = []
        for j in range(7):
            u = j / 6; z = .35 + u * 2.1; r = funnel_radius(z, H) * .60; a = a0 + u * 2.4 + .18 * sin(j * 1.7 + i)
            pts.append((r * cos(a), r * sin(a), z))
        g.tube('LightningVein', pts, [.010 + .005 * sin(j * 1.3) for j in range(7)], (1, .80, .35, 1), root, 5, 'Glow')
    g.export(root, 'tornado')
