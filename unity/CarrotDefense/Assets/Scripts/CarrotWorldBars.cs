using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace CarrotTD {
 /// <summary>
 /// In-world HP bars for ordinary creatures (giant update), drawn by Unity instead of the page's DOM so they track the creature every
 /// rendered frame: one dynamic screen-space mesh (Carrot/WorldBar), 5 px tall at 1440x900 and scaled with the canvas height, a dark
 /// backing, the HP fill, a white damage trail (500 ms hold, 300 ms drain), -45 degree hatching for shields, centred above the head
 /// (CarrotView.EnemyBarPosition). Shown only on hurt or selected creatures; where bars overlap the most-hurt one wins; hidden in the
 /// won and lost phases. Bosses and minibosses keep their HUD bars. During blindness the bars drop to 60% opacity and every visible
 /// creature carries two faint eye glints, all drawn after the overlay, so threats stay readable in the dark.
 /// The page hides its DOM monster bars when the snapshot's caps list 'worldBars' (balance: report it while <see cref="Active"/>).
 /// </summary>
 public sealed class CarrotWorldBars {
  /// <summary>True while a level view draws world bars (for the bridge snapshot's caps).</summary>
  public static bool Active{get;private set;}
  readonly Mesh mesh;readonly Material material;readonly GameObject go;readonly MeshRenderer renderer;
  readonly List<Vector3> vertices=new List<Vector3>(2048);readonly List<Color> colors=new List<Color>(2048);readonly List<Vector2> uv0=new List<Vector2>(2048),uv1=new List<Vector2>(2048);readonly List<int> triangles=new List<int>(3072);
  sealed class Track {public float shown,trail,holdUntil,seen;}
  readonly Dictionary<int,Track> tracks=new Dictionary<int,Track>();readonly List<int> stale=new List<int>();
  struct Candidate {public Vector2 screen;public float hurt,hp,shield,trail;public int id;public bool selected;}
  readonly List<Candidate> candidates=new List<Candidate>(128);readonly List<Rect> placed=new List<Rect>(128);
  static readonly Color Backing=new Color(.03f,.04f,.06f,.82f),Trail=new Color(1f,.96f,.9f,.75f),ShieldFill=new Color(.6f,.93f,1f,.95f);
  public int Drawn{get;private set;}
  public CarrotWorldBars(Transform parent){
   var shader=Shader.Find("Carrot/WorldBar");material=shader!=null?new Material(shader){name="World HP bars"}:null;
   go=new GameObject("World HP bars");go.transform.SetParent(parent,false);mesh=new Mesh{name="World HP bars"};mesh.MarkDynamic();
   go.AddComponent<MeshFilter>().sharedMesh=mesh;renderer=go.AddComponent<MeshRenderer>();renderer.sharedMaterial=material;renderer.shadowCastingMode=ShadowCastingMode.Off;renderer.receiveShadows=false;renderer.lightProbeUsage=LightProbeUsage.Off;renderer.reflectionProbeUsage=ReflectionProbeUsage.Off;
   Active=material!=null;
  }
  public void Dispose(){Active=false;if(mesh!=null)Object.Destroy(mesh);if(material!=null)Object.Destroy(material);if(go!=null)Object.Destroy(go);}
  public void Clear(){tracks.Clear();Drawn=0;mesh.Clear();}
  static Color Fill(float f){return Color.Lerp(new Color(1f,.36f,.32f,.95f),new Color(1f,.70f,.32f,.95f),Mathf.Clamp01(f*1.25f-.15f));}
  /// <summary>Rebuilds the mesh for this frame. `anchor` gives an enemy's bar point in world space; `blind` is 0..1.</summary>
  public void Update(CarrotGame game,Camera cam,System.Func<EnemyState,Vector3> anchor,float raw,float clock,float blind,IList<Vector3> litPads){
   vertices.Clear();colors.Clear();uv0.Clear();uv1.Clear();triangles.Clear();candidates.Clear();placed.Clear();Drawn=0;
   if(material==null||cam==null||game==null||game.level==null){mesh.Clear();return;}
   bool over=game.phase=="won"||game.phase=="lost";float sw=Mathf.Max(1,Screen.width),sh=Mathf.Max(1,Screen.height);float scale=sh/900f;
   float barH=Mathf.Max(4,5*scale),barW=Mathf.Clamp(36*scale,26,60),opacity=Mathf.Lerp(.95f,.6f,Mathf.Clamp01(blind*1.4f));
   foreach(var e in game.enemies){
    if(!e.alive||e.hidden||!string.IsNullOrEmpty(e.boss)||!string.IsNullOrEmpty(e.miniboss))continue;
    if(!tracks.TryGetValue(e.id,out var tr)){tr=new Track{shown=1,trail=1};tracks[e.id]=tr;}tr.seen=clock;
    float total=Mathf.Max(1,e.maxHp+e.maxShield);float hp=Mathf.Clamp01(e.hp/total),shield=Mathf.Clamp01(e.shield/total),f=hp+shield;
    if(f<tr.shown-.0005f){tr.holdUntil=clock+.5f;}tr.shown=f;
    if(clock>=tr.holdUntil)tr.trail=Mathf.MoveTowards(tr.trail,f,raw/.3f);if(tr.trail<f)tr.trail=f;
    bool selected=game.selectionType=="enemy"&&game.selectionId==e.id;bool hurt=e.hp<e.maxHp-.01f||e.maxShield>0&&e.shield<e.maxShield-.01f;
    if(over||!(hurt||selected))continue;
    Vector3 s=cam.WorldToScreenPoint(anchor(e));if(s.z<=0||s.x<-barW||s.x>sw+barW||s.y<-barH||s.y>sh+barH)continue;
    candidates.Add(new Candidate{screen=new Vector2(s.x,s.y),hurt=selected?2:1-f,hp=hp,shield=shield,trail=tr.trail,id=e.id,selected=selected});
   }
   stale.Clear();foreach(var kv in tracks)if(clock-kv.Value.seen>1)stale.Add(kv.Key);foreach(int id in stale)tracks.Remove(id);
   candidates.Sort((a,b)=>b.hurt.CompareTo(a.hurt)!=0?b.hurt.CompareTo(a.hurt):a.id.CompareTo(b.id));
   foreach(var c in candidates){
    var rect=new Rect(c.screen.x-barW*.5f-1,c.screen.y-barH*.5f-1,barW+2,barH+2);bool clash=false;foreach(var r in placed)if(r.Overlaps(rect)){clash=true;break;}if(clash)continue;placed.Add(rect);
    float x0=rect.xMin+1,y0=rect.yMin+1,x1=x0+barW,y1=y0+barH;
    Quad(x0-1,y0-1,x1+1,y1+1,new Color(Backing.r,Backing.g,Backing.b,Backing.a*opacity),0,sw,sh);
    if(c.trail>c.hp+c.shield+.002f)Quad(x0,y0,x0+barW*c.trail,y1,new Color(Trail.r,Trail.g,Trail.b,Trail.a*opacity),0,sw,sh);
    Color fill=Fill(c.hp+c.shield);fill.a*=opacity;Quad(x0,y0,x0+barW*c.hp,y1,fill,0,sw,sh);
    if(c.shield>0)Quad(x0+barW*c.hp,y0,x0+barW*(c.hp+c.shield),y1,new Color(ShieldFill.r,ShieldFill.g,ShieldFill.b,ShieldFill.a*opacity),1,sw,sh);
    if(c.selected)Quad(x0-1,y1+1,x1+1,y1+2.5f*scale,new Color(1,.92f,.6f,.9f),0,sw,sh);
    Drawn++;
   }
   // Blindness: two faint eye glints per visible creature, and a soft pool on each lantern-lit pad, all over the overlay.
   if(blind>.05f&&!over){float g=Mathf.Clamp01(blind*1.5f);float r=Mathf.Max(2,2.4f*scale);
    foreach(var e in game.enemies){if(!e.alive||e.hidden)continue;Vector3 s=cam.WorldToScreenPoint(anchor(e)-Vector3.up*.35f);if(s.z<=0)continue;Color eye=new Color(1,.86f,.62f,.75f*g);Quad(s.x-r*2.2f-r,s.y-r,s.x-r*2.2f+r,s.y+r,eye,2,sw,sh);Quad(s.x+r*2.2f-r,s.y-r,s.x+r*2.2f+r,s.y+r,eye,2,sw,sh);}
    if(litPads!=null)foreach(var p in litPads){Vector3 s=cam.WorldToScreenPoint(p+Vector3.up*.1f);if(s.z<=0)continue;float pr=34*scale;Quad(s.x-pr,s.y-pr*.6f,s.x+pr,s.y+pr*.6f,new Color(1,.82f,.5f,.28f*g),2,sw,sh);}}
   mesh.Clear();if(vertices.Count==0)return;
   mesh.SetVertices(vertices);mesh.SetColors(colors);mesh.SetUVs(0,uv0);mesh.SetUVs(1,uv1);mesh.SetTriangles(triangles,0,false);
   // Clip-space vertices: give the renderer bounds around the camera so it is never frustum-culled.
   mesh.bounds=new Bounds(cam.transform.position+cam.transform.forward*(cam.nearClipPlane+1),Vector3.one*2);
  }
  void Quad(float x0,float y0,float x1,float y1,Color c,int mode,float sw,float sh){
   int k=vertices.Count;float ax=x0/sw*2-1,ay=y0/sh*2-1,bx=x1/sw*2-1,by=y1/sh*2-1;
   vertices.Add(new Vector3(ax,ay,0));vertices.Add(new Vector3(bx,ay,0));vertices.Add(new Vector3(bx,by,0));vertices.Add(new Vector3(ax,by,0));
   for(int i=0;i<4;i++){colors.Add(c);uv0.Add(new Vector2(mode,0));}uv1.Add(new Vector2(0,0));uv1.Add(new Vector2(1,0));uv1.Add(new Vector2(1,1));uv1.Add(new Vector2(0,1));
   triangles.Add(k);triangles.Add(k+2);triangles.Add(k+1);triangles.Add(k);triangles.Add(k+3);triangles.Add(k+2);
  }
 }
}
