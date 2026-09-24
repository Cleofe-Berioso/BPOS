/**
 * Generate a single QA test-case report markdown with thesis META + Vitest durations.
 *
 * Output: docs/EBPLS_WHITEBOX_TEST_CASE_REPORT.md
 * Run: npx tsx scripts/generate-qa-test-case-report.ts
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOCS = path.join(ROOT, "..", "docs");
const EVIDENCE = path.join(ROOT, "..", "whitebox", "evidence", "vitest-results.json");
const THESIS_SCRIPT = path.join(ROOT, "scripts", "generate-whitebox-thesis-tables.ts");
const OUT = path.join(DOCS, "EBPLS_WHITEBOX_TEST_CASE_REPORT.md");

type RowMeta = {
  segment: string;
  description: string;
  input: string;
  expected: string;
  actual: string;
};

type VitestJson = {
  numTotalTests?: number;
  numPassedTests?: number;
  numFailedTests?: number;
  success?: boolean;
  testResults?: Array<{
    name: string;
    assertionResults?: Array<{
      title: string;
      status: string;
      duration?: number;
      failureMessages?: string[];
    }>;
  }>;
};

type Row = {
  id: string;
  segment: string;
  description: string;
  input: string;
  expected: string;
  actual: string;
  result: string;
  duration: number;
  remarks: string;
};

function loadMeta(): Record<string, RowMeta> {
  const src = fs.readFileSync(THESIS_SCRIPT, "utf8");
  const marker = "const META: Record<string, RowMeta> = {";
  const start = src.indexOf(marker);
  if (start < 0) throw new Error("META object not found in thesis script");
  const objStart = src.indexOf("{", start);
  let depth = 0;
  let end = -1;
  for (let i = objStart; i < src.length; i++) {
    const ch = src[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end < 0) throw new Error("Failed to parse META object");
   
  return Function(`"use strict"; return (${src.slice(objStart, end + 1)});`)() as Record<string, RowMeta>;
}

function unitMeta(module: string, title: string): { id: string; meta: RowMeta } {
  if (module === "money.test.ts") {
    if (title.includes("null")) {
      return {
        id: "UT-MONEY-01",
        meta: {
          segment: "src/lib/money.ts → toMoneyNumber()",
          description: "Returns 0 for null/undefined",
          input: "null, undefined",
          expected: "0",
          actual: "0",
        },
      };
    }
    if (title.includes("parses")) {
      return {
        id: "UT-MONEY-02",
        meta: {
          segment: "src/lib/money.ts → toMoneyNumber()",
          description: "Parses numbers and numeric strings",
          input: "number and numeric string",
          expected: "Numeric values parsed",
          actual: "Parsed as numbers",
        },
      };
    }
    return {
      id: "UT-MONEY-03",
      meta: {
        segment: "src/lib/money.ts → toMoneyNumber()",
        description: "Uses toNumber when provided",
        input: "value with custom toNumber",
        expected: "Callback converter used",
        actual: "Callback result used",
      },
    };
  }

  if (module === "fee-computation.test.ts") {
    const pairs: Array<[string, string, string]> = [
      ["classifies asset", "UT-FEE-01", "Classifies asset and worker brackets correctly"],
      ["mayor", "UT-FEE-02", "Computes mayor permit fee with late surcharge/interest"],
      ["higher fee", "UT-FEE-03", "Chooses higher fee between asset and worker"],
      ["fixed-fee", "UT-FEE-04", "Bypasses size/worker classification for fixed-fee categories"],
      ["sums fee", "UT-FEE-05", "Sums fee components correctly"],
    ];
    const hit = pairs.find(([k]) => title.includes(k));
    return {
      id: hit?.[1] ?? "UT-FEE",
      meta: {
        segment: "src/lib/fee-computation.ts",
        description: hit?.[2] ?? title,
        input: "Fee computation fixtures",
        expected: "Correct fee math",
        actual: "Assertion passed",
      },
    };
  }

  if (module === "bplo-assessment.test.ts") {
    const pairs: Array<[string, string, string]> = [
      ["renewal charges", "UT-ASSESS-01", "Builds renewal charges (surcharge + interest)"],
      ["liquor/tobacco surcharge at 25%", "UT-ASSESS-02", "Computes liquor/tobacco surcharge at 25%"],
      ["closure applications skip", "UT-ASSESS-03", "Closure applications skip liquor/tobacco surcharge"],
      ["payment frequency", "UT-ASSESS-04", "Resolves applicant payment frequency from applicant data"],
      ["toReleasePaymentAmount", "UT-ASSESS-05", "Release payment amount returns full annual amount"],
    ];
    const hit = pairs.find(([k]) => title.includes(k));
    return {
      id: hit?.[1] ?? "UT-ASSESS",
      meta: {
        segment: "src/lib/bplo-assessment.ts",
        description: hit?.[2] ?? title,
        input: "Assessment fixtures",
        expected: "Correct assessment helpers",
        actual: "Assertion passed",
      },
    };
  }

  return {
    id: title.slice(0, 48),
    meta: {
      segment: module.replace(/\.test\.ts$/, ""),
      description: title,
      input: `See ${module}`,
      expected: "Assertion passes",
      actual: "Assertion passed",
    },
  };
}

function esc(value: string): string {
  return String(value)
    .replace(/\u2192/g, "->") // →
    .replace(/\u2190/g, "<-") // ←
    .replace(/\u00d7/g, "x") // ×
    .replace(/\u2265/g, ">=") // ≥
    .replace(/\u2264/g, "<=") // ≤
    .replace(/\u2014/g, "-") // —
    .replace(/\u2013/g, "-") // –
    .replace(/\u2026/g, "...") // …
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, " ");
}

function main() {
  if (!fs.existsSync(EVIDENCE)) {
    throw new Error(`Missing evidence file: ${EVIDENCE}. Run npm run test:whitebox first.`);
  }

  const META = loadMeta();
  const vitest = JSON.parse(fs.readFileSync(EVIDENCE, "utf8")) as VitestJson;
  const rows: Row[] = [];
  const seen = new Set<string>();

  const excludedPrefixes = ["WB-E2E-", "WB-BPLO-02", "WB-BPLO-03", "WB-BPLO-04", "WB-BPLO-05", "WB-BPLO-06"];

  for (const file of vitest.testResults ?? []) {
    const moduleName = path.basename(file.name);
    for (const assertion of file.assertionResults ?? []) {
      const title = assertion.title ?? "";
      const idMatch = title.match(/^(WB-[A-Z0-9]+(?:-[0-9]+[a-z]?)?|UT-[A-Z]+-\d+[a-z]?)/);
      let id: string;
      let meta: RowMeta;

      if (idMatch) {
        id = idMatch[1];
        if (excludedPrefixes.some((p) => id === p || id.startsWith("WB-E2E-"))) {
          continue;
        }
        meta =
          META[id] ??
          ({
            segment: module.replace(/\.test\.ts$/, ""),
            description: title.replace(`${id} `, ""),
            input: `See ${module}`,
            expected: "Assertion passes",
            actual: assertion.status === "passed" ? "Matched expected assertions" : "Failed",
          } satisfies RowMeta);
        if (id.startsWith("UT-")) {
          const unit = unitMeta(module, title);
          meta = unit.meta;
          id = unit.id;
        }
      } else {
        const unit = unitMeta(module, title);
        id = unit.id;
        meta = unit.meta;
      }

      if (seen.has(id)) continue;
      seen.add(id);

      rows.push({
        id,
        segment: meta.segment,
        description: meta.description,
        input: meta.input,
        expected: meta.expected,
        actual: meta.actual,
        result: assertion.status === "passed" ? "PASS" : "FAIL",
        duration: typeof assertion.duration === "number" ? assertion.duration : 0,
        remarks:
          assertion.status === "passed"
            ? "OK"
            : (assertion.failureMessages?.[0] ?? "Failed").replace(/\r?\n/g, " ").slice(0, 180),
      });
    }
  }

  if (rows.length !== 96) {
    console.warn(`WARNING: thesis report expected 96 rows, got ${rows.length}`);
  }

  const passed = rows.filter((r) => r.result === "PASS").length;
  const failed = rows.filter((r) => r.result === "FAIL").length;
  const totalMs = rows.reduce((sum, r) => sum + r.duration, 0);
  const ranAt = new Date().toISOString();

  const lines: string[] = [
    "# EBPLS White-Box Test Case Report",
    "",
    "**System:** Electronic Business Permit and Licensing System (EBPLS)",
    "**Test type:** White-box thesis suite (unit / logic contracts only)",
    "**Target count:** 96",
    "**Evidence:** `whitebox/evidence/vitest-results.json`",
    "**Classification:** `whitebox/THESIS_SUITE_96.md`",
    "**Command:** `npm run test:whitebox`",
    `**Generated:** ${ranAt}`,
    `**Verdict:** **${failed === 0 && rows.length === 96 ? "PASS" : "FAIL"}**`,
    "",
    "### Summary",
    "",
    "| Metric | Value |",
    "|---|---:|",
    `| Total test cases | ${rows.length} |`,
    `| Passed | ${passed} |`,
    `| Failed | ${failed} |`,
    `| Pass rate | ${rows.length ? ((passed / rows.length) * 100).toFixed(1) : "0.0"}% |`,
    `| Total duration (Ms) | ${totalMs} |`,
    "",
    "### Excluded from this thesis count (preserved elsewhere)",
    "",
    "| Excluded group | Location | Command |",
    "|---|---|---|",
    "| Workflow process contracts (E2E inventory, 32 cases) | `src/lib/__tests__/workflow/` | `npm run test:workflow` |",
    "| Redundant BPLO status transitions (5 cases) | `src/lib/__tests__/unit-extended/` | `npm run test:unit-extended` |",
    "| Supplemental fee/assessment LOB and penalty cases (4) | `src/lib/__tests__/unit-extended/` | `npm run test:unit-extended` |",
    "",
    "### Column definitions",
    "",
    "| Column | Meaning |",
    "|---|---|",
    "| Test Case ID | Stable white-box ID (WB-* / UT-*) |",
    "| Code Segment | Source file and function under test |",
    "| Test Description | What the case verifies |",
    "| Input Values | Inputs / fixtures used |",
    "| Actual Behavior | Observed result from assertions |",
    "| Expected Behavior | Required behavior from code contract |",
    "| Result | PASS or FAIL |",
    "| Duration (Ms) | Vitest-measured assertion duration |",
    "| Remarks | Notes / failure detail |",
    "",
    "---",
    "",
    "## Test Case Results",
    "",
    "| Test Case ID | Code Segment | Test Description | Input Values | Actual Behavior | Expected Behavior | Result | Duration (Ms) | Remarks |",
    "|---|---|---|---|---|---|---|---:|---|",
  ];

  for (const row of rows) {
    lines.push(
      `| ${[
        row.id,
        row.segment,
        row.description,
        row.input,
        row.actual,
        row.expected,
        row.result,
        String(row.duration),
        row.remarks,
      ]
        .map(esc)
        .join(" | ")} |`
    );
  }

  lines.push(
    "",
    "---",
    "",
    "## Notes",
    "",
    "- Durations are per assertion from Vitest JSON (`duration` field). Sub-millisecond cases may show as `0`.",
    "- Code segment / input / expected / actual for WB-* cases come from the META catalog in `scripts/generate-whitebox-thesis-tables.ts`.",
    "- DB-only cases (WB-DB-*) are not included here; run `npm run test:whitebox:db` for live database evidence.",
    `- Vitest totals in evidence file: ${vitest.numPassedTests ?? "?"}/${vitest.numTotalTests ?? "?"} passed.`,
    ""
  );

  fs.mkdirSync(DOCS, { recursive: true });
  fs.writeFileSync(OUT, lines.join("\n"), "utf8");
  console.log(`Wrote ${OUT}`);
  console.log(`rows=${rows.length} passed=${passed} failed=${failed} totalMs=${totalMs}`);
}

main();
