import Link from "next/link";
import { superadminSummaryRowClass } from "@/components/superadmin/superadmin-ui-styles";
import { EmptyState } from "@/components/ui/empty-state";
import { RoleBadge } from "@/components/ui/role-badge";
import { SectionCard } from "@/components/ui/section-card";
import { StatCard } from "@/components/ui/stat-card";
import { SuperAdminReportExportCard } from "@/components/superadmin/superadmin-report-export-card";
import { MunicipalDocumentHeader, IT_DEPARTMENT_HEADING } from "@/components/ui/municipal-document-header";
import { listSuperAdminBusinessLocations } from "@/lib/business-location";
import { getSuperAdminReportsSummary } from "@/lib/superadmin-data";
import { formatReportTimestamp } from "@/lib/printable-reports";

function percentOf(part: number, whole: number): string {
  if (whole <= 0) return "0%";
  return `${Math.round((part / whole) * 1000) / 10}%`;
}

function statusInterpretation(status: string, count: number, total: number): string {
  const share = percentOf(count, total);
  switch (status) {
    case "Submitted":
      return `${share} waiting for BPLO to start review`;
    case "Under Review":
      return `${share} actively with BPLO reviewers`;
    case "Returned for Correction":
      return `${share} waiting on applicant corrections`;
    case "Department Head Review":
      return `${share} awaiting Department Head decision`;
    case "Department Head Approved":
      return `${share} ready for fee assessment`;
    case "Assessed":
      return `${share} assessed and moving toward payment`;
    case "Approved for Payment":
      return `${share} waiting for applicant payment / OR proof`;
    case "Paid":
      return `${share} paid and preparing for release`;
    case "For Release":
      return `${share} queued for permit / certificate release`;
    case "Released":
      return `${share} completed through release`;
    case "Rejected":
      return `${share} closed as rejected`;
    case "Revoked":
      return `${share} revoked permits — still relevant for closure follow-up`;
    case "Revocation Review":
      return `${share} under revocation decision`;
    default:
      return `${share} of all applications`;
  }
}

