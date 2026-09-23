import { cp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join, extname } from "node:path";
import { createHash } from "node:crypto";

const SRC = "src";
const OUT = "dist";

const banned = [
  { re: /[\u2013\u2014]/, why: "en or em dash" },
  { re: /\b(?:\d{1,3}\.){3}\d{1,3}\b/, why: "IPv4 address" },
  { re: /ocid1\./i, why: "Oracle OCID" },
  { re: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, why: "JWT-like token" },
];

async function walk(dir) {
  const out = [];
  for (const name of await readdir(dir)) {
    const p = join(dir, name);
    if ((await stat(p)).isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}

function minifyCss(css) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s*\n\s*/g, "")
    .replace(/\s*([{};,>])\s*/g, "$1")
    .replace(/;}/g, "}")
    .trim();
}

function minifyHtml(html) {
  return html
    .replace(/>\s*\n\s*</g, "><")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

await rm(OUT, { recursive: true, force: true });
await cp(SRC, OUT, { recursive: true });

const problems = [];
let bytes = 0;
for (const file of await walk(OUT)) {
  const ext = extname(file);
  if (![".html", ".css", ".js", ".svg", ".txt", ".xml", ""].includes(ext)) {
    bytes += (await stat(file)).size;
    continue;
  }
  let text = await readFile(file, "utf8");
  for (const { re, why } of banned) {
    if (re.test(text)) problems.push(`${file}: contains ${why}`);
  }
  if (ext === ".css") text = minifyCss(text);
  if (ext === ".html") text = minifyHtml(text);
  await writeFile(file, text);
  bytes += Buffer.byteLength(text);
}

// GitHub Pages caches for ten minutes and ignores deploys, so give the shared
// script and stylesheet a content version or a returning visitor keeps the old one.
const version = async (f) => createHash("sha1").update(await readFile(join(OUT, f))).digest("hex").slice(0, 10);
const assets = { "/main.js": await version("main.js"), "/styles.css": await version("styles.css") };
for (const file of await walk(OUT)) {
  if (extname(file) !== ".html") continue;
  const text = await readFile(file, "utf8");
  const next = text.replace(/(src|href)="(\/main\.js|\/styles\.css)"/g, (_, attr, path) => `${attr}="${path}?v=${assets[path]}"`);
  if (next !== text) await writeFile(file, next);
}

if (problems.length) {
  console.error("Build failed:\n" + problems.join("\n"));
  process.exit(1);
}
console.log(`Built ${OUT}/ (${(bytes / 1024).toFixed(1)} KB total)`);
