"""Encode the four CC0 orchestral recordings for streaming; Blender background script (its bundled ffmpeg), no network.

The sources live in Assets/Resources/Carrot/Audio/Music~ (a folder Unity ignores, so they stay out of the data file) and are
written as Ogg Vorbis and MP3 to Assets/StreamingAssets/Carrot, which the Web build ships beside Build/. CarrotAudio downloads a track the
first time it is needed (after the HUD is up) and the browser decodes it: Ogg Vorbis everywhere except WebKit, which gets the MP3 (Safari's decodeAudioData has no Vorbis;
headless Chromium has no MP3). 112 kb/s joint stereo lands near the 0.5-quality Vorbis the data file carried before.
"""
import bpy,json,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'Assets/Resources/Carrot/Audio/Music~'
DEST=ROOT/'Assets/StreamingAssets/Carrot'
DEST.mkdir(parents=True,exist_ok=True)
only_new='--only-new' in sys.argv
track=next((a.split('=',1)[1] for a in sys.argv if a.startswith('--track=')),None)
manifest=DEST/'music-provenance.json'
results=json.loads(manifest.read_text()) if (only_new or track) and manifest.exists() else []
for file in sorted(SOURCE.iterdir()):
 if track and file.stem!=track:continue
 if file.suffix.lower() not in ('.mp3','.wav','.ogg','.flac','.m4a'):continue
 if only_new and all((DEST/(file.stem+ext)).exists() for ext in ('.mp3','.ogg')):continue
 bpy.ops.wm.read_factory_settings(use_empty=True)
 scene=bpy.context.scene;scene.sequence_editor_create()
 strips=getattr(scene.sequence_editor,'strips',None) or scene.sequence_editor.sequences
 strip=strips.new_sound(file.stem,str(file),1,1)
 # The supplied AAC has intersample peaks above full scale; retain the whole recording with safe headroom.
 if file.stem=='MusicAsuna':strip.volume=.65
 scene.frame_start=1;scene.frame_end=max(2,int(strip.frame_final_duration))
 seconds=strip.frame_final_duration/scene.render.fps
 for container,codec,ext in (('MP3','MP3','.mp3'),('OGG','VORBIS','.ogg')):
  out=DEST/(file.stem+ext)
  bpy.ops.sound.mixdown(filepath=str(out),check_existing=False,relative_path=False,accuracy=1024,container=container,codec=codec,format='S16',bitrate=112,split_channels=False,mixrate=44100)
  results=[item for item in results if item.get('output')!=out.name]
  results.append({'source':file.name,'output':out.name,'seconds':round(seconds,1),'bytes':out.stat().st_size,'bitrateKbps':112})
  print('ENCODED',file.name,out.name,round(seconds,1),out.stat().st_size)
(DEST/'music-provenance.json').write_text(json.dumps(results,indent=2)+'\n')
print('CARROT_MUSIC_READY')
