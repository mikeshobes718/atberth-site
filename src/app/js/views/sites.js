import { api, get, post, patch, del, enc } from "../api.js";
import { h, mount, icon, toast, toastError, modal, closeOverlays, confirmDanger, field, input, empty, errorBox, loading, badge, timeEl, fmtNum, fmtBytes, busy, toggle, copyBtn, codeBlock, areaChart, seg } from "../ui.js";
import { replace, appPath } from "../state.js";

const SITE_DOMAIN = "atberth.com";
const NAME_RE = /^[a-z0-9](?:[a-z0-9-]{0,40}[a-z0-9])?$/;

async function sha256(buf) {
  const d = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Walk dropped folders. Returns [{path, file}].
async function filesFromDrop(items) {
  const out = [];
  const readEntries = (reader) => new Promise((res, rej) => reader.readEntries(res, rej));
  const fileOf = (entry) => new Promise((res, rej) => entry.file(res, rej));
  async function walk(entry, prefix) {
    if (entry.isFile) out.push({ path: prefix + entry.name, file: await fileOf(entry) });
    else if (entry.isDirectory) {
      const reader = entry.createReader();
      let batch;
      do {
        batch = await readEntries(reader);
        for (const e of batch) await walk(e, prefix + entry.name + "/");
      } while (batch.length);
    }
  }
  for (const it of items) {
    const entry = it.webkitGetAsEntry && it.webkitGetAsEntry();
    if (entry) await walk(entry, "");
  }
  return out;
}

function cleanFiles(list) {
  let files = list.filter(({ path }) => {
    const parts = path.split("/");
    return !parts.some((p) => (p.startsWith(".") && p !== ".well-known") || p === "node_modules");
  });
  const tops = new Set(files.map((f) => f.path.split("/")[0]));
  if (tops.size === 1 && files.every((f) => f.path.includes("/"))) {
    const top = [...tops][0] + "/";
    files = files.map((f) => ({ ...f, path: f.path.slice(top.length) }));
  }
  return files;
}

export default async function sites(ctx) {
  const { slug } = ctx;
  const base = "/apps/" + enc(slug) + "/sites";
  const page = h("div.page");
  ctx.root.append(page);
  const current = ctx.rest[0] ? decodeURIComponent(ctx.rest[0]) : null;
  if (current) return siteDetail(current);

  const list = h("div");
  mount(
    page,
    h(
      "div.ph",
      h("div", h("h1", "Sites"), h("p", "Host static sites and front ends at name." + SITE_DOMAIN + " or your own domain, with HTTPS, previews, rollbacks and stats.")),
      h("div.ph-actions", h("a.btn", { href: "/docs/sites/", target: "_blank", rel: "noopener" }, icon("book"), "Docs"), h("button.btn.primary", { type: "button", onclick: () => newSite() }, icon("plus"), "New site"))
    ),
    list
  );

  async function load() {
    mount(list, loading());
    let rows;
    try {
      rows = (await get(base)).sites || [];
    } catch (e) {
      mount(list, errorBox(e, load));
      return;
    }
    if (!rows.length) {
      mount(
        list,
        h(
          "div.card",
          empty({
            icon: "globe",
            title: "No sites yet",
            text: "Deploy any static build: plain HTML, Vite, React, Astro, SvelteKit or Next.js static export. Each site gets HTTPS, preview links and instant rollbacks.",
            actions: [h("button.btn.primary", { type: "button", onclick: () => newSite() }, icon("plus"), "New site")],
          })
        ),
        h("div.card", { style: { marginTop: "16px" } }, h("div.card-h", h("div", h("h2", "Or deploy from your terminal"), h("div.sub", "The site is created on the first deploy."))), h("div.card-b", codeBlock(`berth sites deploy ./dist --app ${slug} --site my-site`)))
      );
      return;
    }
    mount(
      list,
      h(
        "div.grid.g2",
        rows.map((s) =>
          h(
            "a.card.card-b.click",
            { href: "#" + appPath(slug, "sites", s.name), style: { display: "block" } },
            h("div.row", { style: { gap: "10px" } }, h("span.avatar", icon("globe", "i-sm")), h("div", { style: { minWidth: 0, flex: "1" } }, h("div.strong", s.name), h("div.small.dim.trunc", (s.domains.find((d) => d.primary && d.verified) || {}).domain || s.name + "." + SITE_DOMAIN)), s.current_deploy ? badge("live", "ok") : badge("no deploy", "warn")),
            h("div.row.small.dim", { style: { marginTop: "12px", gap: "14px", flexWrap: "wrap" } }, s.current_deploy ? h("span", "Deployed ", timeEl(s.current_deploy.ready_at)) : h("span", "Nothing deployed yet"), h("span", s.domains.length + " custom domain" + (s.domains.length === 1 ? "" : "s")), s.password_protected ? h("span", icon("lock", "i-sm"), " password") : null)
          )
        )
      )
    );
  }

  function newSite() {
    const name = input({ placeholder: "my-site", autofocus: true });
    const hint = h("div.hint", "Becomes my-site." + SITE_DOMAIN + ". Letters, numbers and hyphens.");
    name.addEventListener("input", () => (hint.textContent = "Becomes " + (name.value.trim().toLowerCase() || "my-site") + "." + SITE_DOMAIN + ". Letters, numbers and hyphens."));
    modal({
      title: "New site",
      body: h("form", { id: "modal-form", onsubmit: (e) => e.preventDefault() }, h("div.field", h("label", "Name"), name, hint)),
      actions: [
        { label: "Cancel" },
        {
          label: "Create site",
          kind: "primary",
          submit: true,
          onClick: async () => {
            const v = name.value.trim().toLowerCase();
            if (!NAME_RE.test(v) || v.includes("--")) {
              toast("Use 1 to 42 letters, numbers or single hyphens.", { bad: true });
              return true;
            }
            await post(base, { name: v });
            setTimeout(() => (location.hash = appPath(slug, "sites", v)), 0);
          },
        },
      ],
    });
  }

  await load();

  async function siteDetail(name) {
    const sbase = base + "/" + enc(name);
    let site;
    mount(page, loading());
    try {
      site = (await get(sbase)).site;
    } catch (e) {
      mount(page, errorBox(e, () => siteDetail(name)));
      return;
    }
    if (!ctx.alive()) return;
    let tab = ctx.query.tab || "deploys";
    const body = h("div");
    const tabs = h("div.tabs");
    const liveUrl = (site.domains.find((d) => d.primary && d.verified) || {}).url || site.url;
    mount(
      page,
      h(
        "div.ph",
        h("div", h("div.small", h("a.link", { href: "#" + appPath(slug, "sites") }, "Sites"), " / "), h("h1", site.name), h("p", h("a.link", { href: liveUrl, target: "_blank", rel: "noopener" }, liveUrl.replace("https://", "")), " ", copyBtn(liveUrl))),
        h("div.ph-actions", h("a.btn", { href: liveUrl, target: "_blank", rel: "noopener" }, icon("ext"), "Visit"), h("button.btn.primary", { type: "button", onclick: () => deployDialog(false) }, icon("upload"), "Deploy"))
      ),
      tabs,
      body
    );
    const TABS = [["deploys", "Deploys"], ["domains", "Domains"], ["stats", "Stats"], ["settings", "Settings"]];
    const drawTabs = () => mount(tabs, TABS.map(([k, l]) => h("button" + (k === tab ? ".on" : ""), { type: "button", onclick: () => { tab = k; replace(appPath(slug, "sites", name) + "?tab=" + k); drawTabs(); draw(); } }, l)));
    const draw = () => ({ deploys, domains, stats, settings })[tab]();
    drawTabs();
    draw();

    async function refreshSite() {
      site = (await get(sbase)).site;
    }

    // ---------------------------------------------------------------- deploys
    async function deploys() {
      mount(body, loading());
      let rows;
      try {
        rows = (await get(sbase + "/deploys?limit=50")).deploys || [];
      } catch (e) {
        return mount(body, errorBox(e, deploys));
      }
      if (!rows.length) {
        return mount(
          body,
          h("div.card", dropZone(false)),
          h("div.card", { style: { marginTop: "16px" } }, h("div.card-h", h("h2", "Deploy from your terminal or CI")), h("div.card-b", codeBlock(`berth sites deploy ./dist --app ${slug} --site ${name}`)))
        );
      }
      mount(
        body,
        h(
          "div.card",
          h("div.card-h", h("div", h("h2", "Deploys"), h("div.sub", "Every deploy has its own link. Promote any of them to make it live, or roll back in one click.")), h("button.btn.sm", { type: "button", onclick: () => deployDialog(true) }, icon("eye"), "Preview deploy")),
          h(
            "div.tbl-wrap",
            h(
              "table.tbl",
              h("thead", h("tr", h("th", "Deploy"), h("th", "Status"), h("th", "Files"), h("th", "Created"), h("th.actions", ""))),
              h(
                "tbody",
                rows.map((d) => {
                  const status = d.current ? badge("live", "ok") : d.status === "ready" ? badge(d.preview ? "preview" : "ready", d.preview ? "info" : "") : d.status === "failed" ? badge("failed", "bad") : badge(d.status, "warn");
                  const actions = h("div.row", { style: { gap: "6px", justifyContent: "flex-end" } });
                  if (d.status === "ready") actions.append(h("a.btn.ghost.sm", { href: d.url, target: "_blank", rel: "noopener", title: d.url }, icon("ext", "i-sm")));
                  if (d.status === "ready" && !d.current) {
                    const pbtn = h("button.btn.sm", { type: "button" }, d.preview ? "Publish" : "Roll back to this");
                    pbtn.onclick = () => busy(pbtn, async () => {
                      try {
                        await post(sbase + "/deploys/" + d.id + "/promote", {});
                        toast(d.id.slice(0, 8) + " is live");
                        await refreshSite();
                        deploys();
                      } catch (e) {
                        toastError(e);
                      }
                    });
                    actions.append(pbtn);
                    actions.append(h("button.btn.ghost.sm", { type: "button", title: "Delete deploy", onclick: () => confirmDanger({ title: "Delete deploy " + d.id.slice(0, 8), text: "Its preview link stops working.", onConfirm: async () => { await del(sbase + "/deploys/" + d.id); deploys(); } }) }, icon("trash", "i-sm")));
                  }
                  return h(
                    "tr",
                    h("td", h("div.strong.mono.small", d.id.slice(0, 8)), d.message ? h("div.tiny.dim.trunc", { style: { maxWidth: "320px" } }, d.message) : null, (d.warnings || []).length ? h("div.tiny", { style: { color: "var(--amber)" } }, d.warnings[0]) : null),
                    h("td", status),
                    h("td.dim", d.files ? fmtNum(d.files) + " · " + fmtBytes(d.bytes) : "-"),
                    h("td.dim", timeEl(d.created_at)),
                    h("td.actions", actions)
                  );
                })
              )
            )
          )
        )
      );
    }

    function dropZone(preview, onDone) {
      const status = h("div.small.dim", { style: { marginTop: "10px" } }, "Drop your build folder (dist, build, out) here, or choose it.");
      const bar = h("div.meter", { style: { marginTop: "12px", display: "none" } }, h("i", { style: { width: "0%" } }));
      const picker = h("input", { type: "file", webkitdirectory: true, multiple: true, style: { display: "none" } });
      const choose = h("button.btn", { type: "button", onclick: () => picker.click() }, icon("folder"), "Choose folder");
      const zone = h(
        "div.card-b",
        { style: { border: "2px dashed var(--line-2, var(--line))", borderRadius: "12px", margin: "16px", padding: "32px", textAlign: "center" } },
        h("div", icon("upload", "i-lg")),
        h("div.strong", { style: { marginTop: "8px" } }, preview ? "Deploy a preview" : "Deploy " + name),
        status,
        h("div", { style: { marginTop: "14px" } }, choose),
        bar
      );
      const run = async (raw) => {
        const files = cleanFiles(raw);
        if (!files.length) return toast("That folder has no files to deploy.", { bad: true });
        choose.disabled = true;
        bar.style.display = "block";
        const setBar = (p) => (bar.firstChild.style.width = Math.round(p * 100) + "%");
        try {
          status.textContent = "Reading " + fmtNum(files.length) + " files…";
          const bySha = {};
          const manifest = {};
          let done = 0;
          for (const f of files) {
            const sha = await sha256(await f.file.arrayBuffer());
            manifest[f.path] = sha;
            bySha[sha] = f.file;
            setBar((++done / files.length) * 0.3);
          }
          if (!manifest["index.html"]) toast("No index.html at the top. The home page will be a 404.", { bad: true });
          const start = await post(sbase + "/deploys", { files: manifest, preview });
          const missing = start.missing || [];
          status.textContent = "Uploading " + fmtNum(missing.length) + " new of " + fmtNum(files.length) + " files…";
          let up = 0;
          const queue = [...missing];
          const worker = async () => {
            while (queue.length) {
              const sha = queue.shift();
              await api("PUT", sbase + "/files/" + sha, { raw: bySha[sha], headers: { "Content-Type": "application/octet-stream" } });
              setBar(0.3 + (++up / Math.max(1, missing.length)) * 0.65);
            }
          };
          await Promise.all(Array.from({ length: Math.min(6, missing.length || 1) }, worker));
          status.textContent = "Finishing…";
          const out = await post(sbase + "/deploys/" + start.deploy.id + "/finish", {});
          setBar(1);
          status.textContent = preview ? "Preview ready." : "Live.";
          toast(preview ? "Preview ready: " + out.url : "Deployed. Live at " + out.url);
          await refreshSite();
          onDone ? onDone() : deploys();
        } catch (e) {
          status.textContent = e.message;
          toastError(e);
        } finally {
          choose.disabled = false;
        }
      };
      picker.addEventListener("change", () => run([...picker.files].map((file) => ({ path: file.webkitRelativePath || file.name, file }))));
      zone.addEventListener("dragover", (e) => { e.preventDefault(); zone.style.borderColor = "var(--accent)"; });
      zone.addEventListener("dragleave", () => (zone.style.borderColor = ""));
      zone.addEventListener("drop", async (e) => {
        e.preventDefault();
        zone.style.borderColor = "";
        run(await filesFromDrop([...e.dataTransfer.items]));
      });
      return h("div", zone, picker);
    }

    function deployDialog(preview) {
      modal({
        title: preview ? "Preview deploy" : "Deploy " + name,
        text: preview ? "A preview gets its own link and does not change the live site. Publish it when it looks right." : "Only files that changed are uploaded. The switch is instant, and you can roll back any time.",
        body: dropZone(preview, () => { closeOverlays(); tab = "deploys"; drawTabs(); deploys(); }),
        wide: true,
      });
    }

    // ---------------------------------------------------------------- domains
    async function domains() {
      mount(body, loading());
      let rows;
      try {
        rows = (await get(sbase + "/domains")).domains || [];
      } catch (e) {
        return mount(body, errorBox(e, domains));
      }
      const domainInput = input({ placeholder: "example.com or www.example.com" });
      const alsoWww = h("input", { type: "checkbox", checked: true });
      const addBtn = h("button.btn.primary", { type: "button" }, icon("plus"), "Add domain");
      addBtn.onclick = () =>
        busy(addBtn, async () => {
          const d = domainInput.value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
          if (!d) return;
          try {
            await post(sbase + "/domains", { domain: d, primary: true });
            if (alsoWww.checked && d.split(".").length === 2) {
              await post(sbase + "/domains", { domain: "www." + d, redirect_to: d }).catch(() => {});
            }
            toast("Added " + d);
            domains();
          } catch (e) {
            toastError(e);
          }
        });
      const card = (d) => {
        const actions = h("div.row", { style: { gap: "6px" } });
        const verify = h("button.btn.sm", { type: "button" }, icon("refresh", "i-sm"), "Check DNS");
        verify.onclick = () => busy(verify, async () => {
          try {
            const out = (await post(sbase + "/domains/" + enc(d.domain) + "/verify", {})).domain;
            toast(out.verified ? d.domain + " is connected. HTTPS starts on the first visit." : "DNS doesn't point here yet. It can take a few minutes to update.", { bad: !out.verified });
            domains();
          } catch (e) {
            toastError(e);
          }
        });
        if (!d.verified) actions.append(verify);
        if (d.verified && !d.primary && !d.redirect_to) {
          const pr = h("button.btn.sm", { type: "button" }, "Make primary");
          pr.onclick = () => busy(pr, async () => { await patch(sbase + "/domains/" + enc(d.domain), { primary: true }).catch(toastError); domains(); });
          actions.append(pr);
        }
        actions.append(h("button.btn.ghost.sm", { type: "button", title: "Remove", onclick: () => confirmDanger({ title: "Remove " + d.domain, text: "The site stops answering at this domain.", confirm: "Remove", onConfirm: async () => { await del(sbase + "/domains/" + enc(d.domain)); domains(); } }) }, icon("trash", "i-sm")));
        return h(
          "div.card-b",
          { style: { borderTop: "1px solid var(--line)" } },
          h("div.row", { style: { gap: "10px", flexWrap: "wrap" } }, h("a.strong", { href: d.url, target: "_blank", rel: "noopener" }, d.domain), d.verified ? badge("connected", "ok") : badge("waiting for DNS", "warn"), d.primary ? badge("primary", "info") : null, d.redirect_to ? h("span.small.dim", "redirects to " + d.redirect_to) : null, h("span.spacer"), actions),
          d.verified
            ? null
            : h(
                "div",
                { style: { marginTop: "12px" } },
                h("div.small.dim", "Add this record where you bought the domain (Namecheap, GoDaddy, Cloudflare…), then Check DNS:"),
                h("div.tbl-wrap", { style: { marginTop: "8px" } }, h("table.tbl", h("thead", h("tr", h("th", "Type"), h("th", "Name"), h("th", "Value"))), h("tbody", d.dns.map((r) => h("tr", h("td.mono", r.type), h("td.mono", r.name, " ", copyBtn(r.name)), h("td.mono", r.value, " ", copyBtn(r.value)))))))
              )
        );
      };
      mount(
        body,
        h(
          "div.card",
          h("div.card-h", h("div", h("h2", "Custom domains"), h("div.sub", "HTTPS certificates are issued and renewed automatically. " + site.name + "." + SITE_DOMAIN + " always works too."))),
          h("div.card-b", h("div.row", { style: { gap: "8px", flexWrap: "wrap" } }, h("div", { style: { flex: "1", minWidth: "240px" } }, domainInput), addBtn), h("label.row.small.dim", { style: { gap: "8px", marginTop: "10px" } }, alsoWww, "For a bare domain like example.com, also add www and redirect it")),
          rows.length ? rows.map(card) : h("div.card-b.small.dim", { style: { borderTop: "1px solid var(--line)" } }, "No custom domains yet.")
        )
      );
    }

    // ---------------------------------------------------------------- stats
    async function stats() {
      mount(body, loading());
      let days = Number(ctx.query.days || 30);
      let data;
      try {
        data = await get(sbase + "/analytics?days=" + days);
      } catch (e) {
        return mount(body, errorBox(e, stats));
      }
      let metric = "visitors";
      const chartBox = h("div", { style: { height: "240px" } });
      const drawChart = () => mount(chartBox, areaChart(data.days.map((d) => ({ v: d[metric] || 0, label: d.day.slice(5), full: d.day })), { label: metric }));
      const tile = (label, value) => h("div.card.card-b", h("div.small.dim", label), h("div", { style: { fontSize: "22px", fontWeight: "600", marginTop: "4px" } }, value));
      const top = (title, rows, key) =>
        h("div.card", h("div.card-h", h("h2", title)), rows.length ? h("div.tbl-wrap", h("table.tbl", h("tbody", rows.slice(0, 10).map((r) => h("tr", h("td.mono.small.trunc", { style: { maxWidth: "320px" } }, r.key), h("td.num", fmtNum(r.count))))))) : h("div.card-b.small.dim", "Nothing yet."));
      mount(
        body,
        h("div.grid.g4", { style: { marginBottom: "16px" } }, tile("Visitors (sum of daily)", fmtNum(data.totals.visitors)), tile("Requests", fmtNum(data.totals.requests)), tile("Bandwidth", fmtBytes(data.totals.bytes)), tile("Not found", fmtNum(data.totals.not_found))),
        h("div.card", h("div.card-h", h("div", h("h2", "Last " + days + " days"), h("div.sub", "No cookies, no personal data. Visitors are counted per day with a salted hash that is thrown away daily.")), seg([["visitors", "Visitors"], ["requests", "Requests"], ["not_found", "404s"]], metric, (v) => { metric = v; drawChart(); })), h("div.card-b", chartBox)),
        h("div.grid.g2", { style: { marginTop: "16px" } }, top("Top pages", data.top_pages), top("Top referrers", data.top_referrers))
      );
      drawChart();
    }

    // ---------------------------------------------------------------- settings
    function settings() {
      const pw = input({ type: "password", placeholder: site.password_protected ? "Set a new password" : "At least 6 characters", autocomplete: "new-password" });
      let scope = site.protect;
      const save = h("button.btn.primary", { type: "button" }, site.password_protected ? "Change password" : "Turn on password");
      save.onclick = () => busy(save, async () => {
        if (pw.value.length < 6) return toast("Use at least 6 characters.", { bad: true });
        try {
          site = (await patch(sbase, { password: pw.value, protect: scope })).site;
          toast("Password on");
          settings();
        } catch (e) {
          toastError(e);
        }
      });
      const off = h("button.btn", { type: "button" }, "Remove password");
      off.onclick = () => busy(off, async () => {
        site = (await patch(sbase, { password: null })).site;
        toast("Password removed. The site is public.");
        settings();
      });
      mount(
        body,
        h(
          "div.card",
          h("div.card-h", h("div", h("h2", "Password protection"), h("div.sub", "Visitors enter the password once per browser session. Great for staging sites and client previews."))),
          h(
            "div.card-b",
            h("div.field", h("label", "Protect"), seg([["all", "The whole site"], ["previews", "Only preview links"]], scope, (v) => (scope = v))),
            field("Password", pw),
            h("div.row", { style: { gap: "8px" } }, save, site.password_protected ? off : null)
          )
        ),
        h(
          "div.card",
          { style: { marginTop: "16px" } },
          h("div.card-h", h("div", h("h2", "Rules"), h("div.sub", "Redirects, rewrites, headers, clean URLs and single-page apps are set by a berth.json file in your build folder."))),
          h("div.card-b", codeBlock(JSON.stringify({ cleanUrls: true, spa: false, redirects: [{ source: "/old-page", destination: "/new-page", status: 301 }], rewrites: [{ source: "/api/*", function: "api" }], headers: [{ source: "/*", headers: { "X-Frame-Options": "DENY" } }] }, null, 2)), h("div.small.dim", { style: { marginTop: "8px" } }, "Netlify-style _redirects and _headers files work too. ", h("a.link", { href: "/docs/sites/#rules", target: "_blank", rel: "noopener" }, "All options")))
        ),
        h(
          "div.card",
          { style: { marginTop: "16px" } },
          h("div.card-h", h("div", h("h2", "Delete site"), h("div.sub", "Removes every deploy and custom domain. " + site.name + "." + SITE_DOMAIN + " becomes free for anyone."))),
          h("div.card-b", h("button.btn.danger", { type: "button", onclick: () => confirmDanger({ title: "Delete " + site.name, text: "This can't be undone.", typeToConfirm: site.name, onConfirm: async () => { await del(sbase); location.hash = appPath(slug, "sites"); } }) }, icon("trash"), "Delete site"))
        )
      );
    }
  }
}
