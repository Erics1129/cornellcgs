"""Original animated metallic voxel logo, rendered from real moving geometry.

Blender -b -t 6 --python scripts/render-voxel-logo.py -- --size 640 --frames 96
python scripts/render-voxel-logo.py --encode (requires Pillow)
"""
from pathlib import Path
import argparse, json, math, random, sys, time
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'output/voxel-logo'
PUBLIC = ROOT / 'public/assets/brand'
FPS = 24


def encode_small(destination=PUBLIC):
    """A separate tiny stream avoids decoding 640px animation in a nav mark."""
    from PIL import Image
    paths=sorted((OUT/'frames').glob('frame-*.png'))
    frames=[Image.open(path).convert('RGBA').resize((160,160),Image.Resampling.LANCZOS) for path in paths]
    durations=[round((i+1)*1000/FPS)-round(i*1000/FPS) for i in range(len(frames))]
    destination.mkdir(parents=True,exist_ok=True)
    frames[0].save(destination/'voxel-cube-small.webp',format='WEBP',quality=94,method=6)
    frames[0].save(destination/'voxel-cube-motion-small.webp',format='WEBP',save_all=True,append_images=frames[1:],duration=durations,loop=0,quality=86,method=4,minimize_size=False)
    print('VOXEL_NAV_COMPLETE',(destination/'voxel-cube-motion-small.webp').stat().st_size,flush=True)


