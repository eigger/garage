import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["./vitest.setup.ts"],
    // tsc's build output lands in dist/ with the same *.test.js files —
    // without an explicit exclude, running `build` before `test` locally
    // makes vitest pick up both copies and silently double-run every test.
    //
    // *.integration.test.ts is excluded here too: those tests call the backup
    // restore route, which wipes every table in whatever DATABASE_URL points
    // to. This suite runs alongside other test files against a shared DB
    // (locally and in CI's `test` job), so it must never run them — they're
    // picked up separately by vitest.integration.config.ts in their own
    // isolated database. See that file for why.
    exclude: ["**/node_modules/**", "**/dist/**", "**/*.integration.test.ts"],
  },
});
