// Unity -> page net events (CarrotNetBridge.cs): one call per frame with a JSON array, dispatched in order as
// window 'carrot-net' CustomEvents (detail = one message). Handlers must never call back into Unity synchronously
// (queue it, e.g. with queueMicrotask); a synchronous reply is deferred by the bridge and counted as a re-entry.
mergeInto(LibraryManager.library, {
 CarrotNetOut: function(pointer) {
  var list;
  try { list = JSON.parse(UTF8ToString(pointer)); }
  catch (error) { console.warn('Carrot net messages unreadable', error); return; }
  for (var i = 0; i < list.length; i++) {
   try { window.dispatchEvent(new CustomEvent('carrot-net', { detail: list[i] })); }
   catch (error) { console.warn('Carrot net handler failed', error); }
  }
 }
});
