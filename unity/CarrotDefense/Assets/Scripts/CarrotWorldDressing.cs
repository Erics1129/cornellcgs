using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;
using Unity.Mathematics;
using UnityEngine.Splines;

namespace CarrotTD {
 /// <summary>
 /// Readability dressing of the giant update, shared by every map: emissive dashed path-edge lines in the biome accent (the Portal
 /// level's inlay style, now on all levels), a spawn gate at every route start, route pulses when a wave is announced, the
 /// shore-masked ponds with their self-made ripple/foam tile, and the decor clearance log used by the QA dump and the world tests.
 /// </summary>
 public sealed partial class CarrotView {
  // ---- biome accents (UI tokens) ----------------------------------------------------------------------------------------------
  Color BiomeAccent(){
   string biome=game.level.biome,boss=game.level.boss;
   if(biome=="marsh")return new Color(.4f,.878f,.784f);if(biome=="frost")return new Color(.45f,.72f,.95f);if(biome=="orchard")return new Color(1f,.70f,.28f);
   if(biome=="arena")return boss=="zombie"?new Color(.55f,.88f,.48f):boss=="eyeball"?new Color(.91f,.48f,.72f):boss=="portal"?new Color(.2f,.78f,.86f):new Color(.66f,.77f,.91f);
   if(biome=="prism")return new Color(.667f,.533f,1f);
   return new Color(.702f,.851f,.267f);
  }
  CarrotWorldBars worldBars;readonly List<Vector3> litPadPoints=new List<Vector3>();
  void UpdateWorldBars(float raw){
   if(worldBars==null)return;litPadPoints.Clear();foreach(int pad in CarrotData.LitPads(levelId))if(pad>=0&&pad<game.level.pads.Length)litPadPoints.Add(game.level.pads[pad]);
   worldBars.Update(game,GameCamera,EnemyBarPosition,raw,clock,blindLevel,litPadPoints);CarrotQa.Max("worldBars.max",worldBars.Drawn);
  }
  #if UNITY_WEBGL && !UNITY_EDITOR
  [System.Runtime.InteropServices.DllImport("__Internal")] static extern void Carrot_SetupCanvasGestures();
  #else
  static void Carrot_SetupCanvasGestures(){}
  #endif
  /// <summary>Pinch zoom stays in the game: no browser gestures on the canvas (iOS gesturestart, double-tap zoom).</summary>
  void SetupCanvasGestures(){try{Carrot_SetupCanvasGestures();}catch(System.Exception){}}
  // ---- contact shadow batch ---------------------------------------------------------------------------------------------------
  readonly List<Transform> contactShadows=new List<Transform>();Mesh shadowBatch;GameObject shadowBatchObject;
  readonly List<Vector3> shadowVerts=new List<Vector3>(1024);readonly List<Vector2> shadowUv=new List<Vector2>(1024);readonly List<int> shadowTris=new List<int>(1536);
  /// <summary>Every actor's soft contact shadow in one dynamic mesh and one draw (they were one renderer each: 40-60 draws on a busy
  /// board). Positions, sizes and visibility still come from each actor's shadow transform.</summary>
  void DrawContactShadows(){
   if(shadowBatch==null){shadowBatch=new Mesh{name="Contact shadow batch"};shadowBatch.MarkDynamic();shadowBatchObject=new GameObject("Contact shadows");shadowBatchObject.transform.SetParent(transform,false);shadowBatchObject.AddComponent<MeshFilter>().sharedMesh=shadowBatch;var mr=shadowBatchObject.AddComponent<MeshRenderer>();Material m;if(!materials.TryGetValue("contact-shadow",out m)){m=new Material(Shader.Find("Carrot/Contact"));m.SetColor("_Color",new Color(.055f,.075f,.085f,.31f));materials["contact-shadow"]=m;}mr.sharedMaterial=m;mr.shadowCastingMode=ShadowCastingMode.Off;mr.receiveShadows=false;}
   shadowVerts.Clear();shadowUv.Clear();shadowTris.Clear();
   for(int i=contactShadows.Count-1;i>=0;i--){var t=contactShadows[i];if(t==null){contactShadows.RemoveAt(i);continue;}if(!t.gameObject.activeInHierarchy)continue;
    Vector3 p=t.position;float hx=t.lossyScale.x*.5f,hz=t.lossyScale.y*.5f;int k=shadowVerts.Count;
    shadowVerts.Add(p+new Vector3(-hx,0,-hz));shadowVerts.Add(p+new Vector3(hx,0,-hz));shadowVerts.Add(p+new Vector3(hx,0,hz));shadowVerts.Add(p+new Vector3(-hx,0,hz));
    shadowUv.Add(new Vector2(0,0));shadowUv.Add(new Vector2(1,0));shadowUv.Add(new Vector2(1,1));shadowUv.Add(new Vector2(0,1));
    shadowTris.Add(k);shadowTris.Add(k+2);shadowTris.Add(k+1);shadowTris.Add(k);shadowTris.Add(k+3);shadowTris.Add(k+2);}
   shadowBatch.Clear();if(shadowVerts.Count==0)return;shadowBatch.SetVertices(shadowVerts);shadowBatch.SetUVs(0,shadowUv);shadowBatch.SetTriangles(shadowTris,0,true);
  }
  bool NightBiome=>game.level.biome=="marsh"||game.level.biome=="arena"&&game.level.boss!="tornado";

