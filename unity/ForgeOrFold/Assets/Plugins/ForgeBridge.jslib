mergeInto(LibraryManager.library, {
  ForgeSend: function (message) {
    var payload = JSON.parse(UTF8ToString(message));
    if (Module.canvas) Module.canvas.dispatchEvent(new CustomEvent('forge-unity', { detail: payload }));
  }
});
