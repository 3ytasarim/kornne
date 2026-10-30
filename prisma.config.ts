import "dotenv/config";
import { defineConfig } from "prisma/config";

// Prisma CLI (migrate/studio) uses the direct connection; the app connects through src/lib/db.ts.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: process.env.DIRECT_URL || process.env.DATABASE_URL || "postgresql://invalid:invalid@localhost:1/invalid" },
});
