/**
 * Scan-only reconciliation: 174 documented TC rows vs existing Vitest it()/test() blocks.
 * Does NOT create or modify tests.
 *
 * Run: npx tsx scripts/scan-whitebox-174.ts
 * Output: ../docs/WHITEBOX_174_SCAN_REPORT.md
 */
/// <reference types="node" />

import fs from "node:fs";
import path from "node:path";

/** Package root (EBPLS). Prefer cwd so this stays CJS/ESM-safe under tsx. */
const ROOT = process.cwd().endsWith(`${path.sep}scripts`)
  ? path.resolve(process.cwd(), "..")
  : process.cwd();
const DOC = path.join(ROOT, "..", "docs", "re-run this test.md");
const VITEST_JSON = path.join(ROOT, "..", "whitebox", "evidence", "vitest-results.json");
const OUT = path.join(ROOT, "..", "docs", "WHITEBOX_174_SCAN_REPORT.md");

type DocRow = { no: number; id: string; desc: string; segment: string };
type Match = {
  vitestTitle: string;
  file: string;
  found: "YES" | "NO";
  executed: "YES" | "NO";
  result: "PASS" | "FAIL" | "SKIPPED" | "NOT FOUND" | "NOT EXECUTED";
  note?: string;
};

function parseDoc(): DocRow[] {
  const md = fs.readFileSync(DOC, "utf8");
  const rows: DocRow[] = [];
  for (const line of md.split(/\r?\n/)) {
    const m = line.match(/^\|\s*(TC-[A-Z0-9-]+)\s*\|\s*([^|]*)\|\s*([^|]*)\|/);
    if (!m) continue;
    rows.push({ no: rows.length + 1, id: m[1].trim(), segment: m[2].trim(), desc: m[3].trim() });
  }
  return rows;
}

