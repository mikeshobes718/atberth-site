import { API, get, post, patch, del, api, enc, encKey } from "../api.js";
import { h, mount, icon, toast, toastError, modal, confirmDanger, drawer, menu, field, input, select, options, empty, errorBox, loading, spinner, badge, fmtBytes, fmtNum, timeEl, fmtDateTime, copy, download, copyBtn } from "../ui.js";
import { appPath, replace } from "../state.js";

const READ = [
  { value: "secret", label: "Secret", hint: "Only secret keys" },
  { value: "public", label: "Public", hint: "Anyone with the link" },
  { value: "authenticated", label: "Signed in", hint: "Any signed-in user" },
  { value: "owner", label: "Owner", hint: "Keys under <user id>/" },
];
const WRITE = READ.filter((r) => r.value !== "public");

export default async function storage(ctx) {
  const { slug } = ctx;
  const base = "/apps/" + enc(slug) + "/storage";
  const page = h("div.page.flush");
  ctx.root.append(page);
  const pane = h("div.pane");
  const work = h("section.work");
  page.append(h("div.split", pane, work));
  let buckets = [];
  let current = ctx.rest[0] ? decodeURIComponent(ctx.rest[0]) : null;
  let prefix = ctx.rest.length > 1 ? ctx.rest.slice(1).map(decodeURIComponent).join("/") + "/" : "";
  const listEl = h("div.pane-list");
  mount(pane, h("div.pane-h", h("div.row", h("h2", "Storage"), h("span.spacer"), h("button.btn.sm", { type: "button", onclick: () => bucketModal() }, icon("plus", "i-sm"), "New bucket"))), listEl);

  function renderList() {
    mount(
      listEl,
      buckets.length
        ? buckets.map((b) =>
            h("button.pane-item" + (b.name === current ? ".on" : ""), { type: "button", onclick: () => openBucket(b.name, "") }, icon("folder", "i-sm"), h("span.nm", b.name), h("span.meta", b.public ? "public" : b.read))
          )
        : h("div.dim.small", { style: { padding: "12px 10px" } }, "No buckets yet.")
    );
  }

  async function loadBuckets() {
    buckets = (await get(base + "/buckets")).buckets || [];
    renderList();
  }

  function openBucket(name, pre) {
    current = name;
    prefix = pre;
    replace(appPath(slug, "storage", name) + (pre ? "/" + pre.replace(/\/$/, "").split("/").map(encodeURIComponent).join("/") : ""));
    ctx.chrome();
    renderList();
    showBucket();
  }

  async function showBucket() {
    const b = buckets.find((x) => x.name === current);
    if (!b) return showEmpty();
    const files = h("div.gridwrap", { style: { background: "transparent" } });
    const status = h("div.statusbar");
    const crumbs = h("div.row", { style: { gap: "4px", flexWrap: "wrap" } });
    const drop = h("div", { style: { flex: "1", display: "flex", flexDirection: "column", minHeight: "0", position: "relative" } }, files);
    mount(
      work,
      h(
        "div.toolbar",
        h("div.title", icon("folder"), b.name),
        b.public ? badge("public", "ok") : badge("read " + b.read),
        badge("write " + b.write),
        h("span.spacer"),
        h("button.btn.sm", { type: "button", onclick: () => newFolder() }, icon("plus", "i-sm"), "Folder"),
        h("button.btn.sm", { type: "button", onclick: () => pickAndUpload() }, icon("upload", "i-sm"), "Upload"),
        h("button.btn.sm.icon", { type: "button", "aria-label": "Refresh", onclick: () => loadFiles() }, icon("refresh", "i-sm")),
        h(
          "button.btn.ghost.icon.sm",
          {
            type: "button",
            "aria-label": "Bucket actions",
            onclick: (e) =>
              menu(e.currentTarget, [{ label: "Bucket settings", icon: "settings", onClick: () => bucketModal(b) }, "-", { label: "Delete bucket", icon: "trash", danger: true, onClick: () => deleteBucket(b) }], { align: "right" }),
          },
          icon("more")
        )
      ),
      h("div", { style: { padding: "10px 14px", borderBottom: "1px solid var(--line)" } }, crumbs),
      drop,
      status
    );
    const segs = prefix ? prefix.replace(/\/$/, "").split("/") : [];
    mount(
      crumbs,
      h("button.btn.ghost.sm", { type: "button", onclick: () => openBucket(b.name, "") }, icon("folder", "i-sm"), b.name),
      segs.map((s, i) => [h("span.dim", "/"), h("button.btn.ghost.sm", { type: "button", onclick: () => openBucket(b.name, segs.slice(0, i + 1).join("/") + "/") }, s)])
    );

    let over = 0;
    drop.addEventListener("dragenter", (e) => {
      e.preventDefault();
      over++;
      drop.classList.add("file-drop", "over");
    });
    drop.addEventListener("dragover", (e) => e.preventDefault());
    drop.addEventListener("dragleave", () => {
      if (--over <= 0) drop.classList.remove("file-drop", "over");
    });
    drop.addEventListener("drop", (e) => {
      e.preventDefault();
      over = 0;
      drop.classList.remove("file-drop", "over");
      upload([...e.dataTransfer.files]);
    });

    async function loadFiles() {
      mount(files, loading());
      let objs;
      try {
        objs = (await get(base + "/objects/" + enc(b.name) + "?limit=1000&prefix=" + enc(prefix))).objects || [];
      } catch (e) {
        mount(files, errorBox(e, loadFiles));
        return;
      }
      const folders = new Map();
      const here = [];
      for (const o of objs) {
        const rest = o.key.slice(prefix.length);
        const i = rest.indexOf("/");
        if (i >= 0) {
          const f = rest.slice(0, i);
          const cur = folders.get(f) || { n: 0, size: 0 };
          cur.n++;
          cur.size += o.size;
          folders.set(f, cur);
        } else here.push(o);
      }
      const total = objs.reduce((s, o) => s + o.size, 0);
      mount(status, h("span.num", fmtNum(here.length) + " files, " + fmtNum(folders.size) + " folders here"), h("span.spacer"), h("span.num", fmtBytes(total) + (objs.length >= 1000 ? " in the first 1,000 files" : " under this folder")), h("span.dim", "Drop files anywhere to upload"));
      if (!here.length && !folders.size) {
        mount(
          files,
          empty({
            icon: "upload",
            title: prefix ? "This folder is empty" : "This bucket is empty",
            text: "Drag files here or pick some to upload. Up to " + fmtBytes(b.max_file_size) + " each" + (b.allowed_types.length ? ", types " + b.allowed_types.join(", ") : "") + ".",
            actions: [h("button.btn.primary", { type: "button", onclick: pickAndUpload }, icon("upload"), "Upload files")],
          })
        );
        return;
      }
      mount(
        files,
        h(
          "table.tbl",
          h("thead", h("tr", h("th", "Name"), h("th.r", "Size"), h("th", "Type"), h("th", "Updated"), h("th.actions", ""))),
          h(
            "tbody",
            [...folders.entries()].sort().map(([f, info]) =>
              h(
                "tr.click",
                { onclick: () => openBucket(b.name, prefix + f + "/") },
                h("td", h("div.row", h("span", { style: { color: "var(--amber)" } }, icon("folder")), h("span.strong", f))),
                h("td.r.dim.num", fmtBytes(info.size)),
                h("td.dim", fmtNum(info.n) + (info.n === 1 ? " file" : " files")),
                h("td"),
                h("td.actions", icon("chev", "i-sm"))
              )
            ),
            here.map((o) => {
              const name = o.key.slice(prefix.length);
              return h(
                "tr.click",
                { onclick: () => preview(o) },
                h("td", h("div.row", h("span.dim", icon(o.content_type.startsWith("image/") ? "eye" : "file")), h("span.strong.trunc", { title: o.key }, name))),
                h("td.r.dim.num", fmtBytes(o.size)),
                h("td.mono.tiny.dim", o.content_type),
                h("td.dim", timeEl(o.updated_at)),
                h(
                  "td.actions",
                  { onclick: (e) => e.stopPropagation() },
                  h(
                    "button.btn.ghost.icon.sm",
                    {
                      type: "button",
                      "aria-label": "File actions",
                      onclick: (e) =>
                        menu(
                          e.currentTarget,
                          [
                            { label: "Preview and details", icon: "eye", onClick: () => preview(o) },
                            { label: "Download", icon: "download", onClick: () => fetchFile(o).then((blob) => download(blob, name.split("/").pop())).catch(toastError) },
                            { label: "Copy signed link (1 hour)", icon: "link", onClick: () => signed(o, 3600) },
                            b.public ? { label: "Copy public link", icon: "link", onClick: () => copy(publicUrl(o), "Public link copied") } : null,
                            "-",
                            { label: "Delete", icon: "trash", danger: true, onClick: () => removeFile(o) },
                          ].filter(Boolean),
                          { align: "right" }
                        ),
                    },
                    icon("more")
                  )
                )
              );
            })
          )
        )
      );
    }

    function publicUrl(o) {
      return API + base + "/objects/" + enc(b.name) + "/" + encKey(o.key);
    }
    function fetchFile(o) {
      return api("GET", base + "/objects/" + enc(b.name) + "/" + encKey(o.key), { blob: true });
    }
    async function signed(o, secs) {
      try {
        const out = await post(base + "/sign/" + enc(b.name) + "/" + encKey(o.key), { expires_in: secs });
        copy(out.url, "Signed link copied, valid until " + fmtDateTime(out.expires_at));
      } catch (e) {
        toastError(e);
      }
    }
    function removeFile(o, after) {
      return confirmDanger({
        title: "Delete " + o.key.split("/").pop(),
        text: "The file is removed from " + b.name + ". Links to it stop working.",
        confirm: "Delete file",
        onConfirm: async () => {
          await del(base + "/objects/" + enc(b.name) + "/" + encKey(o.key));
          toast("File deleted");
          after && after();
          loadFiles();
        },
      });
    }
    function preview(o) {
      const box = h("div", loading());
      const isImg = o.content_type.startsWith("image/");
      const isText = /^text\/|json|javascript|xml|csv/.test(o.content_type) && o.size < 400000;
      let url = null;
      const close = drawer({
        title: o.key.split("/").pop(),
        sub: b.name + "/" + o.key,
        width: 600,
        body: h(
          "div.stack",
          box,
          h(
            "dl.kv",
            h("dt", "Key"),
            h("dd.row", { style: { gap: "4px" } }, h("span.mono.small", o.key), copyBtn(o.key)),
            h("dt", "Size"),
            h("dd", fmtBytes(o.size) + " (" + fmtNum(o.size) + " bytes)"),
            h("dt", "Type"),
            h("dd.mono.small", o.content_type),
            h("dt", "SHA-256"),
            h("dd.mono.tiny", o.sha256),
            h("dt", "Uploaded"),
            h("dd", fmtDateTime(o.created_at)),
            h("dt", "Updated"),
            h("dd", fmtDateTime(o.updated_at))
          )
        ),
        foot: (c) => [
          h("button.btn.danger", { type: "button", onclick: () => removeFile(o, c) }, icon("trash"), "Delete"),
          h("span.spacer"),
          h("button.btn", { type: "button", onclick: () => signed(o, 3600) }, icon("link"), "Signed link"),
          h("button.btn.primary", { type: "button", onclick: () => fetchFile(o).then((bl) => download(bl, o.key.split("/").pop())).catch(toastError) }, icon("download"), "Download"),
        ],
      });
      if (isImg || isText)
        fetchFile(o)
          .then(async (blob) => {
            if (isImg) {
              url = URL.createObjectURL(blob);
              const img = h("img", { src: url, alt: o.key, style: { maxWidth: "100%", borderRadius: "12px", border: "1px solid var(--line)", background: "var(--bg-2)" } });
              mount(box, img);
            } else mount(box, h("pre.code", { style: { maxHeight: "320px" } }, (await blob.text()).slice(0, 20000)));
          })
          .catch((e) => mount(box, h("div.bad-box", icon("alert"), e.message)));
      else mount(box, h("div.empty", { style: { padding: "30px" } }, h("div.empty-ico", icon("file", "i-lg")), h("p", "No preview for " + o.content_type + ".")));
      const obs = new MutationObserver(() => {
        if (!box.isConnected) {
          url && URL.revokeObjectURL(url);
          obs.disconnect();
        }
      });
      obs.observe(document.body, { childList: true });
      return close;
    }
    function newFolder() {
      const name = input({ placeholder: "folder name", mono: true, autofocus: true });
      modal({
        title: "New folder",
        text: "Folders are key prefixes. The folder appears once a file is uploaded into it.",
        body: field("Name", name),
        actions: [
          { label: "Cancel" },
          {
            label: "Open folder",
            kind: "primary",
            submit: true,
            onClick: async () => {
              const n = name.value.trim().replace(/^\/+|\/+$/g, "");
              if (!n) throw new Error("Enter a folder name.");
              openBucket(b.name, prefix + n + "/");
            },
          },
        ],
      });
    }
    async function pickAndUpload() {
      const inp = h("input", { type: "file", multiple: true, style: { display: "none" } });
      inp.addEventListener("change", () => {
        upload([...inp.files]);
        inp.remove();
      });
      document.body.append(inp);
      inp.click();
    }
    async function upload(list) {
      if (!list.length) return;
      let done = 0;
      const t = h("span.row", spinner(), "Uploading 0 of " + list.length);
      mount(status, t);
      for (const f of list) {
        if (f.size > b.max_file_size) {
          toast(f.name + " is over the " + fmtBytes(b.max_file_size) + " limit.", { bad: true });
          continue;
        }
        try {
          await api("PUT", base + "/objects/" + enc(b.name) + "/" + encKey(prefix + f.name), { raw: f, headers: { "Content-Type": f.type || "application/octet-stream" } });
          done++;
          t.lastChild.textContent = "Uploading " + done + " of " + list.length;
        } catch (e) {
          toastError(e);
        }
      }
      if (done) toast("Uploaded " + done + (done === 1 ? " file" : " files"));
      loadFiles();
    }
    loadFiles();
  }

  function bucketModal(b) {
    const name = input({ placeholder: "avatars", mono: true, autofocus: !b, value: b ? b.name : "" });
    if (b) name.disabled = true;
    const r = options(READ, b ? b.read : "secret");
    const w = options(WRITE, b ? b.write : "secret");
    const max = input({ placeholder: "50 MB default", mono: true, value: b && b.max_file_size ? String(Math.round(b.max_file_size / 1048576)) : "" });
    const types = input({ placeholder: "image/*, application/pdf", mono: true, value: b ? (b.allowed_types || []).join(", ") : "" });
    modal({
      title: b ? "Bucket settings" : "New bucket",
      wide: true,
      body: h("div.form", field("Name", name), field("Who can read", r), field("Who can write", w), h("div.form-row", field("Max file size (MB)", max), field("Allowed types", types, "Leave empty for any type"))),
      actions: [
        { label: "Cancel" },
        {
          label: b ? "Save" : "Create bucket",
          kind: "primary",
          submit: true,
          onClick: async () => {
            const body = { read: r.get(), write: w.get() };
            if (max.value.trim()) body.max_file_size = Math.round(Number(max.value) * 1048576);
            body.allowed_types = types.value.split(",").map((s) => s.trim()).filter(Boolean);
            if (b) await patch(base + "/buckets/" + enc(b.name), body);
            else await post(base + "/buckets", { name: name.value.trim(), ...body });
            toast(b ? "Bucket saved" : "Bucket created");
            await loadBuckets();
            openBucket(b ? b.name : name.value.trim(), "");
          },
        },
      ],
    });
  }

  function deleteBucket(b) {
    confirmDanger({
      title: "Delete bucket " + b.name,
      text: "The bucket and every file in it are deleted.",
      confirm: "Delete bucket",
      typeToConfirm: b.name,
      onConfirm: async () => {
        await del(base + "/buckets/" + enc(b.name) + "?force=true");
        toast("Bucket deleted");
        current = null;
        await loadBuckets();
        replace(appPath(slug, "storage"));
        ctx.chrome();
        showEmpty();
      },
    });
  }

  function showEmpty() {
    mount(
      work,
      empty({
        icon: "storage",
        title: buckets.length ? "Pick a bucket" : "No buckets yet",
        text: buckets.length ? "Choose a bucket on the left to browse its files." : "Buckets hold files like avatars and uploads, each with its own read and write rules.",
        actions: [h("button.btn.primary", { type: "button", onclick: () => bucketModal() }, icon("plus"), "New bucket")],
      })
    );
  }

  try {
    await loadBuckets();
  } catch (e) {
    mount(work, errorBox(e, () => location.reload()));
    return;
  }
  if (!ctx.alive()) return;
  if (current && buckets.find((b) => b.name === current)) showBucket();
  else showEmpty();
}
