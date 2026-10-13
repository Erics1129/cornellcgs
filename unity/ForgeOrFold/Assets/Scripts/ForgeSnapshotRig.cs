#if UNITY_EDITOR
using System;
using System.Collections.Generic;
using System.IO;
using UnityEngine;

// Editor-only snapshot driver for the fast visual loop (Assets/Editor/ForgeSnapshots.cs,
// scripts/forge-snapshots.mjs). It steps the real ForgeWorld in play mode at a fixed dt through
// fixture steps and writes PNGs. Not compiled into players. Owner: integration (QA infrastructure).

/// One fixture step. do: sync | wait | capture | strike | look | lookAt | focus | qa | insets | tune.
[Serializable] public class ForgeSnapshotStep {
 public string @do, name, json, impact, spot, mode;
 public float s, yaw, pitch;
 public int seq;
 public bool apex, contact;          // strike: save the apex frame and contact -1/0/+1 frames
 public float[] afterMs;             // strike: extra captures this many ms after contact
 public string[] afterNames;
}
[Serializable] public class ForgeSnapshotJob { public string outDir, view="desktop"; public int width=1440, height=900; public float dt=1/120f, timeout=600; public ForgeSnapshotStep[] steps; }
[Serializable] public class ForgeSnapshotShot { public string name, file; public float t; public int frame; public float headY, fov, pitch; }
[Serializable] public class ForgeSnapshotIndex { public bool ok; public string error; public int width, height; public float dt; public ForgeSnapshotShot[] shots; public string[] messages; }

[DefaultExecutionOrder(10000)]
public class ForgeSnapshotRig : MonoBehaviour {
 public ForgeSnapshotJob job; public ForgeWorld world; public Action<bool> done;
 int step=-1, frame; float simT, waitLeft, strikeEnd; bool finished;
 RenderTexture cur, prev, apexRt; Texture2D readback;
 // Strike in progress.
 ForgeSnapshotStep active; bool contactNow, contactSeen, settled, plusOne, haveApex; float contactT, maxHeadY; readonly List<(float ms,string name)> later=new List<(float,string)>();
 readonly List<ForgeSnapshotShot> shots=new List<ForgeSnapshotShot>(); readonly List<string> messages=new List<string>();

 void Start(){
  cur=MakeRt();prev=MakeRt();apexRt=MakeRt();readback=new Texture2D(job.width,job.height,TextureFormat.RGB24,false,false);
  ForgeWorld.QaSend=OnSend;Directory.CreateDirectory(job.outDir);
 }
 RenderTexture MakeRt(){var rt=new RenderTexture(job.width,job.height,24,RenderTextureFormat.ARGB32,RenderTextureReadWrite.sRGB){antiAliasing=1};rt.Create();return rt;}

 void OnSend(string json){
  var m=JsonUtility.FromJson<ForgeMessage>(json);if(m==null||m.type=="label"||m.type=="position")return;
  messages.Add($"{simT:0.000} {json}");
  if(active==null)return;
  // Exactly what the page does on 'impact': resolve the hit in the engine and Sync it back, re-entrantly.
  if(m.type=="impact"&&m.id==active.seq&&!contactSeen){contactSeen=true;contactNow=true;contactT=simT;if(!string.IsNullOrEmpty(active.impact))world.Sync(active.impact);}
  if(m.type=="settled"&&m.id==active.seq)settled=true;
 }

 void LateUpdate(){
  if(finished)return;
  if(world==null||world.QaCamera==null)return;       // ForgeWorld.Start has not run yet
  frame++;simT+=job.dt;
  if(simT>job.timeout){Finish(false,"timeout after "+job.timeout+" s of simulated time at step "+step);return;}
  if(active!=null){TrackStrike();return;}
  if(waitLeft>0){waitLeft-=job.dt;if(waitLeft>1e-5f)return;}
  while(++step<job.steps.Length){if(!Run(job.steps[step]))return;}
  Finish(true,null);
 }

