using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Splines;

namespace CarrotTD {
 public sealed partial class CarrotView {
  static readonly string[] ExpansionPartNames={"Spears","Pods","Stamen","Coils","Cap","Spines","ClockHands","Orbits","Eyeball","Claw0","Claw1","Claw2","Claw3","Drum","Lantern","Shell","Staff"};
  readonly List<Transform> portalArenaRings=new List<Transform>();readonly List<Renderer> portalApertures=new List<Renderer>();
  float expansionBlackoutUntil=-1;bool expansionBlackoutFading;
  Material portalSurface;
  void ResetExpansionScene(){portalArenaRings.Clear();portalApertures.Clear();expansionBlackoutUntil=-1;expansionBlackoutFading=false;}
  void ResolveExpansionActor(Actor a,string path){
   a.metrics=a.model.GetComponent<CarrotModelMetrics>();
   a.expansionActor=CarrotEffects.ExpansionTower(a.kind)||CarrotEffects.ExpansionMini(a.kind)||CarrotEffects.ExpansionMob(a.kind)||a.kind=="portal";
   if(!a.expansionActor)return;a.expansionParts=new Transform[ExpansionPartNames.Length];for(int i=0;i<ExpansionPartNames.Length;i++)a.expansionParts[i]=Find(a.model,ExpansionPartNames[i]);if(a.kind=="mushroom"&&a.expansionParts[4]==null)a.expansionParts[4]=a.petals;
   if(a.kind=="portal"){
    // The aperture is a thin disk, not a full-screen sprite. Its depth is behind the teeth.
    var aperture=Primitive("Portal event horizon",PrimitiveType.Quad,new Vector3(0,1.17f,-.009f),new Vector3(.878f,.878f,1),PortalSurface(),a.model);aperture.transform.localRotation=Quaternion.identity;var r=aperture.GetComponent<Renderer>();r.shadowCastingMode=ShadowCastingMode.Off;r.receiveShadows=false;portalApertures.Add(r);
   }
  }
  string ExpansionEnemyPath(EnemyState e){
   if(!string.IsNullOrEmpty(e.boss))return "Carrot/Models/Bosses/"+e.boss;
   if(!string.IsNullOrEmpty(e.miniboss))return "Carrot/Models/Minibosses/"+e.miniboss;
   if(e.clone&&e.kind=="eyeball")return "Carrot/Models/Bosses/eyeball";
   if(e.clone&&e.kind=="mirrorKnight")return "Carrot/Models/Minibosses/mirrorKnight";
   return "Carrot/Models/Enemies/"+(e.kind=="fragment"?"crystal":e.kind);
  }
  /// <summary>Snapshot anchor in world space, including flight, model size, phone scale and clone size.</summary>
  public Vector3 EnemyBarPosition(EnemyState enemy){
   Vector3 fallback=enemy.position+Vector3.up*((string.IsNullOrEmpty(enemy.miniboss)?1.2f:1.7f)+(enemy.air?.7f:0));
   if(game==null||game.level==null||levelId!=game.level.id||!enemies.TryGetValue(enemy.id,out var actor)||actor.root==null)return fallback;
   if(actor.metrics!=null)return actor.model.TransformPoint(actor.metrics.healthAnchor)+Vector3.up*.12f;
   // Preserve the original actors' stable anchor; imported culling bounds are not visual bounds.
   return fallback;
  }
  void PartScale(Transform part,Vector3 scale){if(part==null)return;if(!restScales.TryGetValue(part,out var rest)){rest=part.localScale;restScales[part]=rest;}part.localScale=Vector3.Scale(rest,scale);}
  void PartMove(Transform part,Vector3 offset){if(part==null)return;if(!restPositions.TryGetValue(part,out var rest)){rest=part.localPosition;restPositions[part]=rest;}part.localPosition=rest+offset;}
  void PartTurn(Actor a,int index,Vector3 angles){if(a.expansionParts!=null&&index<a.expansionParts.Length&&a.expansionParts[index]!=null)RotatePart(a.expansionParts[index],Quaternion.Euler(angles));}
  void AnimateExpansionTower(Actor a,TowerState t,float charge,float since,float dt,ref Color emission){
   if(!CarrotEffects.ExpansionTower(t.kind))return;float recoil=Mathf.Exp(-since*13)*Mathf.Sin(since*24),chargeEase=charge*charge;Color tone=CarrotEffects.Tone(t.kind);float disabled=t.disabledFor>0||t.stunnedFor>0?.15f:1;
   emission+=tone*(.018f+.045f*chargeEase)*disabled;float rate=clock*(t.tier>=5?1.25f:1);var parts=a.expansionParts;
   switch(t.kind){
    case "bamboo":PartMove(parts[0],Vector3.forward*(recoil*.18f-chargeEase*.035f));PartTurn(a,0,new Vector3(-recoil*7,0,Mathf.Sin(rate*1.4f)*1.5f));break;
    case "chili":PartScale(parts[1],new Vector3(1+chargeEase*.05f,1+chargeEase*.08f-recoil*.12f,1+chargeEase*.05f));PartTurn(a,1,new Vector3(-recoil*12,0,Mathf.Sin(rate*2)*2));break;
    case "lotus":PartTurn(a,2,new Vector3(Mathf.Sin(rate*1.3f)*5,rate*12,0));if(a.petals!=null)RotatePart(a.petals,Quaternion.Euler(-chargeEase*11-recoil*16,Mathf.Sin(rate)*3,0));PartMove(parts[2],Vector3.up*(chargeEase*.035f-recoil*.06f));break;
    case "magnet":PartTurn(a,3,new Vector3(0,rate*70+chargeEase*50,Mathf.Sin(rate*1.3f)*7));if(a.core!=null)RotatePart(a.core,Quaternion.Euler(rate*32,0,rate*18));break;
    case "orchid":PartScale(parts[1],new Vector3(1+chargeEase*.08f,1-recoil*.16f,1+chargeEase*.08f));PartTurn(a,2,new Vector3(-chargeEase*9+recoil*12,0,Mathf.Sin(rate*1.5f)*4));break;
    case "mushroom":PartScale(parts[4],new Vector3(1+recoil*.13f,1-recoil*.15f,1+recoil*.13f));PartMove(parts[4],Vector3.up*(Mathf.Sin(rate*1.6f)*.018f+chargeEase*.03f));break;
    case "cactus":PartScale(parts[5],Vector3.one*(1+chargeEase*.065f-recoil*.12f));PartTurn(a,5,new Vector3(0,Mathf.Sin(rate*.9f)*4,0));break;
    case "clockflower":PartTurn(a,6,new Vector3(0,0,-Mathf.Floor(rate*6)*6-chargeEase*18));if(a.core!=null)RotatePart(a.core,Quaternion.Euler(0,rate*18,0));break;
    case "dragonfruit":PartTurn(a,7,new Vector3(rate*22,rate*55,Mathf.Sin(rate)*18));PartMove(parts[7],Vector3.up*(chargeEase*.10f-recoil*.12f));PartScale(parts[1],Vector3.one*(1+chargeEase*.06f));break;
    case "moonflower":PartTurn(a,7,new Vector3(0,-rate*35,rate*12));PartMove(parts[2],Vector3.up*.05f*Mathf.Sin(rate*1.8f));if(a.core!=null)RotatePart(a.core,Quaternion.Euler(0,rate*18,Mathf.Sin(rate)*12));break;
   }
  }
  void AnimateExpansionEnemy(Actor a,EnemyState e,float dt,float dead,ref Color tint,ref Color emission){
   bool mini=!string.IsNullOrEmpty(e.miniboss);if(e.clone){a.model.localScale*=e.kind=="eyeball"?.52f:.72f;tint=Color.Lerp(tint,new Color(.6f,.73f,1),.30f);emission+=new Color(.04f,.07f,.12f);}
   if(e.boss=="eyeball"&&e.stage>1){a.model.localScale*=1+(e.stage-1)*.05f;emission+=new Color(.12f,.018f,.04f)*(e.stage-1);}
   if(e.clone&&e.kind=="eyeball"){float lid=Mathf.Pow(Mathf.Max(0,Mathf.Sin(clock*2.1f+e.id)),18);if(a.upperLid!=null)RotatePart(a.upperLid,Quaternion.Euler(-62*lid,0,0));if(a.lowerLid!=null)RotatePart(a.lowerLid,Quaternion.Euler(48*lid,0,0));}
   if(!a.expansionActor)return;Color c=CarrotEffects.Tone(e.kind);float cast=e.castRemaining>0?1:0;
   if(mini){emission+=c*(.016f+cast*(.06f+.025f*Mathf.Sin(clock*7)));a.tone=c;if(e.shield>0)tint=Color.Lerp(tint,new Color(.75f,.87f,1),.22f);}
   if(!e.alive){if(e.kind=="portal")a.model.localScale*=Mathf.Max(.001f,1-EaseOutCubic(Mathf.Clamp01(dead/.7f)));return;}
   if(e.kind=="portal"){
    float castPower=cast>0?1.7f:1;float spin=clock*30*castPower;
    if(a.ring!=null)RotatePart(a.ring,Quaternion.Euler(0,0,spin));if(a.ring2!=null)RotatePart(a.ring2,Quaternion.Euler(0,0,-spin*.7f));if(a.ring3!=null)RotatePart(a.ring3,Quaternion.Euler(Mathf.Sin(clock*.7f)*7,0,spin*.35f));
    PartTurn(a,8,new Vector3(Mathf.Sin(clock)*5,Mathf.Sin(clock*.7f)*8,0));
    for(int i=9;i<=12;i++)PartTurn(a,i,new Vector3(Mathf.Sin(clock*1.5f+i)*6-cast*9,0,Mathf.Cos(clock*1.2f+i)*4));
    a.model.localPosition=Vector3.up*(.12f+Mathf.Sin(clock*1.3f)*.045f);emission+=new Color(.08f,.18f,.24f)*(.3f+cast*.5f);return;
   }
   if(e.kind=="slug")a.model.localScale=Vector3.Scale(a.model.localScale,new Vector3(1+Mathf.Sin(e.age*3)*.035f,1,1-Mathf.Sin(e.age*3)*.035f));
   else if(e.kind=="sporeling")a.model.localScale=Vector3.Scale(a.model.localScale,new Vector3(1+Mathf.Sin(e.age*5)*.04f,1-Mathf.Sin(e.age*5)*.05f,1+Mathf.Sin(e.age*5)*.04f));
   else if(e.kind=="wisp"||e.kind=="firefly"||e.kind=="riftling"){emission+=c*(.08f+.05f*Mathf.Sin(clock*3+e.id));if(CarrotQuality.High&&dt>0){a.moteClock+=dt;if(a.moteClock>.5f){a.moteClock=0;effects.Burst(a.root.transform.position+Vector3.up*.3f,new Color(c.r,c.g,c.b,.45f),1,.08f,.65f,.12f);}}}
   if(mini&&a.animation==null){switch(e.kind){
    case "warDrummer":PartTurn(a,13,new Vector3(Mathf.Sin(e.age*8)*4+cast*8,0,0));break;
    case "frostHerald":case "witherPriest":case "graveCaller":PartTurn(a,16,new Vector3(-cast*10,Mathf.Sin(clock*1.4f)*4,0));break;
    case "lanternLeech":PartTurn(a,14,new Vector3(Mathf.Sin(e.age*4)*8,0,Mathf.Cos(e.age*3)*12));break;
    case "ironSnail":PartScale(a.expansionParts[15],Vector3.one*(1+(e.shield>0?.025f:0)));break;
    case "emberBoar":if(cast>0)a.model.localRotation=Quaternion.Euler(8,0,Mathf.Sin(clock*16)*1.2f)*a.modelRotation;break;
    case "portalSentinel":if(a.ring!=null)RotatePart(a.ring,Quaternion.Euler(0,clock*(cast>0?140:40),0));break;
   }}
  }
  void ExpansionEvent(CarrotEvent e){
   if(e.type=="ability"&&e.kind=="blackout"){expansionBlackoutUntil=game.blindUntil;expansionBlackoutFading=true;}
   if(e.type=="abilityTarget"&&(e.kind=="riftBlink"||e.kind=="portalBlink"||e.kind=="portalShift"||e.kind=="reincarnate")){if(enemies.TryGetValue(e.id,out var actor))effects.Echo(actor.root,e.position,e.to,.45f);}
   if(e.type=="ability"&&e.kind=="reincarnate"&&e.value>=2){fovPunch=1.3f;}
  }
  Material PortalSurface(){if(portalSurface!=null)return portalSurface;var shader=Shader.Find("Carrot/PortalAperture");if(shader==null)shader=Shader.Find("Carrot/FxAdditive");portalSurface=new Material(shader);portalSurface.name="Observatory aperture";portalSurface.SetColor("_Color",new Color(.12f,.65f,.92f,1));materials["portal-aperture"]=portalSurface;return portalSurface;}
  void UpdateExpansionScene(float dt){
   if(expansionBlackoutFading&&game.elapsed>=expansionBlackoutUntil&&blindLevel<=.001f)expansionBlackoutFading=false;
   if(portalArenaRings.Count>0){for(int i=0;i<portalArenaRings.Count;i++){var ring=portalArenaRings[i];if(ring!=null)RotatePart(ring,Quaternion.Euler(0,0,clock*(i%2==0?7:-11)));}}
   if(portalApertures.Count>0){properties.Clear();properties.SetFloat("_Phase",clock);properties.SetFloat("_Power",.85f+.10f*Mathf.Sin(clock*.7f));for(int i=portalApertures.Count-1;i>=0;i--){var r=portalApertures[i];if(r==null){portalApertures.RemoveAt(i);continue;}r.SetPropertyBlock(properties);}}
  }
  void ApplyPortalLighting(){if(game.level.boss!="portal")return;sun.color=new Color(.72f,.84f,1);sun.intensity=1.65f;sun.transform.rotation=Quaternion.Euler(43,-35,0);fill.color=new Color(.35f,.26f,.58f);fill.intensity=.32f;RenderSettings.ambientSkyColor=new Color(.19f,.24f,.4f);RenderSettings.ambientEquatorColor=new Color(.19f,.25f,.33f);RenderSettings.ambientGroundColor=new Color(.07f,.10f,.16f);RenderSettings.fogColor=new Color(.09f,.13f,.22f);RenderSettings.fogStartDistance=26;RenderSettings.fogEndDistance=64;skyMaterial.SetColor("_Zenith",new Color(.012f,.026f,.07f));skyMaterial.SetColor("_Horizon",new Color(.16f,.23f,.35f));skyMaterial.SetColor("_Ground",new Color(.05f,.08f,.13f));skyMaterial.SetFloat("_Stars",1);skyMaterial.SetFloat("_Aurora",.7f);skyMaterial.SetColor("_AuroraColor",new Color(.22f,.52f,.85f));skyMaterial.SetFloat("_CloudAmount",.18f);skyMaterial.SetColor("_CloudColor",new Color(.16f,.21f,.32f));}
  void BuildPortalTerrain(){
   var stone=Material("portal-foundation",new Color(.31f,.37f,.44f),1,.32f,.12f,1.7f);stone.SetFloat("_AlbedoSaturation",.22f);stone.SetFloat("_TextureScale",1.2f);stone.SetFloat("_BumpScale",.75f);
   foreach(var route in game.level.routes){var spline=RouteSpline(route);int n=Mathf.Clamp(Mathf.CeilToInt(spline.GetLength()/.30f),20,320);var vertices=new List<Vector3>();var uv=new List<Vector2>();var colors=new List<Color>();var tri=new List<int>();
    // A beveled stone bridge with real side walls; routes are drawn over it by the existing trail renderer.
    for(int i=0;i<=n;i++){float t=i/(float)n;var q=spline.EvaluatePosition(t);var tangent=spline.EvaluateTangent(t);Vector3 p=new Vector3(q.x,0,q.z),side=Vector3.Cross(new Vector3(tangent.x,0,tangent.z).normalized,Vector3.up);float rough=Mathf.PerlinNoise(p.x*2,p.z*2)*.07f;
     Vector2[] section={new Vector2(-.64f,-.5f-rough),new Vector2(-.66f,-.1f),new Vector2(-.56f,.028f),new Vector2(.56f,.028f),new Vector2(.66f,-.1f),new Vector2(.64f,-.5f-rough)};
     for(int j=0;j<6;j++){vertices.Add(p+side*section[j].x+Vector3.up*section[j].y);uv.Add(new Vector2(j*.2f,t*n*.3f));colors.Add(j==2||j==3?Color.white:new Color(.6f,.68f,.77f));if(i>0&&j<5){int v=i*6+j;tri.AddRange(new[]{v-6,v-5,v,v-5,v+1,v});}}
    }
    var mesh=new Mesh{name="Carved floating bridge"};mesh.SetVertices(vertices);mesh.SetUVs(0,uv);mesh.SetColors(colors);mesh.SetTriangles(tri,0);mesh.RecalculateNormals();mesh.RecalculateBounds();var obj=MeshObject("Observatory bridge",mesh,stone,decoration);obj.AddComponent<MeshCollider>().sharedMesh=mesh;
   }
   var platform=Material("portal-platform",new Color(.45f,.5f,.56f),1,.32f,.12f,1.6f);platform.SetFloat("_AlbedoSaturation",.2f);
   foreach(var p in game.level.pads){Primitive("Floating tower terrace",PrimitiveType.Cylinder,p+Vector3.down*.17f,new Vector3(1.55f,.19f,1.55f),platform,decoration);PortalIsland(p,1.0f,.95f,stone);}
   foreach(var blocker in game.blockers){Vector3 p=blocker.position;Primitive("Obstacle terrace",PrimitiveType.Cylinder,p+Vector3.down*.17f,new Vector3(1.35f,.19f,1.35f),platform,decoration);}
   var route0=game.level.routes[0];Vector3 goal=route0[route0.Length-1];Primitive("Golden refuge terrace",PrimitiveType.Cylinder,goal+Vector3.down*.16f,new Vector3(2.7f,.20f,2.7f),platform,decoration);PortalIsland(goal,1.6f,1.8f,stone);
   var far=new[]{new Vector3(-10,-1,7),new Vector3(9,-2,9),new Vector3(1,-1,10),new Vector3(-10,-2,-3)};for(int i=0;i<far.Length;i++)PortalIsland(far[i],1.5f+i*.18f,2.6f,stone);
  }
  void PortalIsland(Vector3 p,float radius,float depth,Material stone){
   const int n=14;var v=new List<Vector3>();var colors=new List<Color>();var uv=new List<Vector2>();var tris=new List<int>();
   for(int row=0;row<3;row++)for(int i=0;i<=n;i++){float a=i*Mathf.PI*2/n;float r=radius*(row==0?.65f:row==1?.85f:.18f)*(1+.12f*Mathf.Sin(i*2.4f+p.x));float y=row==0?-.18f:row==1?-.65f:-depth;v.Add(p+new Vector3(Mathf.Cos(a)*r,y,Mathf.Sin(a)*r));uv.Add(new Vector2(i/(float)n,row*.5f));colors.Add(Color.Lerp(new Color(.25f,.33f,.45f),Color.white,1-row*.28f));if(row>0&&i<n){int q=row*(n+1)+i,k=q-n-1;tris.AddRange(new[]{k,k+1,q,k+1,q+1,q});}}
   var mesh=new Mesh{name="Fractured observatory island"};mesh.SetVertices(v);mesh.SetColors(colors);mesh.SetUVs(0,uv);mesh.SetTriangles(tris,0);mesh.RecalculateNormals();mesh.RecalculateBounds();MeshObject("Suspended rock footing",mesh,stone,decoration);
  }
  void BuildPortalArena(){
   var brass=Material("portal-oxidized-brass",new Color(.5f,.40f,.19f),5,.52f,.7f,1.15f);var obsidian=Material("portal-carved-stone",new Color(.29f,.34f,.41f),1,.28f,.12f,1.7f);var teal=Material("portal-inlay",new Color(.14f,.7f,.72f),5,.6f,.4f,1);teal.SetColor("_EmissionColor",new Color(.05f,.55f,.64f));
   var roots=new[]{new Vector3(-7.8f,1.3f,6.6f),new Vector3(6.8f,1.6f,7.5f),new Vector3(.4f,2.8f,9)};
   for(int i=0;i<roots.Length;i++){Vector3 p=roots[i];float r=i==2?1.25f:.95f;var gate=new GameObject("Ancient observatory gate").transform;gate.SetParent(world,false);gate.position=p;gate.rotation=Quaternion.Euler(i==1?-12:8,i==0?22:-18,i==0?-12:16);
    var ring=MeshObject("Carved segmented arch",PortalTorus(r,.12f,38,7),obsidian,gate);ring.transform.localRotation=Quaternion.identity;
    var inner=MeshObject("Brass celestial band",PortalTorus(r-.13f,.032f,48,5),brass,gate);portalArenaRings.Add(inner.transform);
    var outer=MeshObject("Outer astral band",PortalTorus(r+.14f,.035f,48,5),brass,gate);outer.transform.localRotation=Quaternion.Euler(12,18,0);portalArenaRings.Add(outer.transform);
    var eye=Primitive("Distant void aperture",PrimitiveType.Quad,Vector3.zero,Vector3.one*(r*1.72f),PortalSurface(),gate);var er=eye.GetComponent<Renderer>();er.shadowCastingMode=ShadowCastingMode.Off;er.receiveShadows=false;portalApertures.Add(er);
    for(int k=0;k<12;k++){float a=k*Mathf.PI/6;Vector3 d=new Vector3(Mathf.Cos(a),Mathf.Sin(a),0);var tile=Primitive("Engraved arch stone",PrimitiveType.Cube,d*(r+.04f),new Vector3(.16f,.23f,.18f),obsidian,gate);tile.transform.localRotation=Quaternion.Euler(0,0,a*Mathf.Rad2Deg-90);var rune=Primitive("Cyan astral notch",PrimitiveType.Cube,d*(r+.045f)+Vector3.back*.12f,new Vector3(.035f,.12f,.018f),teal,gate);rune.transform.localRotation=tile.transform.localRotation;}
    // Heavy columns ground the composition; broken capitals make the distant ruin recognizable.
    for(int side=-1;side<=1;side+=2){Vector3 q=p+new Vector3(side*(r+.45f),-2,0);Primitive("Observatory pillar",PrimitiveType.Cylinder,q,new Vector3(.28f,1.25f,.28f),obsidian,decoration);for(int cap=0;cap<2;cap++)Primitive("Carved pillar capital",PrimitiveType.Cylinder,q+Vector3.up*(cap==0?-1.1f:1.1f),new Vector3(.43f,.08f,.43f),brass,decoration);}
   }
   // Continuous turquoise guide marks are inlaid into each bridge edge, never laid over enemies.
   foreach(var route in game.level.routes){var spline=RouteSpline(route);float t=0;int index=0;while(t<1){var q=UnityEngine.Splines.SplineUtility.GetPointAtLinearDistance(spline,t,.7f,out float next);if(next<=t||next>=1)break;t=next;var tangent=spline.EvaluateTangent(t);Vector3 dir=new Vector3(tangent.x,0,tangent.z).normalized,side=Vector3.Cross(dir,Vector3.up),p=new Vector3(q.x,.07f,q.z);for(int sign=-1;sign<=1;sign+=2){var mark=Primitive("Bridge turquoise inlay",PrimitiveType.Cube,p+side*sign*.46f,new Vector3(.028f,.012f,.28f),teal,decoration);mark.transform.rotation=Quaternion.LookRotation(dir);}if(index++%5==0){var bar=Primitive("Brass bridge seam",PrimitiveType.Cube,p+Vector3.down*.017f,new Vector3(1.14f,.015f,.025f),brass,decoration);bar.transform.rotation=Quaternion.LookRotation(dir);}}}
   // Low warm lights distinguish the carrot refuge from the cold rift world.
   var first=game.level.routes[0];Vector3 goal=first[first.Length-1];var gold=Material("portal-refuge-light",new Color(1,.72f,.27f),5,.5f,.5f);gold.SetColor("_EmissionColor",new Color(1.3f,.52f,.10f));
   for(int i=0;i<3;i++){float a=(i*100+25)*Mathf.Deg2Rad;Vector3 p=goal+new Vector3(Mathf.Cos(a)*1.1f,.08f,Mathf.Sin(a)*1.1f);Primitive("Refuge brass lantern base",PrimitiveType.Cylinder,p+Vector3.up*.15f,new Vector3(.12f,.2f,.12f),brass,decoration);Primitive("Refuge lantern",PrimitiveType.Sphere,p+Vector3.up*.39f,Vector3.one*.15f,gold,decoration);}
  }
  Mesh PortalTorus(float radius,float thickness,int segments,int sides){var v=new List<Vector3>();var uv=new List<Vector2>();var colors=new List<Color>();var t=new List<int>();for(int i=0;i<=segments;i++){float a=i*Mathf.PI*2/segments;Vector3 radial=new Vector3(Mathf.Cos(a),Mathf.Sin(a),0);for(int j=0;j<=sides;j++){float b=j*Mathf.PI*2/sides;v.Add(radial*(radius+Mathf.Cos(b)*thickness)+Vector3.forward*Mathf.Sin(b)*thickness);uv.Add(new Vector2(i/(float)segments,j/(float)sides));colors.Add(Color.white);if(i<segments&&j<sides){int k=i*(sides+1)+j;t.AddRange(new[]{k,k+sides+1,k+1,k+1,k+sides+1,k+sides+2});}}}var mesh=new Mesh{name="Carved celestial torus"};mesh.SetVertices(v);mesh.SetUVs(0,uv);mesh.SetColors(colors);mesh.SetTriangles(t,0);mesh.RecalculateNormals();mesh.RecalculateBounds();return mesh;}
 }
}
