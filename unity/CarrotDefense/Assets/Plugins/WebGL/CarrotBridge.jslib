mergeInto(LibraryManager.library, {
 CarrotSend: function(pointer) {
  try { window.dispatchEvent(new CustomEvent('carrot-state', { detail: JSON.parse(UTF8ToString(pointer)) })); }
  catch(error) { console.warn('Carrot state unavailable', error); }
 }
});
