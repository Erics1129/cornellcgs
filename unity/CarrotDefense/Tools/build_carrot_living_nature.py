"""Living-nature meshes for the giant update (Blender 4.5 background, original procedural work, no downloads).

Writes Nature/Source/<Name>.fbx; CarrotModels.Prepare turns them into Resources/Carrot/Nature/<Name>.prefab.
- TreeAutumn (replaces the blocky Kenney tree the orchard border already loads), TreeOak (garden/marsh) and TreePine (frost):
  stylized-real trees with a flared, curved trunk and real branches under opaque, lumpy leaf clumps (no alpha cards: MSAA 1
  and no TAA would shimmer). Bark uses the Poly Haven bark scan through the Bark material; leaves the Foliage material
  (translucency, wrap, sheen). Under 2.5k triangles each.
- Pumpkin, HayBale and CrateStack: the orchard props the view builds from primitives today, as ready meshes for it to place.
Every mesh stands on its pivot (base at z = 0, centred), front -Y, unit height for the trees (the view scales by height).

  Blender -b --factory-startup --python Tools/build_carrot_living_nature.py [-- names,comma,separated]
"""
import sys, os, math, random, json
sys.path.insert(0, os.path.dirname(__file__))
from build_carrot_models import *  # noqa: F401,F403  (helpers: clear, empty, mesh, tube, lathe, ellipsoid, box, join_parts, mat)
from mathutils import Vector, noise

NATURE = ROOT / 'Assets/Resources/Carrot/Nature/Source'
NATURE.mkdir(parents=True, exist_ok=True)
built = []


def lumpy_clump(name, center, radius, color, parent, seed, squash=.82, detail=3):
    """An icosphere leaf clump displaced by layered noise, coloured darker toward the canopy core and underside."""
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=detail, radius=1, location=(0, 0, 0))
    o = bpy.context.object; o.name = name
    rng = random.Random(seed)
    off = Vector((rng.uniform(-50, 50), rng.uniform(-50, 50), rng.uniform(-50, 50)))
    for v in o.data.vertices:
        d = v.co.normalized()
        n = noise.noise(d * 1.6 + off) * .22 + noise.noise(d * 3.4 + off * 1.7) * .09
        v.co = d * (1 + n)
        v.co.z *= squash
    for v in o.data.vertices:
        v.co = v.co * radius + Vector(center)
    o.parent = parent
    o.data.materials.append(mat('Foliage'))
    col = o.data.color_attributes.new(name='Color', type='FLOAT_COLOR', domain='CORNER')
    uv = o.data.uv_layers.new(name='UVMap')
    for p in o.data.polygons:
        p.use_smooth = True
        for li in p.loop_indices:
            co = o.data.vertices[o.data.loops[li].vertex_index].co
            rel = (co - Vector(center)) / radius
            light = .55 + .40 * max(0, min(1, rel.z * .55 + .55))  # sky-lit crown, shaded underside
            jitter = .92 + .16 * (noise.noise(co * 9 + off) * .5 + .5)
            col.data[li].color = tuple(min(1, c * light * jitter) for c in color[:3]) + (1,)
            uv.data[li].uv = (math.atan2(co.y - center[1], co.x - center[0]) / (2 * math.pi) + .5, (co.z - center[2]) / radius * .5 + .5)
    return o


def trunk(parent, H, lean, seed, bark):
    rng = random.Random(seed)
    pts = []; radii = []
    for j in range(8):
        u = j / 7; z = u * H * .62
        x = lean[0] * u * u * H + .015 * H * math.sin(u * 5 + seed); y = lean[1] * u * u * H
        pts.append((x, y, z)); radii.append(H * (.075 - .04 * u) * (1.55 if j == 0 else 1.15 if j == 1 else 1))
    t = tube('TreeTrunk', pts, radii, bark, parent, 10, 'Bark')
    # Root flare: five short lobes splaying into the ground.
    for k in range(5):
        a = 2 * math.pi * k / 5 + rng.uniform(-.3, .3)
        tube('TreeRoot', [(0, 0, H * .07), (math.cos(a) * H * .07, math.sin(a) * H * .07, H * .025), (math.cos(a) * H * .12, math.sin(a) * H * .12, -.005 * H)],
             [H * .04, H * .028, H * .016], bark, parent, 6, 'Bark')
    return pts[-1]


