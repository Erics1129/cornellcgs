using System;
using System.Collections.Generic;
using UnityEngine;

namespace CarrotTD {
 /// <summary>The garden a duo player defends: West/East halves (x mirror) on every boss fight except L29, North/South (z stack) there.</summary>
 public enum DuoSide {West,East,North,South}
 /// <summary>How a duo fight splits: X puts the halves side by side across the wall x=0, Z stacks them across the wall z=0 (L29 only).</summary>
 public enum DuoAxis {X,Z}

 /// <summary>
 /// Duo and two-player endless maps (simulation-owned, static, never hand-copied into game-data.json).
 ///  - Duo halves are generated from the level's own LevelDef. Axis X: half 0 (west) is x-8, half 1 (east) is 8-x.
 ///    Axis Z (L29 Asuna, whose prism rule reads absolute x): half 0 (north) is z+5, half 1 (south) is -(z+5).
 ///    Every route, pad and blocker keeps its index; id, name, biome, boss, gold, waves and blockers are the level's own, so
 ///    every per-level table, kit and award still applies. Negation is exact in IEEE floats, so half 1 is the exact mirror of
 ///    half 0 on every tick (the fairness guarantee behind the random side draw; DuoMirrorExact proves it).
 ///  - The wall is x=0 (z=0 on L29) inside a 1-unit strip with no pads or paths.
 ///  - Endless (id 90, "Twin Gates") is a 29 x 13 grid, Q(gx,gz)=(gx-14,0,gz-6), mirror-symmetric about gx=14.
 /// </summary>
 public static class CarrotDuoMaps {
  public const int EndlessId=90;
  /// <summary>The eleven boss fights offered in duo: the six campaign guardians and the five Challenges.</summary>
  public static readonly int[] DuoLevels={4,8,12,16,20,24,25,26,27,28,29};
  public static bool IsDuoLevel(int id){return Array.IndexOf(DuoLevels,id)>=0;}
  /// <summary>X for every boss level except 29, which is Z.</summary>
  public static DuoAxis SideLayout(int levelId){return levelId==29?DuoAxis.Z:DuoAxis.X;}
  /// <summary>The named garden of half 0|1: West/East on axis X, North/South on axis Z.</summary>
  public static DuoSide Side(int levelId,int side){bool b=side==1;return SideLayout(levelId)==DuoAxis.Z?(b?DuoSide.South:DuoSide.North):(b?DuoSide.East:DuoSide.West);}
  public const float Offset=8,StackOffset=5;

