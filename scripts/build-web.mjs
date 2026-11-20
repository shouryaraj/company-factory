// Bundles the office UI into dist/web: app.ts (+ scene.ts, Preact, htm) via esbuild, office.css via Tailwind.
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync } from "node:fs";
import { build } from "esbuild";

const out = "dist/web";
mkdirSync(out, { recursive: true });
await build({
  entryPoints: ["web/app.ts"], outfile: `${out}/app.js`, bundle: true, format: "esm",
  target: "es2022", minify: true, legalComments: "eof", logLevel: "warning",
});
const tw = spawnSync("npx", ["--no-install", "tailwindcss", "-i", "web/office.css", "-o", `${out}/office.css`, "--minify"],
  { stdio: ["ignore", "ignore", "inherit"], shell: process.platform === "win32" });
if (tw.status !== 0) process.exit(tw.status ?? 1);
copyFileSync("web/index.html", `${out}/index.html`);
