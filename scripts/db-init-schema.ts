/**
 * CREATE SCHEMA IF NOT EXISTS roux;
 * Run before first `npm run db:push`.
 *
 * Usage: DATABASE_URL=… npm run db:init-schema
 * (or with .env.local loaded by your shell)
 */
import { neon } from "@neondatabase/serverless";
import { loadEnvLocal } from "./load-env-local";

loadEnvLocal();

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

async function main() {
  const sql = neon(databaseUrl);
  await sql`CREATE SCHEMA IF NOT EXISTS roux`;
  console.log("OK: schema roux exists");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
