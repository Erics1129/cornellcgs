using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

// Owner: hot-metal-vfx. Smoke and steam (one batched mesh), the sale (knife to the scale, coins into the
// dish) and the shatter (10-16 rigid pieces at the break temperature, one batched mesh, plane collisions).
public partial class ForgeWorld {
 struct SmokeBit { public Vector3 p,v; public float age,life,size,grow,opacity,spin,seed,lit,drag,wisp; public Color32 color; }
 class SaleGhost {public Body body;public Vector3 start;public Quaternion rotation;public float age;public bool paid;public int amount;}
 class Coin {public GameObject go;public Vector3 start,end,p,v,axis;public float age,delay,flight,spin;public int phase,index,total,bounces;public bool sent;public Quaternion rot;}
 class Shard {public int index,v0,count;public Vector3 p,v,w;public Quaternion r;public float scale,sfxClock,seed;public bool rest,landed;public float[] hull;}
 const int MaxSmoke=64;
 readonly SmokeBit[] smoke=new SmokeBit[MaxSmoke];int smokeCount;
 readonly List<SaleGhost> sales=new List<SaleGhost>();
 readonly List<Coin> coins=new List<Coin>();readonly Stack<GameObject> coinPool=new Stack<GameObject>();
 readonly List<Shard> shards=new List<Shard>();
 Material smokeMaterial,shardMaterial;Mesh coinMesh,shardMesh;Batch smokeBatch;GameObject shardObject;
 ForgeHeatModel shardModel;float shardAge,breakTempC,breakFaceY=ForgeLayout.AnvilTopY;ForgeBladeShape breakShape;Matrix4x4 breakToWorld;
 readonly List<Vector3> shardLocalV=new List<Vector3>(),shardLocalN=new List<Vector3>(),shardV=new List<Vector3>(),shardN=new List<Vector3>();

