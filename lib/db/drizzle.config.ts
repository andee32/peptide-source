import { defineConfig } from "drizzle-kit";
import path from "path";

// Load the repo-root .env (Node 20.12+). No-op if absent — hosting/CI inject env
// directly, and existing env vars are not overridden.
try {
  process.loadEnvFile(path.join(__dirname, "../../.env"));
} catch {
  // no .env file present; rely on the ambient environment
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  // Versioned SQL migrations live here (committed). `generate` writes them from
  // the schema diff (offline); `migrate` applies pending ones on deploy. `push`
  // stays dev-only — it diffs straight against the live DB and can drop data.
  out: path.join(__dirname, "./migrations"),
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
