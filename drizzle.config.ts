import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./lib/db/migrations",
  dialect: "postgresql",
  // Only manage tables in the `roux` schema (not public).
  schemaFilter: ["roux"],
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
