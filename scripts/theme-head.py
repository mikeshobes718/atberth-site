import pathlib, re, sys

root = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else pathlib.Path(__file__).resolve().parent.parent) / "src"
SNIP = ('<script>\n(function(){var d=document.documentElement,t;try{t=localStorage.getItem("berth-theme")}catch(e){}'
        'if(t!=="light"&&t!=="dark")t=window.matchMedia&&matchMedia("(prefers-color-scheme: light)").matches?"light":"dark";'
        'd.setAttribute("data-theme",t);d.classList.add("js")})();\n</script>')
METAS = ('<meta name="color-scheme" content="light dark">\n'
         '<meta name="theme-color" content="#08090b" media="(prefers-color-scheme: dark)">\n'
         '<meta name="theme-color" content="#f6f6f3" media="(prefers-color-scheme: light)">\n')
old_script = re.compile(r'<script>\s*\(function\(\)\{[^\n]*?localStorage\.getItem\("berth-theme"\)[^\n]*?\}\)\(\);\s*</script>')

for f in sorted(root.rglob("*.html")):
    if "legal" in f.relative_to(root).parts[:1]:
        continue
    s = o = f.read_text()
    if old_script.search(s):
        s = old_script.sub(lambda m: SNIP, s, count=1)
    elif SNIP not in s:
        s = s.replace('<link rel="stylesheet" href="/styles.css">', SNIP + '\n<link rel="stylesheet" href="/styles.css">', 1)
    s = s.replace('<meta name="color-scheme" content="dark light">', '<meta name="color-scheme" content="light dark">')
    if 'name="color-scheme"' not in s:
        s = s.replace('<link rel="icon"', METAS + '<link rel="icon"', 1)
    if SNIP not in s:
        print("NO SNIPPET:", f)
    if 'src="/main.js"' not in s:
        s = s.replace("</body>", '<script src="/main.js" defer></script>\n</body>', 1)
    if s != o:
        f.write_text(s)
        print("updated", f.relative_to(root))
