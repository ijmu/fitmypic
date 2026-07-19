import { copyFile, cp, mkdir, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const out = fileURLToPath(new URL("../dist/", import.meta.url));
const rootFiles = await readdir(root, { withFileTypes: true });
const excluded = new Set(["index.html", "node_modules", "dist", ".git", "src", "package.json", "package-lock.json", "tsconfig.json", "vite.config.ts", "script.js"]);

await mkdir(out, { recursive: true });
for (const entry of rootFiles) {
  if (excluded.has(entry.name)) continue;
  const source = join(root, entry.name);
  const target = join(out, entry.name);
  if (entry.isDirectory()) await cp(source, target, { recursive: true });
  else await copyFile(source, target);
}