 /// Runs a step; returns true when the next step can run in the same frame.
 bool Run(ForgeSnapshotStep s){
  switch(s.@do){
   case "sync": world.Sync(s.json);return true;
   case "insets": world.Insets(s.json);return true;
   case "tune": world.Tune(s.json);return true;
   case "qa": world.Qa(s.mode);return true;
   case "focus": world.Quick("focus");return true;
   case "look": world.QaLook(s.yaw,s.pitch);return true;
   case "lookAt": world.QaLookAt(s.spot);return true;
   case "capture": Render(cur);Save(cur,s.name);return true;
   case "wait": waitLeft=s.s;return false;
   case "strike":
    active=s;contactSeen=contactNow=settled=plusOne=haveApex=false;maxHeadY=float.MinValue;later.Clear();
    if(s.afterMs!=null)for(int i=0;i<s.afterMs.Length;i++)later.Add((s.afterMs[i],s.afterNames!=null&&i<s.afterNames.Length?s.afterNames[i]:s.name+"-"+s.afterMs[i]+"ms"));
    strikeEnd=simT+4;world.Strike(s.seq.ToString());return false;
   default: Debug.LogWarning("ForgeSnapshots: unknown step "+s.@do);return true;
  }
 }

 void TrackStrike(){
  Render(cur);
  float y=world.QaHeadPosition.y;string prefix=string.IsNullOrEmpty(active.name)?"":active.name+"-";
  if(!contactSeen&&y>maxHeadY){maxHeadY=y;Graphics.CopyTexture(cur,apexRt);haveApex=true;}
  if(contactNow){
   contactNow=false;
   if(active.apex&&haveApex)Save(apexRt,prefix+"apex");
   if(active.contact){Save(prev,prefix+"contact-m1");Save(cur,prefix+"contact-0");plusOne=true;}
  }else if(plusOne){Save(cur,prefix+"contact-p1");plusOne=false;}
  if(contactSeen)for(int i=later.Count-1;i>=0;i--)if(simT-contactT>=later[i].ms/1000f-job.dt*.5f){Save(cur,later[i].name);later.RemoveAt(i);}
  var swap=prev;prev=cur;cur=swap;
  if(settled&&!plusOne&&later.Count==0){active=null;return;}
  if(simT>strikeEnd){messages.Add($"{simT:0.000} strike {active.seq} ended without contact={contactSeen} settled={settled}");active=null;}
 }

 void Render(RenderTexture rt){var c=world.QaCamera;var target=c.targetTexture;c.targetTexture=rt;c.aspect=(float)job.width/job.height;c.Render();c.targetTexture=target;c.ResetAspect();}
 void Save(RenderTexture rt,string name){
  var was=RenderTexture.active;RenderTexture.active=rt;readback.ReadPixels(new Rect(0,0,job.width,job.height),0,0);readback.Apply();RenderTexture.active=was;
  var file=name+".png";File.WriteAllBytes(Path.Combine(job.outDir,file),readback.EncodeToPNG());
  var c=world.QaCamera;float pitch=c.transform.eulerAngles.x;if(pitch>180)pitch-=360;
  shots.Add(new ForgeSnapshotShot{name=name,file=file,t=simT,frame=frame,headY=world.QaHeadPosition.y,fov=c.fieldOfView,pitch=pitch});
 }
 void Finish(bool ok,string error){
  finished=true;ForgeWorld.QaSend=null;
  var index=new ForgeSnapshotIndex{ok=ok&&error==null,error=error,width=job.width,height=job.height,dt=job.dt,shots=shots.ToArray(),messages=messages.ToArray()};
  File.WriteAllText(Path.Combine(job.outDir,"index.json"),JsonUtility.ToJson(index,true));
  foreach(var rt in new[]{cur,prev,apexRt})if(rt!=null)rt.Release();
  done?.Invoke(index.ok);
 }
}
#endif
