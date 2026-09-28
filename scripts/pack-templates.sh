#!/bin/sh
# Pack templates-src/<name>/ into src/templates/<name>.tar.gz and write
# src/templates/index.json, which `berth init` and `berth templates` read.
set -eu
cd "$(dirname "$0")/.."
mkdir -p src/templates
rm -f src/templates/*.tar.gz
python3 - <<'PY'
import json, os, tarfile, io
out = []
for name in sorted(os.listdir("templates-src")):
    src = os.path.join("templates-src", name)
    manifest = os.path.join(src, "template.json")
    if not os.path.isfile(manifest):
        continue
    meta = json.load(open(manifest))
    dest = f"src/templates/{name}.tar.gz"
    with tarfile.open(dest, "w:gz", format=tarfile.PAX_FORMAT) as tar:
        for root, _dirs, files in os.walk(src):
            for f in sorted(files):
                if f.startswith("."):
                    continue
                path = os.path.join(root, f)
                info = tar.gettarinfo(path, arcname=os.path.relpath(path, src))
                info.uid = info.gid = 0; info.uname = info.gname = ""; info.mtime = 0
                with open(path, "rb") as fh:
                    tar.addfile(info, fh)
    out.append({"name": meta["name"], "title": meta["title"], "description": meta["description"],
                "url": f"https://atberth.com/templates/{name}.tar.gz"})
json.dump({"templates": out}, open("src/templates/index.json", "w"), indent=2)
print("packed", ", ".join(t["name"] for t in out))
PY