def encode():
    from PIL import Image, ImageChops, ImageStat
    manifest = json.loads((OUT/'manifest.json').read_text())
    paths = sorted((OUT/'frames').glob('frame-*.png'))
    assert len(paths) == manifest['frames']
    frames = [Image.open(path).convert('RGBA') for path in paths]
    assert all(frame.size == (manifest['size'], manifest['size']) for frame in frames)
    assert all(frame.getextrema()[3][0] == 0 for frame in frames), 'Transparent background required'
    PUBLIC.mkdir(parents=True, exist_ok=True)
    staging=OUT/'encoded';staging.mkdir(parents=True,exist_ok=True)
    durations = [round((i+1)*1000/FPS)-round(i*1000/FPS) for i in range(len(frames))]
    frames[0].save(staging/'voxel-cube.webp',format='WEBP',quality=94,method=6)
    frames[0].save(staging/'voxel-cube-motion.webp',format='WEBP',save_all=True,append_images=frames[1:],duration=durations,loop=0,quality=83,method=4,minimize_size=False)
    with Image.open(staging/'voxel-cube-motion.webp') as check:
        assert check.n_frames == len(frames) and check.info['loop'] == 0
        assert check.size == frames[0].size
    changes = [sum(ImageStat.Stat(ImageChops.difference(frames[0].convert('RGB'), frames[i].convert('RGB'))).mean)/3 for i in [len(frames)//4,len(frames)//2,3*len(frames)//4]]
    assert all(delta > 1 for delta in changes), changes
    encode_small(staging)
    with Image.open(staging/'voxel-cube-motion-small.webp') as check:
        assert check.n_frames==len(frames) and check.size==(160,160)
        assert check.convert('RGBA').getextrema()[3][0]==0
    # All encodes finish first. Each replacement is atomic, so a browser can
    # never encounter a partially-written logo during a local preview/deploy.
    for name in ['voxel-cube.webp','voxel-cube-motion.webp','voxel-cube-small.webp','voxel-cube-motion-small.webp']:
        (staging/name).replace(PUBLIC/name)
    manifest.update({'poster':'/assets/brand/voxel-cube.webp','animation':'/assets/brand/voxel-cube-motion.webp','duration_ms':sum(durations),'poster_bytes':(PUBLIC/'voxel-cube.webp').stat().st_size,'animation_bytes':(PUBLIC/'voxel-cube-motion.webp').stat().st_size,'sampled_frame_mean_differences':changes})
    (OUT/'manifest.json').write_text(json.dumps(manifest,indent=2))
    print('VOXEL_ENCODE_COMPLETE', json.dumps(manifest),flush=True)


def render(args):
    import bpy
    from mathutils import Vector
    bpy.ops.wm.read_factory_settings(use_empty=True)
    random.seed(7843)
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_EEVEE_NEXT'
    scene.eevee.taa_render_samples = args.samples
    scene.eevee.use_raytracing = True
    scene.eevee.ray_tracing_options.resolution_scale = '2'
    scene.render.resolution_x = scene.render.resolution_y = args.size
    scene.render.resolution_percentage = 100
    scene.render.fps = FPS
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.image_settings.compression = 15
    scene.render.use_persistent_data = True
    scene.render.use_motion_blur = True
    scene.render.motion_blur_shutter = .18
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.look = 'AgX - Medium High Contrast'
    scene.world = bpy.data.worlds.new('Cool studio environment')
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs[0].default_value = (.14,.20,.32,1)
    scene.world.node_tree.nodes['Background'].inputs[1].default_value = .45

    def material(name,color,metal=.82,rough=.25,emission=0):
        mat=bpy.data.materials.new(name);mat.use_nodes=True
        bs=mat.node_tree.nodes.get('Principled BSDF')
        bs.inputs['Base Color'].default_value=(*color,1)
        bs.inputs['Metallic'].default_value=metal;bs.inputs['Roughness'].default_value=rough
        bs.inputs['Coat Weight'].default_value=.22
        if emission:
            bs.inputs['Emission Color'].default_value=(*color,1);bs.inputs['Emission Strength'].default_value=emission
        return mat
    metals=[material('Midnight titanium %02d'%i,(.035+i*.008,.064+i*.011,.11+i*.015),.86,.23+i*.008) for i in range(5)]
    ice=material('White-blue optical core',(.46,.76,1),.24,.18,5.8)
    amber=material('Warm optical core', (1,.40,.055),.20,.19,4.0)
    inner=material('Recessed inner chassis',(.015,.035,.065),.55,.32)
    def cube(name,loc,size,mat,bevel=.012):
        bpy.ops.mesh.primitive_cube_add(size=size,location=loc)
        obj=bpy.context.object;obj.name=name;obj.data.materials.append(mat)
        bevel_mod=obj.modifiers.new('Precision chamfer','BEVEL');bevel_mod.width=bevel;bevel_mod.segments=3
        obj.modifiers.new('Weighted machined normals','WEIGHTED_NORMAL')
        return obj
    chassis=cube('Recessed continuous chassis',(0,0,0),1.95,inner,.04)
    cells=[];colored=[];step=.365;grid=7
    for x in range(-3,4):
        for y in range(-3,4):
            for z in range(-3,4):
                if max(abs(x),abs(y),abs(z)) != 3:continue
                base=Vector((x*step,y*step,z*step))
                normal=Vector((math.copysign(1,x) if abs(x)==3 else 0,math.copysign(1,y) if abs(y)==3 else 0,math.copysign(1,z) if abs(z)==3 else 0)).normalized()
                phase=(x*.73+y*.48+z*.67)+random.uniform(-.6,.6)
                offset=random.uniform(-.025,.052)
                amplitude=random.uniform(.035,.115)
                luminous=random.random()<.09
                warm=luminous and random.random()<.22
                mat=(amber if warm else ice) if luminous else random.choice(metals)
                # Some tiles subdivide into four inset voxels, giving varied scale
                # without losing the recognizable cube silhouette at nav size.
                divided=not luminous and random.random()<.18 and sum(abs(n)>0 for n in normal)==1
                objects=[]
                if divided:
                    axes=[i for i,n in enumerate(normal) if n==0]
                    for a in [-1,1]:
                        for b in [-1,1]:
                            sub=Vector((0,0,0));sub[axes[0]]=a*step*.245;sub[axes[1]]=b*step*.245
                            obj=cube('Subvoxel %d %d %d %d %d'%(x,y,z,a,b),base+sub,step*.456,mat,.007)
                            objects.append((obj,base+sub))
                else:
                    obj=cube('Voxel %d %d %d'%(x,y,z),base,step*(.68 if luminous else .915),mat)
                    objects.append((obj,base))
                for obj,origin in objects:
                    cells.append((obj,origin.copy(),normal.copy(),phase+random.uniform(-.25,.25),offset,amplitude))
                    if not luminous:
                        # Unique material colors preserve simultaneous spatial
                        # regions; the lighting and metal response stay physical.
                        gradient=mat.copy();gradient.name='Spatial gradient / '+obj.name
                        obj.data.materials[0]=gradient
                        colored.append((gradient.node_tree.nodes['Principled BSDF'].inputs['Base Color'],origin.copy()))
                if not luminous and random.random()<.14:
                    core=cube('Inset luminous seam %d %d %d'%(x,y,z),base-normal*.11,step*.74,ice if random.random()<.86 else amber,.01)
    def area(name,loc,energy,color,size,target=(0,0,0)):
        data=bpy.data.lights.new(name,'AREA');data.energy=energy;data.color=color;data.shape='DISK';data.size=size
        obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj);obj.location=loc
        obj.rotation_euler=(Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()
    area('Large white overhead softbox',(-3,-4,6),1100,(.84,.92,1),4)
    area('Cool reflected edge',(4,1,3),1450,(.36,.65,1),3)
    area('Front silver strip',(1,-5,1),620,(.70,.86,1),2.5)
    area('Sparse warm reflection',(-4,1,0),280,(1,.42,.15),2)
    camera_data=bpy.data.cameras.new('Logo product lens');camera=bpy.data.objects.new('Logo product camera',camera_data);scene.collection.objects.link(camera)
    camera_data.type='ORTHO';camera_data.ortho_scale=4.42;scene.camera=camera
    def linear_to_oklab(rgb):
        r,g,b=rgb
        l=(.4122214708*r+.5363325363*g+.0514459929*b)**(1/3)
        m=(.2119034982*r+.6806995451*g+.1073969566*b)**(1/3)
        s=(.0883024619*r+.2817188376*g+.6299787005*b)**(1/3)
        return (.2104542553*l+.7936177850*m-.0040720468*s,1.9779984951*l-2.4285922050*m+.4505937099*s,.0259040371*l+.7827717662*m-.8086757660*s)
    def oklab_to_linear(lab):
        L,a,b=lab
        l=(L+.3963377774*a+.2158037573*b)**3
        m=(L-.1055613458*a-.0638541728*b)**3
        s=(L-.0894841775*a-1.2914855480*b)**3
        return tuple(max(0,min(1,c)) for c in (4.0767416621*l-3.3077115913*m+.2309699292*s,-1.2684380046*l+2.6097574011*m-.3413193965*s,-.0041960863*l-.7034186147*m+1.7076147010*s))
    palette=[linear_to_oklab(c) for c in [(.035,.46,.58),(.055,.29,.66),(.20,.10,.58),(.47,.065,.55)]]
    def spatial_color(base,phase):
        screen_x=(.80*base.x+.60*base.y)/1.54
        height=base.z/1.095
        coordinate=.50+.28*screen_x-.20*height
        coordinate+=.20*math.sin(phase-screen_x*1.15+height*.60)+.055*math.sin(2*phase+base.y*.75)
        position=max(0,min(.999999,coordinate))*(len(palette)-1)
        index=int(position);mix=position-index;mix=mix*mix*(3-2*mix)
        lab=tuple(a+(b-a)*mix for a,b in zip(palette[index],palette[index+1]))
        return (*oklab_to_linear(lab),1)
    def pose(frame):
        phase=2*math.pi*(frame-1)/args.frames
        for obj,base,normal,shift,offset,amplitude in cells:
            wave=.5+.5*math.sin(phase+shift)
            fine=.5+.5*math.sin(2*phase+shift*1.4)
            obj.location=base+normal*(offset+amplitude*wave+.025*fine)
            obj.scale=(1,1,1)
        for socket,base in colored:socket.default_value=spatial_color(base,phase)
        angle=phase
        camera.location=(5.7+.15*math.sin(angle),-7.5+.12*math.cos(angle),5.4+.09*math.sin(angle))
        camera.rotation_euler=(Vector((0,0,.02))-camera.location).to_track_quat('-Z','Y').to_euler()
    # Geometry and camera transforms are keyed into the saved reproducible scene.
    for frame in range(1,args.frames+2,3):
        pose(frame)
        for obj,*_ in cells:obj.keyframe_insert('location',frame=frame)
        for socket,_ in colored:socket.keyframe_insert('default_value',frame=frame)
        camera.keyframe_insert('location',frame=frame);camera.keyframe_insert('rotation_euler',frame=frame)
    scene.frame_start=1;scene.frame_end=args.frames
    scene.use_nodes=True;tree=scene.node_tree;tree.nodes.clear()
    render_layer=tree.nodes.new('CompositorNodeRLayers')
    glow=tree.nodes.new('CompositorNodeGlare');glow.glare_type='FOG_GLOW';glow.quality='HIGH';glow.threshold=1.4;glow.size=7
    tree.links.new(render_layer.outputs['Image'],glow.inputs['Image'])
    # Preserve a transparent silhouette; faint bloom belongs to the actual voxel
    # surfaces instead of adding an opaque rectangular background to the logo.
    alpha=tree.nodes.new('CompositorNodeSetAlpha');alpha.mode='REPLACE_ALPHA'
    tree.links.new(glow.outputs['Image'],alpha.inputs['Image']);tree.links.new(render_layer.outputs['Alpha'],alpha.inputs['Alpha'])
    output=tree.nodes.new('CompositorNodeComposite');tree.links.new(alpha.outputs['Image'],output.inputs['Image'])
    OUT.mkdir(parents=True,exist_ok=True);(OUT/'frames').mkdir(exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'voxel-logo.blend'))
    start=time.monotonic()
    for frame in range(1,args.frames+1):
        path=OUT/'frames'/f'frame-{frame:04d}.png'
        if args.resume and path.exists():continue
        scene.frame_set(frame);pose(frame);scene.render.filepath=str(path);bpy.ops.render.render(write_still=True)
        print('VOXEL_FRAME',frame,args.frames,round(time.monotonic()-start,2),flush=True)
    color_samples=[{'position':list(base),'color_start':list(spatial_color(base,0)),'color_quarter_cycle':list(spatial_color(base,math.pi/2)),'color_loop_endpoint':list(spatial_color(base,math.tau))} for _,base in colored]
    assert len(cells)==278,'Keep the approved geometry unchanged'
    assert all(max(abs(a-b) for a,b in zip(sample['color_start'],sample['color_loop_endpoint']))<1e-6 for sample in color_samples)
    manifest={'size':args.size,'frames':args.frames,'fps':FPS,'duration_seconds':args.frames/FPS,'samples':args.samples,'geometry':'Original beveled metallic voxel shell, independent wave-driven extrusions, recessed emissive blue-white and sparse amber cores','color':'Simultaneous cyan/icy-blue upper-left and violet lower-right material regions, with a spatially phased migrating palette wave interpolated in OKLab; sparse warm optical cores stay distinct','colored_blocks':len(colored),'animated_objects':len(cells),'native_render':True,'transparent':True,'seed':7843,'render_seconds':round(time.monotonic()-start,2)}
    (OUT/'color-verification.json').write_text(json.dumps(color_samples,indent=2))
    (OUT/'manifest.json').write_text(json.dumps(manifest,indent=2));print('VOXEL_RENDER_COMPLETE',json.dumps(manifest),flush=True)

if __name__=='__main__':
    args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else sys.argv[1:]
    parser=argparse.ArgumentParser();parser.add_argument('--encode',action='store_true');parser.add_argument('--size',type=int,default=640);parser.add_argument('--frames',type=int,default=96);parser.add_argument('--samples',type=int,default=24);parser.add_argument('--resume',action='store_true');options=parser.parse_args(args)
    encode() if options.encode else render(options)
