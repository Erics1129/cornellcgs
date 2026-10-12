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
    static readonly string[] Bosses = { "garden", "marsh", "frost" };
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
        foreach (string kind in Kinds) for (int tier=1; tier<=4; tier++) Make(kind + "-" + tier, "Models/Towers/" + kind + "-" + tier, false);
        foreach (string kind in Enemies) Make(kind, "Models/Enemies/" + kind, true);
        foreach (string kind in Bosses) Make(kind, "Models/Bosses/" + kind, true);
        if (Directory.Exists(Root + "/Nature/Source")) foreach (var path in Directory.GetFiles(Root + "/Nature/Source", "*.fbx")) Make(Path.GetFileNameWithoutExtension(path), "Nature/"+Path.GetFileNameWithoutExtension(path), false, true);
        ConfigureAudio();
        AssetDatabase.SaveAssets();
        AssetDatabase.Refresh();
        Debug.Log("Carrot models prepared: 40 physical tower tiers, articulated carrot, 11 animated creatures, curated nature and licensed audio.");
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
        importer.meshCompression=ModelImporterMeshCompression.Low;
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
    static void PrepareSurfaceTextures() {
        string atlasPath=Root+"/Textures/MaterialAtlas.png";
        var importer=AssetImporter.GetAtPath(atlasPath) as TextureImporter;
        if(importer==null)return;
        importer.isReadable=true;importer.textureCompression=TextureImporterCompression.Uncompressed;importer.SaveAndReimport();
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
            if(ti!=null){ti.wrapMode=TextureWrapMode.Repeat;ti.maxTextureSize=512;ti.isReadable=false;ti.textureCompression=TextureImporterCompression.Compressed;ti.SaveAndReimport();}
        }
        importer.isReadable=false;importer.textureCompression=TextureImporterCompression.Compressed;importer.SaveAndReimport();
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
                importer.maxTextureSize=512;importer.textureCompression=TextureImporterCompression.CompressedHQ;
                importer.SaveAndReimport();
            }
        }
    }
    static Material Surface(string category) {
        string[] categories={"Metal","Glow","Carrot","Leaf","Bark","Stone","Fur","Scale","Petal"};
        category=categories.FirstOrDefault(c=>category.StartsWith(c,StringComparison.Ordinal)) ?? "Organic";
        string path=Root+"/Models/Materials/"+category+".mat";
        var material=AssetDatabase.LoadAssetAtPath<Material>(path);
        var shader=Shader.Find("Carrot/Storybook");
        if (!shader) throw new InvalidOperationException("Carrot/Storybook shader must exist before preparing models.");
        if (!material) {material=new Material(shader); AssetDatabase.CreateAsset(material,path);}
        material.shader=shader;material.SetColor("_Color",Color.white);
        var detail=AssetDatabase.LoadAssetAtPath<Texture2D>(Root+"/Models/Materials/"+category+"Detail.png");
        material.SetTexture("_MainTex",detail);
        material.SetTextureScale("_MainTex",new Vector2(category=="Carrot"?3f:2f,2f));
        material.SetFloat("_Metallic",category=="Metal"?.65f:0f);
        material.SetFloat("_Glossiness",category=="Metal"?.65f:category=="Glow"?.88f:category=="Scale"?.68f:category=="Carrot"?.40f:category=="Fur"?.16f:.28f);
        material.SetColor("_EmissionColor",category=="Glow"?new Color(.11f,.13f,.14f,1):Color.black);
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
        float reliefStrength=category=="Fur"?.82f:category=="Scale"?.86f:category=="Carrot"?.68f:category=="Leaf"?.72f:category=="Bark"?1.0f:.72f;
        material.SetTexture("_BumpMap",normal);material.SetFloat("_BumpScale",normal?reliefStrength:0f);
        material.SetTexture("_RoughnessMap",roughness);material.SetFloat("_UseRoughnessMap",roughness?1:0);
        material.SetTexture("_OcclusionMap",occlusion);material.SetFloat("_UseOcclusionMap",occlusion?1:0);material.SetFloat("_OcclusionStrength",.63f);
        material.enableInstancing=true;EditorUtility.SetDirty(material);return material;
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
        string[] names={"Turret","Core","Barrel","Petals","Pages","Leaves","EyeL","EyeR","ArmL","ArmR","BrowL","BrowR","Muzzle","Ring01","Ring02","Bell01","Bell02","Bell03"};
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
            bool music=Path.GetFileName(file).StartsWith("Music");
            importer.forceToMono=!music;
            var settings=importer.defaultSampleSettings;
            settings.loadType=music?AudioClipLoadType.CompressedInMemory:AudioClipLoadType.DecompressOnLoad;
            settings.compressionFormat=AudioCompressionFormat.Vorbis;
            settings.quality=music?.72f:.8f;
            settings.sampleRateSetting=AudioSampleRateSetting.OptimizeSampleRate;
            importer.defaultSampleSettings=settings;importer.SaveAndReimport();
        }
    }
}
}
