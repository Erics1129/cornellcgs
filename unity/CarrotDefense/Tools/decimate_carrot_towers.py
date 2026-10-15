"""Download budget for the tower tiers (giant update): the heaviest tiers carried 20-42k triangles for a model that is at most
~150 px tall on screen, and the towers were 64 % of all vertex data in the build. This pass re-exports any tower tier above BUDGET
triangles with every mesh part decimated (Blender collapse, attributes kept) toward the budget, leaving parts under 400 triangles,
the hierarchy, the pivot empties the view animates and every transform untouched.

  Blender -b --factory-startup --python Tools/decimate_carrot_towers.py [-- names,comma,separated]

Reads and writes Assets/Resources/Carrot/Models/Source/<kind>-<tier>.fbx in place (the builders remain the source of the full
geometry; run this after them). Results: Tools/tower-decimation-manifest.json.
"""
import bpy, sys, json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'Assets/Resources/Carrot/Models/Source'
BUDGET = 12000
FLOOR = .30  # never collapse a part below 30 % of its faces: thin petals and rims tear beyond that
KINDS = ["seed", "frost", "mortar", "prism", "storm", "blossom", "starfruit", "gravity", "book", "thunder",
         "bamboo", "chili", "lotus", "magnet", "orchid", "mushroom", "cactus", "clockflower", "dragonfruit", "moonflower"]


def triangles(objs):
    return sum(len(p.vertices) - 2 for o in objs for p in o.data.polygons)


def main():
    only = sys.argv[sys.argv.index('--') + 1].split(',') if '--' in sys.argv else None
    manifest_path = ROOT / 'Tools/tower-decimation-manifest.json'
    manifest = {m['name']: m for m in (json.loads(manifest_path.read_text()) if manifest_path.exists() else [])}
    for kind in KINDS:
        for tier in range(1, 6):
            name = '%s-%d' % (kind, tier)
            path = SOURCE / (name + '.fbx')
            if not path.exists() or (only and name not in only and kind not in only):
                continue
            bpy.ops.wm.read_factory_settings(use_empty=True)
            bpy.ops.import_scene.fbx(filepath=str(path))
            meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
            before = triangles(meshes)
            if before <= BUDGET:
                continue
            # Spend the budget where the triangles are: small parts keep their detail, big parts shrink toward the target.
            small = sum(len(p.vertices) - 2 for o in meshes for p in o.data.polygons if triangles([o]) < 400)
            ratio = max(FLOOR, (BUDGET - small) / max(1, before - small))
            for o in meshes:
                if triangles([o]) < 400:
                    continue
                bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
                mod = o.modifiers.new('Tower budget', 'DECIMATE'); mod.decimate_type = 'COLLAPSE'; mod.ratio = ratio; mod.use_collapse_triangulate = False
                bpy.ops.object.modifier_apply(modifier=mod.name)
            after = triangles(meshes)
            bpy.ops.object.select_all(action='SELECT')
            for o in list(bpy.context.selected_objects):
                if o.type not in {'MESH', 'EMPTY', 'ARMATURE'}:
                    o.select_set(False)
            # Same convention as build_carrot_models.export (Y up, -Z forward, sRGB vertex colours, face smoothing).
            bpy.ops.export_scene.fbx(filepath=str(path), use_selection=True, object_types={'EMPTY', 'MESH'}, axis_forward='-Z', axis_up='Y',
                                     add_leaf_bones=False, bake_anim=False, mesh_smooth_type='FACE', use_mesh_modifiers=True, colors_type='SRGB')
            manifest[name] = {'name': name, 'trianglesBefore': before, 'trianglesAfter': after, 'ratio': round(ratio, 3)}
            print('TOWER_DECIMATED', name, before, '->', after, 'ratio', round(ratio, 3), flush=True)
    manifest_path.write_text(json.dumps(sorted(manifest.values(), key=lambda m: m['name']), indent=1) + '\n')


main()