def broadleaf(name, palette, seed, H=1.0, clumps=7, squash=.8):
    clear(); root = empty(name); rng = random.Random(seed)
    bark = (.42, .30, .20, 1)
    top = trunk(root, H, (rng.uniform(-.05, .05), rng.uniform(-.04, .04)), seed, bark)
    tips = [Vector(top) + Vector((0, 0, H * .12))]
    for b in range(3):
        a = 2 * math.pi * b / 3 + rng.uniform(-.4, .4); z0 = H * rng.uniform(.38, .52)
        start = Vector((0, 0, z0)); out = Vector((math.cos(a), math.sin(a), 0))
        mid = start + out * H * .14 + Vector((0, 0, H * .10)); end = start + out * H * .26 + Vector((0, 0, H * .22))
        tube('TreeBranch', [tuple(start), tuple(mid), tuple(end)], [H * .03, H * .02, H * .008], bark, root, 6, 'Bark')
        tips.append(end)
    centers = []
    for k in range(clumps):
        base = tips[k % len(tips)]
        c = base + Vector((rng.uniform(-.08, .08), rng.uniform(-.08, .08), rng.uniform(.02, .12))) * H
        centers.append(c)
    canopy = sum(centers, Vector()) / len(centers)
    for k, c in enumerate(centers):
        r = H * rng.uniform(.19, .25) * (1.2 if k == 0 else 1)
        lumpy_clump('LeafClump', tuple(c), r, palette[k % len(palette)], root, seed * 31 + k, squash)
    export_nature(root, name)


def pine(name, seed, H=1.0):
    clear(); root = empty(name); rng = random.Random(seed)
    bark = (.36, .26, .19, 1)
    tube('TreeTrunk', [(0, 0, 0), (0, 0, H * .3), (0, 0, H * .9)], [H * .06, H * .045, H * .015], bark, root, 8, 'Bark')
    for k in range(5):
        a = 2 * math.pi * k / 5
        tube('TreeRoot', [(0, 0, H * .05), (math.cos(a) * H * .08, math.sin(a) * H * .08, H * .01)], [H * .03, H * .008], bark, root, 6, 'Bark')
    greens = [(.10, .25, .16, 1), (.12, .29, .18, 1), (.09, .22, .15, 1)]
    for t in range(4):
        z = H * (.22 + t * .19); r = H * (.36 - t * .075)
        # A drooping, lumpy skirt of needles per tier.
        lumpy_clump('NeedleTier', (0, 0, z), r, greens[t % 3], root, seed * 7 + t, squash=.48, detail=3)
    lumpy_clump('NeedleTip', (0, 0, H * .93), H * .09, greens[0], root, seed + 99, squash=1.3, detail=2)
    export_nature(root, name)


def pumpkin(name='Pumpkin', seed=4):
    clear(); root = empty(name); rng = random.Random(seed)
    rows = []
    for j in range(13):
        v = j / 12; th = math.pi * v
        rows.append((.5 * math.sin(th) * (1 + .05 * math.sin(th * 2)), .38 * (1 - math.cos(th))))
    vs = []; fs = []; seg = 40
    for j, (r, z) in enumerate(rows):
        for i in range(seg):
            a = 2 * math.pi * i / seg
            groove = abs(math.sin(a * 4)) ** .6  # eight lobes with soft grooves
            rr = r * (.9 + .1 * groove)
            vs.append((rr * math.cos(a), rr * math.sin(a), z * (1 - .04 * (1 - groove))))
    for j in range(len(rows) - 1):
        for i in range(seg):
            k = j * seg + i; n = j * seg + (i + 1) % seg; fs.append((k, n, n + seg, k + seg))
    o = mesh('PumpkinBody', vs, fs, (1, 1, 1, 1), root, 'Gourd')
    col = o.data.color_attributes.get('Color')
    for p in o.data.polygons:
        for li in p.loop_indices:
            co = o.data.vertices[o.data.loops[li].vertex_index].co
            a = math.atan2(co.y, co.x); groove = abs(math.sin(a * 4)) ** .6
            shade = .72 + .28 * groove
            col.data[li].color = (min(1, .93 * shade), .45 * shade, .10 * shade, 1)
    tube('PumpkinStem', [(0, 0, .70), (.02, .01, .80), (.07, .03, .86), (.10, .02, .85)], [.055, .045, .035, .02], (.36, .40, .17, 1), root, 7, 'Bark')
    leaf('PumpkinLeaf', (.03, 0, .74), (.32, -.14, .70), .13, (.24, .42, .12, 1), root, .05, 'Foliage')
    export_nature(root, name)


