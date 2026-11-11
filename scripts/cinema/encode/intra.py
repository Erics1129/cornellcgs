# Blender 4.5 headless transcode: any movie -> H.264 with a fixed GOP (default 1 = all-intra), no B-frames, no audio.
# usage: Blender -b --factory-startup -P intra.py -- <in> <out.mp4> [gop=1] [crf=MEDIUM] [scale=1.0]
import bpy, sys
argv = sys.argv[sys.argv.index('--') + 1:]
src, dst = argv[0], argv[1]
gop = int(argv[2]) if len(argv) > 2 else 1
crf = argv[3] if len(argv) > 3 else 'MEDIUM'
scale = float(argv[4]) if len(argv) > 4 else 1.0
scene = bpy.context.scene
se = scene.sequence_editor_create()
strips = se.strips if hasattr(se, 'strips') else se.sequences
strip = strips.new_movie('src', src, 1, 1)
el = strip.elements[0]
w, h = el.orig_width, el.orig_height
scene.render.resolution_x = int(round(w * scale / 2) * 2); scene.render.resolution_y = int(round(h * scale / 2) * 2)
scene.render.resolution_percentage = 100
fps = strip.fps if hasattr(strip, 'fps') else 24
scene.render.fps = int(round(fps)); scene.render.fps_base = 1.0
scene.frame_start = 1; scene.frame_end = strip.frame_final_duration
scene.view_settings.view_transform = 'Standard'; scene.view_settings.look = 'None'   # no AgX/Filmic on a transcode
scene.render.use_sequencer = True
strip.transform.scale_x = strip.transform.scale_y = scale
r = scene.render
r.image_settings.file_format = 'FFMPEG'
r.ffmpeg.format = 'MPEG4'; r.ffmpeg.codec = 'H264'
r.ffmpeg.constant_rate_factor = crf; r.ffmpeg.ffmpeg_preset = 'GOOD'
r.ffmpeg.gopsize = gop; r.ffmpeg.use_max_b_frames = True; r.ffmpeg.max_b_frames = 0
r.ffmpeg.audio_codec = 'NONE'
r.filepath = dst; r.use_file_extension = False
print('TRANSCODE', w, h, fps, scene.frame_end, 'gop', gop, crf)
bpy.ops.render.render(animation=True)
