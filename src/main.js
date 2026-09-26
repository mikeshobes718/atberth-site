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

// Phone menu: the header links are hidden under 900px, so give them a menu button.
(function () {
  var header = document.querySelector("header.nav");
  var links = header && header.querySelector(".nav-links");
  var actions = header && header.querySelector(".nav-actions");
  if (!header || !links || !actions) return;
  var btn = document.createElement("button");
  btn.type = "button";
  btn.className = "nav-menu";
  btn.setAttribute("aria-label", "Open menu");
  btn.setAttribute("aria-expanded", "false");
  btn.setAttribute("aria-controls", "nav-panel");
  btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="l1" d="M4 7h16"/><path class="l2" d="M4 12h16"/><path class="l3" d="M4 17h16"/></svg>';
  actions.appendChild(btn);
  var panel = document.createElement("nav");
  panel.id = "nav-panel";
  panel.className = "nav-panel";
  panel.setAttribute("aria-label", "Menu");
  var list = document.createElement("div");
  list.className = "nav-panel-links";
  links.querySelectorAll("a").forEach(function (a) { list.appendChild(a.cloneNode(true)); });
  panel.appendChild(list);
  var foot = document.createElement("div");
  foot.className = "nav-panel-actions";
  var signin = actions.querySelector(".nav-signin");
  var cta = actions.querySelector(".btn");
  if (signin) { var s1 = signin.cloneNode(true); s1.className = "btn btn-ghost"; foot.appendChild(s1); }
  if (cta) { var c1 = cta.cloneNode(true); c1.className = "btn btn-light"; foot.appendChild(c1); }
  panel.appendChild(foot);
  header.appendChild(panel);
  function set(open) {
    header.classList.toggle("menu-open", open);
    btn.setAttribute("aria-expanded", String(open));
    btn.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  }
  btn.addEventListener("click", function () { set(!header.classList.contains("menu-open")); });
  panel.addEventListener("click", function (e) { if (e.target.closest("a")) set(false); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") set(false); });
  document.addEventListener("click", function (e) { if (!header.contains(e.target)) set(false); });
  window.addEventListener("resize", function () { if (window.innerWidth > 900) set(false); });
  // Keep "Sign in" / "Open console" in the panel in step with the header.
  if (signin && window.MutationObserver) {
    new MutationObserver(function () {
      var mine = foot.querySelector("a");
      if (mine && signin) { mine.textContent = signin.textContent; mine.href = signin.href; }
    }).observe(signin, { childList: true, characterData: true, subtree: true, attributes: true });
  }
})();

// Jump button: only on long pages, only while scrolling, pointing the way you're going.
(function () {
  var btn = document.createElement("button");
  btn.type = "button";
  btn.className = "jump";
  btn.setAttribute("aria-label", "Back to top");
  btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6"/></svg>';
  document.body.appendChild(btn);
  var lastY = window.scrollY, dir = "up", timer = 0, hover = false;
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  function hide() { if (!hover) btn.classList.remove("show"); }
  function update() {
    var y = window.scrollY, vh = window.innerHeight;
    var total = document.documentElement.scrollHeight;
    var toBottom = total - (y + vh);
    if (Math.abs(y - lastY) < 4) return;
    dir = y > lastY ? "down" : "up";
    lastY = y;
    var longPage = total > vh * 2.5;
    var want = longPage && (dir === "down" ? (y > vh * 0.5 && toBottom > vh * 1.2) : y > vh * 1.2);
    if (btn.classList.contains("down") !== (dir === "down")) {
      btn.querySelector("path").setAttribute("d", dir === "down" ? "M12 5v14M6 13l6 6 6-6" : "M12 19V5M6 11l6-6 6 6");
    }
    btn.classList.toggle("down", dir === "down");
    btn.setAttribute("aria-label", dir === "down" ? "Jump to bottom" : "Back to top");
    btn.classList.toggle("show", want);
    clearTimeout(timer);
    if (want) timer = setTimeout(hide, 2200);
  }
  window.addEventListener("scroll", update, { passive: true });
  btn.addEventListener("mouseenter", function () { hover = true; clearTimeout(timer); });
  btn.addEventListener("mouseleave", function () { hover = false; timer = setTimeout(hide, 1200); });
  btn.addEventListener("focus", function () { btn.classList.add("show"); clearTimeout(timer); });
  btn.addEventListener("click", function () {
    var down = btn.classList.contains("down");
    window.scrollTo({ top: down ? document.documentElement.scrollHeight : 0, behavior: reduce ? "auto" : "smooth" });
    btn.classList.remove("show");
    btn.blur();
  });
})();