  // ---- decor clearance log --------------------------------------------------------------------------------------------------
  /// <summary>(x, z, footprint radius, 1 = occluding prop / 0 = ground cover) of every decoration placed by this level build.</summary>
  readonly List<Vector4> decorLog=new List<Vector4>();
  void LogDecor(Vector3 p,float radius,bool prop=true){decorLog.Add(new Vector4(p.x,p.z,radius,prop?1:0));}
  /// <summary>Smallest distance from a route centreline to the footprint edge of an occluding prop on this map.</summary>
  public float DecorClearance(){float min=100;foreach(var d in decorLog){if(d.w<.5f)continue;float c=PathDistance(new Vector3(d.x,0,d.y))-d.z*.5f;if(c<min)min=c;}return min;}
  /// <summary>Clearance rule for props: the centre stays at least 1.0 u plus half the footprint from every route centreline.</summary>
  bool PropFree(Vector3 p,float footprint){return IsFree(p,1.0f+footprint*.5f);}

  // ---- path edges -----------------------------------------------------------------------------------------------------------
  /// <summary>Emissive dashed lines on both edges of every trail (0.03 u wide, 0.32 u dashes every 0.55 u) in the biome accent; batched
  /// with the decoration. Night biomes glow a little brighter so the lanes read against dark ground.</summary>
  void BuildPathEdges(Vector3[] route,int routeIndex){
   if(PrismStage)return;Color accent=BiomeAccent();
   var mat=Material("path-edge-"+game.level.biome+"-"+game.level.boss,accent*.35f,-1,.35f);mat.SetColor("_EmissionColor",accent*(NightBiome?.95f:.6f));mat.SetFloat("_SnowStrength",0);mat.SetFloat("_AlbedoGain",1);
   var spline=RouteSpline(route);float t=0;int dash=0;
   while(t<1){var q=SplineUtility.GetPointAtLinearDistance(spline,t,.55f,out float next);if(next<=t||next>=1)break;t=next;dash++;
    var tangent=spline.EvaluateTangent(t);Vector3 dir=new Vector3(tangent.x,0,tangent.z);if(dir.sqrMagnitude<1e-6f)continue;dir.Normalize();Vector3 side=Vector3.Cross(dir,Vector3.up);Vector3 c=new Vector3(q.x,0,q.z);
    if(Pond(c))continue;
    for(int sign=-1;sign<=1;sign+=2){Vector3 p=c+side*sign*.43f;float y=Mathf.Max(SurfaceHeight(p),.062f)+.012f;var mark=Primitive("Path edge light",PrimitiveType.Cube,new Vector3(p.x,y,p.z),new Vector3(.03f,.012f,.32f),mat,decoration);mark.transform.rotation=Quaternion.LookRotation(dir);mark.GetComponent<Renderer>().shadowCastingMode=ShadowCastingMode.Off;}
   }
  }

