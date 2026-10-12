mergeInto(LibraryManager.library, {
  Carrot_CanvasCSSWidth: function () {
    return Module.canvas ? Module.canvas.getBoundingClientRect().width : window.innerWidth;
  }
});
