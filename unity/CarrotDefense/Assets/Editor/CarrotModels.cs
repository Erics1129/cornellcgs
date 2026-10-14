using System;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;

namespace CarrotTD {
/// <summary>Deterministic import of authored Blender meshes and licensed skeletal clips.</summary>
public static class CarrotModels {
    const string Root = "Assets/Resources/Carrot";
    static readonly string[] Kinds = { "seed", "frost", "mortar", "prism", "storm", "blossom", "starfruit", "gravity", "book", "thunder" };
    static readonly string[] Enemies = { "nibble", "dash", "shell", "swarm", "moth", "shaman", "burrow", "crystal" };
    static readonly string[] Bosses = { "garden", "marsh", "frost", "orchard", "zombie" };
    /// <summary>Non-animated multi-part challenge bosses: the view spins and bobs their named pivots.</summary>
    static readonly string[] Props = { "tornado", "eyeball" };
    public static void Prepare() {
        Directory.CreateDirectory(Root + "/Models/Materials");
        Directory.CreateDirectory(Root + "/Models/Towers");
        Directory.CreateDirectory(Root + "/Models/Enemies");
        Directory.CreateDirectory(Root + "/Models/Bosses");
        AssetDatabase.Refresh();
        PrepareSurfaceTextures();
        ConfigureBiologicalRelief();
        foreach (var path in Directory.GetFiles(Root + "/Models/Source", "*.fbx")) Configure(path.Replace('\\','/'));
        if (Directory.Exists(Root + "/Nature/Source")) foreach (var path in Directory.GetFiles(Root + "/Nature/Source", "*.fbx")) Configure(path.Replace('\\','/'));
        Make("Carrot", "Models/Carrot", false);
        foreach (string kind in Kinds) for (int tier=1; tier<=5; tier++) {
            // The Super form (tier 5) is optional until its Blender export lands; the view falls back to tier 4.
            if (tier==5 && !File.Exists(Root + "/Models/Source/" + kind + "-5.fbx")) { Debug.LogWarning("Super model missing (view falls back to tier 4): " + kind + "-5"); continue; }
            Make(kind + "-" + tier, "Models/Towers/" + kind + "-" + tier, false);
        }
        foreach (string kind in Enemies) Make(kind, "Models/Enemies/" + kind, true);
        foreach (string kind in Bosses) Make(kind, "Models/Bosses/" + kind, true);
        foreach (string kind in Props) Make(kind, "Models/Bosses/" + kind, false);
        PrepareSuperEmblems();
        if (Directory.Exists(Root + "/Nature/Source")) foreach (var path in Directory.GetFiles(Root + "/Nature/Source", "*.fbx")) Make(Path.GetFileNameWithoutExtension(path), "Nature/"+Path.GetFileNameWithoutExtension(path), false, true);
        ConfigureAudio();
        AssetDatabase.SaveAssets();
        AssetDatabase.Refresh();
        Debug.Log("Carrot models prepared: 50 physical tower tiers, 15 animated creatures and props, articulated carrot, curated nature and licensed audio.");
    }
    static void Configure(string path) {
        var importer = AssetImporter.GetAtPath(path) as ModelImporter;
        if (importer == null) throw new InvalidOperationException("Missing model: " + path);
        bool animate = Enemies.Contains(Path.GetFileNameWithoutExtension(path)) || Bosses.Contains(Path.GetFileNameWithoutExtension(path));
        if (path.Contains("/Nature/")) animate=false;
        importer.globalScale=1;
        importer.useFileScale=true;
        // Convert both geometry and clips, so procedural pivots are Unity Y-up.
        importer.bakeAxisConversion=true;
        importer.importCameras=false; importer.importLights=false;
        importer.importBlendShapes=true;
        importer.importNormals=ModelImporterNormals.Import;
        importer.importTangents=ModelImporterTangents.CalculateMikk;
        importer.meshCompression=Path.GetFileNameWithoutExtension(path)=="Carrot"?ModelImporterMeshCompression.Low:ModelImporterMeshCompression.Medium;
        importer.isReadable=path.Contains("/Nature/");
        importer.optimizeMeshPolygons=true; importer.optimizeMeshVertices=true;
        importer.materialImportMode=ModelImporterMaterialImportMode.ImportStandard;
        importer.animationType=animate ? ModelImporterAnimationType.Legacy : ModelImporterAnimationType.None;
        importer.importAnimation=animate;
        importer.animationCompression=ModelImporterAnimationCompression.Optimal;
        importer.SaveAndReimport();
        if (animate) {
            var clips=importer.defaultClipAnimations;
            foreach (var clip in clips) {
                string label=clip.name.Split('|').Last();
                // FBX take names may include the source object's prefix.
                int suffix=label.LastIndexOf("Armature",StringComparison.OrdinalIgnoreCase);
                if (suffix>=0 && suffix+8<label.Length) label=label.Substring(suffix+8).Trim('_','|');
                clip.name=label;
                string lower=label.ToLowerInvariant();
                clip.loopTime=lower.Contains("walk") || lower.Contains("run") || lower.Contains("idle") || lower.Contains("flying");
                clip.wrapMode=clip.loopTime ? WrapMode.Loop : WrapMode.Once;
                clip.lockRootRotation=true;clip.lockRootPositionXZ=true;
            }
            importer.clipAnimations=clips;
            importer.SaveAndReimport();
        }
    }
    static void PrepareSuperEmblems() {
        // Ten round golden sigils (5x2 cells) decaled under Super towers; imported like VfxSheet.
        string path=Root+"/Textures/SuperEmblems.png";
        var importer=AssetImporter.GetAtPath(path) as TextureImporter;
        if(importer==null){Debug.LogWarning("SuperEmblems.png missing; the view uses the FxSheet Star6 fallback.");return;}
        importer.textureType=TextureImporterType.Default;importer.sRGBTexture=true;importer.alphaSource=TextureImporterAlphaSource.FromInput;importer.alphaIsTransparency=true;importer.mipmapEnabled=true;importer.wrapMode=TextureWrapMode.Clamp;importer.filterMode=FilterMode.Trilinear;importer.anisoLevel=2;importer.isReadable=false;importer.maxTextureSize=1024;CarrotBuild.WebTexture(importer,1024,90);importer.SaveAndReimport();
        string glow=Root+"/Models/Materials/SuperGlowDetail.png";
        var gi=AssetImporter.GetAtPath(glow) as TextureImporter;
        if(gi!=null){gi.sRGBTexture=true;gi.wrapMode=TextureWrapMode.Repeat;gi.filterMode=FilterMode.Trilinear;gi.mipmapEnabled=true;gi.maxTextureSize=256;gi.isReadable=false;CarrotBuild.WebTexture(gi,256,70);gi.SaveAndReimport();}
    }
    static void PrepareSurfaceTextures() {
        string atlasPath=Root+"/Textures/MaterialAtlas.png";
        var importer=AssetImporter.GetAtPath(atlasPath) as TextureImporter;
        if(importer==null)return;
        importer.isReadable=true;importer.textureCompression=TextureImporterCompression.Uncompressed;var web=importer.GetPlatformTextureSettings("WebGL");web.overridden=false;importer.SetPlatformTextureSettings(web);importer.crunchedCompression=false;importer.SaveAndReimport();
        var atlas=AssetDatabase.LoadAssetAtPath<Texture2D>(atlasPath);
        string[] names={"Soil","Stone","Bark","Carrot","Leaf","Metal"};
        int w=atlas.width/3,h=atlas.height/2;
        for(int i=0;i<6;i++) {
            var pixels=atlas.GetPixels((i%3)*w,(1-i/3)*h,w,h);
            // Original generated pore/grain detail modulates authored vertex color,
            // keeping all face and ability palettes readable at game-camera distance.
            for(int j=0;j<pixels.Length;j++) {float value=.72f+.34f*pixels[j].grayscale;pixels[j]=new Color(value,value,value,1);}
            var tile=new Texture2D(w,h,TextureFormat.RGBA32,false);tile.SetPixels(pixels);tile.Apply();
            string path=Root+"/Models/Materials/"+names[i]+"Detail.png";File.WriteAllBytes(path,tile.EncodeToPNG());UnityEngine.Object.DestroyImmediate(tile);
            AssetDatabase.ImportAsset(path);
            var ti=AssetImporter.GetAtPath(path) as TextureImporter;
            if(ti!=null){ti.wrapMode=TextureWrapMode.Repeat;ti.maxTextureSize=512;ti.isReadable=false;CarrotBuild.WebTexture(ti,512,70);ti.SaveAndReimport();}
        }
        importer.isReadable=false;importer.maxTextureSize=512;CarrotBuild.WebTexture(importer,512,70);importer.SaveAndReimport();
    }
    static void ConfigureBiologicalRelief() {
        // Shallow, surface-specific relief keeps painted color from reading as
        // smooth plastic. These original technical maps do not modify albedo.
        foreach(string category in new[]{"Carrot","Leaf","Fur","Scale"}) {
            foreach(bool normal in new[]{true,false}) {
                string path=Root+"/Models/Materials/"+category+(normal?"MicroNormal.png":"MicroRoughness.png");
                var importer=AssetImporter.GetAtPath(path) as TextureImporter;
                if(importer==null)throw new InvalidOperationException("Biological relief texture missing: "+path);
                importer.textureType=normal?TextureImporterType.NormalMap:TextureImporterType.Default;
                importer.sRGBTexture=false;importer.convertToNormalmap=false;
                importer.wrapMode=TextureWrapMode.Repeat;importer.filterMode=FilterMode.Trilinear;
                importer.anisoLevel=2;importer.mipmapEnabled=true;importer.isReadable=false;
                importer.maxTextureSize=512;CarrotBuild.WebTexture(importer,512,normal?85:70);
                importer.SaveAndReimport();
            }
        }
    }
    static Material Surface(string category) {
        string[] categories={"SuperGlow","Metal","Glow","Carrot","Leaf","Bark","Stone","Fur","Scale","Petal"};
        category=categories.FirstOrDefault(c=>category.StartsWith(c,StringComparison.Ordinal)) ?? "Organic";
        string path=Root+"/Models/Materials/"+category+".mat";
        var material=AssetDatabase.LoadAssetAtPath<Material>(path);
        var shader=Shader.Find("Carrot/Storybook");
        if (!shader) throw new InvalidOperationException("Carrot/Storybook shader must exist before preparing models.");
        if (!material) {material=new Material(shader); AssetDatabase.CreateAsset(material,path);}
        material.shader=shader;material.SetColor("_Color",Color.white);
        // Blender writes FBX COLOR in sRGB; Unity preserves those channel values
        // even in a linear project. Decode only these imported model palettes.
        material.SetFloat("_VertexColorSRGB",1f);
        var detail=AssetDatabase.LoadAssetAtPath<Texture2D>(Root+"/Models/Materials/"+category+"Detail.png");
        material.SetTexture("_MainTex",detail);
        material.SetTextureScale("_MainTex",new Vector2(category=="Carrot"?3f:2f,2f));
        material.SetFloat("_Metallic",category=="Metal"?.85f:category=="SuperGlow"?.6f:0f);
        material.SetFloat("_Glossiness",category=="Metal"?.68f:category=="SuperGlow"?.9f:category=="Glow"?.88f:category=="Scale"?.62f:category=="Carrot"?.40f:category=="Fur"?.14f:category=="Leaf"?.45f:category=="Petal"?.42f:category=="Bark"?.30f:category=="Stone"?.22f:.38f);
        material.SetFloat("_Translucency",category=="Leaf"?.55f:category=="Petal"?.45f:category=="Fur"?.25f:category=="Carrot"?.15f:0f);
        material.SetFloat("_SnowStrength",.35f);
        material.SetColor("_EmissionColor",category=="SuperGlow"?Color.white*2.8f:category=="Glow"?new Color(.11f,.13f,.14f,1)*2.2f:Color.black);
        // Storybook pulses emission only where _SuperPulse is set, driven by the global _CarrotSuperPulse.
        material.SetFloat("_SuperPulse",category=="SuperGlow"?1f:0f);
        if(category=="SuperGlow") {
            var superDetail=AssetDatabase.LoadAssetAtPath<Texture2D>(Root+"/Models/Materials/SuperGlowDetail.png")??AssetDatabase.LoadAssetAtPath<Texture2D>(Root+"/Models/Materials/MetalDetail.png");
            material.SetTexture("_MainTex",superDetail);
        }
        string pbr=Root+"/Textures/PBR/"+category;
        if(category=="Carrot"||category=="Leaf"||category=="Fur"||category=="Scale") {
            var biological=AssetDatabase.LoadAssetAtPath<Texture2D>(pbr+"Albedo.png")??AssetDatabase.LoadAssetAtPath<Texture2D>(pbr+"Albedo.jpg");
            if(biological)material.SetTexture("_MainTex",biological);
        }
        Texture2D normal=AssetDatabase.LoadAssetAtPath<Texture2D>(pbr+"Normal.png");
        Texture2D roughness=AssetDatabase.LoadAssetAtPath<Texture2D>(pbr+"Roughness.jpg");
        Texture2D occlusion=AssetDatabase.LoadAssetAtPath<Texture2D>(pbr+"AO.jpg");
        bool biologicalSurface=category=="Carrot"||category=="Leaf"||category=="Fur"||category=="Scale";
        if(biologicalSurface) {
            normal=AssetDatabase.LoadAssetAtPath<Texture2D>(Root+"/Models/Materials/"+category+"MicroNormal.png");
            roughness=AssetDatabase.LoadAssetAtPath<Texture2D>(Root+"/Models/Materials/"+category+"MicroRoughness.png");
        }
        float reliefStrength=category=="Fur"?.82f:category=="Scale"?.86f:category=="Carrot"?.68f:category=="Leaf"?.72f:category=="Bark"?1.0f:category=="Stone"?.9f:.72f;
        material.SetTexture("_BumpMap",normal);material.SetFloat("_BumpScale",normal?reliefStrength:0f);
        material.SetTexture("_RoughnessMap",roughness);material.SetFloat("_UseRoughnessMap",roughness?1:0);
        material.SetTexture("_OcclusionMap",occlusion);material.SetFloat("_UseOcclusionMap",occlusion?1:0);material.SetFloat("_OcclusionStrength",.63f);
        material.enableInstancing=false;EditorUtility.SetDirty(material);return material;
    }
    static void Make(string source,string destination,bool animated,bool nature=false) {
        string path=Root+(nature?"/Nature/Source/":"/Models/Source/")+source+".fbx";
        var asset=AssetDatabase.LoadAssetAtPath<GameObject>(path);
        if (!asset) throw new InvalidOperationException("Source FBX unavailable: "+path);
        var imported=UnityEngine.Object.Instantiate(asset);imported.name="Geometry";
        var instance=new GameObject(source);imported.transform.SetParent(instance.transform,false);
        foreach (Renderer r in instance.GetComponentsInChildren<Renderer>(true)) {
            var mats=r.sharedMaterials;
            for (int i=0;i<mats.Length;i++) mats[i]=Surface(mats[i]?mats[i].name:"Organic");
            r.sharedMaterials=mats;r.shadowCastingMode=ShadowCastingMode.On;r.receiveShadows=true;
            if (r is SkinnedMeshRenderer skin) skin.updateWhenOffscreen=false;
        }
        if(!animated&&!nature) NormalizeAnimationPivots(imported.transform);
        if (animated) {
            foreach (var animator in instance.GetComponentsInChildren<Animator>(true)) UnityEngine.Object.DestroyImmediate(animator);
            var animation=imported.GetComponent<Animation>();if(!animation)animation=imported.AddComponent<Animation>();
            animation.playAutomatically=false;animation.cullingType=AnimationCullingType.AlwaysAnimate;
            var clips=AssetDatabase.LoadAllAssetsAtPath(path).OfType<AnimationClip>().Where(c=>!c.name.StartsWith("__preview__")).ToArray();
            foreach(var clip in clips) { animation.AddClip(clip,clip.name); if(clip.name.ToLowerInvariant().Contains("idle"))animation.clip=clip; }
            if(clips.Length==0)throw new InvalidOperationException("Skeletal clips missing: "+source);
        }
        if (source=="Carrot") foreach(var t in instance.GetComponentsInChildren<Transform>(true)) if(t.name=="MouthHurt"||t.name=="MouthHappy"||t.name=="BitePatch")t.gameObject.SetActive(false);
        var renderers=instance.GetComponentsInChildren<Renderer>(true);
        if(renderers.Length>0){var bounds=renderers[0].bounds;foreach(var renderer in renderers)bounds.Encapsulate(renderer.bounds);Debug.Log("MODEL_BOUNDS "+destination+" size="+bounds.size.ToString("F3")+" min="+bounds.min.ToString("F3")+" nativeRotation="+imported.transform.localEulerAngles.ToString("F2"));}
        PrefabUtility.SaveAsPrefabAsset(instance,Root+"/"+destination+".prefab");
        UnityEngine.Object.DestroyImmediate(instance);
    }
    static void NormalizeAnimationPivots(Transform imported) {
        // FBX may contain an explicit artist root rotation even after axis import.
        // Preserve the artwork exactly, but expose predictable Unity-space pivots
        // to the runtime animation layer. Creature bones are deliberately excluded.
        string[] names={"Turret","Core","Barrel","Petals","Pages","Leaves","EyeL","EyeR","ArmL","ArmR","BrowL","BrowR","Muzzle","Ring01","Ring02","Ring03","Bell01","Bell02","Bell03","Bell04","Bell05","FunnelTier0","FunnelTier1","FunnelTier2","FunnelTier3","FunnelTier4","DebrisRing0","DebrisRing1","DebrisRing2","UpperLid","LowerLid","Pupil","Iris","Tentacle0","Tentacle1","Tentacle2","Tentacle3","Tentacle4","Tentacle5"};
        var parts=imported.GetComponentsInChildren<Transform>(true).Where(t=>names.Contains(t.name)).ToArray();
        foreach(var part in parts) {
            string name=part.name;var parent=part.parent;int index=part.GetSiblingIndex();
            var pivot=new GameObject(name).transform;
            pivot.SetParent(parent,false);pivot.position=part.position;pivot.rotation=Quaternion.identity;
            var lossy=parent?parent.lossyScale:Vector3.one;
            pivot.localScale=new Vector3(1/Mathf.Max(.000001f,Mathf.Abs(lossy.x)),1/Mathf.Max(.000001f,Mathf.Abs(lossy.y)),1/Mathf.Max(.000001f,Mathf.Abs(lossy.z)));
            pivot.SetSiblingIndex(index);part.name=name+"Geometry";part.SetParent(pivot,true);
        }
    }
    static void ConfigureAudio() {
        foreach(string file in Directory.GetFiles(Root+"/Audio")) {
            var importer=AssetImporter.GetAtPath(file.Replace('\\','/')) as AudioImporter;
            if(importer==null)continue;
            string name=Path.GetFileName(file);bool music=name.StartsWith("Music"),voice=name.StartsWith("Voice");
            importer.forceToMono=!music;importer.loadInBackground=music;
            var settings=importer.defaultSampleSettings;
            settings.loadType=music?AudioClipLoadType.CompressedInMemory:AudioClipLoadType.DecompressOnLoad;
            settings.compressionFormat=AudioCompressionFormat.Vorbis;
            settings.quality=music?.5f:voice?.5f:.65f;
            settings.sampleRateSetting=voice?AudioSampleRateSetting.OverrideSampleRate:AudioSampleRateSetting.OptimizeSampleRate;
            settings.sampleRateOverride=voice?32000u:44100u;
            importer.defaultSampleSettings=settings;importer.SaveAndReimport();
        }
    }
}
}
