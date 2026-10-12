using UnityEngine;

// Owner: room-light-post. Fire light, flash, quality and atmosphere hooks. Bodies moved verbatim from ForgeWorld.cs.
public partial class ForgeWorld {
 float qualityTime;int frameCount;float frameTotal;float smokeClock;
 /// Quality tier 0 (best) to 3. The web maps it to the canvas DPR.
 int QualityTier=>0;
 /// Called once in Start after MakeDressing and before BatchRoom (static room geometry goes in before batching).
 void AtmosBuild(){}
 /// Called once in Start right after the camera exists (clear colour, AA and post settings).
 void AtmosCamera(Camera camera){}
 /// One bellows stroke of strength 0..1: fire swell, board animation, Send('sfx','bellows').
 void Bellows(float strength){}
 /// Called by Sync when snapshot.day changes.
 void AtmosDay(int day){}
 void AtmosQa(string mode){if(mode==ForgeContract.QaModes.Void&&cam!=null)cam.backgroundColor=Color.magenta;}
 void UpdateLighting(float dt){
  float flicker=reduced?1:1+Mathf.Sin(elapsed*12)*.08f+Mathf.Sin(elapsed*21)*.06f;furnaceLight.intensity=2.6f*flicker;fireMat.SetFloat("_Frame",reduced?0:Mathf.Floor(elapsed*14)%16);flash.intensity*=Mathf.Exp(-dt*12);Shader.SetGlobalFloat("_ForgeImpact",flash.intensity);
 }
 /// Contact-frame light for a hit (tempC = KnifeTemperature of the struck knife, 0 if it is gone).
 void AtmosImpact(ForgeEvent e,Vector3 contact,float tempC){if(!reduced)flash.intensity=e.outcome=="dull"?0:e.outcome=="perfect"?7:3.8f;}
 void UpdateQuality(float raw){frameTotal+=raw;frameCount++;qualityTime+=raw;if(qualityTime>5){float average=frameTotal/Mathf.Max(1,frameCount);Send("stats",FxParticleCount(),"fps",1/Mathf.Max(.001f,average),bodies.Count);if(average>.028f){QualitySettings.shadows=ShadowQuality.Disable;Send("quality",0,"low");}frameTotal=0;frameCount=0;qualityTime=0;}}
 void ResizeQuality(){QualitySettings.shadows=ShadowQuality.All;}
 /// Hearth smoke (room atmosphere, under this stream's reduced-motion policy).
 void UpdateHearthSmoke(float dt){
  smokeClock+=dt;if(smokeClock>.55f){smokeClock=0;Puff(spots["furnace"]+new Vector3(0,.22f,-.22f),1,true);}
 }
}
