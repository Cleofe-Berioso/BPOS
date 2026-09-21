import { describe, expect, it } from "vitest";
import {
  parseDateRangeStart,
  parseDateRangeEnd,
  formatReportDateRange,
  formatReportCurrency,
  formatReportDate,
  formatMonthYearLabel,
  monthYearToDateRange,
  reportPercentOf,
  resolveReportMonthYear,
  labelApplicationType,
  labelBusinessStatus,
  labelPermitStatus,
  maskPhoneNumber,
  buildReportMetadata,
  buildMonthlyReportMetadata,
} from "@/lib/printable-reports";
import {
  REPORT_PURPOSES,
  buildApplicationReportNarrative,
  buildRegistryReportNarrative,
  buildClosureReportNarrative,
  buildInspectionReportNarrative,
  buildAuditTrailReportNarrative,
  buildSmsReportNarrative,
  buildMonthlySummaryNarrative,
} from "@/lib/report-narrative-builders";
import {
  isReturnedCorrectionResubmission,
  getApplicationSubmitButtonLabel,
  getApplicationSubmitSuccessMessage,
  getResubmissionConfirmMessage,
} from "@/lib/resubmission-copy";
import {
  buildDefaultFindings,
  buildNoPermitSmsMessage,
  buildNoPermitEmailSubject,
  resolveInspectingOfficeLabel,
} from "@/lib/jit-no-permit-ticket-copy";
import { buildReleaseSmsMessage } from "@/lib/sms";

