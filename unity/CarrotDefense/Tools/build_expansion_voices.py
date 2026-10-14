"""Layer short CC0 creature recordings into individual, quiet expansion voices.

Run in Blender (aud + numpy). These are edited recordings, not generated speech.
All originals remain in the preproduction source archive; no existing cue is replaced.
"""
import aud, hashlib, json, os, uuid, wave
import numpy as np
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
SOURCE=Path(os.environ.get('CARROT_VOICE_SOURCE','/Users/eric/Claude/carrot-defense-preproduction/source-assets/creature-voices/rubberduck'))
DEST=ROOT/'Assets/Resources/Carrot/Audio'
RATE=32000
# A primary vocal performance plus a restrained, separately pitched texture gives each species its identity.
FAMILIES={
 'mite':('cute_09','bug_04',1.22), 'beetle':('bug_02','grunt_01',.87),
 'slug':('burble_02','breath',.78), 'wisp':('alien_06','weird_03',1.12),
 'bat':('scream_02','cute_10',1.28), 'scarab':('bug_03','misc_05',.72),
 'firefly':('cute_06','alien_01',1.35), 'sporeling':('burp_02','burble_01',1.06),
 'tinyZombie':('grunt_04','cough_03',1.2), 'riftling':('alien_01','spit_03',.91),
 'shardling':('weird_04','alien_04',1.18), 'mimic':('barking_02','eat_03',.85),
 'warDrummer':('troll_01','grunt_01',.85), 'frostHerald':('howl','weird_03',.83),
 'witherPriest':('monster_07','breath',.78), 'stormWarden':('roar_01','alien_06',.73),
 'graveCaller':('monster_03','cough_02',.85), 'mirrorKnight':('alien_03','misc_09',.84),
 'riftStalker':('barking_01','alien_02',.76), 'mossGolem':('troll_03','grunt_05',.63),
 'emberBoar':('grunt_03','monster_06',.77), 'venomQueen':('spit_02','scream_01',.96),
 'ironSnail':('snore','bug_01',.7), 'lanternLeech':('weird_02','eat_04',.91),
 'chronoMoth':('alien_05','cute_08',.88), 'thornBeast':('roar_03','troll_02',.74),
 'portalSentinel':('monster_01','alien_06',.78), 'portal':('monster_05','howl',.62),
}
cache={}
def source(name,pitch,limit):
 if name not in cache:
  clip=aud.Sound(str(SOURCE/(name+'.ogg')));cache[name]=(clip.data().mean(axis=1),float(clip.specs[0]))
 samples,rate=cache[name]
 positions=np.arange(0,len(samples)-1,rate*pitch/RATE)
 a=np.interp(positions,np.arange(len(samples)),samples)
 active=np.flatnonzero(np.abs(a)>.015)
 if len(active):a=a[max(0,active[0]-160):min(len(a),active[-1]+320)]
 return a[:int(limit*RATE)]

manifest=[]
for index,(kind,(primary,texture,pitch)) in enumerate(FAMILIES.items()):
 for action,ratio in [('Call',1),('Hit',1.14),('Attack',.94)]:
  maximum=(1.45 if index>=12 else .82) if action!='Hit' else .48
  a=source(primary,pitch*ratio,maximum);b=source(texture,pitch*ratio*1.13,maximum)
  n=max(len(a),len(b));mix=np.zeros(n);mix[:len(a)]+=a*.82;mix[:len(b)]+=b*.18
  mix-=mix.mean();rms=np.sqrt(np.mean(mix*mix));peak=np.max(np.abs(mix))
  gain=min(.11/max(.00001,rms),.56/max(.00001,peak));mix*=gain
  fade=min(int(RATE*.015),n//3);mix[:fade]*=np.linspace(0,1,fade);mix[-fade:]*=np.linspace(1,0,fade)
  out=DEST/('EVoice'+kind+action+'.wav')
  with wave.open(str(out),'wb') as f:f.setnchannels(1);f.setsampwidth(2);f.setframerate(RATE);f.writeframes((np.clip(mix,-1,1)*32767).astype('<i2').tobytes())
  # Same restrained runtime import settings as the existing voice family.
  template=(DEST/'VoiceNibbleCall.wav.meta').read_text()
  import re
  meta=re.sub(r'guid: [a-f0-9]+','guid: '+uuid.uuid5(uuid.NAMESPACE_URL,'cornellcgs/carrot/audio/'+out.name).hex,template)
  out.with_suffix('.wav.meta').write_text(meta)
  manifest.append({'resource':'Carrot/Audio/'+out.stem,'sources':[primary+'.ogg',texture+'.ogg'],'author':'rubberduck','sourcePage':'https://opengameart.org/content/80-cc0-creature-sfx','license':'CC0-1.0','processing':'Mono; independently resampled primary82%/texture18%; active trim; peak/RMS normalization;15ms fades. Original recorded sounds.','pitch':pitch*ratio,'duration':round(n/RATE,3),'sampleRate':RATE,'peak':round(float(np.max(np.abs(mix))),4),'rms':round(float(np.sqrt(np.mean(mix*mix))),4),'sha256':hashlib.sha256(out.read_bytes()).hexdigest()})
(DEST/'Licenses/expansion-voices.json').write_text(json.dumps(manifest,indent=2)+'\n')
print('EXPANSION_VOICES',len(manifest),'maxSeconds',max(x['duration'] for x in manifest))
