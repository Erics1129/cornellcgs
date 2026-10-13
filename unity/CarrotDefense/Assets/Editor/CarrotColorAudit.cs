using System;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEngine;

namespace CarrotTD {
/// <summary>Read-only check of the color values actually retained by Unity's FBX importer.</summary>
public static class CarrotColorAudit {
    [Serializable] public class Report { public string colorSpace; public Model[] models; }
    [Serializable] public class Model { public string path; public MeshSample[] meshes; }
    [Serializable] public class MeshSample { public string name; public int vertices; public int colors; public Palette[] palette; }
    [Serializable] public class Palette { public string rgba; public int vertices; }
    public static void Run() {
        var report=new Report {
            colorSpace=PlayerSettings.colorSpace.ToString(),
            models=new[]{"nibble","shell"}.Select(kind=>{
                string path="Assets/Resources/Carrot/Models/Source/"+kind+".fbx";
                return new Model {
                    path=path,
                    meshes=AssetDatabase.LoadAllAssetsAtPath(path).OfType<Mesh>().Select(mesh=>{
                        var colors=mesh.colors32;
                        return new MeshSample {
                            name=mesh.name, vertices=mesh.vertexCount, colors=colors.Length,
                            palette=colors.GroupBy(c=>c.r+","+c.g+","+c.b+","+c.a)
                                .OrderByDescending(g=>g.Count()).Take(24)
                                .Select(g=>new Palette{rgba=g.Key,vertices=g.Count()}).ToArray()
                        };
                    }).ToArray()
                };
            }).ToArray()
        };
        string json=JsonUtility.ToJson(report,true);
        File.WriteAllText("/tmp/carrot-unity-vertex-colors.json",json);
        Debug.Log("CARROT_VERTEX_COLOR_AUDIT "+json);
    }
}
}
