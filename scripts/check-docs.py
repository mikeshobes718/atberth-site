#!/usr/bin/env python3
"""Run every runnable shell example in the docs against production.

Runnable blocks are <pre data-check> in src/docs/**/index.html. A block with
data-check="raw" runs without the curl wrapper, for examples that show an error
response on purpose.

How it works:
  1. Creates a throwaway Berth account (POST /v1/signup, the code from
     GET /v1/admin/codes with the admin token, POST /v1/login) and exports
     BERTH_ACCOUNT_KEY. The CLI gets a temp BERTH_CONFIG and `berth login --token`.
  2. For each page, picks APP=docs_<random><n>. Unless the page's <article> has
     data-app="self", it creates the app first with `berth apps create --json`
     and exports SECRET_KEY and PUBLISHABLE_KEY.
  3. Runs the page's blocks in order in bash with `set -aeo pipefail`, in a temp
     working dir. Variables a block assigns (ROW_ID=$(...)) are carried to the
     next block on the same page. curl is wrapped with --fail-with-body so an HTTP
     error fails the block.
  4. Deletes every app the account owns and the account itself, and exits
     nonzero if any block failed.

Output never includes keys or tokens: known secrets and anything that looks
like one are redacted.
"""

import glob
import html
import json
import os
import re
import secrets
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
API = os.environ.get("BERTH_API", "https://api.atberth.com/v1").rstrip("/")
ADMIN_TOKEN_PATH = os.path.expanduser("~/Library/Application Support/berth/platform.token")
CLI_REPO = os.path.expanduser("~/Documents/berth-cli/berth")
ORDER = ["", "keys", "auth", "policies", "queries", "realtime", "storage", "functions",
         "webhooks", "sql", "cli", "api", "limits", "supabase"]

SECRET_RE = re.compile(r"\b(?:bak|bsk|bpk)_[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*|signature=[A-Za-z0-9%_-]+")
FIELD_RE = re.compile(r'("(?:secret|key|access_token|refresh_token|signing_secret)"\s*:\s*")[^"]+"')
known_secrets = set()


def redact(text):
    for s in sorted(known_secrets, key=len, reverse=True):
        if s:
            text = text.replace(s, "[redacted]")
    text = SECRET_RE.sub("[redacted]", text)
    return FIELD_RE.sub(r'\1[redacted]"', text)