 /// Frozen entry point: a few dust (hot = false, lit by the workshop lamps) or hearth-smoke (hot = true, the
 /// room's colour as given) puffs. None under reduced motion.
 void Puff(Vector3 at,int count,bool hot=false){
  if(reduced)return;
  int cap=Narrow?20:36;
  for(int i=0;i<count&&smokeCount<Mathf.Min(cap,MaxSmoke);i++)smoke[smokeCount++]=new SmokeBit{p=at+Random.insideUnitSphere*.035f,v=new Vector3(Random.Range(-.09f,.09f),Random.Range(.12f,.3f),Random.Range(-.05f,.06f)),age=-i*.035f,life=Random.Range(.7f,1.4f),size=Random.Range(.09f,.19f),grow=2.8f,opacity=hot?.2f:.5f,color=hot?new Color32(145,110,76,255):new Color32(150,142,132,255),spin=Random.Range(0,360f),seed=Random.value,lit=hot?0:1,drag=.6f};
 }
 /// A small, short puff of scale dust (Shatter): darker and much smaller than the dull-hit dust.
 void ScaleDust(Vector3 at,int count){
  if(reduced)return;
  for(int i=0;i<count&&smokeCount<MaxSmoke;i++)smoke[smokeCount++]=new SmokeBit{p=at+Random.insideUnitSphere*.02f,v=new Vector3(Random.Range(-.12f,.12f),Random.Range(.06f,.18f),Random.Range(-.08f,.08f)),age=-i*.02f,life=Random.Range(.45f,.8f),size=Random.Range(.03f,.06f),grow=2.2f,opacity=.4f,color=new Color32(96,90,84,255),spin=Random.Range(0,360f),seed=Random.value,lit=1,drag=2.5f};
 }
 /// Quench steam: translucent, lamp-lit vapour that leaves the water fast, spreads and thins over about `seconds`
 /// (a third of the puffs under reduced motion).
 void SteamPuff(Vector3 at,int count,float seconds){
  if(reduced)count=Mathf.Max(1,count/3);   // a quench still shows under reduced motion, as a thinner plume
  for(int i=0;i<count&&smokeCount<MaxSmoke;i++){float k=i/(float)Mathf.Max(1,count);// Wisps: small, fast-rising, thin and short-lived (a quench flashes off steam in well under a second per puff).
   smoke[smokeCount++]=new SmokeBit{p=at+new Vector3(Random.Range(-.05f,.05f),0,Random.Range(-.04f,.04f)),v=new Vector3(Random.Range(-.06f,.06f),Random.Range(.7f,1.25f)*(1-.45f*k),Random.Range(-.04f,.04f)),age=-k*seconds*.7f,life=Random.Range(.55f,1.0f),size=Random.Range(.025f,.045f),grow=3.2f,opacity=.2f*(1-.4f*k),color=new Color32(236,236,234,255),spin=Random.Range(0,360f),seed=Random.value,lit=1,drag=1.6f,wisp=1};}
 }
 void KeepSale(Body b){
  int amount=state!=null&&state.effect!=null?state.effect.amount:0;
  sales.Add(new SaleGhost{body=b,start=b.root.transform.position,rotation=b.root.transform.rotation,amount=amount});
 }
 void UpdateEffects(float dt){
  float w=WorldDt(dt);
  for(int i=smokeCount-1;i>=0;i--){ref var p=ref smoke[i];p.age+=w;if(p.age>=p.life){smoke[i]=smoke[--smokeCount];continue;}if(p.age>0){p.p+=p.v*w;p.v*=Mathf.Exp(-p.drag*w);}}
  DrawSmoke();
  for(int i=sales.Count-1;i>=0;i--){var sale=sales[i];sale.age+=w;float t=Mathf.Clamp01(sale.age/.48f);var end=spots["sell"]+new Vector3(-.12f,.145f,0);sale.body.root.transform.position=Vector3.Lerp(sale.start,end,Mathf.SmoothStep(0,1,t))+Vector3.up*Mathf.Sin(t*Mathf.PI)*.24f;sale.body.root.transform.rotation=Quaternion.Slerp(sale.rotation,Quaternion.identity,t);
   if(sale.body.heatState!=null){var hm=sale.body.heatState.model;hm.CoolTo(tuning.metal.rackToC,tuning.metal.rackCoolS,tuning.metal.rackLeadS,tuning.metal);hm.Step(w,false,false,1150,false,tuning.metal);ApplyHeatUniforms(sale.body);}
   if(t>=1&&!sale.paid){sale.paid=true;scaleAge=0;SaleCoins(end+Vector3.up*.03f,sale.amount);}
   if(sale.age>.83f)sale.body.root.transform.localScale*=Mathf.Exp(-w*12);if(sale.age>1.2f){DisposeBody(sale.body);sales.RemoveAt(i);}}
 }
 void DrawSmoke(){
  if(smokeBatch==null){if(smokeMaterial==null){smokeMaterial=new Material(Shader.Find(ForgeContract.Shaders.Smoke));smokeMaterial.SetFloat("_Billboard",1);}smokeBatch=MakeBatch("Smoke batch",smokeMaterial,MaxSmoke,3005);}
  int n=0;
  for(int i=0;i<smokeCount;i++){var p=smoke[i];if(p.age<=0)continue;float t=p.age/p.life;var c=p.color;c.a=(byte)(255*Mathf.Clamp01(Mathf.Sin(Mathf.Clamp01(t)*Mathf.PI)*p.opacity));
   Quad(smokeBatch,n++,p.p,p.size*(1+Mathf.Max(0,t)*p.grow),(p.spin+p.age*12)*Mathf.Deg2Rad,Vector3.zero,0,0,0,0,0,p.wisp,p.lit,p.seed,0,c);}
  Flush(smokeBatch,n);
 }