describe("WB-COPY — reports, narratives, notifications, resubmit", () => {
  it("WB-RPT-01 printable report date/currency/label helpers", () => {
    expect(parseDateRangeStart("2026-01-15")?.toISOString()).toBe("2026-01-15T00:00:00.000Z");
    expect(parseDateRangeEnd("2026-01-15")?.toISOString()).toBe("2026-01-15T23:59:59.999Z");
    expect(parseDateRangeStart("")).toBeUndefined();
    expect(formatReportDateRange()).toBe("All dates");
    expect(formatReportCurrency(1234.5)).toMatch(/₱/);
    expect(formatReportDate(null)).toBe("-");
    expect(formatMonthYearLabel(8, 2026)).toMatch(/August/);
    const range = monthYearToDateRange(2, 2024);
    expect(range.end.getUTCDate()).toBe(29);
    expect(reportPercentOf(1, 4)).toBe("25%");
    expect(reportPercentOf(1, 0)).toBe("0%");
    expect(resolveReportMonthYear({ month: "8", year: "2026" })).toEqual({ month: 8, year: 2026 });
    expect(labelApplicationType("NEW")).toBe("New");
    expect(labelBusinessStatus("ACTIVE")).toBe("Active");
    expect(labelPermitStatus("RELEASED")).toBe("Released");
    expect(maskPhoneNumber("09171234321")).toBe("0917****321");
    expect(maskPhoneNumber(null)).toBe("-");

    const meta = buildReportMetadata({
      title: "Apps",
      generatedBy: "Admin",
      dateFrom: "2026-01-01",
      dateTo: "2026-01-31",
    });
    expect(meta.title).toBe("Apps");
    expect(meta.municipality).toContain("Magalona");
    const monthly = buildMonthlyReportMetadata({
      title: "Monthly",
      generatedBy: "Admin",
      month: 8,
      year: 2026,
    });
    expect(monthly.dateRange).toMatch(/August/);
  });

  it("WB-NARR-01 report narratives empty vs populated", () => {
    expect(Object.keys(REPORT_PURPOSES)).toHaveLength(7);

    const emptyApp = buildApplicationReportNarrative({
      total: 0,
      totalNew: 0,
      totalRenewal: 0,
      totalClosure: 0,
      totalReleased: 0,
      dateRange: "All dates",
    });
    expect(emptyApp.paragraphs[0]).toMatch(/No application/);

    const filledApp = buildApplicationReportNarrative({
      total: 10,
      totalNew: 6,
      totalRenewal: 4,
      totalClosure: 0,
      totalReleased: 7,
      dateRange: "January 2026",
    });
    expect(filledApp.bullets.length).toBeGreaterThan(1);

    expect(
      buildRegistryReportNarrative({
        total: 0,
        activeCount: 0,
        inactiveCount: 0,
        closedCount: 0,
        withPermit: 0,
      }).paragraphs[0]
    ).toMatch(/No business registry/);

    expect(
      buildRegistryReportNarrative({
        total: 5,
        activeCount: 3,
        inactiveCount: 1,
        closedCount: 1,
        withPermit: 4,
      }).bullets
    ).toHaveLength(4);

    expect(
      buildClosureReportNarrative({
        total: 2,
        releasedCount: 1,
        pendingCount: 1,
        dateRange: "All dates",
      }).bullets.length
    ).toBeGreaterThan(0);

    expect(
      buildInspectionReportNarrative({
        total: 4,
        totalCompliant: 2,
        totalNonCompliant: 1,
        totalPendingReview: 0,
        pendingVerification: 1,
        dateRange: "All dates",
      }).bullets.length
    ).toBeGreaterThan(3);

    expect(buildAuditTrailReportNarrative({ total: 0, dateRange: "All dates" }).paragraphs[0]).toMatch(
      /No audit/
    );
    expect(
      buildSmsReportNarrative({
        total: 3,
        sent: 2,
        failed: 1,
        skipped: 0,
        dateRange: "All dates",
      }).bullets
    ).toHaveLength(3);

    const monthly = buildMonthlySummaryNarrative({
      periodLabel: "August 2026",
      applicationsSubmitted: 5,
      permitsReleased: 2,
      closureCertificatesReleased: 0,
      inspectionsConducted: 1,
      verifiedPayments: 2,
      paymentAmount: 1000,
      bploActions: 3,
      newUsers: 1,
      releasedApplications: 2,
      returnedForCorrection: 1,
    });
    expect(monthly.bullets.some((b) => /returned for correction/i.test(b))).toBe(true);
  });

  it("WB-RESUB-01 / TC-RESUB-01 resubmission copy helpers", () => {
    expect(
      isReturnedCorrectionResubmission({ editId: "x", applicationStatus: "Returned for Correction" })
    ).toBe(true);
    expect(isReturnedCorrectionResubmission({ editId: null, applicationStatus: "Returned for Correction" })).toBe(
      false
    );
    expect(getApplicationSubmitButtonLabel("NEW", true)).toBe("Resubmit Application");
    expect(getApplicationSubmitButtonLabel("RENEWAL", false)).toBe("Submit Renewal");
    expect(getApplicationSubmitButtonLabel("CLOSURE", false)).toBe("Submit Closure");
    expect(getApplicationSubmitSuccessMessage("NEW", false, "APP-1")).toContain("APP-1");
    expect(getApplicationSubmitSuccessMessage("RENEWAL", true, "APP-1")).toMatch(/resubmitted/i);
    expect(getApplicationSubmitSuccessMessage("CLOSURE", true, "APP-1")).toMatch(/resubmitted/i);
    expect(getResubmissionConfirmMessage("NEW")).toMatch(/resubmit/i);
    expect(getResubmissionConfirmMessage("RENEWAL")).toMatch(/resubmit/i);
    expect(getResubmissionConfirmMessage("CLOSURE")).toMatch(/resubmit/i);
  });

  it("WB-NOTIF-01 no-permit / sms copy", () => {
    expect(buildDefaultFindings({ lineOfBusiness: "Retail" })).toContain("Retail");
    expect(buildNoPermitSmsMessage({ ticketNumber: "T-1", businessName: "Store" })).toContain("T-1");
    expect(buildNoPermitEmailSubject("T-1")).toContain("T-1");
    expect(resolveInspectingOfficeLabel()).toMatch(/Magalona/);

    // TC-SMS-RELEASE-01 (copy contract): FOR_RELEASE SMS body includes applicant, business, ref.
    const releaseSms = buildReleaseSmsMessage({
      applicantName: "Juan Dela Cruz",
      businessName: "Juan Store",
      applicationNumber: "APP-2026-001",
      status: "FOR_RELEASE",
    });
    expect(releaseSms).toContain("APP-2026-001");
    expect(releaseSms).toContain("FOR_RELEASE");
    expect(releaseSms).toMatch(/BPLO release instructions/i);
  });
});
