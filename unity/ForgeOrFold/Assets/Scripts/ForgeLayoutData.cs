using System;

/// FROZEN station geometry, in metres, world space (x right, y up, z from the work stance toward the
/// back wall). The single source for every stream: room-light-post builds the stations here,
/// strike-feel stands, looks and swings here, hot-metal-vfx sizes the knife here. Pure C# (System
/// only) so Tests/ForgeLayoutTests.cs checks overlaps and reach outside Unity; ForgeLayout below
/// wraps the values as Vector3 for game code.
/// Phase 0 only defines the numbers; each stream moves its own objects onto them.
public static class ForgeLayoutData {
 [Serializable] public struct F3 { public float x,y,z; public F3(float x,float y,float z){this.x=x;this.y=y;this.z=z;} public static F3 operator+(F3 a,F3 b)=>new F3(a.x+b.x,a.y+b.y,a.z+b.z); public static F3 operator-(F3 a,F3 b)=>new F3(a.x-b.x,a.y-b.y,a.z-b.z); public override string ToString()=>$"({x:0.###},{y:0.###},{z:0.###})"; }
 /// Axis-aligned floor footprint (x and z ranges).
 [Serializable] public struct Rect { public float x0,z0,x1,z1; public Rect(float x0,float z0,float x1,float z1){this.x0=x0;this.z0=z0;this.x1=x1;this.z1=z1;} }
 static Rect Around(F3 c,float w,float d)=>new Rect(c.x-w/2,c.z-d/2,c.x+w/2,c.z+d/2);

 // ---- Anvil (most-seen object). Face top is the working surface. ----
 public const float AnvilTopY=.84f;                       // was 1.035
 public static readonly F3 AnvilCenter=new F3(0,AnvilTopY,-.40f);   // centre of the face top
 public const float AnvilFaceX=.78f, AnvilFaceZ=.30f;      // face size
 public const float AnvilBodyHeight=.31f, StumpTopY=AnvilTopY-AnvilBodyHeight, StumpRadius=.29f;
 public static readonly Rect AnvilFootprint=new Rect(-.45f,-.56f,.70f,-.24f);   // body, heel and horn
 public static readonly Rect AnvilFace=Around(AnvilCenter,AnvilFaceX,AnvilFaceZ);
 /// Where the hammer face lands: the top of a knife lying on the face.
 public static readonly F3 StrikePoint=new F3(.05f,.846f,-.40f);
 /// Knife root (knife-local origin) when it lies on the anvil; the blade runs along +x.
 public static readonly F3 KnifeAnvilRoot=new F3(-.13f,.846f,-.40f);

 // ---- Knife ----
 public const float KnifeScale=.12f;                      // was .28 (about 3x real size)
 public static readonly F3 TangGripLocal=new F3(-.55f,0,0); // knife-local, where the tong jaws bite

 // ---- Smith at the anvil ----
 public static readonly F3 SmithAnvilStance=new F3(0,0,-1.03f);   // was -1.48 (the plan's -1.15 left the arm straight)
 public const float EyeHeight=1.62f;
 public static readonly F3 WorkLean=new F3(0,-.04f,.05f);        // eye offset while working
 public static readonly F3 WorkLookOffset=new F3(0,0,.06f);       // WorkLook = StrikePoint + this
 public static F3 WorkLook=>StrikePoint+WorkLookOffset;
 public static F3 WorkEye=>SmithAnvilStance+new F3(0,EyeHeight,0)+WorkLean;

 // ---- Nominal arm model (smith-local, yaw frame). Used by the reach tests and as IK targets. ----
 public static readonly F3 RightShoulderLocal=new F3(.20f,1.42f,.05f), LeftShoulderLocal=new F3(-.19f,1.42f,.05f);
 public const float UpperArm=.29f, ForearmToGrip=.35f;     // forearm .27 + hand to grip centre .08
 public const float GripToHead=.28f, HeadFaceToAxis=.04f;  // hammer grip to head centre; face to handle axis
 public const float ContactHandleElevationDeg=20;           // handle rise from head toward the hand at contact
 public const float ApexSwingDeg=65;                        // forearm rotation about the elbow, contact to apex
 public const float TongLength=.40f, TongElevationDeg=25;   // jaws to the hand on the reins

 // ---- Hearth, beside the anvil on the smith's left ----
 public static readonly F3 HearthBoxCenter=new F3(-1.22f,.41f,-.12f), HearthBoxSize=new F3(1.14f,.82f,1.00f);
 public static readonly Rect HearthFootprint=Around(HearthBoxCenter,HearthBoxSize.x,HearthBoxSize.z);
 public static readonly F3 Firebed=new F3(-1.15f,.88f,-.42f), FirebedSize=new F3(.44f,.06f,.34f);   // coal surface centre
 public static readonly F3 SlackTub=new F3(-.79f,.80f,-.44f), SlackTubSize=new F3(.24f,.10f,.22f);   // set into the hearth top, front right
 public static readonly F3 HoodMin=new F3(-1.62f,1.55f,-.66f), HoodMax=new F3(-.62f,3.60f,.38f);    // hood and flue volume, to the ceiling
 public static readonly F3 HoodSmokeSource=new F3(-1.15f,1.25f,-.32f);   // where hearth smoke and embers rise
 public static readonly F3 HearthStance=new F3(-.50f,0,-.95f);           // a .51 m step from the anvil stance
 public const float HearthYawDeg=-30;
 public static readonly F3 BellowsHandle=new F3(-.62f,1.10f,-.55f);      // lever chain, within right-hand reach at HearthStance
 public static readonly F3 Bellows=new F3(-2.15f,1.05f,.10f); public const float BellowsYawDeg=90;
 public static readonly Rect BellowsFootprint=new Rect(-2.45f,-.08f,-1.85f,.28f);