 // ---------------------------------------------------------------- sale coins
 /// clamp(round(2 + 2.2 log10(amount)), 4, 14) coins arc from the pan into the dish, one coin-land sfx each.
 void SaleCoins(Vector3 pan,int amount){
  var t=tuning.metal;int n=ForgeHeatMath.Coins(Mathf.Max(1,amount),t);if(reduced)n=Mathf.Min(n,6);
  var dish=ForgeLayout.CoinDish;
  for(int i=0;i<n;i++){var go=coinPool.Count>0?coinPool.Pop():MakeCoin();go.SetActive(true);var a=Random.Range(0,Mathf.PI*2);float r=Random.Range(0,ForgeLayoutData.CoinDishRadius*.7f);
   var c=new Coin{go=go,start=pan+new Vector3(Random.Range(-.03f,.03f),0,Random.Range(-.03f,.03f)),end=dish+new Vector3(Mathf.Cos(a)*r,.004f+i*.0012f,Mathf.Sin(a)*r),delay=i*t.coinStaggerS,flight=Random.Range(.36f,.46f),index=i,total=n,axis=Random.onUnitSphere,spin=Random.Range(14f,24f),rot=Random.rotation};
   c.p=c.start;go.transform.position=c.start;go.transform.localScale=new Vector3(.024f,.0022f,.024f);coins.Add(c);}
  if(amount>=t.coinsDustAt)Burst(dish+Vector3.up*.02f,reduced?4:12,"coin-dust");
 }
 GameObject MakeCoin(){var go=new GameObject("Sale coin");if(dynamicRoot!=null)go.transform.SetParent(dynamicRoot,false);go.AddComponent<MeshFilter>().sharedMesh=CoinMesh();var r=go.AddComponent<MeshRenderer>();r.sharedMaterial=brass;r.shadowCastingMode=ShadowCastingMode.Off;return go;}
 void UpdateCoins(float w){
  var t=tuning.metal;
  for(int i=coins.Count-1;i>=0;i--){var c=coins[i];c.age+=w;float a=c.age-c.delay;
   if(a<0){c.go.SetActive(false);continue;}c.go.SetActive(true);
   if(c.phase==0){float s=Mathf.Clamp01(a/c.flight);c.p=Vector3.Lerp(c.start,c.end,s)+Vector3.up*4*t.coinArcM*s*(1-s);c.rot=Quaternion.AngleAxis(c.spin*w*Mathf.Rad2Deg,c.axis)*c.rot;
    if(s>=1){c.phase=1;c.v=new Vector3(Random.Range(-.15f,.15f),1.1f*t.coinBounce*2.2f,Random.Range(-.15f,.15f));c.spin*=t.coinSpinDamp;if(!c.sent){c.sent=true;Send("sfx",c.index,ForgeContract.Sfx.CoinLand,c.index,c.total);}}}
   else if(c.phase==1){c.v.y-=9.81f*w;c.p+=c.v*w;c.rot=Quaternion.AngleAxis(c.spin*w*Mathf.Rad2Deg,c.axis)*c.rot;
    if(c.p.y<c.end.y){c.p.y=c.end.y;c.bounces++;c.spin*=t.coinSpinDamp;if(c.bounces>=2||Mathf.Abs(c.v.y)<.25f){c.phase=2;c.v=Vector3.zero;}else{c.v.y=-c.v.y*t.coinBounce;c.v.x*=.5f;c.v.z*=.5f;}}}
   else{// at rest: settle flat, spin stops
    var up=c.rot*Vector3.up;var flat=Quaternion.FromToRotation(up,Vector3.Dot(up,Vector3.up)>=0?Vector3.up:Vector3.down)*c.rot;c.rot=Quaternion.Slerp(c.rot,flat,1-Mathf.Exp(-w*18));
    if(a-c.flight>t.coinRestS)c.go.transform.localScale*=Mathf.Exp(-w*10);if(a-c.flight>t.coinRestS+.5f){c.go.SetActive(false);coinPool.Push(c.go);coins.RemoveAt(i);continue;}}
   c.go.transform.position=c.p;c.go.transform.rotation=c.rot;}
 }

