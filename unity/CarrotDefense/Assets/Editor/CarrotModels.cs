using System;
using System.Collections.Generic;
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
    static readonly string[] ExpansionKinds = { "bamboo", "chili", "lotus", "magnet", "orchid", "mushroom", "cactus", "clockflower", "dragonfruit", "moonflower" };
    static readonly string[] ExpansionEnemies = { "mite", "beetle", "slug", "wisp", "bat", "scarab", "firefly", "sporeling", "tinyZombie", "riftling", "shardling", "mimic" };
    static readonly string[] Minibosses = { "warDrummer", "frostHerald", "witherPriest", "stormWarden", "graveCaller", "mirrorKnight", "riftStalker", "mossGolem", "emberBoar", "venomQueen", "ironSnail", "lanternLeech", "chronoMoth", "thornBeast", "portalSentinel" };
    static readonly string[] Bosses = { "garden", "marsh", "frost", "orchard", "zombie" };
    /// <summary>Non-animated multi-part challenge bosses: the view spins and bobs their named pivots.</summary>
    static readonly string[] Props = { "tornado", "eyeball" };
    /// <summary>Models whose imported normals are recomputed (see Configure).</summary>
    static readonly string[] SmoothNormals = { "shell" };
    /// <summary>
    /// The original eight creatures and the four biome guardians plus the zombie were authored front -Y in Blender, which imports as
    /// Unity -Z, but the view yaws enemy roots along +Z (LookRotation of the path direction; only Portal-era actors get an extra 180).
    /// They walked backwards. The prefab now turns their Geometry 180 degrees so the prefab front is +Z, matching the view.
    /// </summary>
    static readonly string[] PlusZFront = { "nibble", "dash", "shell", "swarm", "moth", "shaman", "burrow", "crystal", "garden", "marsh", "frost", "orchard", "zombie" };
    /// <summary>Per-actor surface category for an imported material name (null keeps the material's own category).</summary>
    static string ActorCategory(string source,string renderer,string material) {
        if(source=="Carrot"&&material=="Organic"&&renderer.StartsWith("Eye",StringComparison.Ordinal))return "Eye";
        if(material=="Organic") {
            switch(source) {
                case "nibble": case "shaman": return "Mushroom";
                case "shell": case "moth": return "Chitin";
                case "swarm": return "Gel";
                case "dash": case "burrow": return "Pelt";
                case "zombie": return "ZombieHide";
            }
        }
        if(material=="Glow"&&(source.StartsWith("frost-",StringComparison.Ordinal)||source=="crystal"))return "Ice";
        return null;
    }
    public static void Prepare() {
        Directory.CreateDirectory(Root + "/Models/Materials");
        Directory.CreateDirectory(Root + "/Models/Towers");
        Directory.CreateDirectory(Root + "/Models/Enemies");
        Directory.CreateDirectory(Root + "/Models/Bosses");
        Directory.CreateDirectory(Root + "/Models/Minibosses");
        AssetDatabase.Refresh();
        PrepareSurfaceTextures();
        ConfigureBiologicalRelief();
        PreparePortalSurfaces();
        ConfigureDetailNormals();
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
        foreach (string kind in ExpansionKinds) for (int tier=1; tier<=5; tier++) Make(kind + "-" + tier, "Models/Towers/" + kind + "-" + tier, false);
        foreach (string kind in ExpansionEnemies) Make(kind, "Models/Enemies/" + kind, true);
        foreach (string kind in Minibosses) Make(kind, "Models/Minibosses/" + kind, true);
        Make("portal", "Models/Bosses/portal", false);
        PrepareSuperEmblems();
        if (Directory.Exists(Root + "/Nature/Source")) foreach (var path in Directory.GetFiles(Root + "/Nature/Source", "*.fbx")) Make(Path.GetFileNameWithoutExtension(path), "Nature/"+Path.GetFileNameWithoutExtension(path), false, true);
        ConfigureAudio();
        AssetDatabase.SaveAssets();
        AssetDatabase.Refresh();
        Debug.Log("Carrot models prepared: 100 physical tower tiers, all original actors plus 12 new mobs, 15 minibosses and Portal, articulated carrot, curated nature and licensed audio.");
    }
    static void Configure(string path) {
        var importer = AssetImporter.GetAtPath(path) as ModelImporter;
        if (importer == null) throw new InvalidOperationException("Missing model: " + path);
        string modelName=Path.GetFileNameWithoutExtension(path);
        bool animate = Enemies.Contains(modelName) || Bosses.Contains(modelName) || ExpansionEnemies.Contains(modelName) || Minibosses.Contains(modelName);
        if (path.Contains("/Nature/")) animate=false;
        importer.globalScale=1;
        importer.useFileScale=true;
        // Convert both geometry and clips, so procedural pivots are Unity Y-up.
        importer.bakeAxisConversion=true;
        importer.importCameras=false; importer.importLights=false;
        importer.importBlendShapes=true;
        importer.importNormals=ModelImporterNormals.Import;
        // The licensed spider ships flat-shaded split normals; recompute with a 60 degree smoothing angle so the
        // chitin reads as rounded plates (hard creases above 60 degrees stay hard).
        if(SmoothNormals.Contains(modelName)){importer.importNormals=ModelImporterNormals.Calculate;importer.normalSmoothingAngle=60;importer.normalCalculationMode=ModelImporterNormalCalculationMode.AreaAndAngleWeighted;importer.normalSmoothingSource=ModelImporterNormalSmoothingSource.PreferSmoothingGroups;}
        importer.importTangents=ModelImporterTangents.CalculateMikk;
        importer.meshCompression=Path.GetFileNameWithoutExtension(path)=="Carrot"?ModelImporterMeshCompression.Low:ModelImporterMeshCompression.Medium;
        importer.isReadable=path.Contains("/Nature/")||modelName=="portal";
        importer.optimizeMeshPolygons=true; importer.optimizeMeshVertices=true;
        // Mesh LOD (index ranges inside the same mesh, no extra vertices) for the actors that crowd the board; CarrotTierLod picks the level per quality tier.
        bool crowd=Enemies.Contains(modelName)||ExpansionEnemies.Contains(modelName)||Minibosses.Contains(modelName);
        // Guardians and the hero (one each on the board) get one reduced level for the Low tier only. Tower tiers are left whole:
        // nine to twenty towers saved under 40k triangles on Low, not worth their index data in the download.
        bool heavy=modelName=="Carrot"||Bosses.Contains(modelName)||Props.Contains(modelName)||modelName=="portal";
        // Minibosses (three or four on the board at most) keep one reduced level: two levels cost 0.4 MB more index data for ~10k triangles.
        importer.generateMeshLods=crowd||heavy;if(crowd&&!Minibosses.Contains(modelName))importer.maximumMeshLod=2;else if(crowd||heavy)importer.maximumMeshLod=1;
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
    /// <summary>
    /// The Giant Tornado's wind shells (Tools/refine_carrot_characters.tornado_v2): Carrot/FxAlpha with the baked wind-streak sheet,
    /// flat puff shading and one render queue per layer so the inner shell always draws before the outer ones.
    /// </summary>
    static Material WindShell(string name) {
        int layer=int.Parse(name.Substring("TornadoShell".Length),System.Globalization.CultureInfo.InvariantCulture);
        string path=Root+"/Models/Materials/"+name+".mat";var shader=Shader.Find("Carrot/FxAlpha");
        if(!shader)throw new InvalidOperationException("Carrot/FxAlpha shader must exist before preparing the tornado.");
        var m=AssetDatabase.LoadAssetAtPath<Material>(path);if(!m){m=new Material(shader);AssetDatabase.CreateAsset(m,path);}
        m.shader=shader;m.SetColor("_Color",Color.white);m.SetTexture("_MainTex",AssetDatabase.LoadAssetAtPath<Texture2D>(Root+"/Models/Materials/TornadoStreaks.png"));
        m.SetTextureScale("_MainTex",new Vector2(layer==4?6:2+layer,1));m.SetTextureOffset("_MainTex",new Vector2(.37f*layer,0));
        m.SetFloat("_UseAtlas",1);m.SetFloat("_Puff",0);m.SetFloat("_Translucency",.55f);m.SetFloat("_SoftFade",.3f);
        m.renderQueue=3000+layer;m.enableInstancing=false;EditorUtility.SetDirty(m);return m;
    }
    /// <summary>Import settings for the giant-update detail normals, the tornado wind sheet and the zombie albedo tint (Tools/bake_detail_normals.py).</summary>
    static void ConfigureDetailNormals() {
        foreach(string name in new[]{"MushroomPore","ChitinPlate","GelRipple","IceFacet","SkinPore","FurStrand","LeafCluster"}) {
            string path=Root+"/Models/Materials/"+name+"Detail.png";var importer=AssetImporter.GetAtPath(path) as TextureImporter;
            if(importer==null)throw new InvalidOperationException("Detail normal missing (run Tools/bake_detail_normals.py): "+path);
            importer.textureType=TextureImporterType.NormalMap;importer.sRGBTexture=false;importer.convertToNormalmap=false;
            importer.wrapMode=TextureWrapMode.Repeat;importer.filterMode=FilterMode.Trilinear;importer.anisoLevel=2;importer.mipmapEnabled=true;importer.isReadable=false;
            importer.maxTextureSize=512;CarrotBuild.WebTexture(importer,512,80);importer.SaveAndReimport();
        }
        var streaks=AssetImporter.GetAtPath(Root+"/Models/Materials/TornadoStreaks.png") as TextureImporter;
        if(streaks!=null){streaks.textureType=TextureImporterType.Default;streaks.sRGBTexture=true;streaks.alphaSource=TextureImporterAlphaSource.FromInput;streaks.alphaIsTransparency=true;streaks.wrapModeU=TextureWrapMode.Repeat;streaks.wrapModeV=TextureWrapMode.Clamp;streaks.filterMode=FilterMode.Trilinear;streaks.mipmapEnabled=true;streaks.isReadable=false;streaks.maxTextureSize=512;CarrotBuild.WebTexture(streaks,512,70);streaks.SaveAndReimport();}
        var foliage=AssetImporter.GetAtPath(Root+"/Models/Materials/FoliageDetail.png") as TextureImporter;
        if(foliage!=null){foliage.textureType=TextureImporterType.Default;foliage.sRGBTexture=true;foliage.wrapMode=TextureWrapMode.Repeat;foliage.filterMode=FilterMode.Trilinear;foliage.anisoLevel=2;foliage.mipmapEnabled=true;foliage.isReadable=false;foliage.maxTextureSize=512;CarrotBuild.WebTexture(foliage,512,70);foliage.SaveAndReimport();}
        var tint=AssetImporter.GetAtPath(Root+"/Models/Materials/ZombieHideTint.png") as TextureImporter;
        if(tint!=null){tint.textureType=TextureImporterType.Default;tint.sRGBTexture=true;tint.mipmapEnabled=false;tint.filterMode=FilterMode.Point;tint.wrapMode=TextureWrapMode.Repeat;tint.isReadable=false;tint.maxTextureSize=32;tint.textureCompression=TextureImporterCompression.Uncompressed;var web=tint.GetPlatformTextureSettings("WebGL");web.overridden=true;web.maxTextureSize=32;web.format=TextureImporterFormat.RGBA32;tint.SetPlatformTextureSettings(web);tint.SaveAndReimport();}
    }
    static void PreparePortalSurfaces() {
        string atlasPath=Root+"/Textures/PortalBioAtlas.png";
        var source=AssetImporter.GetAtPath(atlasPath) as TextureImporter;
        if(source==null)throw new InvalidOperationException("Portal biological atlas missing: "+atlasPath);
        source.isReadable=true;source.sRGBTexture=true;source.textureCompression=TextureImporterCompression.Uncompressed;
        var settings=source.GetPlatformTextureSettings("WebGL");settings.overridden=false;source.SetPlatformTextureSettings(settings);source.SaveAndReimport();
        var atlas=AssetDatabase.LoadAssetAtPath<Texture2D>(atlasPath);int size=512,halfW=atlas.width/2,halfH=atlas.height/2;
        string[] categories={"PortalChitin","PortalCap","PortalBamboo","PortalPeel"};
        for(int category=0;category<4;category++) {
            var detail=new Color[size*size];var normals=new Color[size*size];var roughness=new Color[size*size];
            for(int y=0;y<size;y++)for(int x=0;x<size;x++) {
                float u=x/(float)size,v=y/(float)size;
                int px=category%2*halfW+Mathf.Clamp(Mathf.RoundToInt(u*(halfW-1)),0,halfW-1);
                int py=(1-category/2)*halfH+Mathf.Clamp(Mathf.RoundToInt(v*(halfH-1)),0,halfH-1);
                float grain=atlas.GetPixel(px,py).grayscale;float shade=.72f+.34f*grain;
                detail[y*size+x]=new Color(shade,shade,shade,1);
                float du=PortalRelief(category,u+1f/size,v)-PortalRelief(category,u-1f/size,v);
                float dv=PortalRelief(category,u,v+1f/size)-PortalRelief(category,u,v-1f/size);
                var n=new Vector3(-du*size*.045f,-dv*size*.045f,1).normalized;
                normals[y*size+x]=new Color(n.x*.5f+.5f,n.y*.5f+.5f,n.z*.5f+.5f,1);
                float r=(category==0?.48f:category==1?.79f:category==2?.52f:.35f)+.07f*(PortalRelief(category,u,v)-.5f);
                roughness[y*size+x]=new Color(r,r,r,1);
            }
            WritePortalMap(categories[category]+"Detail",detail,size,false,false);
            WritePortalMap(categories[category]+"Normal",normals,size,true,true);
            WritePortalMap(categories[category]+"Roughness",roughness,size,false,true);
        }
        source.isReadable=false;source.maxTextureSize=1024;CarrotBuild.WebTexture(source,1024,85);source.SaveAndReimport();
    }
    static float PortalRelief(int category,float u,float v) {
        // Tileable analytic microgeometry, independent of generated colour pixels.
        float a=u*Mathf.PI*2,b=v*Mathf.PI*2;
        if(category==0)return .50f+.18f*Mathf.Sin(a*14+Mathf.Sin(b*8))+.10f*Mathf.Sin(b*17+a*3);
        if(category==1)return .50f+.13f*Mathf.Sin(a*49+b*17)*Mathf.Sin(b*43-a*11)+.07f*Mathf.Sin(a*73+b*61);
        if(category==2)return .50f+.21f*Mathf.Sin(a*32+.30f*Mathf.Sin(b*3))+.08f*Mathf.Sin(a*67+b);
        return .50f+.11f*Mathf.Sin(a*53+b*37)*Mathf.Sin(b*59-a*19)+.035f*Mathf.Sin(a*13+b*11);
    }
    static void WritePortalMap(string name,Color[] pixels,int size,bool normal,bool linear) {
        var texture=new Texture2D(size,size,TextureFormat.RGBA32,false,linear);texture.SetPixels(pixels);texture.Apply();
        string path=Root+"/Models/Materials/"+name+".png";File.WriteAllBytes(path,texture.EncodeToPNG());UnityEngine.Object.DestroyImmediate(texture);AssetDatabase.ImportAsset(path);
        var importer=AssetImporter.GetAtPath(path) as TextureImporter;
        importer.textureType=normal?TextureImporterType.NormalMap:TextureImporterType.Default;importer.sRGBTexture=!linear;importer.convertToNormalmap=false;
        importer.isReadable=false;importer.mipmapEnabled=true;importer.wrapMode=TextureWrapMode.Repeat;importer.filterMode=FilterMode.Trilinear;importer.anisoLevel=2;
        CarrotBuild.WebTexture(importer,512,normal?85:75);importer.SaveAndReimport();
    }
    static Material Surface(string category) {
        string[] categories={"PortalChitin","PortalCap","PortalBamboo","PortalPeel","SuperGlow","Metal","Glow","Carrot","Leaf","Bark","Stone","Fur","Scale","Petal","Mushroom","Chitin","Gel","Ice","Eye","ZombieHide","Pelt","TornadoDust","Foliage","Gourd","Straw"};
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
        if(biologicalSurface||category=="Pelt") {
            // Pelt (bunny, mole) shares the fur relief but keeps the creature's own painted colour (no fur albedo).
            string relief=category=="Pelt"?"Fur":category;
            normal=AssetDatabase.LoadAssetAtPath<Texture2D>(Root+"/Models/Materials/"+relief+"MicroNormal.png");
            roughness=AssetDatabase.LoadAssetAtPath<Texture2D>(Root+"/Models/Materials/"+relief+"MicroRoughness.png");
        }
        float reliefStrength=category=="Fur"||category=="Pelt"?.82f:category=="Scale"?.86f:category=="Carrot"?.68f:category=="Leaf"?.72f:category=="Bark"?1.0f:category=="Stone"?.9f:.72f;
        material.SetTexture("_BumpMap",normal);material.SetFloat("_BumpScale",normal?reliefStrength:0f);
        material.SetTexture("_RoughnessMap",roughness);material.SetFloat("_UseRoughnessMap",roughness?1:0);
        material.SetTexture("_OcclusionMap",occlusion);material.SetFloat("_UseOcclusionMap",occlusion?1:0);material.SetFloat("_OcclusionStrength",.63f);
        if(category=="ZombieHide") {
            // The grave-green the view used to lerp in every frame (tint .46/.55/.38 at 70 %), baked as a flat sRGB
            // albedo multiplier so property-block tints (hit flash, slow) can no longer wash it out.
            material.SetTexture("_MainTex",AssetDatabase.LoadAssetAtPath<Texture2D>(Root+"/Models/Materials/ZombieHideTint.png"));
            material.SetTextureScale("_MainTex",Vector2.one);
        }
        if(category.StartsWith("Portal",StringComparison.Ordinal)) {
            // Authored palette supplies identity; generated atlas supplies pore/fibre
            // variation. Neutral detail avoids multiplying red/blue animal palettes.
            material.SetTexture("_MainTex",AssetDatabase.LoadAssetAtPath<Texture2D>(Root+"/Models/Materials/"+category+"Detail.png"));
            material.SetTextureScale("_MainTex",Vector2.one);
            material.SetTexture("_BumpMap",AssetDatabase.LoadAssetAtPath<Texture2D>(Root+"/Models/Materials/"+category+"Normal.png"));
            material.SetFloat("_BumpScale",category=="PortalPeel"?.34f:.55f);
            material.SetTexture("_RoughnessMap",AssetDatabase.LoadAssetAtPath<Texture2D>(Root+"/Models/Materials/"+category+"Roughness.png"));
            material.SetFloat("_UseRoughnessMap",1);material.SetFloat("_UseOcclusionMap",0);
            material.SetFloat("_Glossiness",category=="PortalCap"?.23f:category=="PortalPeel"?.59f:.42f);
            material.SetFloat("_Translucency",category=="PortalBamboo"?.23f:category=="PortalPeel"?.08f:0);
        }
        ApplyBlendedRealism(material,category);
        material.enableInstancing=false;EditorUtility.SetDirty(material);return material;
    }
    /// <summary>
    /// Living-miniature surface response per category (Storybook T0 properties). Values follow docs/carrot-defense/giant-update/characters.md:
    /// skin wrap capped at .35 and fur sheen at .4 so low-poly toys never turn waxy. Every category resets every property, so re-running is idempotent.
    /// </summary>
    static void ApplyBlendedRealism(Material m,string category) {
        float sss=0,sheen=0,detailStrength=0,detailScale=6;Color sssTint=Color.white,sheenTint=Color.white;string detail=null;
        switch(category) {
            case "Carrot": sss=.34f;sssTint=new Color(1f,.42f,.16f);detail="SkinPore";detailScale=5;detailStrength=.35f;break;
            case "Leaf": sss=.45f;sssTint=new Color(.62f,1f,.30f);break;
            case "Petal": sss=.40f;sssTint=new Color(1f,.78f,.80f);break;
            case "Fur": case "Pelt": sss=.20f;sssTint=new Color(1f,.70f,.55f);sheen=.40f;sheenTint=new Color(1f,.96f,.90f);detail="FurStrand";detailScale=4;detailStrength=.45f;break;
            case "Scale": sss=.22f;sssTint=new Color(1f,.55f,.55f);break;
            case "Mushroom": sss=.20f;sssTint=new Color(1f,.82f,.66f);sheen=.20f;sheenTint=new Color(1f,.95f,.88f);detail="MushroomPore";detailScale=4;detailStrength=.60f;break;
            case "Chitin": detail="ChitinPlate";detailScale=3;detailStrength=.70f;break;
            case "Gel": sss=.50f;sssTint=new Color(.62f,1f,.52f);detail="GelRipple";detailScale=2;detailStrength=.80f;break;
            case "Ice": sss=.50f;sssTint=new Color(.45f,.75f,1f);detail="IceFacet";detailScale=2;detailStrength=.75f;break;
            case "Eye": break;
            case "ZombieHide": sss=.10f;sssTint=new Color(.8f,1f,.7f);detail="SkinPore";detailScale=4;detailStrength=.40f;break;
            case "PortalCap": sheen=.20f;sheenTint=new Color(1f,.95f,.88f);break;
            case "PortalChitin": detail="ChitinPlate";detailScale=2.5f;detailStrength=.35f;break;
            case "PortalPeel": sss=.18f;sssTint=new Color(1f,.6f,.5f);break;
            case "Bark": detail="BarkGrain";detailScale=4;detailStrength=.45f;break;
            case "Organic": sss=.10f;sssTint=new Color(1f,.82f,.70f);break;
            case "Foliage": sss=.30f;sssTint=new Color(1f,.85f,.45f);sheen=.10f;sheenTint=new Color(.9f,1f,.8f);detail="LeafCluster";detailScale=2.5f;detailStrength=1.3f;break;
            case "Gourd": sss=.28f;sssTint=new Color(1f,.55f,.18f);detail="SkinPore";detailScale=3;detailStrength=.35f;break;
            case "Straw": sss=.15f;sssTint=new Color(1f,.85f,.5f);sheen=.25f;sheenTint=new Color(1f,.95f,.8f);detail="FurStrand";detailScale=2;detailStrength=.6f;break;
        }
        // Category-specific base response for the new surfaces.
        if(category=="Mushroom"){m.SetFloat("_Glossiness",.45f);m.SetFloat("_Translucency",.20f);m.SetFloat("_ReflectionStrength",.55f);}
        // Chitin stays dark: a tight highlight, little environment (bright sky reflections turned the thin legs grey).
        else if(category=="Chitin"){m.SetFloat("_Glossiness",.58f);m.SetFloat("_ReflectionStrength",.5f);m.SetFloat("_Translucency",0f);}
        else if(category=="Gel"){m.SetFloat("_Glossiness",.78f);m.SetFloat("_ReflectionStrength",1.0f);m.SetFloat("_Translucency",.35f);}
        else if(category=="Ice"){
            // Ice reads through its highlights and the blue light scattered inside, not a bright albedo: the painted ICE blue is
            // halved, the surface turns glassy and reflective, and the old grey glow becomes a faint cold core.
            m.SetFloat("_AlbedoGain",.55f);m.SetFloat("_Glossiness",.9f);m.SetFloat("_ReflectionStrength",1.4f);m.SetFloat("_Translucency",.45f);m.SetColor("_EmissionColor",new Color(.02f,.05f,.08f,1));}
        else if(category=="Eye"){m.SetFloat("_Glossiness",.93f);m.SetFloat("_ReflectionStrength",1.25f);m.SetFloat("_Translucency",0f);}
        else if(category=="ZombieHide"){m.SetFloat("_Glossiness",.30f);m.SetFloat("_Translucency",.05f);}
        else if(category=="Pelt"){m.SetFloat("_Glossiness",.16f);m.SetFloat("_Translucency",.25f);}
        else if(category=="Foliage"){m.SetFloat("_Glossiness",.26f);m.SetFloat("_Translucency",.35f);m.SetFloat("_Wind",.008f);m.SetFloat("_SnowStrength",1f);m.SetFloat("_ReflectionStrength",.5f);}
        else if(category=="Gourd"){m.SetFloat("_Glossiness",.46f);m.SetFloat("_Translucency",.10f);}
        else if(category=="Straw"){m.SetFloat("_Glossiness",.12f);m.SetFloat("_Translucency",.20f);m.SetFloat("_ReflectionStrength",.3f);}
        else if(category=="TornadoDust"){m.SetFloat("_Glossiness",.10f);m.SetFloat("_Translucency",.30f);m.SetFloat("_ReflectionStrength",.35f);sss=.25f;sssTint=new Color(.7f,.78f,.95f);}
        m.SetFloat("_Subsurface",sss);m.SetColor("_SubsurfaceTint",sssTint);m.SetFloat("_Sheen",sheen);m.SetColor("_SheenTint",sheenTint);
        Texture2D detailMap=null;
        if(detail=="BarkGrain")detailMap=AssetDatabase.LoadAssetAtPath<Texture2D>(Root+"/Textures/PBR/BarkNormal.png");
        else if(detail!=null)detailMap=AssetDatabase.LoadAssetAtPath<Texture2D>(Root+"/Models/Materials/"+detail+"Detail.png");
        m.SetTexture("_DetailNormal",detailMap);m.SetFloat("_DetailScale",detailScale);m.SetFloat("_DetailStrength",detailMap!=null?detailStrength:0f);
        m.SetFloat("_HitFlash",0);m.SetFloat("_RimBoost",0);
    }
    static void Make(string source,string destination,bool animated,bool nature=false) {
        string path=Root+(nature?"/Nature/Source/":"/Models/Source/")+source+".fbx";
        var asset=AssetDatabase.LoadAssetAtPath<GameObject>(path);
        if (!asset) throw new InvalidOperationException("Source FBX unavailable: "+path);
        var imported=UnityEngine.Object.Instantiate(asset);imported.name="Geometry";
        var instance=new GameObject(source);imported.transform.SetParent(instance.transform,false);
        foreach (Renderer r in instance.GetComponentsInChildren<Renderer>(true)) {
            var mats=r.sharedMaterials;
            bool wind=false;
            for (int i=0;i<mats.Length;i++){string name=mats[i]?mats[i].name:"Organic";if(name.StartsWith("TornadoShell",StringComparison.Ordinal)){mats[i]=WindShell(name);wind=true;}else mats[i]=Surface(ActorCategory(source,r.name,name)??name);}
            r.sharedMaterials=mats;r.shadowCastingMode=wind?ShadowCastingMode.Off:ShadowCastingMode.On;r.receiveShadows=!wind;
            if (r is SkinnedMeshRenderer skin) skin.updateWhenOffscreen=false;
        }
        if(PlusZFront.Contains(source)){var turn=Quaternion.Euler(0,180,0);imported.transform.localPosition=turn*imported.transform.localPosition;imported.transform.localRotation=turn*imported.transform.localRotation;}
        if(!animated&&!nature) NormalizeAnimationPivots(imported.transform,source=="portal"||ExpansionKinds.Any(k=>source.StartsWith(k+"-",StringComparison.Ordinal)));
        if (animated) {
            foreach (var animator in instance.GetComponentsInChildren<Animator>(true)) UnityEngine.Object.DestroyImmediate(animator);
            var animation=imported.GetComponent<Animation>();if(!animation)animation=imported.AddComponent<Animation>();
            animation.playAutomatically=false;animation.cullingType=AnimationCullingType.AlwaysAnimate;
            var clips=AssetDatabase.LoadAllAssetsAtPath(path).OfType<AnimationClip>().Where(c=>!c.name.StartsWith("__preview__")).ToArray();
            foreach(var clip in clips) animation.AddClip(clip,clip.name);
            // Deterministic default clip (the asset order of a re-import is not stable): exactly "Idle", else the first idle by name.
            var idle=clips.FirstOrDefault(c=>c.name.Equals("Idle",StringComparison.OrdinalIgnoreCase))??clips.Where(c=>c.name.ToLowerInvariant().Contains("idle")).OrderBy(c=>c.name,StringComparer.Ordinal).FirstOrDefault();
            if(idle!=null)animation.clip=idle;
            if(clips.Length==0)throw new InvalidOperationException("Skeletal clips missing: "+source);
        }
        if (source=="Carrot") foreach(var t in instance.GetComponentsInChildren<Transform>(true)) if(t.name=="MouthHurt"||t.name=="MouthHappy"||t.name=="BitePatch")t.gameObject.SetActive(false);
        if(ExpansionEnemies.Contains(source)||Minibosses.Contains(source)) AddMeasuredHealthAnchor(instance);
        if(animated){AddGait(instance,imported);AddSecondaryMotion(instance);}
        else if(source=="Carrot")AddSecondaryMotion(instance);
        if(!nature)AddTierLod(instance,source);
        var renderers=instance.GetComponentsInChildren<Renderer>(true);
        if(renderers.Length>0){var bounds=renderers[0].bounds;foreach(var renderer in renderers)bounds.Encapsulate(renderer.bounds);Debug.Log("MODEL_BOUNDS "+destination+" size="+bounds.size.ToString("F3")+" min="+bounds.min.ToString("F3")+" nativeRotation="+imported.transform.localEulerAngles.ToString("F2"));}
        PrefabUtility.SaveAsPrefabAsset(instance,Root+"/"+destination+".prefab");
        UnityEngine.Object.DestroyImmediate(instance);
    }
    /// <summary>
    /// Spring links for CarrotSecondaryMotion, chosen by bone name (docs/carrot-defense/giant-update/characters.md lists them per prefab).
    /// Appendages swing most, heads and arms a little; a creature with none of the named bones springs its Body so every rig gets a chain.
    /// At most six links per actor keep the per-frame cost flat with 110 actors on screen.
    /// </summary>
    static void AddSecondaryMotion(GameObject instance) {
        var links=new List<CarrotSecondaryMotion.Link>();
        var bones=new HashSet<Transform>();
        foreach(var skin in instance.GetComponentsInChildren<SkinnedMeshRenderer>(true))if(skin.bones!=null)foreach(var b in skin.bones)if(b!=null)bones.Add(b);
        bool rigged=bones.Count>0;
        IEnumerable<Transform> candidates=rigged?(IEnumerable<Transform>)bones:instance.GetComponentsInChildren<Transform>(true);
        void Add(Transform t,float max,float lean,byte mode=CarrotSecondaryMotion.Tilt,bool self=true){if(links.Count<6&&!links.Any(l=>l.bone==t))links.Add(new CarrotSecondaryMotion.Link{bone=t,maxDegrees=max,lean=lean,mode=mode,trackSelf=self});}
        var ordered=candidates.OrderBy(t=>Depth(t)).ThenBy(t=>t.name,StringComparer.Ordinal).ToList();
        foreach(var t in ordered){string n=t.name;
            if(n.StartsWith("Ear",StringComparison.Ordinal)||n.StartsWith("Antenna",StringComparison.Ordinal)){char digit=n.Length>3&&char.IsDigit(n[3])?n[3]:'1';Add(t,8,digit=='1'?1.6f:digit=='2'?1.0f:.7f);}
            else if(n.StartsWith("Tail",StringComparison.Ordinal))Add(t,8,1.4f);
            else if(n=="Leaves"||n.StartsWith("Leaf",StringComparison.Ordinal))Add(t,8,1.8f);}
        foreach(var t in ordered){string n=t.name;
            if(n=="Jaw")Add(t,8,1.0f,CarrotSecondaryMotion.Hinge);
            else if(n.StartsWith("Wing",StringComparison.Ordinal)&&(n.EndsWith("1.L")||n.EndsWith("1.R")||n=="WingL"||n=="WingR"))Add(t,6,1.0f);
            else if(n=="Head2")Add(t,5,.9f);else if(n=="Head3")Add(t,6,1.2f);
            else if(n=="Cap"||n=="Drum")Add(t,6,1.0f);
            else if(n=="Abdomen")Add(t,5,.8f);}
        foreach(var t in ordered){string n=t.name;
            if(n=="Head")Add(t,4,.5f,CarrotSecondaryMotion.Tilt,false);
            else if(n=="ArmL"||n=="ArmR"||n=="UpperArm.L"||n=="UpperArm.R")Add(t,5,.7f,CarrotSecondaryMotion.Tilt,false);}
        if(links.Count==0)foreach(var t in ordered)if(t.name=="Body"||t.name=="Body1"){Add(t,3,.35f);break;}
        if(links.Count==0){Debug.LogWarning("SECONDARY_MOTION none for "+instance.name);return;}
        var motion=instance.AddComponent<CarrotSecondaryMotion>();motion.links=links.ToArray();
        Debug.Log("SECONDARY_MOTION "+instance.name+" "+string.Join(",",links.Select(l=>l.bone.name+"("+l.maxDegrees+")")));
    }
    /// <summary>Tier LOD for crowd actors: High keeps full detail on light rigs and drops heavy ones (over 6k triangles) one level; Medium one level; Low two.</summary>
    static void AddTierLod(GameObject instance,string source) {
        bool crowd=Enemies.Contains(source)||ExpansionEnemies.Contains(source)||Minibosses.Contains(source);
        int levels=0;long triangles=0;
        foreach(var r in instance.GetComponentsInChildren<Renderer>(true)){Mesh m=r is SkinnedMeshRenderer sk?sk.sharedMesh:r.GetComponent<MeshFilter>()?.sharedMesh;if(m==null)continue;levels=Mathf.Max(levels,m.lodCount);for(int i=0;i<m.subMeshCount;i++)triangles+=m.GetIndexCount(i)/3;}
        if(levels<=1)return;
        var lod=instance.AddComponent<CarrotTierLod>();
        if(crowd){lod.high=!Minibosses.Contains(source)&&triangles>6000?1:0;lod.medium=Mathf.Min(1,levels-1);lod.low=Mathf.Min(2,levels-1);}
        else{lod.high=0;lod.medium=0;lod.low=1;}
        Debug.Log("TIER_LOD "+source+" levels="+levels+" triangles="+triangles+" high="+lod.high+" medium="+lod.medium+" low="+lod.low);
    }
    static int Depth(Transform t){int d=0;while(t.parent!=null){t=t.parent;d++;}return d;}
    /// <summary>
    /// Measures the locomotion clips once. Each foot (or leg) bone gets a tip point fixed in its own space (the farthest vertex skinned
    /// to it, via the bind pose), and the tip's fore-aft travel relative to the prefab root over one cycle gives the stride: a planted
    /// foot covers about 55 % of the stride while in contact, so ground speed at 1x = (travel / .55) / cycle. Legless hoppers and
    /// flyers stay unmeasured (speed 0) and keep the view's relative playback. The rest pose is restored afterwards.
    /// </summary>
    static void AddGait(GameObject instance,GameObject imported) {
        var animation=imported.GetComponent<Animation>();if(animation==null)return;
        AnimationClip walk=null,run=null,idleA=null,idleB=null;
        foreach(AnimationState st in animation){string n=st.name.ToLowerInvariant();if(walk==null&&n.Contains("walk"))walk=st.clip;if(run==null&&n.Contains("run"))run=st.clip;}
        if(walk==null)foreach(AnimationState st in animation){string n=st.name.ToLowerInvariant();if(n.Contains("fly")&&!n.Contains("idle")){walk=st.clip;break;}}
        foreach(AnimationState st in animation){string n=st.name.ToLowerInvariant();if(idleA==null&&n=="idle")idleA=st.clip;}
        if(idleA==null)foreach(AnimationState st in animation){string n=st.name.ToLowerInvariant();if(n.Contains("idle")){idleA=st.clip;break;}}
        foreach(string pick in new[]{"dance","yes","jump_idle","flying_idle","duck","no"})foreach(AnimationState st in animation){if(idleB==null&&st.name.ToLowerInvariant()==pick&&st.clip!=idleA)idleB=st.clip;}
        var gait=instance.AddComponent<CarrotGait>();gait.idleA=idleA!=null?idleA.name:"";gait.idleB=idleB!=null?idleB.name:"";
        if(walk==null)return;
        gait.walkClip=walk.name;gait.walkCycle=walk.length;
        // Tip points per candidate bone, from the bind pose of every skin that uses it.
        var tips=new Dictionary<Transform,Vector3>();
        foreach(var skin in imported.GetComponentsInChildren<SkinnedMeshRenderer>(true)){
            var mesh=skin.sharedMesh;if(mesh==null||skin.bones==null)continue;var bones=skin.bones;var bind=mesh.bindposes;var vertices=mesh.vertices;var weights=mesh.boneWeights;if(weights.Length!=vertices.Length)continue;
            for(int b=0;b<bones.Length;b++){var bone=bones[b];if(bone==null)continue;string n=bone.name;
                bool foot=(n.Contains("Foot")||n.StartsWith("Leg",StringComparison.Ordinal))&&!n.Contains("Target")&&!n.Contains("Pole");if(!foot)continue;
                Vector3 best=Vector3.zero;float far=-1;
                for(int i=0;i<vertices.Length;i++){var w=weights[i];float wb=w.boneIndex0==b?w.weight0:w.boneIndex1==b?w.weight1:w.boneIndex2==b?w.weight2:w.boneIndex3==b?w.weight3:0;if(wb<.4f)continue;var local=bind[b].MultiplyPoint3x4(vertices[i]);float d=local.sqrMagnitude;if(d>far){far=d;best=local;}}
                if(far>=0&&(!tips.TryGetValue(bone,out var old)||best.sqrMagnitude>old.sqrMagnitude))tips[bone]=best;}
        }
        var transforms=imported.GetComponentsInChildren<Transform>(true);var rest=transforms.Select(t=>(t,t.localPosition,t.localRotation,t.localScale)).ToArray();
        float Stride(AnimationClip clip,out string boneName){
            boneName="";if(clip==null||tips.Count==0)return 0;var root=instance.transform;var lo=new Dictionary<Transform,float>();var hi=new Dictionary<Transform,float>();
            for(int s=0;s<=32;s++){clip.SampleAnimation(imported,clip.length*s/32f);foreach(var pair in tips){float z=root.InverseTransformPoint(pair.Key.TransformPoint(pair.Value)).z;lo[pair.Key]=lo.TryGetValue(pair.Key,out var a)?Mathf.Min(a,z):z;hi[pair.Key]=hi.TryGetValue(pair.Key,out var b)?Mathf.Max(b,z):z;}}
            float travel=0;foreach(var pair in tips){float r=hi[pair.Key]-lo[pair.Key];if(r>travel){travel=r;boneName=pair.Key.name;}}
            foreach(var r in rest){r.t.localPosition=r.Item2;r.t.localRotation=r.Item3;r.t.localScale=r.Item4;}
            return travel>.02f?travel/.55f:0;
        }
        bool flight=walk.name.ToLowerInvariant().Contains("fly");
        string walkBone="",runBone;float walkStride=flight?0:Stride(walk,out walkBone),runStride=flight||run==null?0:Stride(run,out runBone);
        gait.walkSpeed=walkStride>0?walkStride/walk.length:0;gait.runSpeed=runStride>0&&run!=null?runStride/run.length:0;gait.strideBone=walkStride>0?walkBone:"";
        Debug.Log("GAIT "+instance.name+" walk="+walk.name+"/"+walk.length.ToString("F2")+" stride="+walkStride.ToString("F3")+" speed="+gait.walkSpeed.ToString("F3")+" run="+(run!=null?run.name:"-")+" runSpeed="+gait.runSpeed.ToString("F3")+" bone="+gait.strideBone+" idle="+gait.idleA+"/"+gait.idleB);
    }
    public static void RebuildExpansionStatic() {
        foreach(string kind in ExpansionKinds)for(int tier=1;tier<=5;tier++)Make(kind+"-"+tier,"Models/Towers/"+kind+"-"+tier,false);
        Make("portal","Models/Bosses/portal",false);AssetDatabase.SaveAssets();
    }
    public static void RebuildExpansionMetricsAndAudio() {
        foreach(string kind in ExpansionEnemies)Make(kind,"Models/Enemies/"+kind,true);
        foreach(string kind in Minibosses)Make(kind,"Models/Minibosses/"+kind,true);
        ConfigureAudio();AssetDatabase.SaveAssets();
    }
    static void AddMeasuredHealthAnchor(GameObject instance) {
        // These native rigs render correctly, but Unity's imported skinned
        // culling AABB retains a 100x FBX scale. Measure the visible weighted
        // vertices for UI metadata without changing skinning or culling.
        float top=float.NegativeInfinity;var inverse=instance.transform.worldToLocalMatrix;
        foreach(var skin in instance.GetComponentsInChildren<SkinnedMeshRenderer>(true)) {
            var mesh=skin.sharedMesh;var vertices=mesh.vertices;var weights=mesh.boneWeights;var bind=mesh.bindposes;var bones=skin.bones;
            var matrices=new Matrix4x4[bones.Length];for(int i=0;i<bones.Length;i++)matrices[i]=inverse*bones[i].localToWorldMatrix*bind[i];
            for(int i=0;i<vertices.Length;i++) {
                var w=weights[i];var v=vertices[i];Vector3 p=Vector3.zero;
                if(w.weight0>0)p+=matrices[w.boneIndex0].MultiplyPoint3x4(v)*w.weight0;
                if(w.weight1>0)p+=matrices[w.boneIndex1].MultiplyPoint3x4(v)*w.weight1;
                if(w.weight2>0)p+=matrices[w.boneIndex2].MultiplyPoint3x4(v)*w.weight2;
                if(w.weight3>0)p+=matrices[w.boneIndex3].MultiplyPoint3x4(v)*w.weight3;
                top=Mathf.Max(top,p.y);
            }
        }
        if(top<.1f||top>3f||float.IsInfinity(top)||float.IsNaN(top))throw new InvalidOperationException("Invalid measured model height: "+instance.name+"="+top);
        instance.AddComponent<CarrotModelMetrics>().healthAnchor=new Vector3(0,top,0);
    }
    static void NormalizeAnimationPivots(Transform imported,bool unitParentSpace=false) {
        // FBX may contain an explicit artist root rotation even after axis import.
        // Preserve the artwork exactly, but expose predictable Unity-space pivots
        // to the runtime animation layer. Creature bones are deliberately excluded.
        string[] names={"Turret","Core","Barrel","Petals","Pages","Leaves","EyeL","EyeR","ArmL","ArmR","BrowL","BrowR","Muzzle","Ring01","Ring02","Ring03","Bell01","Bell02","Bell03","Bell04","Bell05","FunnelTier0","FunnelTier1","FunnelTier2","FunnelTier3","FunnelTier4","DebrisRing0","DebrisRing1","DebrisRing2","UpperLid","LowerLid","Pupil","Iris","Tentacle0","Tentacle1","Tentacle2","Tentacle3","Tentacle4","Tentacle5","Spears","Pods","Stamen","Coils","Cap","Spines","ClockHands","Orbits","Pendulum","Clover","Eyeball","Claw0","Claw1","Claw2","Claw3"};
        var parts=imported.GetComponentsInChildren<Transform>(true).Where(t=>names.Contains(t.name)).ToArray();
        var normalized=new Dictionary<Transform,Transform>();
        foreach(var part in parts) {
            string name=part.name;var parent=part.parent;int index=part.GetSiblingIndex();
            if(unitParentSpace) {
                // Native FBX Geometry nodes carry a 100x scale. An inverse-scaled
                // wrapper fixes size, but its localPosition still moves in that
                // 100x parent space. Keep motion nodes on unit-scale parents.
                parent=imported.parent;
                for(var ancestor=part.parent;ancestor!=null;ancestor=ancestor.parent)
                    if(normalized.TryGetValue(ancestor,out var motionParent)){parent=motionParent;break;}
            }
            var pivot=new GameObject(name).transform;
            pivot.SetParent(parent,false);pivot.position=part.position;pivot.rotation=Quaternion.identity;
            var lossy=parent?parent.lossyScale:Vector3.one;
            pivot.localScale=new Vector3(1/Mathf.Max(.000001f,Mathf.Abs(lossy.x)),1/Mathf.Max(.000001f,Mathf.Abs(lossy.y)),1/Mathf.Max(.000001f,Mathf.Abs(lossy.z)));
            pivot.SetSiblingIndex(index);part.name=name+"Geometry";part.SetParent(pivot,true);
            normalized[part]=pivot;
            if(unitParentSpace&&(pivot.parent.lossyScale-Vector3.one).sqrMagnitude>.000001f)
                throw new InvalidOperationException("Non-unit motion parent: "+imported.parent.name+"/"+name);
        }
    }
    static void ConfigureAudio() {
        foreach(string file in Directory.GetFiles(Root+"/Audio")) {
            var importer=AssetImporter.GetAtPath(file.Replace('\\','/')) as AudioImporter;
            if(importer==null)continue;
            string name=Path.GetFileName(file);bool music=name.StartsWith("Music"),voice=name.StartsWith("Voice")||name.StartsWith("EVoice");
            importer.forceToMono=!music;importer.loadInBackground=music;
            var settings=importer.defaultSampleSettings;
            settings.loadType=music?AudioClipLoadType.CompressedInMemory:AudioClipLoadType.DecompressOnLoad;
            settings.preloadAudioData=!music;
            settings.compressionFormat=AudioCompressionFormat.Vorbis;
            settings.quality=music?.5f:voice?.5f:.65f;
            settings.sampleRateSetting=voice?AudioSampleRateSetting.OverrideSampleRate:AudioSampleRateSetting.OptimizeSampleRate;
            settings.sampleRateOverride=voice?32000u:44100u;
            importer.defaultSampleSettings=settings;importer.SaveAndReimport();
        }
    }
}
}
