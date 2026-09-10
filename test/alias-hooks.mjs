import { existsSync } from "node:fs";
import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * Teaches plain `node --test` the two things Next resolves for us: the "@/" alias,
 * and extensionless relative imports. Only the tests need this - the app itself
 * goes through Next's own resolver, so source stays idiomatic.
 */
const ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), "..");
const CANDIDATES = ["", ".ts", ".tsx", "/index.ts", ".js"];

function firstThatExists(base) {
  for (const suffix of CANDIDATES) {
    const file = base + suffix;
    if (existsSync(file) && !file.endsWith("/")) return pathToFileURL(file).href;
  }
  return null;
}

export function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) {
    const url = firstThatExists(resolvePath(ROOT, specifier.slice(2)));
    if (url) return { url, shortCircuit: true };
  }

  if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
    const base = resolvePath(dirname(fileURLToPath(context.parentURL)), specifier);
    const url = firstThatExists(base);
    if (url) return { url, shortCircuit: true };
  }

  return next(specifier, context);
}
