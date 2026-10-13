// sources: Assets/Scripts/ForgeLayoutData.cs
// Pure C# checks of the frozen station geometry (outside Assets, so Unity ignores this file).
// Run by scripts/forge-cs-check.mjs on Unity's bundled .NET 6.
using System;
using System.Collections.Generic;
using static ForgeLayoutData;

static class ForgeLayoutTests {
 static int failures, checks;
 static void Check(bool ok,string what){checks++;if(!ok){failures++;Console.WriteLine("FAIL ForgeLayoutTests: "+what);}}
 static F3 V(float x,float y,float z)=>new F3(x,y,z);
 static F3 Mul(F3 a,float s)=>V(a.x*s,a.y*s,a.z*s);
 static float Dot(F3 a,F3 b)=>a.x*b.x+a.y*b.y+a.z*b.z;
 static float Len(F3 a)=>MathF.Sqrt(Dot(a,a));
 static F3 Norm(F3 a)=>Mul(a,1/Len(a));
 static float Dist(F3 a,F3 b)=>Len(a-b);
 const float Deg=MathF.PI/180;
 /// Quaternion.Euler(0, deg, 0) * v (Unity, left-handed).
 static F3 Yaw(float deg,F3 v){float c=MathF.Cos(deg*Deg),s=MathF.Sin(deg*Deg);return V(v.x*c+v.z*s,v.y,-v.x*s+v.z*c);}
 /// Hand position on a tool held `length` from `tip`, pointing back toward the shoulder and rising `elevDeg`.
 static F3 ToolHand(F3 tip,F3 shoulder,float length,float elevDeg){var h=shoulder-tip;h.y=0;h=Norm(h);float e=elevDeg*Deg;return tip+Mul(V(h.x*MathF.Cos(e),MathF.Sin(e),h.z*MathF.Cos(e)),length);}
 /// Elbow bend in degrees (0 = straight) for a two-bone arm reaching from shoulder to hand; -1 when out of reach.
 static float Bend(F3 shoulder,F3 hand){float d=Dist(shoulder,hand),u=UpperArm,f=ForearmToGrip;if(d>=u+f)return -1;float c=(u*u+f*f-d*d)/(2*u*f);return 180-MathF.Acos(Math.Clamp(c,-1,1))/Deg;}
 static void Reach(string what,F3 shoulder,F3 hand){float d=Dist(shoulder,hand),b=Bend(shoulder,hand);Console.WriteLine($"  {what}: {d:0.000} m, elbow bend {b:0.0} deg");Check(d<=.60f,what+" reach "+d.ToString("0.000")+" m > .60 m");Check(b>=15,what+" elbow bend "+b.ToString("0.0")+" deg < 15 deg (arm locked straight)");}
 /// Elbow position for a shoulder-hand pair, on the side of `hint`.
 static F3 Elbow(F3 s,F3 g,F3 hint){float d=Dist(g,s),u=UpperArm,f=ForearmToGrip;float a=(u*u-f*f+d*d)/(2*d),r=MathF.Sqrt(MathF.Max(0,u*u-a*a));var ex=Norm(g-s);var c=s+Mul(ex,a);var w=hint-c;w=w-Mul(ex,Dot(w,ex));if(Len(w)<1e-6f)w=V(0,-1,0);return c+Mul(Norm(w),r);}
 /// Rotate v about the world x axis (the smith's right axis at yaw 0).
 static F3 RotX(F3 v,float deg){float c=MathF.Cos(deg*Deg),s=MathF.Sin(deg*Deg);return V(v.x,v.y*c-v.z*s,v.y*s+v.z*c);}
 static bool Overlap(Rect a,Rect b)=>a.x0<b.x1&&b.x0<a.x1&&a.z0<b.z1&&b.z0<a.z1;
 static bool Inside(Rect a,Rect room)=>a.x0>=room.x0&&a.x1<=room.x1&&a.z0>=room.z0&&a.z1<=room.z1;
 static float Gap(Rect a,Rect b){float dx=MathF.Max(0,MathF.Max(a.x0-b.x1,b.x0-a.x1)),dz=MathF.Max(0,MathF.Max(a.z0-b.z1,b.z0-a.z1));return MathF.Sqrt(dx*dx+dz*dz);}
 static Rect Box(F3 c,float w,float d)=>new Rect(c.x-w/2,c.z-d/2,c.x+w/2,c.z+d/2);
 static Rect Circle(F3 c,float r)=>Box(c,2*r,2*r);

