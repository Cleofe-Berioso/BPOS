import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import path from "node:path";

const srcPath = fileURLToPath(new URL("./src", import.meta.url));
const whiteboxOut = path.join(__dirname, "..", "whitebox");

/**
 * Thesis white-box suite — exactly the unit/logic cases counted for QA thesis.
 * Excludes workflow (WB-E2E) and unit-extended supplemental coverage.
 * Reports under ../whitebox.
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
      "src/lib/__tests__/whitebox/**/*.test.ts",
      "src/lib/__tests__/money.test.ts",
      "src/lib/__tests__/fee-computation.test.ts",
      "src/lib/__tests__/bplo-assessment.test.ts",
    ],
    exclude: [
      "**/node_modules/**",
      "src/lib/__tests__/workflow/**",
      "src/lib/__tests__/unit-extended/**",
    ],
    reporters: [
      "default",
      ["json", { outputFile: path.join(whiteboxOut, "evidence", "vitest-results.json") }],
      ["junit", { outputFile: path.join(whiteboxOut, "evidence", "vitest-junit.xml") }],
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "lcov", "html"],
      reportsDirectory: path.join(whiteboxOut, "coverage"),
      include: ["src/lib/**/*.ts"],
      exclude: [
        "src/lib/__tests__/**",
        "src/lib/prisma.ts",
        "**/*.d.ts",
      ],
    },
  },
});
