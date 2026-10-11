using UnityEngine;
public partial class ForgeWorld {
 float emberClock;Transform[] motes;
 void MakeDressing(){
  var barrel=Group("Quench barrel",new Vector3(-1.18f,0,-.08f));
  for(int i=0;i<20;i++){float a=i*Mathf.PI*2/20;var stave=Box("Oak barrel stave",new Vector3(Mathf.Cos(a)*.245f,.34f,Mathf.Sin(a)*.245f),new Vector3(.077f,.67f,.035f),wood,barrel);stave.transform.localRotation=Quaternion.Euler(0,-a*Mathf.Rad2Deg,0);}
  for(int i=0;i<3;i++){var hoop=MeshObject("Barrel hoop",RingMesh(),iron);hoop.transform.SetParent(barrel,false);hoop.transform.localPosition=Vector3.up*(.09f+i*.245f);hoop.transform.localScale=Vector3.one*.27f;}
  var water=Mat("Quench water","233031",.4f,.96f);Primitive("Water meniscus",PrimitiveType.Cylinder,new Vector3(0,.57f,0),new Vector3(.455f,.005f,.455f),water,barrel);
  for(int i=0;i<12;i++){float a=i*.77f;var offcut=Box("Steel offcut",new Vector3(.58f+Mathf.Cos(a)*.18f,.922f,.4f+Mathf.Sin(a)*.14f),new Vector3(.02f,.006f,.08f),iron);offcut.transform.Rotate(0,i*43,0);}
  var bellows=Primitive("Leather bellows",PrimitiveType.Sphere,new Vector3(-1.65f,1.00f,.89f),new Vector3(.57f,.14f,.3f),leather);bellows.transform.Rotate(0,-15,0);
  Box("Bellows board",new Vector3(-1.65f,1.075f,.89f),new Vector3(.5f,.024f,.29f),wood).transform.Rotate(0,-15,0);
  Box("Bellows lever",new Vector3(-1.35f,1.045f,.81f),new Vector3(.3f,.033f,.06f),wood);
  var clay=Mat("Unglazed clay","8a6e51",0,.15f);
  for(int i=0;i<3;i++){var p=new Vector3(.1f+i*.24f,1.025f,1.6f);Primitive("Clay flux pot",PrimitiveType.Cylinder,p,new Vector3(.15f,.09f,.15f),clay);Primitive("Dark pot opening",PrimitiveType.Cylinder,p+Vector3.up*.092f,new Vector3(.123f,.001f,.123f),coal);}
  for(int i=0;i<5;i++){Box("Stored fuel",new Vector3(-2.85f+(i%2)*.17f,.08f+(i/2)*.13f,-.1f),new Vector3(.15f,.13f,.45f),wood).transform.Rotate(0,i*13,0);}
  var dust=new Material(Shader.Find("Forge/Glow"));dust.SetColor("_Color",new Color(.9f,.71f,.4f,.10f));motes=new Transform[18];
  for(int i=0;i<motes.Length;i++){var mote=Primitive("Drifting forge dust",PrimitiveType.Quad,new Vector3(-2.5f+(i%6)*.85f,1.4f+(i/6)*.45f,-.2f+(i%3)*.55f),Vector3.one*.004f,dust);motes[i]=mote.transform;}
 }
 void UpdateAtmosphere(float dt){if(reduced)return;emberClock+=dt;if(emberClock>.22f){emberClock=0;Burst(spots["furnace"]+new Vector3(Mathf.Sin(elapsed*4)*.2f,.12f,-.22f),1,"good");}if(motes!=null)for(int i=0;i<motes.Length;i++){var t=motes[i];t.position+=new Vector3(Mathf.Sin(elapsed*.4f+i)*.018f,.025f,Mathf.Cos(elapsed*.3f+i)*.008f)*dt;if(t.position.y>3)t.position=new Vector3(t.position.x,1.2f,t.position.z);t.rotation=cam.transform.rotation;}}
}
