/**
 * Load .env.local then run a command (e.g. drizzle-kit) with DATABASE_URL set.
 * Usage: node --import tsx scripts/db-with-env.ts drizzle-kit push
 */
import { spawnSync } from "node:child_process";
import { loadEnvLocal } from "./load-env-local";

loadEnvLocal();

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage: db-with-env.ts <command> [args...]");
  process.exit(1);
}

const [cmd, ...rest] = args;
const result = spawnSync(cmd!, rest, {
  stdio: "inherit",
  env: process.env,
  shell: true,
});
process.exit(result.status ?? 1);
