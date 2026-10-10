using UnityEngine;
public partial class ForgeWorld {
 float emberClock;Transform[] motes;
 void MakeDressing(){
  // Solid voussoirs and a dark throat give the hearth a readable, curved silhouette.
  var darkStone=new Material(stone);darkStone.color=C("676963");
  for(int i=0;i<13;i++){float a=i*Mathf.PI/12;var block=Box("Hearth arch stone",new Vector3(-3.8f+Mathf.Cos(a)*1.05f,2.25f+Mathf.Sin(a)*.75f,2.47f),new Vector3(.34f,.44f,.45f),darkStone);block.transform.rotation=Quaternion.Euler(0,0,a*Mathf.Rad2Deg-90);}
  for(int i=0;i<6;i++){Box("Hearth iron grate",new Vector3(-4.6f+i*.31f,1.63f,2.4f),new Vector3(.045f,.37f,.06f),iron);}
  // Quench barrel: individual staves, hoops, water and the rim all catch different light.
  var barrel=Group("Quench barrel",new Vector3(2.45f,1.05f,1.25f));
  for(int i=0;i<18;i++){float a=i*Mathf.PI*2/18;var stave=Box("Curved oak stave",new Vector3(Mathf.Cos(a)*.44f,.34f,Mathf.Sin(a)*.44f),new Vector3(.16f,.68f,.09f),wood,barrel);stave.transform.localRotation=Quaternion.Euler(0,-a*Mathf.Rad2Deg,0);}
  for(int i=0;i<2;i++){var hoop=MeshObject("Barrel hoop",RingMesh(),iron);hoop.transform.SetParent(barrel,false);hoop.transform.localPosition=Vector3.up*(.12f+i*.44f);hoop.transform.localScale=Vector3.one*.5f;}
  var water=Mat("Still quench water","233e3d",.7f,.96f);Primitive("Water surface",PrimitiveType.Cylinder,new Vector3(0,.56f,0),new Vector3(.82f,.01f,.82f),water,barrel);
  for(int i=0;i<9;i++){float a=i*.77f;var shard=Box("Loose steel offcut",new Vector3(1.2f+Mathf.Cos(a)*.36f,1.08f,.38f+Mathf.Sin(a)*.3f),new Vector3(.08f,.013f,.19f),iron);shard.transform.Rotate(0,i*43,0);}
  // Leather bellows, brass nail heads and handles beside the fire.
  var bellows=Primitive("Leather bellows",PrimitiveType.Sphere,new Vector3(-2,1.18f,2.6f),new Vector3(1,.22f,.62f),leather);bellows.transform.Rotate(0,-20,0);
  Box("Bellows upper board",new Vector3(-2,1.31f,2.6f),new Vector3(.85f,.06f,.52f),wood).transform.Rotate(0,-20,0);
  Box("Bellows handle",new Vector3(-1.38f,1.24f,2.42f),new Vector3(.62f,.06f,.12f),wood);
  for(int i=0;i<7;i++)Primitive("Bellows nail",PrimitiveType.Sphere,new Vector3(-2.3f+i*.1f,1.353f,2.38f),Vector3.one*.025f,brass);
  // Clay vessels and rolled leather create depth without heavy imported meshes.
  var clay=Mat("Glazed clay","6c725b",.08f,.52f);
  for(int i=0;i<3;i++){float x=5.2f+i*.55f;Primitive("Storage vessel",PrimitiveType.Capsule,new Vector3(x,.44f,5.8f),new Vector3(.4f,.45f,.4f),clay);Primitive("Vessel lip",PrimitiveType.Cylinder,new Vector3(x,.86f,5.8f),new Vector3(.28f,.025f,.28f),brass);}
  var rolled=Primitive("Rolled apron leather",PrimitiveType.Cylinder,new Vector3(4.55f,1.22f,1.15f),new Vector3(.32f,.6f,.32f),leather);rolled.transform.Rotate(0,0,90);
  // A forged chain wraps the anvil block; each link is true geometry.
  for(int i=0;i<20;i++){float a=i*Mathf.PI*2/20;var link=MeshObject("Anvil securing chain",RingMesh(),iron);link.transform.position=new Vector3(Mathf.Sin(a)*.83f,.77f, -.7f+Mathf.Cos(a)*.75f);link.transform.rotation=Quaternion.Euler(90,a*Mathf.Rad2Deg,i%2*60);link.transform.localScale=new Vector3(.075f,.075f,.11f);}
  var dust=new Material(Shader.Find("Forge/Glow"));dust.SetColor("_Color",new Color(.9f,.71f,.4f,.12f));motes=new Transform[18];
  for(int i=0;i<motes.Length;i++){var mote=Primitive("Drifting forge dust",PrimitiveType.Quad,new Vector3(-4+(i%6)*1.5f,1.8f+(i/6)*.7f,2+(i%3)*.6f),Vector3.one*.018f,dust);motes[i]=mote.transform;}
 }
 void UpdateAtmosphere(float dt){
  if(reduced)return;emberClock+=dt;if(emberClock>.16f){emberClock=0;Burst(new Vector3(-3.8f+Mathf.Sin(elapsed*4)*.5f,1.6f,2.7f),1,"good");}
  if(motes!=null)for(int i=0;i<motes.Length;i++){var t=motes[i];t.position+=new Vector3(Mathf.Sin(elapsed*.4f+i)*.018f,.025f,Mathf.Cos(elapsed*.3f+i)*.008f)*dt;if(t.position.y>4)t.position=new Vector3(t.position.x,1.5f,t.position.z);t.rotation=cam.transform.rotation;}
 }
}
