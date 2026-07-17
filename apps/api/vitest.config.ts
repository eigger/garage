import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["./vitest.setup.ts"],
    // tsc's build output lands in dist/ with the same *.test.js files —
    // without an explicit exclude, running `build` before `test` locally
    // makes vitest pick up both copies and silently double-run every test.
    exclude: ["**/node_modules/**", "**/dist/**"],
  },
});
