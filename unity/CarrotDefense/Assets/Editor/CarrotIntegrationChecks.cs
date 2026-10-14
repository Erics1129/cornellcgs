#if UNITY_EDITOR
using UnityEngine;

namespace CarrotTD {
 /// <summary>Offline integration entrypoints for the five acquired Asset Store packages.</summary>
 public static class CarrotIntegrationChecks {
  public static void InventoryStagedSources() {
   CarrotAsunaAssets.InventorySource();
   CarrotLicensedFxImporter.AuditSource();
   Debug.Log("CARROT_LICENSED_SOURCE_INVENTORY_OK");
  }
  public static void PrepareLicensedAssets() {
   CarrotAsunaAssets.Prepare();
   CarrotLicensedFxImporter.Prepare();
   Debug.Log("CARROT_LICENSED_ASSETS_PREPARED");
  }
  public static void PrepareAndVerify() {
   PrepareLicensedAssets();
   VerifyPreparedAssets();
  }
  public static void VerifyPreparedAssets() {
   CarrotAsunaAssets.RequirePrepared();
   CarrotLicensedFxImporter.RequirePrepared();
   CarrotAsunaPreview.RenderPortrait();
   CarrotSimulationTests.Run();
  }
  public static void ExportPortraitAndBuildQa() {
   CarrotAsunaPoseExport.Export();
   CarrotBuild.WebQa();
  }
 }
}
#endif