  // ---- spawn gates ----------------------------------------------------------------------------------------------------------
  /// <summary>A gate at a route start facing along the first leg: the moss arch rebuilt across the lane, an aperture disc in the
  /// biome accent and a keystone lantern (the marsh and arena gates light the lane with a point light, two per level).</summary>
  void BuildEntrance(Vector3[] route,int routeIndex){
   Vector3 p=route[0];Vector3 dir=route.Length>1?route[1]-route[0]:Vector3.forward;dir.y=0;if(dir.sqrMagnitude<1e-4f)dir=Vector3.forward;dir.Normalize();Vector3 side=Vector3.Cross(Vector3.up,dir);
   var rock=Material("entry-stone",new Color(.86f,.9f,.8f),1,.25f,0,1.8f);
   for(int i=0;i<7;i++){float a=Mathf.PI*i/6;Vector3 pos=p+side*Mathf.Cos(a)*.7f+Vector3.up*(.24f+Mathf.Sin(a)*.78f)-dir*.18f;pos.y+=TerrainHeight(p);var s=Primitive("Gate arch stone",PrimitiveType.Sphere,pos,new Vector3(.44f,.42f,.4f),rock,decoration);s.transform.localRotation=Quaternion.LookRotation(dir)*Quaternion.Euler(i*12,i*23,0);}
   Color accent=BiomeAccent();
   var aperture=Primitive("Spawn gate aperture",PrimitiveType.Quad,p+Vector3.up*(.62f+TerrainHeight(p))-dir*.2f,new Vector3(1.05f,1.05f,1),GateSurface(accent),world);aperture.transform.rotation=Quaternion.LookRotation(dir);var ar=aperture.GetComponent<Renderer>();ar.shadowCastingMode=ShadowCastingMode.Off;ar.receiveShadows=false;portalApertures.Add(ar);
   var lamp=Primitive("Gate keystone lantern",PrimitiveType.Sphere,p+Vector3.up*(1.08f+TerrainHeight(p))-dir*.18f,Vector3.one*.14f,Material("lantern",new Color(1,.76f,.22f),5,.65f,.3f),decoration);lamp.GetComponent<Renderer>().sharedMaterial.SetColor("_EmissionColor",LanternGlow);
   if(!Spectator&&(game.level.biome=="marsh"||game.level.biome=="arena")&&lanterns.Count<2){var lightGo=new GameObject("Lantern light");lightGo.transform.SetParent(decoration,false);lightGo.transform.localPosition=p+Vector3.up*(1.1f+TerrainHeight(p))-dir*.18f;var light=lightGo.AddComponent<Light>();light.type=LightType.Point;light.range=2.6f;light.intensity=6;light.color=new Color(1,.7f,.28f);light.shadows=LightShadows.None;lanterns.Add(light);}
   LogDecor(p-dir*.18f,0,false);
  }
  /// <summary>Lantern glass emission, capped at 4 (HDR) so the Lantern Flood never blows out under bloom.</summary>
  static readonly Color LanternGlow=new Color(1.5f,.72f,.12f);
  readonly Dictionary<string,Material> gateSurfaces=new Dictionary<string,Material>();
  Material GateSurface(Color accent){string key=ColorUtility.ToHtmlStringRGB(accent);if(gateSurfaces.TryGetValue(key,out var m)&&m!=null)return m;var shader=Shader.Find("Carrot/PortalAperture");if(shader==null)shader=Shader.Find("Carrot/FxAdditive");m=new Material(shader){name="Spawn gate "+key};m.SetColor("_Color",new Color(accent.r,accent.g,accent.b,.78f));m.SetColor("_DepthColor",new Color(accent.r*.05f,accent.g*.05f,accent.b*.07f,1));gateSurfaces[key]=m;materials["gate-"+key]=m;return m;}

