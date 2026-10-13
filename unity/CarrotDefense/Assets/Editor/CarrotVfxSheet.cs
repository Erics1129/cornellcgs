using System;
using System.IO;
using UnityEditor;
using UnityEngine;

namespace CarrotTD {
/// <summary>Procedural 8x8 effect sheet (1024 px, 128 px cells). Colour comes from particle tint; cells carry shape, shading and alpha only.</summary>
public static class CarrotVfxSheet {
 const int Size=1024,Cells=8,Cell=Size/Cells,Pad=4;
 public const string Path="Assets/Resources/Carrot/Textures/VfxSheet.png";
 public static void Prepare(){
  var pixels=new Color[Size*Size];
  for(int cell=0;cell<64;cell++){int cx=cell%Cells,cy=cell/Cells;
   for(int py=0;py<Cell;py++)for(int px=0;px<Cell;px++){
    float u=((px+.5f)-Cell*.5f)/(Cell*.5f-Pad),v=((py+.5f)-Cell*.5f)/(Cell*.5f-Pad);
    Color c=Draw(cell,u,-v);if(Mathf.Abs(u)>1||Mathf.Abs(v)>1)c.a=0;
    c.a=Mathf.Clamp01(c.a);c.r=Mathf.Clamp01(c.r);c.g=Mathf.Clamp01(c.g);c.b=Mathf.Clamp01(c.b);
    // Row 0 sits at the top of the image so Unity's texture-sheet frame index matches the cell number.
    int x=cx*Cell+px,y=Size-1-(cy*Cell+py);pixels[y*Size+x]=c;
   }
  }
  var texture=new Texture2D(Size,Size,TextureFormat.RGBA32,false);texture.SetPixels(pixels);texture.Apply();
  File.WriteAllBytes(Path,texture.EncodeToPNG());UnityEngine.Object.DestroyImmediate(texture);
  AssetDatabase.ImportAsset(Path);
  var importer=AssetImporter.GetAtPath(Path) as TextureImporter;
  if(importer!=null){importer.textureType=TextureImporterType.Default;importer.sRGBTexture=true;importer.alphaSource=TextureImporterAlphaSource.FromInput;importer.alphaIsTransparency=true;importer.mipmapEnabled=true;importer.wrapMode=TextureWrapMode.Clamp;importer.filterMode=FilterMode.Trilinear;importer.anisoLevel=2;importer.isReadable=false;importer.maxTextureSize=1024;CarrotBuild.WebTexture(importer,1024,90);importer.SaveAndReimport();}
  AssetDatabase.DeleteAsset("Assets/Resources/Carrot/Textures/VfxAtlas.png");
  // Every glyph cell must be a solid mark: an outline-only cell reads as a missing-texture placeholder in the scene.
  for(int cell=56;cell<64;cell++){float covered=0,total=0;for(int py=0;py<Cell;py++)for(int px=0;px<Cell;px++){float u=((px+.5f)-Cell*.5f)/(Cell*.5f-Pad),v=((py+.5f)-Cell*.5f)/(Cell*.5f-Pad);if(u*u+v*v>.64f)continue;total++;int x=(cell%Cells)*Cell+px,y=Size-1-((cell/Cells)*Cell+py);if(pixels[y*Size+x].a>.5f)covered++;}float fraction=covered/Mathf.Max(1,total);if(fraction<.08f)throw new InvalidOperationException("VfxSheet glyph cell "+cell+" is an outline ("+(fraction*100).ToString("F1")+"% filled inside r<0.8)");}
  Debug.Log("CARROT_VFX_SHEET 64 cells written to "+Path);
 }
 static float Hash(float x,float y){return Frac(Mathf.Sin(x*127.1f+y*311.7f)*43758.5453f);}
 static float Frac(float x){return x-Mathf.Floor(x);}
 static float Noise(float x,float y){float ix=Mathf.Floor(x),iy=Mathf.Floor(y),fx=x-ix,fy=y-iy;fx=fx*fx*(3-2*fx);fy=fy*fy*(3-2*fy);return Mathf.Lerp(Mathf.Lerp(Hash(ix,iy),Hash(ix+1,iy),fx),Mathf.Lerp(Hash(ix,iy+1),Hash(ix+1,iy+1),fx),fy);}
 static float Fbm(float x,float y,int octaves=4){float sum=0,amp=.5f,norm=0;for(int i=0;i<octaves;i++){sum+=Noise(x,y)*amp;norm+=amp;x=x*2.03f+7.1f;y=y*2.03f+3.3f;amp*=.5f;}return sum/norm;}
 static float Step(float edge0,float edge1,float x){return Mathf.SmoothStep(0,1,Mathf.Clamp01((x-edge0)/Mathf.Max(.00001f,edge1-edge0)));}
 static float Segment(float px,float py,float ax,float ay,float bx,float by){float dx=bx-ax,dy=by-ay;float t=Mathf.Clamp01(((px-ax)*dx+(py-ay)*dy)/Mathf.Max(.00001f,dx*dx+dy*dy));return Mathf.Sqrt((px-ax-dx*t)*(px-ax-dx*t)+(py-ay-dy*t)*(py-ay-dy*t));}
 static float Star(float u,float v,int points,float inner,float outer){float a=Mathf.Atan2(v,u);float r=Mathf.Sqrt(u*u+v*v);float seg=Mathf.PI*2/points;float local=Mathf.Repeat(a,seg)/seg;float edge=Mathf.Lerp(outer,inner,Mathf.Abs(local*2-1));return r/edge;}
 static Color Shade(float alpha,float value){return new Color(value,value,value,alpha);}
 static Color Draw(int cell,float u,float v){
  float r=Mathf.Sqrt(u*u+v*v),a=Mathf.Atan2(v,u);
  switch(cell){
   case 0:return Shade(1-Step(.42f,.62f,r),1);
   case 1:return Shade(Mathf.Pow(Mathf.Clamp01(1-r),1.8f),1);
   case 2:case 3:{int rays=cell==2?4:6;float ray=0;for(int i=0;i<rays;i++){float ang=i*Mathf.PI/rays;float d=Mathf.Abs(u*Mathf.Sin(ang)-v*Mathf.Cos(ang));ray=Mathf.Max(ray,(1-Step(0,.05f+.1f*(1-r),d))*Mathf.Pow(Mathf.Clamp01(1-r),1.4f));}float core=Mathf.Pow(Mathf.Clamp01(1-r*2.2f),1.5f);return Shade(Mathf.Max(ray,core),1);}
   case 4:return Shade(1-Step(0,.07f,Mathf.Abs(r-.78f)),1);
   case 5:return Shade((1-Step(.06f,.2f,Mathf.Abs(r-.66f)))*(.7f+.3f*(1-Step(.0f,.06f,Mathf.Abs(r-.66f)))),1);
   case 6:{float x=u*.5f+.5f;float band=Step(0,.22f,x)*(1-Step(.55f,1,x))+.75f*(1-Step(.85f,1,x))*Step(.5f,.85f,x);return Shade(band,.75f+.25f*Step(.55f,.95f,x));}
   case 7:{float arm=0;for(int i=0;i<6;i++){float ang=i*Mathf.PI/3;float cx=Mathf.Cos(ang),cy=Mathf.Sin(ang);float along=u*cx+v*cy;float across=Mathf.Abs(-u*cy+v*cx);if(along<0)continue;arm=Mathf.Max(arm,(1-Step(.02f,.06f,across))*(1-Step(.7f,.95f,along)));for(int b=1;b<=2;b++){float bx=cx*(.3f*b),by=cy*(.3f*b);float l=Mathf.Min(Segment(u,v,bx,by,bx+Mathf.Cos(ang+1.05f)*.22f,by+Mathf.Sin(ang+1.05f)*.22f),Segment(u,v,bx,by,bx+Mathf.Cos(ang-1.05f)*.22f,by+Mathf.Sin(ang-1.05f)*.22f));arm=Mathf.Max(arm,1-Step(.02f,.05f,l));}}arm=Mathf.Max(arm,1-Step(.08f,.14f,r));return Shade(arm,.9f+.1f*(1-r));}
   default:break;
  }
  if(cell<24){ // smoke flipbook, 16 frames
   int frame=cell-8;float time=frame/15f;float grow=.45f+.55f*time;float rr=r/grow;float n=Fbm(u*2.4f+frame*.37f+11,v*2.4f-time*1.6f+5,4);float body=Mathf.Clamp01(1-rr)*(.55f+.9f*n);float alpha=Step(.18f,.6f,body)*(1-Step(.55f,1,time)*.6f);float light=.45f+.55f*Mathf.Clamp01(.5f+v*.6f+(n-.5f)*.8f);return Shade(alpha,light);
  }
  if(cell<32){ // spark streaks along +U, head at the right
   int k=cell-24;float thick=.05f+.03f*(k%4);float x=u*.5f+.5f;float wave=Mathf.Sin(x*9+k)*.02f*(k/4);float d=Mathf.Abs(v-wave);float profile=Mathf.Exp(-d*d/(thick*thick*(.4f+.9f*x)));float head=Step(0,.75f,x)*(1-Step(.97f,1,x));return Shade(profile*head,.85f+.15f*x);
  }
  if(cell<40){ // ember and fire, 8 frames
   int frame=cell-32;float t=frame/8f;float n=Fbm(u*3+frame*.9f,v*3-t*4,3);float lick=Mathf.Clamp01(1-Mathf.Abs(u)*(1.6f+v*.8f))*Mathf.Clamp01(1-(v+.2f)*(v+.2f)*1.3f);float body=lick*(.5f+n*.9f);float alpha=Step(.2f,.55f,body);return Shade(alpha,.75f+.25f*Mathf.Clamp01(.6f-v*.5f+n*.4f));
  }
  if(cell<48){ // debris silhouettes
   int k=cell-40;float alpha=0,light=.55f+.4f*Mathf.Clamp01(.5f+v*.5f+u*.2f);
   switch(k){
    case 0:alpha=(Mathf.Abs(u)<.75f&&Mathf.Abs(v)<.32f?1:0)*(1-Step(.6f,.78f,Mathf.Abs(u)+Fbm(u*5,v*5,2)*.2f));light*=.8f+.2f*Noise(u*6,v*2);break;
    case 1:alpha=1-Step(.62f,.7f,r+Fbm(u*3,v*3,3)*.18f-.09f);break;
    case 2:{float e=Mathf.Sqrt(u*u/.9f+v*v/.25f);alpha=1-Step(.9f,1,e+Mathf.Max(0,u)*.1f);float vein=1-Step(0,.03f,Mathf.Abs(v));light*=1-vein*.3f;break;}
    case 3:{float e=Mathf.Sqrt(u*u/.5f+v*v/.95f);alpha=1-Step(.9f,1,e+Step(.5f,1,v)*.3f);break;}
    case 4:{float e=Mathf.Sqrt(u*u/.9f+v*v/.5f);alpha=1-Step(.92f,1,e);light*=.7f+.3f*Step(.4f,.6f,Frac((u+v)*3));break;}
    case 5:{float tri=Mathf.Max(Mathf.Abs(u)*2.4f-(1-v)*.9f,-v-1);alpha=1-Step(0,.1f,tri);light=.8f+.2f*(1-Step(.2f,.4f,Mathf.Abs(u)));break;}
    case 6:{float cap=1-Step(.75f,.85f,Mathf.Sqrt(u*u+Mathf.Max(0,v)*Mathf.Max(0,v)*2.2f));float flat=v<0&&v>-.25f&&Mathf.Abs(u)<.8f?1:0;float stem=Mathf.Abs(u)<.08f&&v>.5f&&v<.95f?1:0;alpha=Mathf.Max(Mathf.Max(cap,flat),stem);light*=.75f+.25f*Noise(u*8,v*8);break;}
    case 7:{alpha=Mathf.Abs(u)<.6f&&Mathf.Abs(v)<.85f?1:0;float lines=Step(.35f,.5f,Frac(v*5.5f))*(Mathf.Abs(u)<.45f?1:0);light=.92f-lines*.35f;break;}
   }
   return Shade(alpha,light);
  }
  if(cell<56){ // ground residue decals
   int k=cell-48;float n=Fbm(u*3.5f+k*9,v*3.5f,4);
   switch(k){
    case 0:{float edge=r+(n-.5f)*.45f;float alpha=(1-Step(.55f,.95f,edge))*(.5f+.5f*(1-Step(0,.6f,edge)));return Shade(alpha,.08f+.12f*n);}
    case 1:{float ring=1-Step(.08f,.2f,Mathf.Abs(r-.7f+(n-.5f)*.15f));float inner=(1-Step(.4f,.65f,r))*.5f;return Shade(Mathf.Max(ring,inner)*.9f,.3f+.3f*n);}
    case 2:{float poly=0;for(int i=0;i<7;i++){float ang=i*Mathf.PI*2/7+.3f;poly=Mathf.Max(poly,(u*Mathf.Cos(ang)+v*Mathf.Sin(ang))/(.82f+Mathf.Sin(i*2.7f)*.1f));}float alpha=(1-Step(.9f,1,poly))*(.55f+.45f*n);float crack=0;for(int i=0;i<5;i++){float ang=i*1.3f+.4f;crack=Mathf.Max(crack,1-Step(.01f,.035f,Segment(u,v,0,0,Mathf.Cos(ang)*.85f,Mathf.Sin(ang)*.85f)));}return Shade(alpha,.85f+.15f*n-crack*.5f);}
    case 3:{float ring=1-Step(.1f,.22f,Mathf.Abs(r-.72f));float dots=Step(.72f,.8f,Noise(u*18,v*18));return Shade(ring*(.35f+.65f*dots),.95f);}
    case 4:{float crack=0;for(int i=0;i<9;i++){float ang=i*.72f+Mathf.Sin(i*3.1f)*.3f;float len=.55f+.45f*Hash(i,3);float ex=Mathf.Cos(ang)*len,ey=Mathf.Sin(ang)*len;float d=Segment(u,v,0,0,ex,ey);float w=.025f*(1-Mathf.Sqrt(u*u+v*v)/len*.7f);crack=Mathf.Max(crack,1-Step(w,w+.03f,d));float bx=ex*.55f,by=ey*.55f;d=Segment(u,v,bx,by,bx+Mathf.Cos(ang+.9f)*.3f,by+Mathf.Sin(ang+.9f)*.3f);crack=Mathf.Max(crack,.8f*(1-Step(.012f,.035f,d)));}float centre=1-Step(.1f,.3f,r);return Shade(Mathf.Max(crack,centre*.8f)*(1-Step(.8f,1,r)),.1f);}
    case 5:{float blob=1-Step(.5f,.9f,r+(n-.5f)*.7f);float splash=0;for(int i=0;i<6;i++){float ang=i*1.05f+.5f;float d=Segment(u,v,Mathf.Cos(ang)*.4f,Mathf.Sin(ang)*.4f,Mathf.Cos(ang)*.95f,Mathf.Sin(ang)*.95f);splash=Mathf.Max(splash,1-Step(.03f,.09f,d));}return Shade(Mathf.Max(blob,splash)*.9f,.22f+.15f*n);}
    case 6:{float fern=0;for(int i=0;i<6;i++){float ang=i*Mathf.PI/3;float cx=Mathf.Cos(ang),cy=Mathf.Sin(ang);float along=u*cx+v*cy,across=Mathf.Abs(-u*cy+v*cx);if(along<0)continue;fern=Mathf.Max(fern,(1-Step(.01f,.03f,across))*(1-Step(.6f,.95f,along)));for(int b=1;b<=4;b++){float bx=cx*(.18f*b),by=cy*(.18f*b);float l=Mathf.Min(Segment(u,v,bx,by,bx+Mathf.Cos(ang+1.0f)*.17f,by+Mathf.Sin(ang+1.0f)*.17f),Segment(u,v,bx,by,bx+Mathf.Cos(ang-1.0f)*.17f,by+Mathf.Sin(ang-1.0f)*.17f));fern=Mathf.Max(fern,(1-Step(.008f,.025f,l))*(1-b*.12f));}}float haze=(1-Step(.3f,.9f,r))*.35f*n;return Shade(Mathf.Max(fern,haze),.95f);}
    default:{float swirl=Mathf.Sin(a*2+r*9-n*3)*.5f+.5f;float alpha=(1-Step(.7f,1,r))*(.35f+.65f*swirl*(1-Step(0,.35f,r)))+ (1-Step(.0f,.3f,r));return Shade(Mathf.Clamp01(alpha),.25f+.3f*swirl);}
   }
  }
  { // glyphs
   int k=cell-56;float alpha=0;
   switch(k){
    case 0:{float d=Mathf.Min(Segment(u,v,-.2f,.9f,.25f,.1f),Mathf.Min(Segment(u,v,.25f,.1f,-.25f,-.1f),Segment(u,v,-.25f,-.1f,.2f,-.9f)));alpha=1-Step(.07f,.14f,d);break;}
    case 1:{float ring=1-Step(.07f,.14f,Mathf.Abs(r-.78f));float hands=Mathf.Min(Segment(u,v,0,0,0,.5f),Segment(u,v,0,0,.36f,0));alpha=Mathf.Max(ring,1-Step(.05f,.11f,hands));break;}
    case 2:alpha=1-Step(.92f,1.05f,Star(u,v,5,.42f,.95f));break;
    case 3:{float d=Mathf.Min(Segment(u,v,-.7f,.55f,0,-.3f),Segment(u,v,0,-.3f,.7f,.55f));alpha=1-Step(.1f,.18f,d);break;}
    case 4:{float tri=Mathf.Max(Mathf.Abs(u)*1.73f-(.85f-v)*1f,-v-.75f);float fill=1-Step(-.08f,.06f,tri);float bang=(Mathf.Abs(u)<.1f&&v>-.3f&&v<.42f)||(Mathf.Sqrt(u*u+(v+.5f)*(v+.5f))<.11f)?1:0;alpha=fill;return Shade(alpha,1-bang*.85f);}
    case 5:{float best=1;for(int i=0;i<160;i++){float t=i/159f;float ang=t*Mathf.PI*4;float rr=.9f*(1-t*.85f);float px=Mathf.Cos(ang)*rr,py=Mathf.Sin(ang)*rr;best=Mathf.Min(best,Mathf.Sqrt((u-px)*(u-px)+(v-py)*(v-py)));}alpha=1-Step(.06f,.12f,best);break;}
    case 6:{float head=1-Step(.3f,.38f,Mathf.Sqrt((u+.3f)*(u+.3f)*1.3f+(v+.55f)*(v+.55f)*2.2f));float stem=(u>-.08f&&u<.04f&&v>-.55f&&v<.8f)?1:0;float flag=1-Step(.08f,.15f,Segment(u,v,0,.8f,.45f,.4f));alpha=Mathf.Max(Mathf.Max(head,stem),flag);break;}
    default:{float disc=1-Step(.84f,.92f,r);float inner=1-Step(.06f,.12f,Mathf.Abs(r-.62f));alpha=Mathf.Max(disc*.75f,inner);break;}
   }
   return Shade(alpha,1);
  }
 }
}
}
