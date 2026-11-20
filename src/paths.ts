import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** The package root: holds library/, examples/ and dist/. */
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const LIB = join(ROOT, "library");
export const EXAMPLES = join(ROOT, "examples");
export const DIST = join(ROOT, "dist");
export const VERSION: string = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version;

/** How generated files tell agents to run the factory again. */
export const CMD = "company-factory";

export const read = (path: string): string => (existsSync(path) ? readFileSync(path, "utf8") : "");
