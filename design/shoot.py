import sys
from playwright.sync_api import sync_playwright

url = sys.argv[1]
prefix = sys.argv[2]

with sync_playwright() as p:
    b = p.chromium.launch()
    for name, opts in [
        ("desktop", dict(viewport={"width": 1440, "height": 900}, device_scale_factor=1)),
        ("mobile", dict(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)),
        ("desktop-light", dict(viewport={"width": 1440, "height": 900}, device_scale_factor=1)),
    ]:
        ctx = b.new_context(**opts)
        pg = ctx.new_page()
        if name.endswith("light"):
            pg.add_init_script("localStorage.setItem('berth-theme','light')")
        pg.goto(url, wait_until="networkidle")
        pg.wait_for_timeout(3000)
        sw = pg.evaluate("[document.documentElement.scrollWidth, window.innerWidth]")
        cls = pg.evaluate("""new Promise(r=>{let v=0;new PerformanceObserver(l=>{for(const e of l.getEntries())if(!e.hadRecentInput)v+=e.value}).observe({type:'layout-shift',buffered:true});setTimeout(()=>r(v),300)})""")
        out = f"{prefix}-{name}.png"
        pg.screenshot(path=out, full_page=True)
        print(name, "scrollWidth/innerWidth", sw, "CLS", round(cls, 4), out)
        ctx.close()
    b.close()