def call(method, path, token=None, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(API + path, data=data, method=method)
    req.add_header("Accept", "application/json")
    if data is not None:
        req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(req, timeout=60) as res:
            raw = res.read().decode() or "{}"
            return res.status, json.loads(raw)
    except urllib.error.HTTPError as err:
        raw = err.read().decode()
        try:
            return err.code, json.loads(raw)
        except ValueError:
            return err.code, {"raw": raw[:300]}


def extract(path):
    text = open(path, encoding="utf-8").read()
    self_app = bool(re.search(r'<article class="doc"[^>]*data-app="self"', text))
    blocks = []
    for m in re.finditer(r'<pre\b([^>]*)>(.*?)</pre>', text, re.S):
        attrs = m.group(1)
        am = re.search(r'data-check(?:="([^"]*)")?', attrs)
        if not am:
            continue
        code = re.sub(r"</?code[^>]*>", "", m.group(2))
        blocks.append({"mode": am.group(1) or "", "code": html.unescape(code)})
    return self_app, blocks


PRELUDE = """set -aeo pipefail
curl() { command curl --fail-with-body "$@"; }
"""


def run_block(block, env, cwd, state_file):
    script = ""
    if block["mode"] == "raw":
        script = "set -aeo pipefail\n"
    else:
        script = PRELUDE
    script += block["code"] + "\n"
    script += 'env -0 > "$BERTH_DOCS_STATE"\n'
    run_env = dict(env)
    run_env["BERTH_DOCS_STATE"] = state_file
    try:
        proc = subprocess.run(["bash", "-c", script], cwd=cwd, env=run_env, capture_output=True,
                              text=True, timeout=180)
        code, out = proc.returncode, proc.stdout + proc.stderr
    except subprocess.TimeoutExpired as err:
        code, out = 124, (err.stdout or b"").decode(errors="replace") + "\n[timed out after 180 s]"
    if code == 0:
        raw = open(state_file, "rb").read().decode(errors="replace")
        new_env = {}
        for item in raw.split("\0"):
            if "=" in item:
                k, v = item.split("=", 1)
                if k not in ("BERTH_DOCS_STATE", "_", "SHLVL", "PWD", "OLDPWD") and not k.startswith("BASH_FUNC_"):
                    new_env[k] = v
        for k, v in new_env.items():
            known_secrets.update(SECRET_RE.findall(v))
            if "SECRET" in k and v:
                known_secrets.add(v)
        return True, out, new_env
    return False, out, env


def find_cli():
    path = shutil.which("berth")
    if path:
        try:
            h = subprocess.run([path, "--help"], capture_output=True, text=True, timeout=30).stdout
        except Exception:
            h = ""
        if "functions" in h:
            return path
    if os.path.exists(CLI_REPO):
        return CLI_REPO
    sys.exit("No berth CLI with the functions command found.")


def main():
    only = sys.argv[1:]
    admin = open(ADMIN_TOKEN_PATH).read().strip()
    known_secrets.add(admin)

    work = tempfile.mkdtemp(prefix="berth-docs-")
    bindir = os.path.join(work, "bin")
    os.makedirs(bindir)
    os.symlink(find_cli(), os.path.join(bindir, "berth"))

    tag = secrets.token_hex(3)
    email = f"delivered+docs{tag}@resend.dev"
    status, body = call("POST", "/signup", body={"email": email})
    if status != 202:
        sys.exit(f"signup failed: {status} {redact(json.dumps(body))}")
    code = None
    for _ in range(20):
        status, body = call("GET", "/admin/codes?email=" + urllib.request.quote(email), admin)
        code = body.get("code") if status == 200 else None
        if code:
            break
        time.sleep(1)
    if not code:
        sys.exit(f"no login code: {status} {redact(json.dumps(body))}")
    status, body = call("POST", "/login", body={"email": email, "code": code, "key_name": "docs-check"})
    if status != 200:
        sys.exit(f"login failed: {status} {redact(json.dumps(body))}")
    account_key = body["key"]
    account_id = body["account"]["id"]
    known_secrets.add(account_key)

    base_env = {
        "PATH": bindir + os.pathsep + os.environ.get("PATH", "/usr/bin:/bin"),
        "HOME": os.environ.get("HOME", work),
        "LANG": "C.UTF-8",
        "BERTH_CONFIG": os.path.join(work, "config.json"),
        "BERTH_ACCOUNT_KEY": account_key,
    }
    subprocess.run(["berth", "login", "--token", account_key], env=base_env, capture_output=True, check=True)

    results = []
    try:
        for n, slug in enumerate(ORDER):
            if only and slug not in only and not (slug == "" and "overview" in only):
                continue
            page = os.path.join(ROOT, "src", "docs", slug, "index.html") if slug else os.path.join(ROOT, "src", "docs", "index.html")
            self_app, blocks = extract(page)
            name = "/docs/" + (slug + "/" if slug else "")
            cwd = os.path.join(work, slug or "overview")
            os.makedirs(cwd, exist_ok=True)
            env = dict(base_env)
            env["APP"] = f"docs_{tag}{n}"
            if not self_app:
                proc = subprocess.run(["berth", "apps", "create", env["APP"], "--json"], env=env,
                                      capture_output=True, text=True)
                if proc.returncode != 0:
                    print(f"FAIL {name} setup: {redact(proc.stdout + proc.stderr)}")
                    results.append((name, 0, False))
                    continue
                created = json.loads(proc.stdout)
                env["SECRET_KEY"] = created["keys"]["secret"]
                env["PUBLISHABLE_KEY"] = created["keys"]["publishable"]
                known_secrets.update([env["SECRET_KEY"], env["PUBLISHABLE_KEY"]])
            state = os.path.join(work, "state")
            for i, block in enumerate(blocks, 1):
                ok, out, env = run_block(block, env, cwd, state)
                results.append((name, i, ok))
                first = block["code"].strip().splitlines()[0][:70]
                print(f"{'PASS' if ok else 'FAIL'} {name} #{i}  {first}", flush=True)
                if not ok or os.environ.get("VERBOSE"):
                    print("  | " + redact(out.strip()).replace("\n", "\n  | "))
            delete_apps(account_key)
    finally:
        delete_apps(account_key)
        status, _ = call("DELETE", f"/admin/accounts/{account_id}", admin)
        print(f"cleanup: account delete -> {status}")
        shutil.rmtree(work, ignore_errors=True)

    passed = sum(1 for r in results if r[2])
    print(f"\n{passed}/{len(results)} blocks passed")
    sys.exit(0 if results and passed == len(results) else 1)


def delete_apps(account_key):
    status, body = call("GET", "/apps", account_key)
    for app in body.get("apps", []) if status == 200 else []:
        call("DELETE", "/apps/" + app.get("slug", app.get("name")), account_key)


if __name__ == "__main__":
    main()