  // ---- route pulses ---------------------------------------------------------------------------------------------------------
  sealed class RoutePulse {public LineRenderer line;public Vector3[] points;public float[] distance;public float length,age=-1;public bool air;public int frame=-1;}
  readonly List<RoutePulse> routePulses=new List<RoutePulse>();Material pulseSolid,pulseDashed;Texture2D dashTexture;bool sawWaveIncoming;
  const float PulseTravel=1.6f,PulseFade=.4f,PulseTail=2.4f;readonly Gradient pulseGradient=new Gradient();readonly GradientColorKey[] pulseColors=new GradientColorKey[2];readonly GradientAlphaKey[] pulseAlphas=new GradientAlphaKey[3];
  void BuildRoutePulses(){
   foreach(var r in routePulses)if(r.line!=null)Destroy(r.line.gameObject);routePulses.Clear();sawWaveIncoming=false;
   if(pulseSolid==null){pulseSolid=new Material(Shader.Find("Carrot/FxAdditive"));pulseSolid.SetFloat("_UseAtlas",0);pulseSolid.SetFloat("_Soft",0);pulseSolid.SetFloat("_ZTest",8);materials["route-pulse"]=pulseSolid;
    dashTexture=new Texture2D(16,4,TextureFormat.RGBA32,false){name="Route pulse dashes",wrapMode=TextureWrapMode.Repeat,filterMode=FilterMode.Bilinear};var px=new Color32[64];for(int y=0;y<4;y++)for(int x=0;x<16;x++)px[y*16+x]=new Color32(255,255,255,(byte)(x<9?255:0));dashTexture.SetPixels32(px);dashTexture.Apply(false,true);
    pulseDashed=new Material(pulseSolid){name="Route pulse dashed"};pulseDashed.SetFloat("_UseAtlas",1);pulseDashed.SetTexture("_MainTex",dashTexture);materials["route-pulse-dashed"]=pulseDashed;}
   if(PrismStage)return;
   foreach(var route in game.level.routes){var spline=RouteSpline(route);float length=spline.GetLength();int n=Mathf.Max(4,Mathf.CeilToInt(length/.2f));var pts=new Vector3[n+1];var dist=new float[n+1];
    for(int i=0;i<=n;i++){float3 q=spline.EvaluatePosition(i/(float)n);Vector3 p=new Vector3(q.x,0,q.z);p.y=SurfaceHeight(p)+.1f;pts[i]=p;dist[i]=i==0?0:dist[i-1]+Vector3.Distance(pts[i-1],p);}
    var go=new GameObject("Route pulse "+routePulses.Count);go.transform.SetParent(world,false);var line=go.AddComponent<LineRenderer>();line.useWorldSpace=true;line.widthMultiplier=.16f;line.numCapVertices=2;line.numCornerVertices=2;line.shadowCastingMode=ShadowCastingMode.Off;line.receiveShadows=false;line.textureMode=LineTextureMode.Tile;line.alignment=LineAlignment.TransformZ;go.transform.rotation=Quaternion.Euler(90,0,0);line.enabled=false;
    routePulses.Add(new RoutePulse{line=line,points=pts,distance=dist,length=dist[n]});}
  }
  /// <summary>Starts a pulse on one route (or every route when route &lt; 0): threat pink for both kinds, with a shape twin, dashed
  /// for air and solid for ground. Reduced motion shows the whole lane at once and fades it instead of travelling.</summary>
  void StartRoutePulse(int route,bool air){for(int i=0;i<routePulses.Count;i++){if(route>=0&&i!=route%Mathf.Max(1,routePulses.Count))continue;var r=routePulses[i];bool same=r.frame==Time.frameCount;r.air=air||same&&r.air;r.frame=Time.frameCount;r.age=0;r.line.sharedMaterial=r.air?pulseDashed:pulseSolid;r.line.enabled=true;if(!same)CarrotQa.Count("routePulse",1);}}
  void UpdateRoutePulses(float raw){
   foreach(var r in routePulses){if(r.age<0)continue;r.age+=raw;float life=reducedMotion?1.2f:PulseTravel+PulseFade;if(r.age>=life){r.age=-1;r.line.enabled=false;continue;}
    float head,tail,alpha;
    if(reducedMotion){head=r.length;tail=0;alpha=r.age<.2f?r.age/.2f:1-Mathf.Clamp01((r.age-.6f)/.6f);}
    else{head=Mathf.Min(r.length,r.age/PulseTravel*r.length);tail=Mathf.Max(0,head-PulseTail);alpha=r.age<PulseTravel?1:1-(r.age-PulseTravel)/PulseFade;}
    int count=0;var line=r.line;int max=r.points.Length;if(line.positionCount<max)line.positionCount=max;
    for(int i=0;i<max;i++){float d=r.distance[i];if(d<tail||d>head)continue;line.SetPosition(count++,r.points[i]);}
    if(count<2){line.positionCount=0;continue;}line.positionCount=count;
    Color c=CarrotEffects.Threat;pulseColors[0]=new GradientColorKey(c,0);pulseColors[1]=new GradientColorKey(Color.Lerp(c,Color.white,.35f),1);pulseAlphas[0]=new GradientAlphaKey(0,0);pulseAlphas[1]=new GradientAlphaKey(.85f*alpha,.75f);pulseAlphas[2]=new GradientAlphaKey(alpha,1);pulseGradient.SetKeys(pulseColors,pulseAlphas);line.colorGradient=pulseGradient;
    properties.Clear();properties.SetColor("_Color",new Color(1.6f,1.6f,1.6f,1));properties.SetVector("_MainTex_ST",new Vector4(1,1,-r.age*2,0));line.SetPropertyBlock(properties);}
  }

