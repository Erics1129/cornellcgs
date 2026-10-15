mergeInto(LibraryManager.library, {
  Carrot_CanvasCSSWidth: function () {
    return Module.canvas ? Module.canvas.getBoundingClientRect().width : window.innerWidth;
  },
  // Safari and every iOS browser are WebKit: navigator.vendor is "Apple Computer, Inc." there and "Google Inc." in Chrome on a Mac.
  // The page samples requestAnimationFrame while the loader downloads (nothing heavy running): the display's own period in ms, 0 if unknown.
  Carrot_DisplayPeriodMs: function () {
    try { return Number(window.__carrotDisplayPeriod) || 0; } catch (e) { return 0; }
  },
  // Pinch zoom belongs to the game: no browser pinch, gesture or double-tap zoom on the canvas (iOS Safari fires gesturestart even with
  // touch-action:none). Idempotent; the page's own CSS keeps touch-action:none too.
  Carrot_SetupCanvasGestures: function () {
    try {
      var canvas = Module.canvas; if (!canvas || canvas.__carrotGestures) return; canvas.__carrotGestures = true;
      canvas.style.touchAction = 'none';
      var stop = function (e) { e.preventDefault(); };
      ['gesturestart', 'gesturechange', 'gestureend'].forEach(function (n) { canvas.addEventListener(n, stop, { passive: false }); });
      canvas.addEventListener('dblclick', stop, { passive: false });
    } catch (e) {}
  },
  Carrot_IsWebKit: function () {
    try { return (navigator.vendor || '').indexOf('Apple') >= 0 ? 1 : 0; } catch (e) { return 0; }
  }
});
