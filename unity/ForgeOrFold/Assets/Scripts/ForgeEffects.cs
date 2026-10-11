using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

public partial class ForgeWorld {
 class SmokePuff {public Transform root;public Renderer renderer;public Vector3 velocity;public float age,life,size,opacity,spin;public Color color;}
 class SaleGhost {public Body body;public Vector3 start;public Quaternion rotation;public float age;public bool paid;}
 readonly List<SmokePuff> smoke=new List<SmokePuff>();
 readonly Stack<SmokePuff> smokePool=new Stack<SmokePuff>();
 readonly List<SaleGhost> sales=new List<SaleGhost>();
 Material smokeMaterial;MaterialPropertyBlock smokeProperties;Mesh coinMesh;float smokeClock;

 void Puff(Vector3 at,int count,bool hot=false){
  if(reduced)return;
  if(smokeMaterial==null){smokeMaterial=new Material(Shader.Find("Forge/Smoke"));smokeProperties=new MaterialPropertyBlock();}
  for(int i=0;i<count&&smoke.Count<(Screen.width<700?20:36);i++){
   SmokePuff p;if(smokePool.Count>0){p=smokePool.Pop();p.root.gameObject.SetActive(true);}else{var go=Primitive("Forge smoke",PrimitiveType.Quad,at,Vector3.one,smokeMaterial);var renderer=go.GetComponent<Renderer>();renderer.shadowCastingMode=ShadowCastingMode.Off;renderer.receiveShadows=false;p=new SmokePuff{root=go.transform,renderer=renderer};}
   p.root.position=at+Random.insideUnitSphere*.035f;p.velocity=new Vector3(Random.Range(-.09f,.09f),Random.Range(.12f,.3f),Random.Range(-.05f,.06f));p.age=-i*.035f;p.life=Random.Range(.7f,1.4f);p.size=Random.Range(.09f,.19f);p.opacity=hot?.2f:.48f;p.color=hot?new Color(.57f,.43f,.3f):new Color(.5f,.47f,.43f);p.spin=Random.Range(0,360);smoke.Add(p);
  }
 }
 void KeepSale(Body b){
  var collider=b.root.GetComponent<Collider>();if(collider)collider.enabled=false;
  sales.Add(new SaleGhost{body=b,start=b.root.transform.position,rotation=b.root.transform.rotation});
 }
 void UpdateEffects(float dt){
  smokeClock+=dt;if(smokeClock>.55f){smokeClock=0;Puff(spots["furnace"]+new Vector3(0,.22f,-.22f),1,true);}
  for(int i=smoke.Count-1;i>=0;i--){var p=smoke[i];p.age+=dt;float t=p.age/p.life;if(t>=1){p.root.gameObject.SetActive(false);smokePool.Push(p);smoke.RemoveAt(i);continue;}p.root.position+=p.velocity*dt;p.root.rotation=cam.transform.rotation*Quaternion.Euler(0,0,p.spin+p.age*12);p.root.localScale=Vector3.one*p.size*(1+Mathf.Max(0,t)*2.8f);var c=p.color;c.a=Mathf.Sin(Mathf.Clamp01(t)*Mathf.PI)*p.opacity;smokeProperties.SetColor("_Color",c);p.renderer.SetPropertyBlock(smokeProperties);}
  for(int i=sales.Count-1;i>=0;i--){var sale=sales[i];sale.age+=dt;float t=Mathf.Clamp01(sale.age/.48f);var end=spots["sell"]+new Vector3(-.12f,.145f,0);sale.body.root.transform.position=Vector3.Lerp(sale.start,end,Mathf.SmoothStep(0,1,t))+Vector3.up*Mathf.Sin(t*Mathf.PI)*.24f;sale.body.root.transform.rotation=Quaternion.Slerp(sale.rotation,Quaternion.identity,t);if(t>=1&&!sale.paid){sale.paid=true;scaleAge=0;Burst(end+Vector3.up*.06f,reduced?5:22,"coin");}if(sale.age>.83f)sale.body.root.transform.localScale*=Mathf.Exp(-dt*12);if(sale.age>1.2f){DisposeBody(sale.body);sales.RemoveAt(i);}}
 }
 // Break the actual blade surface into solid triangular splinters, retaining its silhouette.
 void BreakBlade(Body body){
  if(reduced)return;var mesh=body.blade.GetComponent<MeshFilter>().sharedMesh;var vertices=mesh.vertices;var indices=mesh.triangles;var pieces=new Queue<Vector3[]>();var tint=new MaterialPropertyBlock();tint.SetColor("_Color",body.metal.color);
  // Use one outer face, then split long triangles so fragments cannot become metre-long needles.
  for(int i=0;i+2<indices.Length;i+=3){var a=body.blade.transform.TransformPoint(vertices[indices[i]]);var b=body.blade.transform.TransformPoint(vertices[indices[i+1]]);var c=body.blade.transform.TransformPoint(vertices[indices[i+2]]);if(Vector3.Cross(b-a,c-a).normalized.y>.25f)pieces.Enqueue(new[]{a,b,c});}
  int made=0,splits=0;while(pieces.Count>0&&made<64&&fragments.Count<220){var tri=pieces.Dequeue();var a=tri[0];var b=tri[1];var c=tri[2];float ab=(b-a).sqrMagnitude,bc=(c-b).sqrMagnitude,ca=(a-c).sqrMagnitude;
   if(Mathf.Max(ab,bc,ca)>.0121f&&splits++<256){if(ab>=bc&&ab>=ca){var m=(a+b)/2;pieces.Enqueue(new[]{a,m,c});pieces.Enqueue(new[]{m,b,c});}else if(bc>=ca){var m=(b+c)/2;pieces.Enqueue(new[]{a,b,m});pieces.Enqueue(new[]{a,m,c});}else{var m=(c+a)/2;pieces.Enqueue(new[]{a,b,m});pieces.Enqueue(new[]{m,b,c});}continue;}
   var cross=Vector3.Cross(b-a,c-a);if(cross.sqrMagnitude<.000000001f)continue;var center=(a+b+c)/3;var normal=cross.normalized*.002f;
   var shard=new Mesh{name="Blade splinter"};shard.vertices=new[]{a-center+normal,b-center+normal,c-center+normal,a-center-normal,b-center-normal,c-center-normal};shard.triangles=new[]{0,1,2,5,4,3,0,3,4,0,4,1,1,4,5,1,5,2,2,5,3,2,3,0};shard.RecalculateNormals();shard.RecalculateBounds();
   int before=fragments.Count;Burst(center,1,"shatter");if(fragments.Count==before){Destroy(shard);continue;}var p=fragments[fragments.Count-1];p.mesh=shard;p.root.GetComponent<MeshFilter>().sharedMesh=shard;p.root.transform.rotation=Quaternion.identity;p.root.transform.localScale=Vector3.one;p.renderer.SetPropertyBlock(tint);p.velocity=new Vector3((center.x+.2f)*1.5f,Random.Range(.45f,1.2f),Random.Range(-.65f,.65f));p.life=p.maxLife=Random.Range(1.2f,2.1f);made++;
  }
 }

