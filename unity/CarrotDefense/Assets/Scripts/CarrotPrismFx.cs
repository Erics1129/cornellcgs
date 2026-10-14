using UnityEngine;

namespace CarrotTD {
 public sealed partial class FxPool {
  public sealed class PrismRibbon {public Slot slot;public Mesh mesh;public Vector3[] vertices;public Color[] colors;public float age,life,width,lift,travel;public Vector3 from,to;}
  public PrismRibbon[] prismRibbons;
  public const int RibbonSegments=24,RibbonStrands=3;
  void BuildPrismRibbons(Transform root){prismRibbons=new PrismRibbon[CarrotQuality.Rich?3:2];for(int r=0;r<prismRibbons.Length;r++){
   int count=(RibbonSegments+1)*2*RibbonStrands;var vertices=new Vector3[count];var colors=new Color[count];var uv=new Vector2[count];var triangles=new int[RibbonSegments*6*RibbonStrands];Rect cell=FxSheet.Cell(FxSheet.GlowSoft);
   for(int strand=0;strand<RibbonStrands;strand++)for(int i=0;i<=RibbonSegments;i++){int k=(strand*(RibbonSegments+1)+i)*2;float u=i/(float)RibbonSegments;uv[k]=new Vector2(cell.center.x,cell.y+cell.height*.07f);uv[k+1]=new Vector2(cell.center.x,cell.yMax-cell.height*.07f);colors[k]=colors[k+1]=Color.white;if(i<RibbonSegments){int t=(strand*RibbonSegments+i)*6;triangles[t]=k;triangles[t+1]=k+2;triangles[t+2]=k+1;triangles[t+3]=k+1;triangles[t+4]=k+2;triangles[t+5]=k+3;}}
   var mesh=new Mesh{name="Pooled spectral motion ribbon"};mesh.MarkDynamic();mesh.vertices=vertices;mesh.colors=colors;mesh.uv=uv;mesh.triangles=triangles;owned.Add(mesh);prismRibbons[r]=new PrismRibbon{slot=MeshSlot(root,"Spectral ribbon",mesh,additiveSheet),mesh=mesh,vertices=vertices,colors=colors};
  }}
 }
}