def haybale(name='HayBale', seed=8):
    clear(); root = empty(name); rng = random.Random(seed)
    vs = []; fs = []; seg = 36; rows = 10; R = .30; L = .62
    for j in range(rows + 1):
        u = j / rows
        for i in range(seg):
            a = 2 * math.pi * i / seg
            n = noise.noise(Vector((math.cos(a) * 3, math.sin(a) * 3, u * 6))) * .025
            edge = 1 - .08 * (abs(u - .5) * 2) ** 6
            vs.append(((u - .5) * L, (R + n) * edge * math.cos(a), R + (R + n) * edge * math.sin(a)))
    for j in range(rows):
        for i in range(seg):
            k = j * seg + i; nn = j * seg + (i + 1) % seg; fs.append((k, nn, nn + seg, k + seg))
    for side in (0, rows):
        ring = [side * seg + i for i in range(seg)]
        fs.append(tuple(ring if side else reversed(ring)))
    o = mesh('HayBody', vs, fs, (1, 1, 1, 1), root, 'Straw')
    col = o.data.color_attributes.get('Color')
    for p in o.data.polygons:
        for li in p.loop_indices:
            co = o.data.vertices[o.data.loops[li].vertex_index].co
            f = noise.noise(co * 14) * .5 + .5
            col.data[li].color = (.78 * (.86 + .2 * f), .64 * (.86 + .2 * f), .28 * (.8 + .3 * f), 1)
    for x in (-.17, .17):
        tube('HayTwine', [(x, R * 1.02 * math.cos(a), R + R * 1.02 * math.sin(a)) for a in [2 * math.pi * k / 24 for k in range(25)]], .012, (.35, .25, .14, 1), root, 5, 'Bark')
    export_nature(root, name)


def cratestack(name='CrateStack', seed=11):
    clear(); root = empty(name); rng = random.Random(seed)
    wood = (.60, .44, .27, 1)
    def crate(c, s, yaw):
        g = empty('Crate', root, c); g.rotation_euler = (0, 0, math.radians(yaw))
        for k in range(4):
            box('CratePlank', (0, -s / 2, -s / 2 + s * (k + .5) / 4), (s * 1.0, s * .06, s * .23), wood, g, 0, 'Bark')
            box('CratePlank', (0, s / 2, -s / 2 + s * (k + .5) / 4), (s * 1.0, s * .06, s * .23), wood, g, 0, 'Bark')
            box('CratePlank', (-s / 2, 0, -s / 2 + s * (k + .5) / 4), (s * .06, s * .9, s * .23), wood, g, 0, 'Bark')
            box('CratePlank', (s / 2, 0, -s / 2 + s * (k + .5) / 4), (s * .06, s * .9, s * .23), wood, g, 0, 'Bark')
        box('CrateLid', (0, 0, s / 2), (s * .96, s * .96, s * .05), (.52, .37, .22, 1), g, 0, 'Bark')
        for cx in (-1, 1):
            for cy in (-1, 1):
                box('CratePost', (cx * s * .47, cy * s * .47, 0), (s * .08, s * .08, s * 1.02), (.45, .31, .18, 1), g, 0, 'Bark')
    crate((0, 0, .2), .4, 0); crate((.43, .06, .2), .4, 14); crate((.2, .03, .59), .38, -9)
    export_nature(root, name)


def export_nature(root, name):
    join_parts()
    for o in bpy.context.scene.objects:
        if o.type == 'MESH':
            hard = o.name.startswith('Crate')  # planked boxes keep crisp edges
            for p in o.data.polygons:
                p.use_smooth = not hard
    bpy.ops.object.select_all(action='SELECT')
    for o in list(bpy.context.selected_objects):
        if o.type not in {'MESH', 'EMPTY'}:
            o.select_set(False)
    path = NATURE / (name + '.fbx')
    bpy.ops.export_scene.fbx(filepath=str(path), use_selection=True, object_types={'EMPTY', 'MESH'}, axis_forward='-Z', axis_up='Y', bake_anim=False, add_leaf_bones=False, colors_type='SRGB', mesh_smooth_type='FACE')
    tri = sum(len(p.vertices) - 2 for o in bpy.context.scene.objects if o.type == 'MESH' for p in o.data.polygons)
    built.append({'name': name, 'triangles': tri, 'generator': 'Tools/build_carrot_living_nature.py', 'licence': 'original work (project licence)'})
    print('LIVING_NATURE', name, 'triangles', tri, flush=True)


if __name__ == '__main__':
    only = sys.argv[sys.argv.index('--') + 1].split(',') if '--' in sys.argv else None
    jobs = {
        'TreeAutumn': lambda: broadleaf('TreeAutumn', [(.88, .34, .05, 1), (.92, .50, .06, 1), (.62, .16, .06, 1), (.82, .40, .06, 1)], 21),
        'TreeOak': lambda: broadleaf('TreeOak', [(.18, .42, .08, 1), (.25, .50, .10, 1), (.14, .34, .07, 1)], 33),
        'TreePine': lambda: pine('TreePine', 5),
        'Pumpkin': pumpkin, 'HayBale': haybale, 'CrateStack': cratestack,
    }
    for name, job in jobs.items():
        if only is None or name in only:
            job()
    manifest = ROOT / 'Tools/living-nature-manifest.json'
    old = json.loads(manifest.read_text()) if manifest.exists() else []
    names = {b['name'] for b in built}
    manifest.write_text(json.dumps([m for m in old if m['name'] not in names] + built, indent=2) + '\n')
