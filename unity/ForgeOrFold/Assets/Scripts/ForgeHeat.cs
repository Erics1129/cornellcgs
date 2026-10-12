using UnityEngine;

// Owner: hot-metal-vfx. Presentation-only knife temperature (no engine actions).
public partial class ForgeWorld {
 /// Per-knife temperature state, stored on Body.heatState. Empty until hot-metal-vfx fills it.
 class HeatState {}
 /// Per-frame knife look (heat, evolution, emission). Moved verbatim from the bodies loop of Update.
 void KnifeVisual(Body b,float dt){
  b.heat=Mathf.Max(0,b.heat-dt*.04f);b.evolution=Mathf.Max(0,b.evolution-dt);float lift=b.evolution>0?Mathf.Sin(b.evolution/1.5f*Mathf.PI):0;b.root.transform.position+=Vector3.up*lift*dt*2.4f;b.metal.SetFloat("_Heat",b.heat);b.metal.SetColor("_EmissionColor",Color.white*lift*2+(b.knife.flow>0?new Color(.08f,.25f,.3f):Color.black));if(b.knife.level>=15&&UnityEngine.Random.value<dt*6)Burst(b.root.transform.position+Vector3.right*.7f,1,"perfect");
 }
 /// The engine heat event arrived for this knife.
 void KnifeHeated(Body b){b.heat=1;}
 /// The knife's logical place entered (true) or left (false) the furnace. Sync calls it on place changes;
 /// the hearth choreography may call it again at the visual moment, so it must be idempotent.
 void KnifeInCoals(Body b,bool inCoals){}
 /// The knife was plunged into the slack tub (keep choreography).
 void KnifeQuench(Body b){}
 /// Body temperature in degrees C (the 3 mm body value).
 float KnifeTemperature(Body b)=>b.heat*1150;
 void MetalQa(string mode){}
}
