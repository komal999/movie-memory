import "dotenv/config";
import { defineConfig } from "prisma/config";

// `prisma generate` runs on npm install (postinstall) and needs no database,
// so a missing DATABASE_URL must not break config loading. Commands that do
// need a connection (migrate, studio) fail with a clear message if it's unset.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  ...(process.env.DATABASE_URL ? { datasource: { url: process.env.DATABASE_URL } } : {}),
});