/** Ordered matching: each Vitest title can be consumed once (except intentional multi-use for documented duplicates). */
function buildMatchPlan(docs: DocRow[]): Match[] {
  // Primary 1:1 map for unique TC rows → WB/UT titles (substring match)
  const primary: Record<string, { title: string; file: string; once?: boolean }> = {
    "TC-RATE-01": { title: "WB-RATE-01", file: "wb-rate-limit.test.ts" },
    "TC-RATE-02": { title: "WB-RATE-02", file: "wb-rate-limit.test.ts" },
    "TC-RATE-03": { title: "WB-RATE-03", file: "wb-rate-limit.test.ts" },
    "TC-RATE-04": { title: "WB-RATE-04", file: "wb-rate-limit.test.ts" },
    "TC-RBAC-05": { title: "WB-RBAC-01", file: "wb-rbac.test.ts" },
    "TC-RBAC-06": { title: "WB-RBAC-02", file: "wb-rbac.test.ts" },
    "TC-RBAC-07": { title: "WB-RBAC-03", file: "wb-rbac.test.ts" },
    "TC-RBAC-08": { title: "WB-RBAC-04", file: "wb-rbac.test.ts" },
    "TC-RBAC-09": { title: "WB-RBAC-05", file: "wb-rbac.test.ts" },
    "TC-RBAC-10": { title: "WB-RBAC-06", file: "wb-rbac.test.ts" },
    "TC-RBAC-11": { title: "WB-RBAC-07", file: "wb-rbac.test.ts" },
    "TC-UTIL-12": { title: "WB-UTIL-02", file: "wb-utils.test.ts" },
    "TC-UTIL-13": { title: "WB-UTIL-03", file: "wb-utils.test.ts" },
    "TC-UTIL-14": { title: "WB-UTIL-04", file: "wb-utils.test.ts" },
    "TC-UTIL-20": { title: "WB-UTIL-05", file: "wb-utils.test.ts" },
    "TC-BPLO-24": { title: "WB-BPLO-01", file: "wb-bplo-review-contract.test.ts" },
    "TC-BPLO-25": { title: "WB-BPLO-02", file: "wb-bplo-review-contract.test.ts" },
    "TC-BPLO-26": { title: "WB-BPLO-03", file: "wb-bplo-review-contract.test.ts" },
    "TC-BPLO-27": { title: "WB-BPLO-04", file: "wb-bplo-review-contract.test.ts" },
    "TC-BPLO-28": { title: "WB-BPLO-05", file: "wb-bplo-review-contract.test.ts" },
    "TC-BPLO-29": { title: "WB-BPLO-06", file: "wb-bplo-review-contract.test.ts" },
    "TC-RULES-30": { title: "WB-RULES-01", file: "wb-business-rules.test.ts" },
    "TC-RULES-31": { title: "WB-RULES-02", file: "wb-business-rules.test.ts" },
    "TC-RULES-32": { title: "WB-RULES-03", file: "wb-business-rules.test.ts" },
    "TC-RULES-33": { title: "WB-RULES-04", file: "wb-business-rules.test.ts" },
    "TC-RULES-34": { title: "WB-RULES-05", file: "wb-business-rules.test.ts" },
    "TC-RULES-35": { title: "WB-RULES-06", file: "wb-business-rules.test.ts" },
    "TC-RULES-36": { title: "WB-RULES-07", file: "wb-business-rules.test.ts" },
    "TC-DOCVAL-37": { title: "WB-DOCVAL-01", file: "wb-document-validation.test.ts" },
    "TC-DOCVAL-38": { title: "WB-DOCVAL-02", file: "wb-document-validation.test.ts" },
    "TC-DOCVAL-39": { title: "WB-DOCVAL-03", file: "wb-document-validation.test.ts" },
    "TC-DOCVAL-40": { title: "WB-DOCVAL-04", file: "wb-document-validation.test.ts" },
    "TC-DOCVAL-41": { title: "WB-DOCVAL-05", file: "wb-document-validation.test.ts" },
    "TC-E2E-42": { title: "WB-E2E-00", file: "workflow/wb-e2e-processes.test.ts" },
    "TC-E2E-43": { title: "WB-E2E-01", file: "workflow/wb-e2e-processes.test.ts" },
    "TC-E2E-44": { title: "WB-E2E-02", file: "workflow/wb-e2e-processes.test.ts" },
    "TC-E2E-45": { title: "WB-E2E-03", file: "workflow/wb-e2e-processes.test.ts" },
    "TC-E2E-46": { title: "WB-E2E-04", file: "workflow/wb-e2e-processes.test.ts" },
    "TC-E2E-47": { title: "WB-E2E-05", file: "workflow/wb-e2e-processes.test.ts" },
    "TC-E2E-48": { title: "WB-E2E-06", file: "workflow/wb-e2e-processes.test.ts" },
    "TC-E2E-49": { title: "WB-E2E-07", file: "workflow/wb-e2e-processes.test.ts" },
    "TC-E2E-50": { title: "WB-E2E-08", file: "workflow/wb-e2e-processes.test.ts" },
    "TC-E2E-51": { title: "WB-E2E-09", file: "workflow/wb-e2e-processes.test.ts" },
    "TC-E2E-52": { title: "WB-E2E-10", file: "workflow/wb-e2e-processes.test.ts" },
    "TC-E2E-53": { title: "WB-E2E-11", file: "workflow/wb-e2e-processes.test.ts" },
    "TC-E2E-54": { title: "WB-E2E-12", file: "workflow/wb-e2e-processes.test.ts" },
    "TC-E2E-55": { title: "WB-E2E-13", file: "workflow/wb-e2e-processes.test.ts" },
    "TC-E2E-56": { title: "WB-E2E-14", file: "workflow/wb-e2e-processes.test.ts" },
    "TC-E2E-57": { title: "WB-E2E-15", file: "workflow/wb-e2e-processes.test.ts" },
    "TC-E2E-58": { title: "WB-E2E-16", file: "workflow/wb-e2e-processes.test.ts" },
    "TC-E2E-59": { title: "WB-E2E-17", file: "workflow/wb-e2e-processes.test.ts" },
    "TC-E2E-60": { title: "WB-E2E-18", file: "workflow/wb-e2e-processes.test.ts" },
    "TC-E2E-61": { title: "WB-E2E-19", file: "workflow/wb-e2e-processes.test.ts" },
    "TC-E2E-62": { title: "WB-E2E-24", file: "workflow/wb-e2e-processes.test.ts" },
    "TC-E2E-63": { title: "WB-E2E-25", file: "workflow/wb-e2e-processes.test.ts" },
    "TC-E2E-64": { title: "WB-E2E-26", file: "workflow/wb-e2e-processes.test.ts" },
    "TC-E2E-65": { title: "WB-E2E-27", file: "workflow/wb-e2e-processes.test.ts" },
    "TC-E2E-66": { title: "WB-E2E-28", file: "workflow/wb-e2e-processes.test.ts" },
    "TC-E2E-67": { title: "WB-E2E-29", file: "workflow/wb-e2e-processes.test.ts" },
    "TC-E2E-68": { title: "WB-E2E-30", file: "workflow/wb-e2e-processes.test.ts" },
    "TC-E2E-69": { title: "WB-E2E-31", file: "workflow/wb-e2e-processes.test.ts" },
    "TC-E2E-70": { title: "WB-E2E-32", file: "workflow/wb-e2e-processes.test.ts" },
    "TC-E2E-71": { title: "WB-E2E-33", file: "workflow/wb-e2e-processes.test.ts" },
    "TC-E2E-72": { title: "WB-E2E-34", file: "workflow/wb-e2e-processes.test.ts" },
    "TC-E2E-73": { title: "WB-E2E-35", file: "workflow/wb-e2e-processes.test.ts" },
    "TC-ELIG-74": { title: "WB-ELIG-01", file: "wb-eligibility.test.ts" },
    "TC-ELIG-75": { title: "WB-ELIG-03 flagged unsettled", file: "wb-eligibility.test.ts" },
    "TC-ELIG-76": { title: "WB-ELIG-03a", file: "wb-eligibility.test.ts" },
    "TC-ELIG-77": { title: "WB-ELIG-03b", file: "wb-eligibility.test.ts" },
    "TC-ELIG-78": { title: "WB-ELIG-04", file: "wb-eligibility.test.ts" },
    "TC-ELIG-79": { title: "WB-ELIG-02", file: "wb-eligibility.test.ts" },
    "TC-ASSESS-95": { title: "builds renewal charges", file: "bplo-assessment.test.ts" },
    "TC-ASSESS-96": { title: "computes liquor/tobacco surcharge at 25%", file: "bplo-assessment.test.ts" },
    "TC-ASSESS-97": { title: "resolves applicant payment frequency", file: "bplo-assessment.test.ts" },
    "TC-ASSESS-98": { title: "toReleasePaymentAmount", file: "bplo-assessment.test.ts" },
    "TC-MAP-122": { title: "WB-MAP-01", file: "wb-application-mappers.test.ts" },
    "TC-MAP-123": { title: "WB-MAP-02", file: "wb-application-mappers.test.ts" },
    "TC-GEO-124": { title: "WB-GEO-01", file: "wb-payment-print-geo.test.ts" },
    "TC-ADDR-125": { title: "WB-ADDR-01", file: "wb-payment-print-geo.test.ts" },
    "TC-RPT-132": { title: "WB-RPT-01", file: "wb-copy-reports.test.ts" },
    "TC-NARR-133": { title: "WB-NARR-01", file: "wb-copy-reports.test.ts" },
    "TC-RESUB-134": { title: "WB-RESUB-01", file: "wb-copy-reports.test.ts" },
    "TC-DOCS-135": { title: "WB-DOCS-01", file: "wb-required-documents.test.ts" },
    "TC-DOCS-136": { title: "WB-DOCS-02", file: "wb-required-documents.test.ts" },
    "TC-DOCS-137": { title: "WB-DOCS-03", file: "wb-required-documents.test.ts" },
    "TC-DOCS-138": { title: "WB-DOCS-06", file: "wb-required-documents.test.ts" },
    "TC-DOCS-139": { title: "WB-DOCS-05", file: "wb-required-documents.test.ts" },
    "TC-DOCS-140": { title: "WB-DOCS-04", file: "wb-required-documents.test.ts" },
    "TC-DOCS-141": { title: "WB-DOCS-07", file: "wb-required-documents.test.ts" },
    "TC-STATUS-142": { title: "WB-STATUS-02", file: "wb-status-machine.test.ts" },
    "TC-STATUS-143": { title: "WB-STATUS-05", file: "wb-status-machine.test.ts" },
    "TC-STATUS-144": { title: "WB-STATUS-04", file: "wb-status-machine.test.ts" },
    "TC-STATUS-145": { title: "WB-STATUS-03", file: "wb-status-machine.test.ts" },
    "TC-STATUS-146": { title: "WB-STATUS-07", file: "wb-status-machine.test.ts" },
    "TC-STATUS-147": { title: "WB-STATUS-02", file: "wb-status-machine.test.ts" }, // release in primary pipeline
    "TC-STATUS-148": { title: "WB-STATUS-03", file: "wb-status-machine.test.ts" },
    "TC-UPLOAD-149": { title: "WB-UPLOAD-01", file: "wb-upload-rules.test.ts" },
    "TC-UPLOAD-150": { title: "WB-UPLOAD-02", file: "wb-upload-rules.test.ts" },
    "TC-UPLOAD-151": { title: "WB-UPLOAD-03", file: "wb-upload-rules.test.ts" },
    "TC-UPLOAD-152": { title: "WB-UPLOAD-04", file: "wb-upload-rules.test.ts" },
    "TC-PAGE-153": { title: "WB-PAGE-01", file: "wb-pagination.test.ts" },
    "TC-PAGE-154": { title: "WB-PAGE-03", file: "wb-pagination.test.ts" },
    "TC-PAGE-155": { title: "WB-PAGE-02", file: "wb-pagination.test.ts" },
    "TC-PAGE-156": { title: "WB-PAGE-01", file: "wb-pagination.test.ts" },
    "TC-PAGE-157": { title: "WB-PAGE-04", file: "wb-pagination.test.ts" },
    "TC-PRINT-158": { title: "WB-PRINT-01", file: "wb-payment-print-geo.test.ts" },
    "TC-RATE-159": { title: "WB-RATE-01", file: "wb-rate-limit.test.ts" },
    "TC-RATE-160": { title: "WB-RATE-02", file: "wb-rate-limit.test.ts" },
    "TC-RATE-161": { title: "WB-RATE-03", file: "wb-rate-limit.test.ts" },
    "TC-RATE-162": { title: "WB-RATE-04", file: "wb-rate-limit.test.ts" },
    "TC-DOCS-163": { title: "WB-DOCS-01", file: "wb-required-documents.test.ts" },
    "TC-FEE-168": { title: "classifies asset and worker brackets", file: "fee-computation.test.ts" },
    "TC-FEE-169": { title: "late renewals", file: "fee-computation.test.ts" },
    "TC-FEE-170": { title: "higher fee", file: "fee-computation.test.ts" },
    "TC-FEE-171": { title: "fixed-fee", file: "fee-computation.test.ts" },
    "TC-FEE-172": { title: "sums fee components", file: "fee-computation.test.ts" },
    "TC-MONEY-173": { title: "returns 0 for null/undefined", file: "money.test.ts" },
    "TC-MONEY-174": { title: "parses numbers and numeric strings", file: "money.test.ts" },
    "TC-MONEY-175": { title: "uses toNumber when provided", file: "money.test.ts" },
    "TC-PAY-90": { title: "WB-PAY-01", file: "wb-payment-print-geo.test.ts" },
    "TC-JIT-105": { title: "WB-JIT-01", file: "wb-jit.test.ts" },
    "TC-JIT-106": { title: "WB-JIT-03", file: "wb-jit.test.ts" },
    "TC-JIT-107": { title: "WB-JIT-04", file: "wb-jit.test.ts" },
    "TC-JIT-108": { title: "WB-JIT-02", file: "wb-jit.test.ts" },
    "TC-NOTIF-117": { title: "WB-NOTIF-01", file: "wb-copy-reports.test.ts" },
    "TC-RULES-103": { title: "WB-RULES-06", file: "wb-business-rules.test.ts" },
    "TC-DOCVAL-104": { title: "WB-DOCVAL-04", file: "wb-document-validation.test.ts" },
  };

  // FILE rows by position (two TC-FILE-80)
  const fileTitles = [
    "WB-FILE-01",
    "WB-FILE-04", // reject unsupported — closest to second TC-FILE-80
    "WB-FILE-05",
    "WB-FILE-02",
    "WB-FILE-03",
    "WB-FILE-06",
  ];

  // DB cases: not Vitest — documented against scripts/whitebox-db-tests.ts
  const dbOnly = new Set(
    docs.filter((d) => d.id.startsWith("TC-DB-")).map((d) => d.id)
  );

  const vitestResults = loadVitestIndex();

  let fileIdx = 0;
  const out: Match[] = [];

  for (const row of docs) {
    // Special: TC-FILE-80×2 and TC-FILE-81..84 by order
    if (row.id.startsWith("TC-FILE-")) {
      const titleKey = fileTitles[fileIdx++] ?? "";
      const hit = findVitest(vitestResults, titleKey);
      out.push(hit ? passMatch(hit) : notFound(`expected ${titleKey}`));
      continue;
    }

    if (row.id.startsWith("TC-DB-")) {
      out.push({
        vitestTitle: "(none — DB script case)",
        file: "scripts/whitebox-db-tests.ts",
        found: "NO",
        executed: "NO",
        result: "NOT EXECUTED",
        note: "Documented DB white-box case; not a Vitest it()/test() block",
      });
      continue;
    }

    const map = primary[row.id];
    if (!map) {
      out.push(notFound("no Vitest mapping"));
      continue;
    }
    const hit = findVitest(vitestResults, map.title);
    if (!hit) {
      out.push(notFound(`pattern ${map.title} in ${map.file}`));
      continue;
    }
    out.push(passMatch(hit));
  }

  void dbOnly;
  return out;
}

