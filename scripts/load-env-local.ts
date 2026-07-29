/**
 * Load .env.local into process.env (does not override existing vars).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export function loadEnvLocal(filename = ".env.local"): void {
  try {
    const raw = readFileSync(resolve(process.cwd(), filename), "utf8");
    for (const line of raw.split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i === -1) continue;
      const k = t.slice(0, i).trim();
      let v = t.slice(i + 1).trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      if (!(k in process.env)) process.env[k] = v;
    }
  } catch {
    /* missing file is ok */
  }
}