 // ---------------------------------------------------------------- shatter
 /// Break the blade into 10-16 rigid pieces cut across its length, at the temperature of the moment, with the
 /// crack lines flashing through the hit-stop. Called by Sync before the body is disposed.
 void BreakBlade(Body body){
  var h=body.heatState;if(h==null||body.blade==null)return;var t=tuning.metal;
  ClearShards();
  breakTempC=h.model.BodyC(t);breakFaceY=body.knife.place=="anvil"?body.root.transform.position.y-.006f:ForgeLayout.AnvilTopY;
  var pieces=new List<ForgeShardPiece>();h.shape.Shatter(pieces,t,()=>Random.value);
  if(shardMaterial!=null)Destroy(shardMaterial);shardMaterial=new Material(body.metal){name="Shatter pieces"};
  shardModel=h.model.Clone();shardModel.Rebase(t);shardAge=0;
  var bt=body.blade.transform;float scale=bt.lossyScale.x;
  // Launched from the blade centre here; ImpactFx (right after, same Sync) relaunches them from the real contact.
  breakShape=h.shape;breakToWorld=bt.localToWorldMatrix;var centre=bt.TransformPoint(h.mesh.bounds.center);var from=centre;
  shardLocalV.Clear();shardLocalN.Clear();var uv0=new List<Vector2>();var uv1=new List<Vector4>();var col=new List<Color32>();var tris=new List<int>();
  foreach(var piece in pieces){
   var s=new Shard{index=shards.Count,v0=shardLocalV.Count,count=piece.mesh.count,r=bt.rotation,scale=scale,hull=piece.hull};
   s.p=bt.TransformPoint(new Vector3(piece.cx,piece.cy,piece.cz));
   s.seed=Random.value;s.v=ShardVelocity(s,from);s.w=Random.onUnitSphere*Random.Range(4f,11f)*(reduced?.3f:1);
   var o=piece.mesh;for(int i=0;i<o.count;i++){shardLocalV.Add(new Vector3(o.pos[i*3],o.pos[i*3+1],o.pos[i*3+2]));shardLocalN.Add(new Vector3(o.nrm[i*3],o.nrm[i*3+1],o.nrm[i*3+2]));uv0.Add(new Vector2(o.uv0[i*2],o.uv0[i*2+1]));uv1.Add(new Vector4(o.uv1[i*4],o.uv1[i*4+1],o.uv1[i*4+2],o.uv1[i*4+3]));col.Add(new Color32(255,255,255,0));}
   foreach(var k in o.tris)tris.Add(k+s.v0);shards.Add(s);
  }
  if(shardMesh==null){shardMesh=new Mesh{name="Shatter pieces"};shardMesh.MarkDynamic();shardObject=new GameObject("Shatter pieces");if(dynamicRoot!=null)shardObject.transform.SetParent(dynamicRoot,false);shardObject.AddComponent<MeshFilter>().sharedMesh=shardMesh;var r=shardObject.AddComponent<MeshRenderer>();r.shadowCastingMode=ShadowCastingMode.On;}
  shardObject.GetComponent<MeshRenderer>().sharedMaterial=shardMaterial;shardObject.SetActive(true);
  shardMesh.Clear();PoseShards();shardMesh.SetVertices(shardV);shardMesh.SetNormals(shardN);shardMesh.SetUVs(0,uv0);shardMesh.SetUVs(1,uv1);shardMesh.SetColors(col);shardMesh.SetTriangles(tris,0,false);shardMesh.bounds=new Bounds(new Vector3(0,1,-1),new Vector3(14,4,12));
  shardMaterial.SetVector(CrackId,new Vector4(1,t.crackGlow,t.crackPerM,0));shardMaterial.SetFloat(CrackFlashId,1);shardMaterial.SetFloat(DissolveId,0);shardMaterial.SetFloat("_Shard",1);ShardUniforms();
 }
 /// Pieces leave away from the contact (in the anvil plane), up, with some scatter; the same seed gives the same throw.
 Vector3 ShardVelocity(Shard s,Vector3 from){
  var t=tuning.metal;float speed=t.shardSpeed*(reduced?.35f:1);var rnd=new System.Random((int)(s.seed*1e6f)+s.index);float R()=>(float)rnd.NextDouble();
  var out_=s.p-from;out_.y=0;if(out_.sqrMagnitude<1e-6f)out_=new Vector3(R()-.5f,0,R()-.5f);out_.Normalize();
  return (out_*Mathf.Lerp(.35f,1.1f,R())+Vector3.up*Mathf.Lerp(.6f,1.5f,R())+new Vector3(R()-.5f,R()-.5f,R()-.5f)*.5f)*speed;
 }
 void LaunchShards(Vector3 from){foreach(var s in shards)s.v=ShardVelocity(s,from);}
 void PoseShards(){
  shardV.Clear();shardN.Clear();
  foreach(var s in shards)for(int i=0;i<s.count;i++){var lv=shardLocalV[s.v0+i];shardV.Add(s.p+s.r*(lv*s.scale));shardN.Add(s.r*shardLocalN[s.v0+i]);}
 }
 void ShardUniforms(){var t=tuning.metal;shardModel.Uniforms(t,ua,ub,uc);shardMaterial.SetVector(HeatA,new Vector4(ua[0],ua[1],ua[2],ua[3]));shardMaterial.SetVector(HeatB,new Vector4(ub[0],ub[1],ub[2],ub[3]));shardMaterial.SetVector(HeatC,new Vector4(uc[0],uc[1],uc[2],uc[3]));}
 void UpdateShards(float w){
  if(shards.Count==0)return;var t=tuning.metal;shardAge+=w;
  shardModel.Step(w*t.shardTauScale,false,false,1150,false,t);ShardUniforms();
  shardMaterial.SetFloat(CrackFlashId,Mathf.Clamp01(1-shardAge/Mathf.Max(.01f,t.shardCrackFlashS)));
  shardMaterial.SetFloat(DissolveId,Mathf.Clamp01((shardAge-t.shardRestS)/Mathf.Max(.01f,t.shardGoneS-t.shardRestS)));
  if(shardAge>=t.shardGoneS){ClearShards();return;}
  float faceY=breakFaceY;
  foreach(var s in shards){
   s.sfxClock-=w;
   if(!s.rest){s.v.y-=9.81f*w;s.v*=Mathf.Exp(-.3f*w);s.p+=s.v*w;float ang=s.w.magnitude;if(ang>1e-4f)s.r=Quaternion.AngleAxis(ang*w*Mathf.Rad2Deg,s.w/ang)*s.r;s.w*=Mathf.Exp(-2*w);}
   // Lowest hull point against the collision planes.
   float low=float.MaxValue;Vector3 lowP=s.p;for(int c=0;c<8;c++){var hp=s.p+s.r*(new Vector3(s.hull[c*3],s.hull[c*3+1],s.hull[c*3+2])*s.scale);if(hp.y<low){low=hp.y;lowP=hp;}}
   var probe=new Vector3(lowP.x,low,lowP.z);var above=probe+Vector3.up*(.06f+Mathf.Max(0,-s.v.y)*w*2);
   if(Floor(probe,above,faceY,out var y)&&low<y){
    s.p.y+=y-low;float impact=-s.v.y;
    if(impact>.3f&&s.sfxClock<=0&&s.index<16){s.sfxClock=.15f;Send("sfx",s.index,ForgeContract.Sfx.ShardLand,impact*.035f,s.index);}
    if(impact>.25f&&!s.rest){s.v.y=impact*t.shardBounce;s.v.x*=1-t.shardFriction*.5f;s.v.z*=1-t.shardFriction*.5f;s.w*=.55f;}
    else{s.v.y=0;s.v.x*=1-t.shardFriction;s.v.z*=1-t.shardFriction;s.w*=.4f;if(new Vector2(s.v.x,s.v.z).magnitude<.06f){s.rest=true;s.v=Vector3.zero;s.w=Vector3.zero;}}
    s.landed=true;
   }
   // Resting pieces lie flat (no spinning in place).
   if(s.landed){var up=s.r*Vector3.up;var flat=Quaternion.FromToRotation(up,Vector3.Dot(up,Vector3.up)>=0?Vector3.up:Vector3.down)*s.r;s.r=Quaternion.Slerp(s.r,flat,1-Mathf.Exp(-w*(s.rest?14:4)));}
  }
  PoseShards();shardMesh.SetVertices(shardV);shardMesh.SetNormals(shardN);
 }
 void ClearShards(){shards.Clear();if(shardObject!=null)shardObject.SetActive(false);}