type VHit = { title: string; file: string; status: string };

function loadVitestIndex(): VHit[] {
  if (!fs.existsSync(VITEST_JSON)) return [];
  const json = JSON.parse(fs.readFileSync(VITEST_JSON, "utf8")) as {
    testResults?: Array<{ name: string; assertionResults?: Array<{ title: string; status: string }> }>;
  };
  const hits: VHit[] = [];
  for (const f of json.testResults ?? []) {
    const file = path.basename(f.name);
    for (const a of f.assertionResults ?? []) {
      hits.push({ title: a.title, file, status: a.status });
    }
  }
  return hits;
}

function findVitest(index: VHit[], pattern: string): VHit | null {
  const p = pattern.trim();
  return index.find((h) => h.title.includes(p)) ?? null;
}

function passMatch(hit: VHit): Match {
  const executed = hit.status === "passed" || hit.status === "failed" || hit.status === "skipped";
  let result: Match["result"] = "NOT EXECUTED";
  if (hit.status === "passed") result = "PASS";
  else if (hit.status === "failed") result = "FAIL";
  else if (hit.status === "skipped" || hit.status === "pending") result = "SKIPPED";
  return {
    vitestTitle: hit.title,
    file: hit.file,
    found: "YES",
    executed: executed ? "YES" : "NO",
    result,
  };
}

