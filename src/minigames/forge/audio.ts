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
 private noise(duration:number,level:number,frequency:number,delay=0){if(!this.ctx||!this.master)return;const t=this.ctx.currentTime+delay,buffer=this.ctx.createBuffer(1,Math.ceil(this.ctx.sampleRate*duration),this.ctx.sampleRate),data=buffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*(1-i/data.length);const src=this.ctx.createBufferSource(),filter=this.ctx.createBiquadFilter(),gain=this.ctx.createGain();src.buffer=buffer;filter.type='bandpass';filter.frequency.value=frequency;filter.Q.value=.6;gain.gain.setValueAtTime(level,t);gain.gain.exponentialRampToValueAtTime(.0001,t+duration);src.connect(filter).connect(gain).connect(this.master);src.start(t);src.stop(t+duration)}
 play(kind:string,level=0){
  if(kind==='good'||kind==='perfect'){this.noise(.055,.32,2300);this.tone(95,.08,.17,'triangle');const base=330+level*28;[1,2.72,4.16].forEach((f,i)=>this.tone(base*f,.45-i*.08,.13/(i+1)));if(kind==='perfect')[1,1.25,1.5,2].forEach((f,i)=>this.tone(560*f,.55,.08,'sine',.1+i*.07))}
  else if(kind==='shatter'){this.noise(.22,.38,1500);this.noise(.15,.14,4800,.13);for(let i=0;i<13;i++)this.tone(180+Math.random()*2400,.08+Math.random()*.2,.07,'triangle',i*.025)}
  else if(kind==='chip'){this.noise(.08,.24,3100);this.tone(165,.09,.22,'sawtooth');this.tone(1700,.24,.1,'triangle',.04)}
  else if(kind==='dull'){this.noise(.09,.15,450);this.tone(78,.14,.2,'triangle')}
  else if(kind==='evolution'||kind==='flow')[1,1.25,1.5,2,2.5].forEach((f,i)=>this.tone(330*f,.7,.07,'sine',i*.09))
  else if(kind==='sell'){this.tone(180,.09,.08,'triangle');[1,1.34,1.12,1.6,1.8,2].forEach((f,i)=>{this.tone(1600*f,.14,.06,'sine',.1+i*.065);this.tone(1600*f*2.17,.07,.025,'sine',.1+i*.065)})}
  else if(kind==='heat'){this.tone(110,.8,.08,'sawtooth');this.tone(750,.45,.035,'triangle',.15)}
  else if(kind==='buy'){this.tone(660,.22,.07);this.tone(990,.3,.06,'sine',.08)}
  else this.tone(420,.07,.05)
 }
 suspend(){void this.ctx?.suspend()}
 dispose(){void this.ctx?.close();this.ctx=null}
}