 Mesh CoinMesh(){
  if(coinMesh!=null)return coinMesh;var v=new List<Vector3>();var triangles=new List<int>();const int segments=16;
  v.Add(Vector3.up*.5f);v.Add(Vector3.down*.5f);
  for(int i=0;i<segments;i++){float angle=i*Mathf.PI*2/segments;v.Add(new Vector3(Mathf.Cos(angle)*.5f,.5f,Mathf.Sin(angle)*.5f));v.Add(new Vector3(Mathf.Cos(angle)*.5f,-.5f,Mathf.Sin(angle)*.5f));}
  for(int i=0;i<segments;i++){int a=2+i*2,b=2+((i+1)%segments)*2;triangles.AddRange(new[]{0,b,a,1,a+1,b+1,a,b,b+1,a,b+1,a+1});}
  coinMesh=new Mesh{name="Minted coins"};coinMesh.SetVertices(v);coinMesh.SetTriangles(triangles,0);coinMesh.RecalculateNormals();return coinMesh;
 }
 void DisposeEffects(){foreach(var sale in sales)DisposeBody(sale.body);foreach(var p in fragments)if(p.mesh)Destroy(p.mesh);if(smokeMaterial)Destroy(smokeMaterial);if(coinMesh)Destroy(coinMesh);}
}
