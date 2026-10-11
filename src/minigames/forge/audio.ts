/** Synthesized workshop sound; no audio assets, and no context before a gesture. */
export class ForgeAudio {
 private ctx:AudioContext|null=null
 private master:GainNode|null=null
 private bed:GainNode|null=null
 volume=.4
 muted=false
 constructor(){try{const s=JSON.parse(localStorage.getItem('cgs-forge-audio')||'null');if(s){this.volume=Number.isFinite(s.volume)?Math.max(0,Math.min(1,s.volume)):.4;this.muted=!!s.muted}}catch{/* defaults */}}
 start(){if(!this.ctx){this.ctx=new AudioContext();this.master=this.ctx.createGain();this.master.connect(this.ctx.destination);this.bed=this.ctx.createGain();this.bed.gain.value=.022;this.bed.connect(this.master);const noise=this.ctx.createBuffer(1,this.ctx.sampleRate*2,this.ctx.sampleRate);const data=noise.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;const src=this.ctx.createBufferSource();src.buffer=noise;src.loop=true;const filter=this.ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=170;src.connect(filter).connect(this.bed);src.start();this.apply()}void this.ctx.resume()}
 private apply(){if(this.ctx&&this.master)this.master.gain.setTargetAtTime(this.muted?0:this.volume,this.ctx.currentTime,.04);try{localStorage.setItem('cgs-forge-audio',JSON.stringify({volume:this.volume,muted:this.muted}))}catch{/* optional */}}
 setVolume(v:number){this.volume=v;this.apply()}
 setMuted(v:boolean){this.muted=v;this.apply()}
 private tone(hz:number,duration:number,level=.15,type:OscillatorType='sine',delay=0){if(!this.ctx||!this.master)return;const t=this.ctx.currentTime+delay,o=this.ctx.createOscillator(),g=this.ctx.createGain();o.type=type;o.frequency.setValueAtTime(hz,t);o.frequency.exponentialRampToValueAtTime(hz*.7,t+duration);g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(level,t+.007);g.gain.exponentialRampToValueAtTime(.0001,t+duration);o.connect(g).connect(this.master);o.start(t);o.stop(t+duration+.02)}
 play(kind:string,level=0){
  if(kind==='good'||kind==='perfect'){const base=330+level*28;[1,2.72,4.16].forEach((f,i)=>this.tone(base*f,.45-i*.08,.13/(i+1)));if(kind==='perfect')[1,1.25,1.5,2].forEach((f,i)=>this.tone(560*f,.55,.08,'sine',.1+i*.07))}
  else if(kind==='shatter'){for(let i=0;i<13;i++)this.tone(180+Math.random()*2400,.08+Math.random()*.2,.07,'triangle',i*.025)}
  else if(kind==='chip'){this.tone(165,.09,.22,'sawtooth');this.tone(1700,.24,.1,'triangle',.04)}
  else if(kind==='dull')this.tone(78,.14,.2,'triangle')
  else if(kind==='evolution'||kind==='flow')[1,1.25,1.5,2,2.5].forEach((f,i)=>this.tone(330*f,.7,.07,'sine',i*.09))
  else if(kind==='sell')[1,1.4,1.7,2].forEach((f,i)=>this.tone(1400*f,.16,.06,'sine',i*.06))
  else if(kind==='heat'){this.tone(110,.8,.08,'sawtooth');this.tone(750,.45,.035,'triangle',.15)}
  else if(kind==='buy'){this.tone(660,.22,.07);this.tone(990,.3,.06,'sine',.08)}
  else this.tone(420,.07,.05)
 }
 suspend(){void this.ctx?.suspend()}
 dispose(){void this.ctx?.close();this.ctx=null}
}
