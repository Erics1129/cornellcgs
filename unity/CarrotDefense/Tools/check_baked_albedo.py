"""Acceptance check: the albedo baked into the Giant Tornado and the Gravewalker Zombie matches what the view used to lerp in.

Run in Blender 4.5 background:
  Blender -b --factory-startup --python Tools/check_baked_albedo.py -- <old tornado.fbx> <new tornado.fbx> <zombie.fbx>
Old tornado: area-weighted mean of the funnel tiers' decoded vertex colour times the view tint lerp(white,(.58,.64,.76),.75).
New tornado: area-weighted mean of the core and wind shells' decoded vertex colour (the FxAlpha sheet is white, so the
vertex colour is the albedo). Zombie: Organic (hide) vertex colour times the old tint versus times the baked
ZombieHideTint texel (159,175,144). Differences are reported as OKLab Delta E; the gate is 0.03.
"""
import bpy, sys, math

def s2l(c): return c / 12.92 if c <= .04045 else ((c + .055) / 1.055) ** 2.4
def oklab(rgb):
    r, g, b = rgb
    l = .4122214708 * r + .5363325363 * g + .0514459929 * b; m = .2119034982 * r + .6806995451 * g + .1073969566 * b; s = .0883024619 * r + .2817188376 * g + .6299787005 * b
    l, m, s = [x ** (1 / 3) for x in (l, m, s)]
    return (.2104542553 * l + .7936177850 * m - .0040720468 * s, 1.9779984951 * l - 2.4285922050 * m + .4505937099 * s, .0259040371 * l + .7827717662 * m - .8086757660 * s)
def de(a, b): return math.dist(oklab(a), oklab(b))

def mean_color(path, keep):
    bpy.ops.wm.read_factory_settings(use_empty=True); bpy.ops.import_scene.fbx(filepath=path)
    acc = [0, 0, 0]; area = 0
    for o in bpy.context.scene.objects:
        if o.type != 'MESH' or not keep(o): continue
        me = o.data; col = me.color_attributes[0] if len(me.color_attributes) else None
        if col is None: continue
        for p in me.polygons:
            a = p.area
            c = [0, 0, 0]
            for li in p.loop_indices:
                v = col.data[li].color
                for k in range(3): c[k] += s2l(v[k]) / len(p.loop_indices)
            for k in range(3): acc[k] += c[k] * a
            area += a
    return [x / area for x in acc]

args = sys.argv[sys.argv.index('--') + 1:]
tint = [s2l(1 - .75 * (1 - t)) for t in (.58, .64, .76)]
def in_tier(o):
    p = o
    while p is not None:
        if p.name.startswith('FunnelTier'): return True
        p = p.parent
    return False
old = mean_color(args[0], in_tier); old = [old[k] * tint[k] for k in range(3)]
new = mean_color(args[1], in_tier)
d1 = de(old, new)
print('TORNADO_ALBEDO old=%s new=%s dE=%.4f' % ([round(x, 4) for x in old], [round(x, 4) for x in new], d1))
z = mean_color(args[2], lambda o: any(m and m.name == 'Organic' for m in o.data.materials))
zt = [s2l(1 - .7 * (1 - t)) for t in (.46, .55, .38)]; zb = [s2l(v / 255) for v in (159, 175, 144)]
d2 = de([z[k] * zt[k] for k in range(3)], [z[k] * zb[k] for k in range(3)])
print('ZOMBIE_ALBEDO dE=%.4f' % d2)
print('BAKED_ALBEDO_CHECK', 'PASS' if d1 <= .03 and d2 <= .03 else 'FAIL')
