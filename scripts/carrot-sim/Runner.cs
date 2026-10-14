// Entry point of the standalone Carrot simulation: runs a CarrotSimulationTests entry on Unity's bundled .NET.
//   carrot-sim quick | run | tune | <AnyStaticMethodName> [args...]
// A method taking string[] receives the remaining arguments. Exit code 1 and CARROT_STANDALONE_FAIL on any exception.
using System;
using System.Reflection;
using CarrotTD;

static class CarrotSimRunner {
 static int Main(string[] args){
  string mode=args.Length>0?args[0]:"quick";
  var rest=args.Length>1?args[1..]:new string[0];
  var started=DateTime.UtcNow;
  try{
   string name=mode=="quick"?"Quick":mode=="run"?"Run":mode=="tune"?"Tune":mode;
   var m=typeof(CarrotSimulationTests).GetMethod(name,BindingFlags.Public|BindingFlags.NonPublic|BindingFlags.Static|BindingFlags.IgnoreCase);
   if(m==null){Console.WriteLine("CARROT_STANDALONE_FAIL no CarrotSimulationTests."+name);return 2;}
   var ps=m.GetParameters();
   m.Invoke(null,ps.Length==1&&ps[0].ParameterType==typeof(string[])?new object[]{rest}:ps.Length==0?null:throw new ArgumentException(name+" takes unsupported parameters"));
   Console.WriteLine("CARROT_STANDALONE_DONE "+name+" in "+(DateTime.UtcNow-started).TotalSeconds.ToString("F1",System.Globalization.CultureInfo.InvariantCulture)+" s");
   return 0;
  }catch(Exception e){
   var inner=e is TargetInvocationException t&&t.InnerException!=null?t.InnerException:e;
   Console.WriteLine("CARROT_STANDALONE_FAIL "+inner.Message);Console.WriteLine(inner.StackTrace);return 1;
  }
 }
}