  static readonly Dictionary<int,LevelDef> halves=new Dictionary<int,LevelDef>();
  /// <summary>The cached half `side` (0|1) of a duo level; null when the level is not a duo fight.</summary>
  public static LevelDef Half(int levelId,int side){
   if(!IsDuoLevel(levelId)||(side!=0&&side!=1))return null;int key=levelId*2+side;
   lock(halves){
    LevelDef def;if(halves.TryGetValue(key,out def))return def;
    var src=CarrotData.Level(levelId);if(src==null)return null;
    bool z=SideLayout(levelId)==DuoAxis.Z;
    var routes=new Vector3[src.routes.Length][];for(int r=0;r<routes.Length;r++)routes[r]=Map(src.routes[r],z,side);
    var blockers=new BlockerSeed[src.blockers.Length];for(int i=0;i<blockers.Length;i++)blockers[i]=new BlockerSeed{pad=src.blockers[i].pad,kind=src.blockers[i].kind};
    def=new LevelDef{id=src.id,name=src.name,biome=src.biome,boss=src.boss,startingGold=src.startingGold,waves=src.waves,routes=routes,pads=Map(src.pads,z,side),blockers=blockers};
    halves[key]=def;return def;
   }
  }
  static Vector3[] Map(Vector3[] points,bool z,int side){var a=new Vector3[points.Length];for(int i=0;i<a.Length;i++)a[i]=MapPoint(points[i],z,side);return a;}
  /// <summary>The solo-to-half transform of one point (exact for the integer grid points the levels are authored on).</summary>
  public static Vector3 MapPoint(Vector3 p,bool z,int side){
   if(z){float v=p.z+StackOffset;return new Vector3(p.x,p.y,side==0?v:-v);}
   return new Vector3(side==0?p.x-Offset:Offset-p.x,p.y,p.z);
  }
  /// <summary>Half `side`'s playable rectangle (x, z): axis X west x[-16,-.5] / east x[.5,16], z[-6.5,6.5];
  /// axis Z north z[.5,10.5] / south z[-10.5,-.5], x[-8,34].</summary>
  public static Rect HalfRect(int levelId,int side){
   if(SideLayout(levelId)==DuoAxis.Z)return side==0?Rect.MinMaxRect(-8,.5f,34,10.5f):Rect.MinMaxRect(-8,-10.5f,34,-.5f);
   return side==0?Rect.MinMaxRect(-16,-6.5f,-.5f,6.5f):Rect.MinMaxRect(.5f,-6.5f,16,6.5f);
  }
  /// <summary>The whole duo map (both halves and the wall strip): 32 x 13 on axis X, 42 x 21 on axis Z.</summary>
  public static Rect ArenaRect(int levelId){return SideLayout(levelId)==DuoAxis.Z?Rect.MinMaxRect(-8,-10.5f,34,10.5f):Rect.MinMaxRect(-16,-6.5f,16,6.5f);}
  /// <summary>The wall segment (world space, y=0): x=0 across the arena's depth, or z=0 across its width on L29.</summary>
  public static void Wall(int levelId,out Vector3 a,out Vector3 b){
   var r=ArenaRect(levelId);
   if(SideLayout(levelId)==DuoAxis.Z){a=new Vector3(r.xMin,0,0);b=new Vector3(r.xMax,0,0);}
   else {a=new Vector3(0,0,r.yMin);b=new Vector3(0,0,r.yMax);}
  }
  /// <summary>Which half a world point lies on (0|1), or -1 inside the wall strip (|coordinate| &lt; .5).</summary>
  public static int HalfAt(int levelId,Vector3 p){float c=SideLayout(levelId)==DuoAxis.Z?p.z:p.x;if(c<=-.5f)return SideLayout(levelId)==DuoAxis.Z?1:0;if(c>=.5f)return SideLayout(levelId)==DuoAxis.Z?0:1;return -1;}

  // ---- Two-player endless: "Twin Gates" (id 90, orchard, lantern posts).
  static Vector3[] Q(params int[] p){var a=new Vector3[p.Length/2];for(int i=0;i<a.Length;i++)a[i]=new Vector3(p[i*2]-14,0,p[i*2+1]-6);return a;}
  /// <summary>Two 42-unit routes (34 of wing plus an 8-unit shared boulevard) from the back corners to the carrot at (14,9);
  /// 35 pads (13 per wing, 4 inner per side, 1 behind the carrot); blockers on pads 4, 21 (hedge), 12, 29 (stump), 34 (crystal).</summary>
  public static readonly LevelDef Endless=new LevelDef{id=EndlessId,name="Twin Gates",biome="orchard",boss="",startingGold=700,waves=999,
   routes=new Vector3[][]{Q(0,11,8,11,8,7,3,7,3,3,10,3,10,1,14,1,14,9),Q(28,11,20,11,20,7,25,7,25,3,18,3,18,1,14,1,14,9)},
   pads=Q(2,10,5,10,4,8,6,8,1,6,2,4,5,5,8,5,5,2,8,2,11,2,10,8,10,10,12,4,12,7,12,9,13,0,26,10,23,10,24,8,22,8,27,6,26,4,23,5,20,5,23,2,20,2,17,2,18,8,18,10,16,4,16,7,16,9,15,0,14,11),
   blockers=new BlockerSeed[]{new BlockerSeed{pad=4,kind="hedge"},new BlockerSeed{pad=21,kind="hedge"},new BlockerSeed{pad=12,kind="stump"},new BlockerSeed{pad=29,kind="stump"},new BlockerSeed{pad=34,kind="crystal"}}};
  /// <summary>Lantern pads of Twin Gates (towers there keep full sight during Blindness).</summary>
  public static readonly int[] EndlessLitPads={13,30,14,31};
  /// <summary>The whole endless map: x[-15,15] z[-7,7].</summary>
  public static readonly Rect EndlessRect=Rect.MinMaxRect(-15,-7,15,7);
  /// <summary>Camera framing of a seat's home wing: seat 0 x[-15,4], seat 1 x[-4,15] (z[-7,7]).</summary>
  public static Rect EndlessHomeRect(int seat){return seat==1?Rect.MinMaxRect(-4,-7,15,7):Rect.MinMaxRect(-15,-7,4,7);}
 }
}
