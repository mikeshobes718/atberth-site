(function () {
  var d = document.documentElement, t;
  try { t = localStorage.getItem("berth-theme"); } catch (e) {}
  if (t !== "light" && t !== "dark") t = window.matchMedia && matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  d.setAttribute("data-theme", t);
})();
