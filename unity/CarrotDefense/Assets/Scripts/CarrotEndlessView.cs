using UnityEngine;
using UnityEngine.Rendering;

namespace CarrotTD {
 /// <summary>
 /// Twin Gates (two-player endless, id 90): the art the shared map adds on top of the two mirrored orchard wings the decoration
 /// passes already dress. Both gates sit in the back corners as stone portals with a pennant in the colour of the seat whose home
 /// wing they open; the two lanes meet at a paved junction plaza at the front centre and walk the curbed boulevard back to the carrot;
 /// lantern posts stand on the four lit pads (13, 30, 14, 31: towers there keep full sight in Blindness); and an orchard meadow grows
 /// behind the carrot. Everything is static, batched with the decoration and kept clear of all 35 pads and both routes.
 /// </summary>
 public sealed partial class CarrotView {
  void BuildEndlessArt(){
   if(!EndlessMap||game==null||game.level==null||game.level.routes.Length<2)return;
   var stone=Material("entry-stone",new Color(.86f,.9f,.8f),1,.25f,0,1.8f);var dressed=Material("endless-dressed-stone",new Color(.78f,.74f,.64f),1,.3f,0,1.7f);
   var paving=Material("endless-paving",new Color(.92f,.84f,.68f),1,.24f,0,2.1f);paving.SetFloat("_AlbedoSaturation",.4f);
   var pole=Material("banner-pole",new Color(.42f,.31f,.2f),2,.3f);
   // The gates: two pillars, capitals and a lintel across each lane start, set just outside the existing arch, plus a home pennant.
   for(int r=0;r<2;r++){
    var route=game.level.routes[r];Vector3 p=route[0],dir=route[1]-route[0];dir.y=0;if(dir.sqrMagnitude<1e-4f)continue;dir.Normalize();Vector3 side=Vector3.Cross(Vector3.up,dir);
    int home=p.x<0?0:1;Color c=home==(duoCfg.seat==1?1:0)?LocalColour:PartnerColour;Vector3 gate=p-dir*.45f;float gy=TerrainHeight(gate);
    for(int s=-1;s<=1;s+=2){Vector3 q=gate+side*s*1.08f;float y=TerrainHeight(q);Primitive("Twin Gates pillar",PrimitiveType.Cylinder,q+Vector3.up*(y+.78f),new Vector3(.34f,.78f,.34f),stone,decoration);Primitive("Twin Gates capital",PrimitiveType.Cube,q+Vector3.up*(y+1.6f),new Vector3(.5f,.13f,.5f),dressed,decoration);}
    var lintel=Primitive("Twin Gates lintel",PrimitiveType.Cube,gate+Vector3.up*(gy+1.74f),new Vector3(2.7f,.2f,.36f),dressed,decoration);lintel.transform.rotation=Quaternion.LookRotation(dir);
    Vector3 top=gate+side*(p.x<0?-1.08f:1.08f);float ty=TerrainHeight(top);Primitive("Home pennant pole",PrimitiveType.Cylinder,top+Vector3.up*(ty+2.05f),new Vector3(.04f,.4f,.04f),pole,decoration,true);
    var cloth=Material("banner-"+ColorUtility.ToHtmlStringRGB(c),c*.8f,-1,.2f);cloth.SetColor("_EmissionColor",c*.35f);cloth.SetFloat("_Cull",0);cloth.SetFloat("_SnowStrength",0);
    var flag=Primitive("Home pennant",PrimitiveType.Cube,top+Vector3.up*(ty+2.25f)+side*(p.x<0?-.2f:.2f),new Vector3(.4f,.26f,.02f),cloth,decoration);flag.transform.rotation=Quaternion.LookRotation(dir);flag.GetComponent<Renderer>().shadowCastingMode=ShadowCastingMode.Off;
    LogDecor(gate,2.4f,false);
   }
   // The shared boulevard: the last leg both routes have in common, curbed both sides, with a paved plaza at the junction.
   var lane=game.level.routes[0];Vector3 a=lane[lane.Length-2],b=lane[lane.Length-1];Vector3 along=b-a;float length=along.magnitude;
   if(length>.5f){along/=length;Vector3 across=Vector3.Cross(Vector3.up,along);
    for(float t=.9f;t<=length-.7f;t+=.48f)for(int s=-1;s<=1;s+=2){Vector3 q=a+along*t+across*s*.6f;float y=TerrainHeight(q);var curb=Primitive("Boulevard curb",PrimitiveType.Cube,q+Vector3.up*(y+.05f),new Vector3(.12f,.09f,.42f),dressed,decoration,true);curb.transform.rotation=Quaternion.LookRotation(along);}
    var plaza=MeshObject("Junction plaza",Disc(1.3f,40),paving,decoration);plaza.transform.localPosition=a+Vector3.up*(TerrainHeight(a)+.054f);plaza.GetComponent<Renderer>().shadowCastingMode=ShadowCastingMode.Off;
    for(int s=-1;s<=1;s+=2){Vector3 q=a+along*.95f+across*s*.95f;float y=TerrainHeight(q);Primitive("Plaza bollard",PrimitiveType.Cylinder,q+Vector3.up*(y+.2f),new Vector3(.16f,.2f,.16f),stone,decoration,true);Primitive("Plaza bollard cap",PrimitiveType.Sphere,q+Vector3.up*(y+.42f),new Vector3(.2f,.1f,.2f),dressed,decoration,true);}
    LogDecor(a,2.6f,false);}
   // Lantern posts on the lit pads, offset away from the boulevard; the lights only on the host (endless has no spectator).
   var post=Material("lantern-post",new Color(.28f,.22f,.16f),2,.25f);var glass=Material("lantern",new Color(1,.76f,.22f),5,.65f,.3f);glass.SetColor("_EmissionColor",LanternGlow);
   foreach(int pad in CarrotDuoMaps.EndlessLitPads){if(pad<0||pad>=game.level.pads.Length)continue;Vector3 q=game.level.pads[pad];Vector3 foot=q+new Vector3(q.x<0?-.62f:.62f,0,.5f);float y=TerrainHeight(foot);
    Primitive("Lantern post",PrimitiveType.Cylinder,foot+Vector3.up*(y+.55f),new Vector3(.07f,.55f,.07f),post,decoration,true);Primitive("Lantern arm",PrimitiveType.Cube,foot+Vector3.up*(y+1.08f),new Vector3(.3f,.05f,.05f),post,decoration);
    var lamp=Primitive("Lantern glass",PrimitiveType.Sphere,foot+Vector3.up*(y+1.0f),Vector3.one*.17f,glass,decoration);lamp.GetComponent<Renderer>().shadowCastingMode=ShadowCastingMode.Off;
    if(!Spectator){var lightGo=new GameObject("Lantern light");lightGo.transform.SetParent(decoration,false);lightGo.transform.localPosition=foot+Vector3.up*(y+1.05f);var light=lightGo.AddComponent<Light>();light.type=LightType.Point;light.range=2.8f;light.intensity=6;light.color=new Color(1,.72f,.3f);light.shadows=LightShadows.None;lanterns.Add(light);}
    LogDecor(foot,.3f);}
   // The back meadow behind the carrot: small fruit trees and flowers, clear of pad 34 and the two gate lanes.
   var rng=new System.Random(9091);
   foreach(var at in new[]{new Vector3(-2.7f,0,7.3f),new Vector3(2.5f,0,7.7f),new Vector3(-.3f,0,8.7f)}){if(!PropFree(at,1.4f))continue;var model=Modelled(treeAutumn)??treeAutumn;if(model!=null)PlaceNature(model,at,1.9f+(float)rng.NextDouble()*.5f,(float)rng.NextDouble()*360);}
   for(int i=0;i<14;i++){Vector3 p=new Vector3((float)rng.NextDouble()*8.4f-4.2f,0,5.7f+(float)rng.NextDouble()*2.6f);if(IsFree(p,.9f))Flower(p,.18f+(float)rng.NextDouble()*.12f,i%3==0?Color.white:new Color(1,.8f,.36f));}
  }
 }
}
