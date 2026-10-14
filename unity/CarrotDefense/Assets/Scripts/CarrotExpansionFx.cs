using System.Collections.Generic;
using UnityEngine;

namespace CarrotTD {
 // Physical projectile silhouettes share the existing shell pool. These meshes and materials
 // are created once, and never add a renderer to the battlefield during combat.
 public sealed partial class FxPool {
  public Mesh spear,thorn,petal,pod,crescent;public Material botanicalShell;
  readonly Mesh[] expansionEmblems=new Mesh[10];
  static readonly string[] ExpansionOrder={"bamboo","chili","lotus","magnet","orchid","mushroom","cactus","clockflower","dragonfruit","moonflower"};
  void BuildExpansionMeshes(){
   spear=Lathe("Bamboo spear",new[]{new Vector2(0,-.7f),new Vector2(.06f,-.65f),new Vector2(.06f,.36f),new Vector2(.16f,.38f),new Vector2(0,.9f)},8);
   thorn=Lathe("Barbed cactus thorn",new[]{new Vector2(0,-.35f),new Vector2(.12f,-.28f),new Vector2(.065f,-.1f),new Vector2(.14f,-.08f),new Vector2(.05f,.16f),new Vector2(0,.72f)},7);
   pod=Lathe("Living spore pod",new[]{new Vector2(0,-.42f),new Vector2(.18f,-.32f),new Vector2(.29f,-.04f),new Vector2(.24f,.22f),new Vector2(.10f,.36f),new Vector2(0,.45f)},12);
   petal=Petal();crescent=Crescent();int[] cells={FxSheet.Leaf,FxSheet.Ember,FxSheet.Petal,FxSheet.Bolt,FxSheet.Pollen,FxSheet.StarGlyph,FxSheet.Root,FxSheet.Clock,FxSheet.Star6,FxSheet.Star4};for(int i=0;i<cells.Length;i++)expansionEmblems[i]=FlatQuad(FxSheet.Cell(cells[i]));
   botanicalShell=Mat("Carrot/Storybook");botanicalShell.color=Color.white;botanicalShell.SetFloat("_Glossiness",.48f);botanicalShell.SetFloat("_Cull",0);
  }
  public Mesh ExpansionEmblem(string kind){int i=System.Array.IndexOf(ExpansionOrder,kind);return expansionEmblems[Mathf.Clamp(i,0,9)];}
  Mesh Lathe(string name,Vector2[] profile,int sides){
   var v=new List<Vector3>();var uv=new List<Vector2>();var colors=new List<Color>();var triangles=new List<int>();
   for(int row=0;row<profile.Length;row++)for(int col=0;col<=sides;col++){float a=col*Mathf.PI*2/sides;v.Add(new Vector3(Mathf.Cos(a)*profile[row].x,Mathf.Sin(a)*profile[row].x,profile[row].y));uv.Add(new Vector2(col/(float)sides,row/(float)(profile.Length-1)));colors.Add(Color.white);if(row==0||col==sides)continue;int q=row*(sides+1)+col,p=q-sides-1;triangles.AddRange(new[]{p,p+1,q,p+1,q+1,q});}
   return OwnedMesh(name,v,uv,colors,triangles);
  }
  Mesh Petal(){
   var v=new List<Vector3>();var uv=new List<Vector2>();var colors=new List<Color>();var triangles=new List<int>();
   const int rows=12;for(int i=0;i<=rows;i++){float t=i/(float)rows;float width=.34f*Mathf.Sin(t*Mathf.PI);for(int j=0;j<3;j++){float x=(j-1)*width;v.Add(new Vector3(x,(1-Mathf.Abs(j-1))*.07f+Mathf.Sin(t*Mathf.PI)*.12f,t-.5f));uv.Add(new Vector2(j*.5f,t));colors.Add(Color.white);if(i>0&&j<2){int p=i*3+j;triangles.AddRange(new[]{p-3,p,p-2,p-2,p,p+1});}}}return OwnedMesh("Curved lotus petal",v,uv,colors,triangles);
  }
  Mesh Crescent(){
   var v=new List<Vector3>();var uv=new List<Vector2>();var colors=new List<Color>();var triangles=new List<int>();const int n=24;
   for(int i=0;i<=n;i++){float t=i/(float)n,a=Mathf.Lerp(-145,145,t)*Mathf.Deg2Rad;float width=.24f*Mathf.Sin(t*Mathf.PI);for(int j=0;j<2;j++){float r=.55f-j*width;v.Add(new Vector3(Mathf.Cos(a)*r,Mathf.Sin(a)*r,0));uv.Add(new Vector2(t,j));colors.Add(Color.white);}if(i<n){int q=i*2;triangles.AddRange(new[]{q,q+2,q+1,q+1,q+2,q+3});}}return OwnedMesh("Lunar crescent",v,uv,colors,triangles);
  }
  Mesh OwnedMesh(string name,List<Vector3> v,List<Vector2> uv,List<Color> colors,List<int> triangles){var mesh=new Mesh{name=name};mesh.SetVertices(v);mesh.SetUVs(0,uv);mesh.SetColors(colors);mesh.SetTriangles(triangles,0);mesh.RecalculateNormals();mesh.RecalculateBounds();owned.Add(mesh);return mesh;}
 }
}