function notFound(note: string): Match {
  return {
    vitestTitle: "—",
    file: "—",
    found: "NO",
    executed: "NO",
    result: "NOT FOUND",
    note,
  };
}

function main() {
  const docs = parseDoc();
  if (docs.length !== 174) {
    console.error(`Expected 174 documented rows, found ${docs.length}`);
  }
  const matches = buildMatchPlan(docs);

  const foundYes = matches.filter((m) => m.found === "YES").length;
  const executedYes = matches.filter((m) => m.executed === "YES").length;
  const passed = matches.filter((m) => m.result === "PASS").length;
  const failed = matches.filter((m) => m.result === "FAIL").length;
  const skipped = matches.filter((m) => m.result === "SKIPPED").length;
  const notFound = matches.filter((m) => m.result === "NOT FOUND").length;
  const notExecuted = matches.filter((m) => m.result === "NOT EXECUTED").length;

  const unmatched = docs
    .map((d, i) => ({ d, m: matches[i]! }))
    .filter(({ m }) => m.found === "NO")
    .map(({ d, m }) => `- ${d.id} (row ${d.no}): ${d.desc} — ${m.note ?? m.result}`);

  const idCounts: Record<string, number> = {};
  for (const d of docs) idCounts[d.id] = (idCounts[d.id] ?? 0) + 1;
  const dups = Object.entries(idCounts).filter(([, n]) => n > 1);

  const vitestTotal = loadVitestIndex().length;

  const lines: string[] = [];
  lines.push(`# White-Box Scan Report — 174 Documented Cases`);
  lines.push(``);
  lines.push(`**Mode:** SCAN ONLY (no tests created, modified, added, or removed)`);
  lines.push(`**Source doc:** \`docs/re-run this test.md\` (${docs.length} rows)`);
  lines.push(`**Vitest run:** \`npm run test:whitebox\` → evidence \`whitebox/evidence/vitest-results.json\``);
  lines.push(`**Vitest assertion count in JSON:** ${vitestTotal}`);
  lines.push(``);
  lines.push(`## Per-case reconciliation (exactly ${docs.length} rows)`);
  lines.push(``);
  lines.push(`| No. | Test Case ID | Test Description | Matching Vitest Test | Source Test File | Found | Executed | Result |`);
  lines.push(`|---:|---|---|---|---|---|---|---|`);
  for (let i = 0; i < docs.length; i++) {
    const d = docs[i]!;
    const m = matches[i]!;
    lines.push(
      `| ${d.no} | ${d.id} | ${d.desc.replace(/\|/g, "/")} | ${m.vitestTitle.replace(/\|/g, "/")} | ${m.file} | ${m.found} | ${m.executed} | ${m.result} |`
    );
  }

  lines.push(``);
  lines.push(`## FINAL REPORT`);
  lines.push(``);
  lines.push(`1. **Total documented White-Box test cases:** ${docs.length}`);
  lines.push(`2. **Total matching tests found in Vitest source (Found=YES):** ${foundYes}`);
  lines.push(`3. **Total documented cases executed by Vitest (Executed=YES):** ${executedYes}`);
  lines.push(`4. **Total passed:** ${passed}`);
  lines.push(`5. **Total failed:** ${failed}`);
  lines.push(`6. **Total skipped:** ${skipped}`);
  lines.push(`7. **Total documented cases with Found=NO (no Vitest it()/test()):** ${docs.length - foundYes} (Result=NOT EXECUTED for all ${notExecuted} DB-script rows; Result=NOT FOUND: ${notFound})`);
  lines.push(`8. **List of unmatched documented test cases (Found=NO):**`);
  lines.push(``);
  lines.push(...unmatched);
  lines.push(``);
  lines.push(`9. **Duplicate Test Case IDs detected (preserved as separate rows):**`);
  for (const [id, n] of dups) lines.push(`   - \`${id}\` appears **${n}** times`);
  lines.push(``);
  lines.push(`10. **Explanation of 174 documented rows vs Vitest count (~133):**`);
  lines.push(``);
  lines.push(`- Vitest currently executes **${vitestTotal}** \`it()\`/\`test()\` assertions across 20 files.`);
  lines.push(`- The documentation has **174 rows**, including:`);
  lines.push(`  - **${docs.filter((d) => d.id.startsWith("TC-DB-")).length}** \`TC-DB-*\` rows that map to \`scripts/whitebox-db-tests.ts\` (Prisma/DB script), **not** Vitest — counted as Found=NO / Executed=NO / NOT EXECUTED for Vitest.`);
  lines.push(`  - Documented **duplicate IDs** (\`TC-FILE-80\`×2, \`TC-DB-RENEW-92\`×2) as separate rows.`);
  lines.push(`  - Documented **re-stated** Vitest cases (e.g. \`TC-RATE-159..162\` reuses \`WB-RATE-01..04\`; \`TC-DOCS-163\` reuses \`WB-DOCS-01\`; \`TC-RULES-103\` / \`TC-DOCVAL-104\` reuse earlier RULES/DOCVAL tests).`);
  lines.push(`  - Some Vitest tests exist but are **not listed** as separate TC rows in the 174 (e.g. \`WB-UTIL-01\`, \`WB-UTIL-06\`, \`WB-ELIG-05..07\`, \`WB-JIT-05\`, \`WB-STATUS-01/06\`, \`WB-PAGE-05\`, liquor CLOSURE surcharge \`it()\`, etc.) — scan-only mode does not invent documentation rows for them.`);
  lines.push(`- Therefore: **174 ≠ 133** because the doc mixes Vitest cases, DB-script cases, and intentional duplicate/restated rows; Vitest alone does not own all 174 rows.`);
  lines.push(``);
  lines.push(`*Generated by scan script — documentation left at exactly 174 rows.*`);

  fs.writeFileSync(OUT, lines.join("\n"), "utf8");
  console.log(`Wrote ${OUT}`);
  console.log({ documented: docs.length, foundYes, executedYes, passed, failed, skipped, notFound, notExecuted, vitestTotal });
}

main();
