"""Native 4K physically animated subpage films. Blender4.5+: -- --scene ml-process --preview."""
import bpy,sys,os,math,json,time,importlib,argparse,struct
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts/cinematic'))
from common import FPS,FRAMES
IDS=['who-we-are','what-we-do','ml-process','events','world','people','advisors','join','contact']
LANDSCAPE={'events'}
OUT=ROOT/'output/cinematic-v3';PUBLIC=ROOT/'public/assets/page-scenes'

def faststart(path):
    data=path.read_bytes()
    def atoms(buf,start=0,end=None):
        end=len(buf) if end is None else end;c=start
        while c+8<=end:
            n,k=struct.unpack_from('>I4s',buf,c);h=8
            if n==1:n=struct.unpack_from('>Q',buf,c+8)[0];h=16
            if n==0:n=end-c
            if n<h or c+n>end:raise RuntimeError('Invalid MP4 atom')
            yield k,c,n,h;c+=n
    top=list(atoms(data));moov=next(a for a in top if a[0]==b'moov');mdat=next(a for a in top if a[0]==b'mdat')
    if moov[1]<mdat[1]:return
    _,old,size,h=moov;insert=mdat[1];movie=bytearray(data[old:old+size])
    def patch(start,end):
        for kind,pos,length,h in atoms(movie,start,end):
            if kind in {b'moov',b'trak',b'mdia',b'minf',b'stbl'}:patch(pos+h,pos+length)
            elif kind in {b'stco',b'co64'}:
                count=struct.unpack_from('>I',movie,pos+h+4)[0];stride=4 if kind==b'stco' else 8;fmt='>I' if stride==4 else '>Q'
                for i in range(count):
                    at=pos+h+8+stride*i;off=struct.unpack_from(fmt,movie,at)[0]
                    if insert<=off<old:struct.pack_into(fmt,movie,at,off+size)
    patch(0,len(movie));path.write_bytes(data[:insert]+movie+data[insert:old]+data[old+size:])

def settings(scene,args,id):
    scene.render.engine=args.engine
    if args.engine=='CYCLES':
        p=bpy.context.preferences.addons['cycles'].preferences;p.compute_device_type='METAL';p.get_devices()
        for d in p.devices:d.use=d.type=='METAL'
        scene.cycles.device='GPU';scene.cycles.samples=args.samples;scene.cycles.use_denoising=True;scene.cycles.max_bounces=5
    else:
        scene.eevee.taa_render_samples=args.samples;scene.eevee.use_raytracing=True;scene.eevee.shadow_pool_size='1024'
        scene.eevee.ray_tracing_options.resolution_scale='2';scene.eevee.ray_tracing_options.screen_trace_quality=.65
    scene.render.resolution_x=3840 if id in LANDSCAPE else 2160;scene.render.resolution_y=2160 if id in LANDSCAPE else 3840
    scene.render.resolution_percentage=args.scale;scene.render.fps=FPS;scene.frame_start=1;scene.frame_end=FRAMES
    scene.render.film_transparent=False;scene.render.use_persistent_data=True
    scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGB';scene.render.image_settings.compression=15
    scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast'
    scene.render.use_motion_blur=True;scene.render.motion_blur_shutter=.22
    scene.world=bpy.data.worlds.new('Studio atmosphere')