 static int Main(){
  // 1. Footprints. Bench-supported items may overlap the bench; the anvil body sits on its stump.
  var stations=new List<(string name,Rect r)>{("anvil",AnvilFootprint),("stump",Circle(AnvilCenter,StumpRadius)),("hearth",HearthFootprint),("bench",Bench),("bellows",BellowsFootprint),("barrel",Circle(Barrel,BarrelRadius)),("crate",Box(Crate,CrateSize.x,CrateSize.z)),("fuel",FuelFootprint),
   ("rack",Box(Rack,1.1f,.5f)),("scale",Circle(Scale,.19f)),("shop",Box(Shop,.73f,.62f)),("lantern",Box(Lantern,.19f,.19f)),("coin dish",Circle(CoinDish,CoinDishRadius))};
  var onBench=new HashSet<string>{"rack","scale","shop","lantern","coin dish"};
  for(int i=0;i<stations.Count;i++)for(int j=i+1;j<stations.Count;j++){var a=stations[i];var b=stations[j];
   bool exempt=(a.name=="bench"&&onBench.Contains(b.name))||(b.name=="bench"&&onBench.Contains(a.name))||(a.name=="anvil"&&b.name=="stump");
   if(!exempt)Check(!Overlap(a.r,b.r),$"{a.name} overlaps {b.name}");}
  foreach(var s in stations){Check(Inside(s.r,RoomInterior),s.name+" leaves the room");Check(!Overlap(s.r,Walkable),s.name+" intrudes into the walkable area");}
  // 2. Every stance and approach is walkable; every station key resolves.
  foreach(var key in StationKeys){var a=Approach(key);Check(IsWalkable(a.x,a.z),"approach "+key+" "+a+" is not walkable");Spot(key);}
  Check(IsWalkable(HearthStance.x,HearthStance.z),"HearthStance is not walkable");
  // 3. The work view looks down at the strike point at a comfortable pitch.
  var eye=WorkEye;var look=Norm(WorkLook-eye);float pitch=MathF.Asin(-look.y)/Deg;Console.WriteLine($"  work pitch {pitch:0.0} deg");
  Check(pitch>=42&&pitch<=50,"work pitch "+pitch.ToString("0.0")+" outside 42-50 deg");
  // 4. Strike point and knife root lie on the anvil face.
  Check(StrikePoint.x>AnvilFace.x0&&StrikePoint.x<AnvilFace.x1&&StrikePoint.z>AnvilFace.z0&&StrikePoint.z<AnvilFace.z1,"StrikePoint off the anvil face");
  Check(StrikePoint.y-AnvilTopY>=0&&StrikePoint.y-AnvilTopY<=.015f,"StrikePoint not on the face top");
  Check(KnifeAnvilRoot.x>AnvilFace.x0&&KnifeAnvilRoot.z>AnvilFace.z0&&KnifeAnvilRoot.z<AnvilFace.z1&&MathF.Abs(KnifeAnvilRoot.y-StrikePoint.y)<.001f,"KnifeAnvilRoot off the face");
  // 5. Right arm: the hammer grip is reachable with a bent elbow at contact and at the apex.
  var rs=SmithAnvilStance+RightShoulderLocal;var head=StrikePoint+V(0,HeadFaceToAxis,0);var grip=ToolHand(head,rs,GripToHead,ContactHandleElevationDeg);
  Reach("right shoulder to hammer grip at contact",rs,grip);
  var elbow=Elbow(rs,grip,rs+V(.25f,-.35f,.05f));var fore=grip-elbow;var apex=elbow+RotX(fore,ApexSwingDeg);if(apex.y<grip.y)apex=elbow+RotX(fore,-ApexSwingDeg);
  Check(apex.y>grip.y+.15f,"apex grip does not rise");Reach("right shoulder to hammer grip at apex",rs,apex);
  // 6. Left arm: the tong hand at the anvil.
  var ls=SmithAnvilStance+LeftShoulderLocal;var jaws=KnifeAnvilRoot+Mul(TangGripLocal,KnifeScale);Reach("left shoulder to tong hand at the anvil",ls,ToolHand(jaws,ls,TongLength,TongElevationDeg));
  // 7. Hearth: firebed and slack tub within tong reach from HearthStance, bellows handle within the right hand's.
  var lh=HearthStance+Yaw(HearthYawDeg,LeftShoulderLocal);var rh=HearthStance+Yaw(HearthYawDeg,RightShoulderLocal);
  float toFire=Dist(lh,Firebed),toTub=Dist(lh,SlackTub);Console.WriteLine($"  left shoulder at HearthStance: firebed {toFire:0.000} m, slack tub {toTub:0.000} m");
  Check(toFire<=.95f,"left shoulder to Firebed "+toFire.ToString("0.000")+" m > .95 m");Check(toTub<=1.15f,"left shoulder to SlackTub "+toTub.ToString("0.000")+" m > 1.15 m");
  Reach("left shoulder to tong hand at the firebed",lh,ToolHand(Firebed,lh,TongLength,TongElevationDeg));
  Reach("left shoulder to tong hand at the slack tub",lh,ToolHand(SlackTub,lh,TongLength,TongElevationDeg));
  Reach("right shoulder to bellows handle",rh,BellowsHandle);
  float step=Dist(HearthStance,SmithAnvilStance);Console.WriteLine($"  hearth step {step:0.000} m");Check(step<=.60f,"hearth step "+step.ToString("0.000")+" m > .60 m (use a short step or at least .5 s)");
  // 8. Hearth beside the anvil with room to work; firebed, tub and hood consistent.
  float gap=Gap(HearthFootprint,AnvilFace);Console.WriteLine($"  hearth to anvil face {gap:0.000} m");Check(gap>=.25f,"hearth right edge "+gap.ToString("0.000")+" m from the anvil face (< .25 m)");
  var fire=Box(Firebed,FirebedSize.x,FirebedSize.z);var tub=Box(SlackTub,SlackTubSize.x,SlackTubSize.z);
  Check(Inside(fire,HearthFootprint),"firebed outside the hearth top");Check(Inside(tub,HearthFootprint),"slack tub outside the hearth top");Check(!Overlap(fire,tub),"firebed overlaps the slack tub");
  Check(Firebed.y>HearthBoxCenter.y+HearthBoxSize.y/2&&SlackTub.y<=HearthBoxCenter.y+HearthBoxSize.y/2+.05f,"firebed or tub height wrong");
  Check(HoodMin.x<=fire.x0&&HoodMax.x>=fire.x1&&HoodMin.z<=fire.z0&&HoodMax.z>=fire.z1&&HoodMin.y>Firebed.y+.4f,"hood does not cover the firebed");
  Check(HoodSmokeSource.x>HoodMin.x&&HoodSmokeSource.x<HoodMax.x&&HoodSmokeSource.z>HoodMin.z&&HoodSmokeSource.z<HoodMax.z,"hood smoke source outside the hood");
  // 9. Lights and walls.
  Check(HangingLamp.y>1.95f&&HangingLamp.y<3.4f,"hanging lamp height");Check(FrontWallZ<Walkable.z0,"front wall inside the walkable area");Check(DoorX0<DoorX1&&DoorX0>RoomInterior.x0&&DoorX1<RoomInterior.x1,"door outside the front wall");
  if(failures>0){Console.WriteLine($"FAIL ForgeLayoutTests: {failures} of {checks} checks failed");return 1;}
  Console.WriteLine($"PASS ForgeLayoutTests ({checks} checks)");return 0;
 }
}