export default async function SuperAdminReportsPage() {
  const [reports, locationRows] = await Promise.all([
    getSuperAdminReportsSummary(),
    listSuperAdminBusinessLocations(),
  ]);
  const totalNew = reports.applicationsByType.find((row) => row.type === "NEW")?.count ?? 0;
  const totalRenewal = reports.applicationsByType.find((row) => row.type === "RENEWAL")?.count ?? 0;
  const totalClosure = reports.applicationsByType.find((row) => row.type === "CLOSURE")?.count ?? 0;
  const totalTyped = totalNew + totalRenewal + totalClosure;
  const totalByStatus = reports.applicationsByStatus.reduce((sum, row) => sum + row.count, 0);
  const pendingReview =
    (reports.applicationsByStatus.find((row) => row.status === "Submitted")?.count ?? 0) +
    (reports.applicationsByStatus.find((row) => row.status === "Under Review")?.count ?? 0);
  const returnedCount =
    reports.applicationsByStatus.find((row) => row.status === "Returned for Correction")?.count ?? 0;
  const releasedCount =
    reports.applicationsByStatus.find((row) => row.status === "Released")?.count ?? 0;
  const revokedCount =
    reports.applicationsByStatus.find((row) => row.status === "Revoked")?.count ?? 0;
  const generatedAt = formatReportTimestamp(new Date());

  const verifiedLocations = locationRows.filter((row) => row.status === "VERIFIED").length;
  const pendingLocations = locationRows.filter((row) => row.status === "PENDING").length;
  const needsCorrectionLocations = locationRows.filter((row) => row.status === "NEEDS_CORRECTION").length;

  return (
    <section className="ui-page-stack pb-12">
      <MunicipalDocumentHeader
        heading={{
          ...IT_DEPARTMENT_HEADING,
          title: "System Reports Hub",
        }}
        subtitle="Official municipal reporting for Business Permit Online System oversight. Summaries explain workload meaning; printable reports support audit and management briefings."
        titleTone="official"
        meta={
          <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-center sm:gap-4">
            <RoleBadge roleType="VIEW_ONLY" label="Read-Only Reports" />
            <span>
              Generated at: <strong>{generatedAt}</strong>
            </span>
          </div>
        }
      />

      <SectionCard
        title="Executive brief"
        description="A short reading of the current municipal permit system — designed for IT and management, not a raw dump of totals."
      >
        <div className="space-y-3 text-sm leading-6 text-[var(--ink-muted)]">
          <p>
            <strong className="text-[var(--foreground)]">Filing mix:</strong>{" "}
            {totalTyped > 0
              ? `${totalNew.toLocaleString("en-PH")} new (${percentOf(totalNew, totalTyped)}), ${totalRenewal.toLocaleString("en-PH")} renewal (${percentOf(totalRenewal, totalTyped)}), and ${totalClosure.toLocaleString("en-PH")} closure (${percentOf(totalClosure, totalTyped)}).`
              : "No typed applications are recorded yet."}
          </p>
          <p>
            <strong className="text-[var(--foreground)]">Pipeline pressure:</strong>{" "}
            {pendingReview.toLocaleString("en-PH")} applications are still in BPLO submission/review stages
            {returnedCount > 0
              ? `, and ${returnedCount.toLocaleString("en-PH")} are waiting on applicant corrections.`
              : "."}
          </p>
          <p>
            <strong className="text-[var(--foreground)]">Completion signal:</strong>{" "}
            {releasedCount.toLocaleString("en-PH")} applications reached Released
            {totalByStatus > 0 ? ` (${percentOf(releasedCount, totalByStatus)} of status inventory)` : ""}.{" "}
            {reports.releasedPermits.toLocaleString("en-PH")} business permits and{" "}
            {reports.closureCertificates.toLocaleString("en-PH")} closure certificates are recorded as released documents.
          </p>
          <p>
            <strong className="text-[var(--foreground)]">Compliance follow-through:</strong>{" "}
            {revokedCount > 0
              ? `${revokedCount.toLocaleString("en-PH")} revoked applications appear in status inventory — confirm related businesses still appear in closure processing where required.`
              : "No revoked applications currently appear in the status inventory."}
          </p>
          <p>
            <strong className="text-[var(--foreground)]">Location integrity:</strong>{" "}
            {locationRows.length.toLocaleString("en-PH")} mapped business locations —{" "}
            {verifiedLocations.toLocaleString("en-PH")} verified, {pendingLocations.toLocaleString("en-PH")} pending,{" "}
            {needsCorrectionLocations.toLocaleString("en-PH")} needing correction.
          </p>
        </div>
      </SectionCard>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard
          title="Total New"
          value={totalNew.toLocaleString("en-PH")}
          subtitle={`${percentOf(totalNew, totalTyped)} — first-time registrations`}
          tone="blue"
        />
        <StatCard
          title="Total Renewal"
          value={totalRenewal.toLocaleString("en-PH")}
          subtitle={`${percentOf(totalRenewal, totalTyped)} — continuing businesses`}
          tone="amber"
        />
        <StatCard
          title="Total Closure"
          value={totalClosure.toLocaleString("en-PH")}
          subtitle={`${percentOf(totalClosure, totalTyped)} — exit / retirement filings`}
          tone="slate"
        />
        <StatCard
          title="Released Permits"
          value={reports.releasedPermits.toLocaleString("en-PH")}
          subtitle="Business permits marked RELEASED"
          tone="green"
        />
        <StatCard
          title="BPLO Activity Count"
          value={reports.bploActivityCount.toLocaleString("en-PH")}
          subtitle="History actions performed by BPLO actors"
          tone="slate"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard
          title="Applications by status — what it means"
          description="Each status share tells you where applicants are waiting and which office owns the next action."
        >
          {reports.applicationsByStatus.length === 0 ? (
            <EmptyState
              title="No records available yet"
              description="This section populates as applications are processed."
            />
          ) : (
            <div className="space-y-2">
              {reports.applicationsByStatus
                .filter((row) => row.count > 0)
                .map((row) => (
                  <div key={row.status} className={`${superadminSummaryRowClass} flex-col items-start gap-1 sm:flex-row sm:items-center`}>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-[var(--foreground)]">{row.status}</p>
                      <p className="ui-caption">{statusInterpretation(row.status, row.count, totalByStatus)}</p>
                    </div>
                    <span className="text-sm font-semibold tabular-nums text-[var(--foreground)]">
                      {row.count.toLocaleString("en-PH")}
                    </span>
                  </div>
                ))}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Applications by type — capacity implication"
          description="Use the mix to anticipate document load, fee assessment volume, and inspection demand."
        >
          {reports.applicationsByType.length === 0 ? (
            <EmptyState
              title="No records available yet"
              description="This section populates as application records are created."
            />
          ) : (
            <div className="space-y-2">
              {reports.applicationsByType.map((row) => {
                const meaning =
                  row.type === "NEW"
                    ? "Drives first-time verification, requirements validation, and map pinning."
                    : row.type === "RENEWAL"
                      ? "Drives recurring assessment, surcharge/interest checks, and renewal notices."
                      : "Drives closure documents, settlement, and certificate issuance.";
                return (
                  <div key={row.type} className={`${superadminSummaryRowClass} flex-col items-start gap-1 sm:flex-row sm:items-center`}>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-[var(--foreground)]">{row.type}</p>
                      <p className="ui-caption">
                        {percentOf(row.count, totalTyped)} of typed filings — {meaning}
                      </p>
                    </div>
                    <span className="text-sm font-semibold tabular-nums text-[var(--foreground)]">
                      {row.count.toLocaleString("en-PH")}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>
      </div>

      <SuperAdminReportExportCard />

      <SectionCard
        title="Printable system reports"
        description="Open a filtered official report when you need evidence, not just a dashboard glance. Each report uses numbered sections, narrative interpretation, detailed record tables, and direct CSV export."
      >
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <PrintableReportCard
            title="Monthly Executive Summary"
            purpose="Answer: What happened in a chosen month — filings, releases, inspections, and payments?"
            whenToUse="Monthly management briefings, IT oversight archives, and municipal reporting cycles."
            description="Pick month and year. Generates a multi-section summary with KPIs, filing mix, and compliance signals."
            href="/superadmin/reports/print/monthly-summary"
            csvHref="/api/superadmin/reports/export?reportType=monthly-summary"
            tone="green"
          />
          <PrintableReportCard
            title="Application Summary"
            purpose="Answer: How many filings exist, in what stage, and for whom?"
            whenToUse="Weekly IT / BPLO coordination, backlog briefings, audit sampling."
            description="All application records: type, status, owner, submitted and updated dates."
            href="/superadmin/reports/print/applications"
            csvHref="/api/superadmin/reports/export?reportType=applications"
            tone="blue"
          />
          <PrintableReportCard
            title="Business Registry"
            purpose="Answer: Which businesses are active, inactive, or closed?"
            whenToUse="Masterlist checks, revoked/inactive follow-up, GIS cross-check."
            description="Business records with permit number, validity, type, and current status."
            href="/superadmin/reports/print/business-registry"
            csvHref="/api/superadmin/reports/export?reportType=business-registry"
            tone="indigo"
          />
          <PrintableReportCard
            title="Business Closure"
            purpose="Answer: Which closures completed and which certificates were released?"
            whenToUse="Forced/revoked closure monitoring and certificate inventory."
            description="Closure applications with certificate status and released dates."
            href="/superadmin/reports/print/closures"
            csvHref="/api/superadmin/reports/export?reportType=closures"
            tone="amber"
          />
          <PrintableReportCard
            title="Inspection Compliance"
            purpose="Answer: What did JIT find and what did Department Head decide?"
            whenToUse="Compliance hearings, revocation readiness, inspection productivity."
            description="JIT inspection records: compliance status, inspector, and Department Head decisions."
            href="/superadmin/reports/print/inspections"
            csvHref="/api/superadmin/reports/export?reportType=inspections"
            tone="slate"
          />
          <PrintableReportCard
            title="Audit Trail"
            purpose="Answer: Who changed what, when, and with which remarks?"
            whenToUse="Incident review, accountability checks, security follow-up."
            description="System-wide actor actions across modules — role, action, entity, and status changes."
            href="/superadmin/reports/print/audit-trail"
            csvHref="/api/superadmin/reports/export?reportType=audit-trail"
            tone="purple"
          />
          <PrintableReportCard
            title="SMS Delivery Log"
            purpose="Answer: Did applicant notices actually send?"
            whenToUse="When dashboard shows SMS failures or applicants report missing alerts."
            description="SMS delivery records with masked phone numbers, provider, and delivery status."
            href="/superadmin/reports/print/sms"
            csvHref="/api/superadmin/reports/export?reportType=sms"
            tone="red"
          />
        </div>
      </SectionCard>
    </section>
  );
}

type CardTone = "blue" | "green" | "indigo" | "amber" | "slate" | "purple" | "red";

const cardToneStyles: Record<CardTone, { border: string; icon: string; title: string; btn: string }> = {
  blue: {
    border: "border-[var(--info)]",
    icon: "bg-[var(--info-soft)] text-[var(--info)]",
    title: "text-[var(--foreground)]",
    btn: "border-[var(--info)] bg-[var(--info)] hover:opacity-90 text-white",
  },
  green: {
    border: "border-[var(--success)]",
    icon: "bg-[var(--success-soft)] text-[var(--success)]",
    title: "text-[var(--foreground)]",
    btn: "border-[var(--success)] bg-[var(--success)] hover:opacity-90 text-white",
  },
  indigo: {
    border: "border-[var(--info)]",
    icon: "bg-[var(--info-soft)] text-[var(--info)]",
    title: "text-[var(--foreground)]",
    btn: "border-[var(--info)] bg-[var(--info)] hover:opacity-90 text-white",
  },
  amber: {
    border: "border-[var(--warning)]",
    icon: "bg-[var(--warning-soft)] text-[var(--warning)]",
    title: "text-[var(--foreground)]",
    btn: "border-[var(--warning)] bg-[var(--warning)] hover:opacity-90 text-white",
  },
  slate: {
    border: "border-[var(--border-color)]",
    icon: "bg-[var(--muted-surface)] text-[var(--ink-muted)]",
    title: "text-[var(--foreground)]",
    btn: "border-[var(--border-color)] bg-[var(--foreground)] hover:opacity-90 text-[var(--surface)]",
  },
  purple: {
    border: "border-[var(--accent)]",
    icon: "bg-[var(--accent-soft)] text-[var(--accent)]",
    title: "text-[var(--foreground)]",
    btn: "border-[var(--accent)] bg-[var(--accent)] hover:opacity-90 text-white",
  },
  red: {
    border: "border-[var(--danger)]",
    icon: "bg-[var(--danger-soft)] text-[var(--danger)]",
    title: "text-[var(--foreground)]",
    btn: "border-[var(--danger)] bg-[var(--danger)] hover:opacity-90 text-white",
  },
};

function PrintableReportCard({
  title,
  purpose,
  whenToUse,
  description,
  href,
  csvHref,
  tone,
}: {
  title: string;
  purpose: string;
  whenToUse: string;
  description: string;
  href: string;
  csvHref?: string;
  tone: CardTone;
}) {
  const styles = cardToneStyles[tone];
  return (
    <div className={`flex flex-col gap-3 rounded-[var(--radius-card)] border bg-[var(--surface)] p-4 ${styles.border}`}>
      <div className={`inline-flex h-9 w-9 items-center justify-center rounded-lg text-sm font-bold ${styles.icon}`}>
        📄
      </div>
      <div className="flex-1 space-y-2">
        <p className={`text-sm font-semibold ${styles.title}`}>{title}</p>
        <p className="text-xs font-semibold leading-5 text-[var(--foreground)]">{purpose}</p>
        <p className="ui-caption leading-relaxed">{description}</p>
        <p className="ui-caption leading-relaxed">
          <span className="font-semibold text-[var(--foreground)]">When to use:</span> {whenToUse}
        </p>
      </div>
      <div className="mt-auto flex items-center gap-2 pt-2">
        <Link
          href={href}
          className={`flex-1 inline-flex items-center justify-center rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${styles.btn}`}
        >
          Open Report →
        </Link>
        {csvHref && (
          <a
            href={csvHref}
            download
            className="inline-flex items-center justify-center gap-1 rounded-lg border border-[var(--border-color)] bg-[var(--surface)] hover:bg-[var(--muted-surface)] px-2.5 py-2 text-xs font-semibold text-[var(--foreground)] transition-colors shadow-xs"
            title="Download CSV report"
          >
            <span>📥</span>
            <span>CSV</span>
          </a>
        )}
      </div>
    </div>
  );
}
