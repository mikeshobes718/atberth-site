(function () {
  var root = document.documentElement;
  var toggle = document.querySelector("[data-theme-toggle]");
  var meta = document.querySelectorAll('meta[name="theme-color"]');
  var mq = window.matchMedia("(prefers-color-scheme: light)");
  var KEY = "berth-theme";

  function saved() {
    try {
      var t = localStorage.getItem(KEY);
      return t === "light" || t === "dark" ? t : null;
    } catch (e) { return null; }
  }

  function system() { return mq.matches ? "light" : "dark"; }

  function apply(theme) {
    root.setAttribute("data-theme", theme);
    var next = theme === "dark" ? "light" : "dark";
    if (toggle) toggle.setAttribute("aria-label", "Switch to " + next + " theme");
    var color = theme === "dark" ? "#08090b" : "#f6f6f3";
    meta.forEach(function (m) { m.setAttribute("content", color); });
  }

  apply(saved() || system());

  function follow() { if (!saved()) apply(system()); }
  if (mq.addEventListener) mq.addEventListener("change", follow);
  else if (mq.addListener) mq.addListener(follow);
  window.addEventListener("storage", function (e) {
    if (e.key === KEY) apply(saved() || system());
  });

  if (toggle) {
    toggle.addEventListener("click", function () {
      var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
      apply(next);
      try { localStorage.setItem(KEY, next); } catch (e) {}
    });
  }

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var items = document.querySelectorAll(".reveal");
  if (reduce || !("IntersectionObserver" in window)) {
    items.forEach(function (el) { el.classList.add("in"); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add("in");
          io.unobserve(e.target);
        }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    items.forEach(function (el) { io.observe(el); });
    setTimeout(function () {
      items.forEach(function (el) { el.classList.add("in"); });
      io.disconnect();
    }, 2500);
  }

  document.querySelectorAll(".doc pre.code").forEach(function (pre) {
    var box = document.createElement("div");
    box.className = "cb";
    var head = document.createElement("div");
    head.className = "cb-head";
    var label = document.createElement("span");
    label.textContent = pre.getAttribute("data-lang") || "shell";
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "copy";
    btn.textContent = "Copy";
    btn.addEventListener("click", function () {
      var text = pre.innerText.replace(/\n$/, "");
      var done = function () {
        btn.textContent = "Copied";
        setTimeout(function () { btn.textContent = "Copy"; }, 1400);
      };
      if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, function () {});
    });
    head.appendChild(label);
    head.appendChild(btn);
    pre.parentNode.insertBefore(box, pre);
    box.appendChild(head);
    box.appendChild(pre);
  });

  var current = document.querySelector('.doc-side a[aria-current="page"]');
  if (current && window.matchMedia("(max-width: 900px)").matches) {
    var side = current.parentNode;
    side.scrollLeft = current.offsetLeft - 24;
  }

  var tocLinks = Array.prototype.slice.call(document.querySelectorAll(".doc-toc a"));
  var heads = tocLinks.map(function (a) {
    return { a: a, el: document.getElementById((a.getAttribute("href") || "").slice(1)) };
  }).filter(function (h) { return h.el; });
  if (heads.length) {
    var mark = function () {
      var y = window.scrollY + 120;
      var on = heads[0];
      heads.forEach(function (h) { if (h.el.offsetTop <= y) on = h; });
      heads.forEach(function (h) { h.a.classList.toggle("active", h === on); });
    };
    mark();
    window.addEventListener("scroll", mark, { passive: true });
  }

  if (!reduce && window.matchMedia("(hover: hover)").matches) {
    document.querySelectorAll(".card").forEach(function (card) {
      card.addEventListener("pointermove", function (e) {
        var r = card.getBoundingClientRect();
        card.style.setProperty("--mx", e.clientX - r.left + "px");
        card.style.setProperty("--my", e.clientY - r.top + "px");
      });
    });
  }

  // The console keeps its session on this origin. When one is live, the
  // header should say where you are going, not ask you to sign in again.
  (function () {
    // Same order as the console: a key kept only for this tab wins, then a remembered one.
    var s = null;
    [function () { return sessionStorage; }, function () { return localStorage; }].some(function (store) {
      try { s = JSON.parse(store().getItem("berth-console-session") || "null"); } catch (e) { s = null; }
      return !!(s && s.token);
    });
    if (!s || !s.token) return;
    if (s.expires_at && Date.parse(s.expires_at) < Date.now()) return;
    document.querySelectorAll('a[href="/app/"]').forEach(function (a) {
      if (a.textContent.trim() === "Sign in") a.textContent = "Open console";
    });
  })();
})();