def encode(id):
    master=PUBLIC/id/'motion-v3-4k.mp4'
    bpy.ops.wm.read_factory_settings(use_empty=True);s=bpy.context.scene;s.render.engine='BLENDER_EEVEE_NEXT'
    s.render.fps=FPS;s.frame_start=1;s.frame_end=FRAMES
    source_width,source_height=(3840,2160) if id in LANDSCAPE else (2160,3840)
    s.render.resolution_x=source_width;s.render.resolution_y=source_height;s.render.resolution_percentage=100
    e=s.sequence_editor_create();v=e.strips.new_movie('Native4K film',str(master),1,1)
    s.view_settings.view_transform='Standard';s.view_settings.look='None'
    s.render.image_settings.file_format='FFMPEG';s.render.ffmpeg.format='MPEG4';s.render.ffmpeg.codec='H264';s.render.ffmpeg.constant_rate_factor='HIGH';s.render.ffmpeg.ffmpeg_preset='GOOD';s.render.ffmpeg.gopsize=15
    for label,short,long in [('1080',1080,1920),('mobile',720,1280)]:
        s.render.resolution_x=long if id in LANDSCAPE else short;s.render.resolution_y=short if id in LANDSCAPE else long;s.render.resolution_percentage=100
        # VSE preserves source pixel dimensions: changing output size alone crops.
        # Scale the source explicitly so every rendition keeps the full composition.
        v.transform.scale_x=s.render.resolution_x/source_width;v.transform.scale_y=s.render.resolution_y/source_height
        s.render.filepath=str(PUBLIC/id/f'motion-v3-{label}.mp4');bpy.ops.render.render(animation=True);faststart(Path(s.render.filepath))

def run(args,id):
    target=OUT/id;target.mkdir(parents=True,exist_ok=True);(PUBLIC/id).mkdir(parents=True,exist_ok=True)
    if args.encode:return encode(id)
    bpy.ops.wm.read_factory_settings(use_empty=True);s=bpy.context.scene;settings(s,args,id)
    module=importlib.import_module('gallery' if id in ['who-we-are','people','join'] else 'table' if id in ['what-we-do','events','advisors'] else 'optics')
    desc=module.build(id)
    bpy.ops.wm.save_as_mainfile(filepath=str(target/'scene.blend'))
    if args.preview:
        for frame in [1,61,121]:
            s.frame_set(frame);s.render.filepath=str(target/f'preview-{frame}.png');now=time.monotonic();bpy.ops.render.render(write_still=True);print('FRAME_TIME',id,frame,round(time.monotonic()-now,2),flush=True)
        return
    s.frame_set(1);s.render.filepath=str(target/'poster.png');bpy.ops.render.render(write_still=True)
    # Poster uses the same geometry, camera and lighting as the first video frame.
    poster=bpy.data.images.load(str(target/'poster.png'));s.render.image_settings.file_format='WEBP';s.render.image_settings.quality=90
    transform,look=s.view_settings.view_transform,s.view_settings.look;s.view_settings.view_transform='Standard';s.view_settings.look='None'
    poster.save_render(str(PUBLIC/id/'motion-v3.webp'),scene=s);s.view_settings.view_transform=transform;s.view_settings.look=look
    s.render.image_settings.file_format='FFMPEG';s.render.ffmpeg.format='MPEG4';s.render.ffmpeg.codec='H264';s.render.ffmpeg.constant_rate_factor='HIGH';s.render.ffmpeg.ffmpeg_preset='GOOD';s.render.ffmpeg.gopsize=15
    s.render.filepath=str(PUBLIC/id/'motion-v3-4k.mp4');start=time.monotonic();bpy.ops.render.render(animation=True);faststart(Path(s.render.filepath))
    desc.update({'engine':args.engine,'samples':args.samples,'width':round(s.render.resolution_x*args.scale/100),'height':round(s.render.resolution_y*args.scale/100),'fps':FPS,'frames':FRAMES,'seconds':FRAMES/FPS,'renderSeconds':round(time.monotonic()-start),'nativeRender':True})
    (target/'manifest.json').write_text(json.dumps(desc,indent=2));encode(id);print('FILM_COMPLETE',id,desc,flush=True)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--scene',default='ml-process');p.add_argument('--engine',default='BLENDER_EEVEE_NEXT');p.add_argument('--samples',type=int,default=32);p.add_argument('--scale',type=int,default=100);p.add_argument('--preview',action='store_true');p.add_argument('--encode',action='store_true');args=p.parse_args(sys.argv[sys.argv.index('--')+1:])
    for id in (IDS if args.scene=='all' else args.scene.split(',')):run(args,id)