 Mesh CoinMesh(){
  if(coinMesh!=null)return coinMesh;var v=new List<Vector3>();var triangles=new List<int>();const int segments=16;
  v.Add(Vector3.up*.5f);v.Add(Vector3.down*.5f);
  for(int i=0;i<segments;i++){float angle=i*Mathf.PI*2/segments;v.Add(new Vector3(Mathf.Cos(angle)*.5f,.5f,Mathf.Sin(angle)*.5f));v.Add(new Vector3(Mathf.Cos(angle)*.5f,-.5f,Mathf.Sin(angle)*.5f));}
  for(int i=0;i<segments;i++){int a=2+i*2,b=2+((i+1)%segments)*2;triangles.AddRange(new[]{0,b,a,1,a+1,b+1,a,b,b+1,a,b+1,a+1});}
  coinMesh=new Mesh{name="Minted coins"};coinMesh.SetVertices(v);coinMesh.SetTriangles(triangles,0);coinMesh.RecalculateNormals();return coinMesh;
 }
 void DisposeEffects(){
  foreach(var sale in sales)DisposeBody(sale.body);
  foreach(var m in new[]{smokeMaterial,shardMaterial,litMaterial,addMaterial,particleGold,particleIron,particleAsh,particleHot})if(m)Destroy(m);
  foreach(var mesh in new[]{coinMesh,shardMesh,litBatch?.mesh,addBatch?.mesh,smokeBatch?.mesh})if(mesh)Destroy(mesh);
 }
}