  // ---- ponds ----------------------------------------------------------------------------------------------------------------
  /// <summary>A pond disc whose vertex colour r is the normalized distance to the (slightly irregular) bank.</summary>
  Mesh PondMesh(Vector3 center,float radius){
   const int seg=64,rings=6;var v=new List<Vector3>();var c=new List<Color>();var t=new List<int>();
   v.Add(Vector3.zero);c.Add(new Color(1,1,1,1));
   for(int ring=1;ring<=rings;ring++){float f=ring/(float)rings;for(int i=0;i<seg;i++){float a=i*Mathf.PI*2/seg;float bank=radius*(1+.06f*Mathf.Sin(a*3+center.x)+.04f*Mathf.Sin(a*7+center.z));float r=bank*f;v.Add(new Vector3(Mathf.Cos(a)*r,0,Mathf.Sin(a)*r));float inner=1-f;c.Add(new Color(inner,inner,inner,1));}}
   for(int i=0;i<seg;i++){t.Add(0);t.Add(1+(i+1)%seg);t.Add(1+i);}
   for(int ring=1;ring<rings;ring++){int a0=1+(ring-1)*seg,b0=1+ring*seg;for(int i=0;i<seg;i++){int i1=(i+1)%seg;t.Add(a0+i);t.Add(a0+i1);t.Add(b0+i);t.Add(a0+i1);t.Add(b0+i1);t.Add(b0+i);}}
   var mesh=new Mesh{name="Sheltered pond"};mesh.SetVertices(v);mesh.SetColors(c);mesh.SetTriangles(t,0);mesh.RecalculateNormals();mesh.RecalculateBounds();return mesh;
  }
  static Texture2D waterTile;
  /// <summary>Self-made 256 px tile, generated here at load (no file): rg = tangent-space ripple normal from a periodic two-octave
  /// gradient-noise height, b = foam cells (periodic Worley distance), a = 1. Seed 1729; periods 8 and 16 cells.</summary>
  static Texture2D WaterTile(){
   if(waterTile!=null)return waterTile;const int size=256;var h=new float[size*size];var px=new Color32[size*size];
   for(int y=0;y<size;y++)for(int x=0;x<size;x++){float u=x/(float)size,w=y/(float)size;h[y*size+x]=PeriodicNoise(u*8,w*8,8,1729)*.65f+PeriodicNoise(u*16,w*16,16,1931)*.35f;}
   var cells=new Vector2[64];var rng=new System.Random(1729);for(int i=0;i<64;i++)cells[i]=new Vector2((i%8+(float)rng.NextDouble())/8f,(i/8+(float)rng.NextDouble())/8f);
   for(int y=0;y<size;y++)for(int x=0;x<size;x++){
    float hl=h[y*size+(x+size-1)%size],hr=h[y*size+(x+1)%size],hd=h[((y+size-1)%size)*size+x],hu=h[((y+1)%size)*size+x];
    float nx=(hl-hr)*6,ny=(hd-hu)*6;Vector2 uv=new Vector2(x/(float)size,y/(float)size);float best=9,second=9;
    for(int i=0;i<64;i++){Vector2 d=uv-cells[i];d.x-=Mathf.Round(d.x);d.y-=Mathf.Round(d.y);float dd=d.magnitude;if(dd<best){second=best;best=dd;}else if(dd<second)second=dd;}
    float foam=Mathf.Clamp01((second-best)*9);
    px[y*size+x]=new Color32((byte)Mathf.Clamp(Mathf.RoundToInt((nx*.5f+.5f)*255),0,255),(byte)Mathf.Clamp(Mathf.RoundToInt((ny*.5f+.5f)*255),0,255),(byte)Mathf.RoundToInt(foam*255),255);}
   waterTile=new Texture2D(size,size,TextureFormat.RGBA32,true,true){name="Carrot water tile (procedural)",wrapMode=TextureWrapMode.Repeat,filterMode=FilterMode.Bilinear,anisoLevel=2};waterTile.SetPixels32(px);waterTile.Apply(true,true);return waterTile;
  }
  static float PeriodicNoise(float x,float y,int period,int seed){
   int x0=Mathf.FloorToInt(x),y0=Mathf.FloorToInt(y);float fx=x-x0,fy=y-y0;float ux=fx*fx*(3-2*fx),uy=fy*fy*(3-2*fy);
   float g(int ix,int iy,float dx,float dy){ix=((ix%period)+period)%period;iy=((iy%period)+period)%period;uint hsh=(uint)(ix*73856093^iy*19349663^seed*83492791);hsh^=hsh>>13;hsh*=0x5bd1e995;hsh^=hsh>>15;float a=(hsh&1023)/1023f*Mathf.PI*2;return Mathf.Cos(a)*dx+Mathf.Sin(a)*dy;}
   float n00=g(x0,y0,fx,fy),n10=g(x0+1,y0,fx-1,fy),n01=g(x0,y0+1,fx,fy-1),n11=g(x0+1,y0+1,fx-1,fy-1);
   return Mathf.Lerp(Mathf.Lerp(n00,n10,ux),Mathf.Lerp(n01,n11,ux),uy)*.5f+.5f;
  }
  Color skyZenith=new Color(.05f,.1f,.16f),skyHorizon=new Color(.12f,.2f,.26f);
  Material WaterMaterial(){
   var m=new Material(Shader.Find("Carrot/Water"));m.SetColor("_Color",new Color(.018f,.071f,.068f));m.SetColor("_Shallow",new Color(.11f,.24f,.23f));m.SetTexture("_WaterTex",WaterTile());
   m.SetColor("_SkyZenith",skyZenith*.9f);m.SetColor("_SkyHorizon",skyHorizon);m.SetFloat("_Reflection",.5f);return m;
  }
 }
}
