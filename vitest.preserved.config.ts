import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import path from "node:path";

const srcPath = fileURLToPath(new URL("./src", import.meta.url));

/**
 * Preserved suites that are outside the thesis white-box 96-case count:
 * - workflow (WB-E2E process contracts)
 * - unit-extended (BPLO-02..06, special fee LOB, SA penalties)
 */
export default defineConfig({
  resolve: {
    alias: { "@": srcPath },
  },
  test: {
    environment: "node",
    globals: true,
    setupFiles: [path.join(__dirname, "vitest.whitebox.setup.ts")],
    include: [
      "src/lib/__tests__/workflow/**/*.test.ts",
      "src/lib/__tests__/unit-extended/**/*.test.ts",
    ],
  },
});
