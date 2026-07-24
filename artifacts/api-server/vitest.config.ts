import { defineConfig } from "vitest/config";

// Unit tests only. The integration suite under test/ is Node's built-in test
// runner (needs a scratch DB) and is run via `pnpm run test:integration` — keep
// vitest scoped to the pure-function unit tests in src/ so the two don't collide.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["test/**", "node_modules/**"],
  },
});
