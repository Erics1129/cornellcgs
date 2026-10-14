using System.Collections.Generic;
using UnityEngine;

namespace CarrotTD {
 /// <summary>
 /// Round-robin banks of recorded CC0 Kenney variants (Resources/Carrot/Audio/Variants, written by
 /// Tools/synth_carrot_sfx.mjs) plus the single clips that already shipped. Each bank deals from a shuffled bag with
 /// no immediate repeat across refills, and every pick gets its own pitch (+-1 semitone) and level (+-1.5 dB), so
 /// a 110-enemy wave never plays the same buffer at the same pitch twice in a row.
 /// </summary>
 public sealed class CarrotSfxBank {
  public const float PitchSpread=1.0594631f; // one semitone
  public const float VolumeSpreadDb=1.5f;
  // Bank -> resource paths under Carrot/Audio. The first entry of a bank is the clip the game shipped before.
  public static readonly Dictionary<string,string[]> Banks=new Dictionary<string,string[]>{
   {"Metal",new[]{"ImpactMetal","Variants/Metal/Metal1","Variants/Metal/Metal2","Variants/Metal/Metal3","Variants/Metal/Metal4"}},
   {"Glass",new[]{"ImpactGlass","Variants/Glass/Glass1","Variants/Glass/Glass2","Variants/Glass/Glass3","Variants/Glass/Glass4"}},
   {"GlassLight",new[]{"Variants/GlassLight/GlassLight1","Variants/GlassLight/GlassLight2","Variants/GlassLight/GlassLight3","Variants/GlassLight/GlassLight4"}},
   {"Wood",new[]{"ImpactWood","Variants/Wood/Wood1","Variants/Wood/Wood2","Variants/Wood/Wood3","Variants/Wood/Wood4"}},
   {"Plate",new[]{"Variants/Plate/Plate1","Variants/Plate/Plate2","Variants/Plate/Plate3","Variants/Plate/Plate4"}},
   {"Mining",new[]{"Variants/Mining/Mining1","Variants/Mining/Mining2","Variants/Mining/Mining3","Variants/Mining/Mining4"}},
   {"Punch",new[]{"Variants/Punch/Punch1","Variants/Punch/Punch2","Variants/Punch/Punch3","Variants/Punch/Punch4"}},
   {"Bell",new[]{"Variants/Bell/Bell1","Variants/Bell/Bell2"}},
   {"Soft",new[]{"Variants/Soft/Soft1","Variants/Soft/Soft2","Variants/Soft/Soft3","Variants/Soft/Soft4","Variants/Soft/Soft5"}},
   {"SoftHeavy",new[]{"ImpactSoft","Variants/SoftHeavy/SoftHeavy1","Variants/SoftHeavy/SoftHeavy2","Variants/SoftHeavy/SoftHeavy3","Variants/SoftHeavy/SoftHeavy4"}},
   {"Grass",new[]{"FootstepGrass","Variants/Grass/Grass1","Variants/Grass/Grass2","Variants/Grass/Grass3","Variants/Grass/Grass4"}},
   {"Snow",new[]{"FootstepSnow","Variants/Snow/Snow1","Variants/Snow/Snow2","Variants/Snow/Snow3","Variants/Snow/Snow4"}},
   {"Slice",new[]{"Slice","Variants/Slice/Slice1","Variants/Slice/Slice2","Variants/Slice/Slice3","Variants/Slice/Slice4"}},
   {"Coin",new[]{"Coin","Variants/Coin/Coin1"}},
   {"KillPop",new[]{"Synth/KillPop","Synth/KillPopB"}},
  };
  sealed class Bag {public AudioClip[] clips;public int[] order;public int next;public int last=-1;}
  readonly Dictionary<string,Bag> bags=new Dictionary<string,Bag>();
  uint state;
  public int Loaded {get;private set;}
  public int Missing {get;private set;}
  public readonly List<string> MissingNames=new List<string>();

  public CarrotSfxBank(uint seed=0x9E3779B9u){state=seed==0?1u:seed;}
  /// <summary>Loads every bank from Resources (decoded up front: these are short one-shots).</summary>
  public void Load(System.Func<string,AudioClip> load){
   foreach(var pair in Banks){
    var list=new List<AudioClip>();
    foreach(var path in pair.Value){var clip=load(path);if(clip!=null){list.Add(clip);Loaded++;if(clip.loadState==AudioDataLoadState.Unloaded)clip.LoadAudioData();}else{Missing++;MissingNames.Add(path);}}
    if(list.Count>0)bags[pair.Key]=new Bag{clips=list.ToArray(),order=Identity(list.Count)};
   }
  }
  /// <summary>Test seam: a bank from explicit clips.</summary>
  public void Set(string bank,AudioClip[] clips){bags[bank]=new Bag{clips=clips,order=Identity(clips.Length)};}
  public bool Has(string bank)=>bags.ContainsKey(bank);
  public int Count(string bank)=>bags.TryGetValue(bank,out var b)?b.clips.Length:0;
  static int[] Identity(int n){var a=new int[n];for(int i=0;i<n;i++)a[i]=i;return a;}
  uint NextUInt(){uint x=state;x^=x<<13;x^=x>>17;x^=x<<5;state=x;return x;}
  public float Unit(){return (NextUInt()>>8)*(1f/16777216f);}
  /// <summary>Next clip of the bank (shuffled bag, never the same clip twice in a row), or null when the bank is empty.</summary>
  public AudioClip Next(string bank){
   if(!bags.TryGetValue(bank,out var b)||b.clips.Length==0)return null;
   if(b.clips.Length==1)return b.clips[0];
   if(b.next==0){
    // Fisher-Yates refill; a refill that would repeat the previous pick swaps it away from the front.
    for(int i=b.order.Length-1;i>0;i--){int j=(int)(NextUInt()%(uint)(i+1));int t=b.order[i];b.order[i]=b.order[j];b.order[j]=t;}
    if(b.order[0]==b.last){int j=1+(int)(NextUInt()%(uint)(b.order.Length-1));int t=b.order[0];b.order[0]=b.order[j];b.order[j]=t;}
   }
   int pick=b.order[b.next];b.next=(b.next+1)%b.order.Length;b.last=pick;return b.clips[pick];
  }
  /// <summary>Per-pick pitch multiplier in [1/semitone, semitone] (+-1 semitone).</summary>
  public float Pitch(){return Mathf.Pow(PitchSpread,Unit()*2-1);}
  /// <summary>Per-pick level multiplier for +-1.5 dB.</summary>
  public float Volume(){return Mathf.Pow(10,(Unit()*2-1)*VolumeSpreadDb/20);}
 }
}