 // ---- Other stations and dressing ----
 public static readonly F3 Barrel=new F3(-2.75f,0,.45f); public const float BarrelRadius=.25f;   // decor
 public static readonly F3 Crate=new F3(-2.70f,.55f,-.50f), CrateSize=new F3(.87f,.18f,.60f);
 public static readonly F3 CrateApproach=new F3(-2.70f,0,-1.15f);
 public static readonly F3 Fuel=new F3(-3.05f,0,1.20f); public static readonly Rect FuelFootprint=new Rect(-3.25f,.95f,-2.85f,1.45f);
 public static readonly Rect Bench=new Rect(-.55f,-.10f,3.20f,1.72f); public const float BenchTopY=.85f;   // shortened from x -3.2
 public static readonly F3 Rack=new F3(1.80f,1.03f,1.10f), Scale=new F3(1.65f,1.015f,-.25f), Shop=new F3(2.80f,1.00f,.65f), Lantern=new F3(.87f,.96f,.85f);   // unchanged
 public static readonly F3 CoinDish=new F3(1.25f,.87f,.02f); public const float CoinDishRadius=.09f;
 public static readonly F3 HangingLamp=new F3(.35f,2.05f,-.75f);
 public const float FrontWallZ=-3.90f, DoorX0=1.6f, DoorX1=2.5f;
 public static readonly Rect RoomInterior=new Rect(-3.425f,-3.79f,3.425f,2.01f);   // inner wall faces
 public static readonly Rect Walkable=new Rect(-3.25f,-3.70f,3.25f,-.90f);
 public static bool IsWalkable(float x,float z)=>x>Walkable.x0&&x<Walkable.x1&&z>Walkable.z0&&z<Walkable.z1;
 public const int StaticLayer=8;

 // ---- Approaches (where the smith stands to use a station), keyed like ForgeWorld.spots ----
 public static readonly F3 RackApproach=new F3(1.8f,0,-1.1f), SellApproach=new F3(1.5f,0,-1.18f), ShopApproach=new F3(2.8f,0,-1.1f), LanternApproach=new F3(.85f,0,-1.18f);
 public static readonly string[] StationKeys={"crate","furnace","anvil","rack","sell","shop","lantern"};
 /// Station point (the spot a knife or the camera targets) for a ForgeWorld.spots key.
 public static F3 Spot(string key){switch(key){case "crate":return Crate;case "furnace":return Firebed;case "anvil":return AnvilCenter;case "rack":return Rack;case "sell":return Scale;case "shop":return Shop;case "lantern":return Lantern;default:throw new ArgumentException(key);}}
 /// Approach (smith stance, y = 0) for a ForgeWorld.approaches key.
 public static F3 Approach(string key){switch(key){case "crate":return CrateApproach;case "furnace":return HearthStance;case "anvil":return SmithAnvilStance;case "rack":return RackApproach;case "sell":return SellApproach;case "shop":return ShopApproach;case "lantern":return LanternApproach;default:throw new ArgumentException(key);}}
}

#if !FORGE_UNIT
/// ForgeLayoutData as Unity values.
public static class ForgeLayout {
 public static UnityEngine.Vector3 V(ForgeLayoutData.F3 v)=>new UnityEngine.Vector3(v.x,v.y,v.z);
 public static readonly UnityEngine.Vector3 AnvilCenter=V(ForgeLayoutData.AnvilCenter), StrikePoint=V(ForgeLayoutData.StrikePoint), KnifeAnvilRoot=V(ForgeLayoutData.KnifeAnvilRoot), TangGripLocal=V(ForgeLayoutData.TangGripLocal);
 public static readonly UnityEngine.Vector3 SmithAnvilStance=V(ForgeLayoutData.SmithAnvilStance), WorkLean=V(ForgeLayoutData.WorkLean), WorkLook=V(ForgeLayoutData.WorkLook), WorkEye=V(ForgeLayoutData.WorkEye);
 public static readonly UnityEngine.Vector3 HearthStance=V(ForgeLayoutData.HearthStance), Firebed=V(ForgeLayoutData.Firebed), SlackTub=V(ForgeLayoutData.SlackTub), BellowsHandle=V(ForgeLayoutData.BellowsHandle), HoodSmokeSource=V(ForgeLayoutData.HoodSmokeSource);
 public static readonly UnityEngine.Vector3 HangingLamp=V(ForgeLayoutData.HangingLamp), CoinDish=V(ForgeLayoutData.CoinDish);
 public static readonly UnityEngine.Quaternion HearthYaw=UnityEngine.Quaternion.Euler(0,ForgeLayoutData.HearthYawDeg,0);
 public const float KnifeScale=ForgeLayoutData.KnifeScale, EyeHeight=ForgeLayoutData.EyeHeight, AnvilTopY=ForgeLayoutData.AnvilTopY;
 public static UnityEngine.Vector3 Spot(string key)=>V(ForgeLayoutData.Spot(key));
 public static UnityEngine.Vector3 Approach(string key)=>V(ForgeLayoutData.Approach(key));
 public static bool Walkable(UnityEngine.Vector3 p)=>ForgeLayoutData.IsWalkable(p.x,p.z);
}
#endif
