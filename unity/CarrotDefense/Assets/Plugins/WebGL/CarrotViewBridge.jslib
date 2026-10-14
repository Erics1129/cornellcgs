mergeInto(LibraryManager.library, {
  Carrot_CanvasCSSWidth: function () {
    return Module.canvas ? Module.canvas.getBoundingClientRect().width : window.innerWidth;
  },
  // Safari and every iOS browser are WebKit: navigator.vendor is "Apple Computer, Inc." there and "Google Inc." in Chrome on a Mac.
  // The page samples requestAnimationFrame while the loader downloads (nothing heavy running): the display's own period in ms, 0 if unknown.
  Carrot_DisplayPeriodMs: function () {
    try { return Number(window.__carrotDisplayPeriod) || 0; } catch (e) { return 0; }
  },
  Carrot_IsWebKit: function () {
    try { return (navigator.vendor || '').indexOf('Apple') >= 0 ? 1 : 0; } catch (e) { return 0; }
  }
});
