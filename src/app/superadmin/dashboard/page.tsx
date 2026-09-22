import Link from "next/link";
import { Activity, ClipboardList, MessageSquareWarning, Users } from "lucide-react";
import { RoleBadge } from "@/components/ui/role-badge";
import { SectionCard } from "@/components/ui/section-card";
import { StatCard } from "@/components/ui/stat-card";
import { DashboardQueueCard } from "@/components/ui/dashboard-queue-card";
import { DashboardLineChart } from "@/components/ui/dashboard-line-chart";
import { DashboardStackedBarChart } from "@/components/ui/dashboard-stacked-bar-chart";
import { DashboardHorizontalBarChart } from "@/components/ui/dashboard-horizontal-bar-chart";
import { DashboardPieChart } from "@/components/ui/dashboard-pie-chart";
import { DashboardGaugeCard } from "@/components/ui/dashboard-gauge-card";
import { DASHBOARD_CHART_COLORS } from "@/components/ui/dashboard-chart-card";
import { MunicipalDocumentHeader, IT_DEPARTMENT_HEADING } from "@/components/ui/municipal-document-header";
import { actionButtonStyles } from "@/components/ui/action-button";
import {
  getSuperAdminDashboardSummary,
  getSuperAdminReportsSummary,
} from "@/lib/superadmin-data";
import { getSuperAdminDashboardMetrics } from "@/lib/superadmin-dashboard";

function percentOf(part: number, whole: number): string {
  if (whole <= 0) return "0%";
  return `${Math.round((part / whole) * 1000) / 10}%`;
}

export default async function SuperAdminDashboard() {
  const [summary, reports, metrics] = await Promise.all([
    getSuperAdminDashboardSummary(),
    getSuperAdminReportsSummary(),
    getSuperAdminDashboardMetrics(),
  ]);

  const totalNew = reports.applicationsByType.find((row) => row.type === "NEW")?.count ?? 0;
  const totalRenewal = reports.applicationsByType.find((row) => row.type === "RENEWAL")?.count ?? 0;
  const totalClosure = reports.applicationsByType.find((row) => row.type === "CLOSURE")?.count ?? 0;
  const totalTyped = totalNew + totalRenewal + totalClosure;
  const dbHealthMax = 1;
  const dbHealthValue = metrics.systemHealth.databaseReachable ? 1 : 0;
  const lastCheckLabel = new Date(metrics.systemHealth.lastSuccessfulDashboardCheck).toLocaleString("en-PH");
  const snapshot = metrics.operationalSnapshot;
  const releaseRate = percentOf(reports.releasedPermits, summary.totalApplications);

  const dominantType =
    totalNew >= totalRenewal && totalNew >= totalClosure
      ? { label: "New", count: totalNew }
      : totalRenewal >= totalClosure
        ? { label: "Renewal", count: totalRenewal }
        : { label: "Closure", count: totalClosure };

  return (
    <section className="ui-page-stack">
      <MunicipalDocumentHeader
        heading={{
          ...IT_DEPARTMENT_HEADING,
          title: "IT Administrator Dashboard",
        }}
        subtitle="Municipal operations intelligence for the Business Permit Online System — backlog meaning, delivery health, and compliance signals for IT oversight."
        titleTone="official"
        meta={
          <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-center sm:gap-4">
            <RoleBadge roleType="VIEW_ONLY" label="Read-Only Monitoring" />
            <span>
              Snapshot refreshed: <strong>{lastCheckLabel}</strong>
            </span>
          </div>
        }
        actions={
          <Link href="/superadmin/reports" className={actionButtonStyles("secondary", "sm")}>
            Open Reports Hub
          </Link>
        }
      />

      <SectionCard
        title="Operational meaning at a glance"
        description="Interpret current load: where work is waiting, how messaging is performing, and how permits are completing."
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            title="Open Workload"
            value={snapshot.openWorkloadTotal.toLocaleString("en-PH")}
            subtitle={
              snapshot.heaviestStage
                ? `Largest queue: ${snapshot.heaviestStage.label} (${snapshot.heaviestStage.count.toLocaleString("en-PH")})`
                : "No open stage backlog detected"
            }
            tone={snapshot.openWorkloadTotal > 0 ? "amber" : "green"}
          />
          <StatCard
            title="Permit Release Rate"
            value={releaseRate}
            subtitle={`${reports.releasedPermits.toLocaleString("en-PH")} released of ${summary.totalApplications.toLocaleString("en-PH")} applications`}
            tone="green"
          />
          <StatCard
            title="SMS Reliability"
            value={snapshot.smsReliabilityPercent == null ? "—" : `${snapshot.smsReliabilityPercent}%`}
            subtitle={
              metrics.systemHealth.recentFailedSmsCount > 0
                ? `${metrics.systemHealth.recentFailedSmsCount.toLocaleString("en-PH")} failures in last 7 days`
                : "No failures in the last 7 days"
            }
            tone={
              snapshot.smsReliabilityPercent == null
                ? "slate"
                : snapshot.smsReliabilityPercent >= 95
                  ? "green"
                  : "red"
            }
          />
          <StatCard
            title="Daily Activity Pace"
            value={snapshot.recentActivityAveragePerDay.toLocaleString("en-PH")}
            subtitle="Average workflow history events per day (7-day window)"
            tone="blue"
          />
        </div>
      </SectionCard>

      <SectionCard title="Monitoring shortcuts" description="Jump to the audit modules that explain the numbers above.">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <DashboardQueueCard
            title="Applications Registry"
            description="Inspect individual filings when a stage backlog grows."
            count={summary.totalApplications}
            href="/superadmin/applications"
            tone="info"
            icon={<ClipboardList className="h-4 w-4" />}
          />
          <DashboardQueueCard
            title="User Accounts"
            description="Confirm staff and applicant access when activity drops."
            count={summary.totalUsers}
            href="/superadmin/users"
            tone="success"
            icon={<Users className="h-4 w-4" />}
          />
          <DashboardQueueCard
            title="Recent Activity"
            description="Trace who moved applications in the last week."
            count={metrics.systemHealth.recentActivityVolume}
            href="/superadmin/activities"
            tone="warning"
            icon={<Activity className="h-4 w-4" />}
          />
          <DashboardQueueCard
            title="Failed SMS"
            description="Investigate delivery issues affecting applicant notices."
            count={metrics.systemHealth.recentFailedSmsCount}
            href="/superadmin/reports/print/sms"
            tone="danger"
            icon={<MessageSquareWarning className="h-4 w-4" />}
          />
        </div>
      </SectionCard>

      <SectionCard
        title="Portfolio mix"
        description={
          totalTyped > 0
            ? `Dominant filing type is ${dominantType.label} (${percentOf(dominantType.count, totalTyped)} of typed applications). Use this to anticipate renewal vs. new registration capacity.`
            : "Application type mix will appear once filings exist."
        }
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <StatCard
            title="New Applications"
            value={totalNew.toLocaleString("en-PH")}
            subtitle={`${percentOf(totalNew, totalTyped)} of typed filings — first-time registrations`}
            tone="blue"
          />
          <StatCard
            title="Renewal Applications"
            value={totalRenewal.toLocaleString("en-PH")}
            subtitle={`${percentOf(totalRenewal, totalTyped)} of typed filings — continuing businesses`}
            tone="amber"
          />
          <StatCard
            title="Closure Applications"
            value={totalClosure.toLocaleString("en-PH")}
            subtitle={`${percentOf(totalClosure, totalTyped)} of typed filings — retirement / non-compliant exits`}
            tone="blue"
          />
          <StatCard
            title="Total Users"
            value={summary.totalUsers.toLocaleString("en-PH")}
            subtitle="Applicant and staff accounts in the system"
            tone="blue"
          />
          <StatCard
            title="Total Applications"
            value={summary.totalApplications.toLocaleString("en-PH")}
            subtitle="All workflow records under IT audit visibility"
            tone="blue"
          />
          <StatCard
            title="Released Permits / Certificates"
            value={reports.releasedPermits.toLocaleString("en-PH")}
            subtitle={`Completion signal: ${releaseRate} of all applications reached release`}
            tone="green"
          />
        </div>
      </SectionCard>

      <div className="grid gap-4 xl:grid-cols-2">
        <DashboardLineChart
          title="Who is working the system?"
          description="Daily workflow history by actor role. Rising BPLO or Department Head lines usually mean review/approval pressure; rising Applicant lines often mean resubmissions or payments."
          data={metrics.userActivityByRole}
          series={[
            { key: "applicant", label: "Applicant", color: DASHBOARD_CHART_COLORS[2] },
            { key: "bplo", label: "BPLO", color: DASHBOARD_CHART_COLORS[0] },
            { key: "departmentHead", label: "Department Head", color: DASHBOARD_CHART_COLORS[3] },
            { key: "jit", label: "JIT", color: DASHBOARD_CHART_COLORS[6] },
            { key: "superAdmin", label: "IT Administrator", color: DASHBOARD_CHART_COLORS[5] },
          ]}
          emptyTitle="No user activity logs available yet."
          emptyDescription="System user activity appears once workflow history entries are recorded."
        />

        <DashboardLineChart
          title="Where is work waiting?"
          description="Daily open workload by office stage. The highest line indicates the current bottleneck where applicants are waiting on a next action."
          data={metrics.applicationVolumeAcrossSystem}
          series={[
            { key: "bploReview", label: "BPLO Review", color: DASHBOARD_CHART_COLORS[2] },
            { key: "bploAssessment", label: "BPLO Assessment", color: DASHBOARD_CHART_COLORS[6] },
            { key: "bploPayment", label: "BPLO Payment", color: DASHBOARD_CHART_COLORS[3] },
            { key: "bploRelease", label: "BPLO Release", color: DASHBOARD_CHART_COLORS[0] },
            { key: "departmentHeadApproval", label: "Department Head Approval", color: DASHBOARD_CHART_COLORS[5] },
            { key: "jitInspection", label: "JIT Inspection", color: DASHBOARD_CHART_COLORS[4] },
          ]}
          emptyTitle="No application volume data available yet."
          emptyDescription="Stage volume appears once applications and inspections are available."
        />

        <DashboardStackedBarChart
          title="Daily transaction outcomes"
          description="Submissions, approvals, returns/rejections, inspections, payment checks, permit releases, and SMS outcomes. Spikes in returns/rejections often predict follow-up applicant traffic."
          data={metrics.transactionVolume}
          categoryKey="label"
          series={[
            { key: "logins", label: "Logins (if tracked)", color: DASHBOARD_CHART_COLORS[5] },
            { key: "submitted", label: "Applications Submitted", color: DASHBOARD_CHART_COLORS[2] },
            { key: "approvals", label: "Approvals", color: DASHBOARD_CHART_COLORS[0] },
            { key: "returnsRejections", label: "Returns/Rejections", color: DASHBOARD_CHART_COLORS[4] },
            { key: "inspections", label: "Inspections", color: DASHBOARD_CHART_COLORS[6] },
            { key: "paymentVerification", label: "Payment Verification", color: DASHBOARD_CHART_COLORS[3] },
            { key: "permitReleases", label: "Permit Releases", color: DASHBOARD_CHART_COLORS[1] },
            { key: "smsSent", label: "SMS Sent", color: DASHBOARD_CHART_COLORS[0] },
            { key: "smsFailed", label: "SMS Failed", color: DASHBOARD_CHART_COLORS[4] },
          ]}
          emptyTitle="No transaction activity available yet."
          emptyDescription="Activity trends render when history and related logs contain records."
        />

        <DashboardLineChart
          title="Compliance and revocation pressure"
          description="Released permits versus verified non-compliant inspections, revoked businesses, and renewals blocked by revocation-related status."
          data={metrics.complianceRevocationTrends}
          series={[
            { key: "releasedPermits", label: "Approved/Released Permits", color: DASHBOARD_CHART_COLORS[0] },
            { key: "verifiedNonCompliant", label: "Verified Non-Compliant", color: DASHBOARD_CHART_COLORS[3] },
            { key: "revokedBusinesses", label: "Revoked Businesses", color: DASHBOARD_CHART_COLORS[4] },
            { key: "restrictedRenewals", label: "Restricted/Disabled Renewals", color: DASHBOARD_CHART_COLORS[5] },
          ]}
          emptyTitle="No compliance or revocation records yet."
          emptyDescription="Compliance and revocation trends appear once inspection and revocation data exists."
        />

        <DashboardLineChart
          title="Business closure prevalence"
          description="Monthly closure filings. An upward curve means more businesses are exiting operations and will need certificate processing."
          data={metrics.closurePrevalenceTrend}
          lineLabel="Closure Applications"
          emptyTitle="No closure application trends yet."
          emptyDescription="Closure trend appears once closure applications are filed."
        />

        <DashboardHorizontalBarChart
          title="Where businesses concentrate"
          description="Top barangay + line-of-business combinations. Useful for planning JIT coverage and anticipating document volume by area."
          data={metrics.prevalentBusinessCategoriesByArea}
          barLabel="Business Records"
          emptyTitle="No business category data available yet."
          emptyDescription="Category prevalence appears after business profile and location records are available."
        />

        <DashboardPieChart
          title="SMS delivery health"
          description="Share of sent, failed, and skipped SMS. High skipped/failed share usually means configuration, credits, or invalid contact data."
          data={metrics.smsDeliveryDistribution}
          emptyTitle="No SMS delivery logs available yet."
          emptyDescription="SMS status analytics render once delivery logs are recorded."
        />

        <SectionCard
          title="Diagnostic logs"
          description="Use these live audit sources for IT root-cause checks. Dedicated exception-table logging is not part of this deployment."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Link
              href="/superadmin/activities"
              className="rounded-[var(--radius-card)] border border-[var(--border-color)] bg-[var(--muted-surface)] p-3 transition-colors hover:border-[var(--primary)] hover:bg-[var(--primary-soft)]"
            >
              <div className="flex items-start gap-2.5">
                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-[var(--warning-soft)] text-[var(--warning)] ring-1 ring-[var(--border-color)]">
                  <Activity className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[var(--foreground)]">Activity Log</p>
                  <p className="mt-1 text-xs text-[var(--ink-muted)]">
                    {metrics.systemHealth.recentActivityVolume.toLocaleString("en-PH")} workflow events in the last 7 days
                  </p>
                  <p className="mt-2 text-xs font-semibold text-[var(--primary)]">Open activity trail →</p>
                </div>
              </div>
            </Link>
            <Link
              href="/superadmin/reports/print/sms"
              className="rounded-[var(--radius-card)] border border-[var(--border-color)] bg-[var(--muted-surface)] p-3 transition-colors hover:border-[var(--primary)] hover:bg-[var(--primary-soft)]"
            >
              <div className="flex items-start gap-2.5">
                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-[var(--danger-soft)] text-[var(--danger)] ring-1 ring-[var(--border-color)]">
                  <MessageSquareWarning className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[var(--foreground)]">SMS Delivery Log</p>
                  <p className="mt-1 text-xs text-[var(--ink-muted)]">
                    {metrics.systemHealth.recentFailedSmsCount.toLocaleString("en-PH")} failed SMS in the last 7 days
                  </p>
                  <p className="mt-2 text-xs font-semibold text-[var(--primary)]">Open SMS delivery report →</p>
                </div>
              </div>
            </Link>
          </div>
        </SectionCard>
      </div>

      <SectionCard
        title="System health indicators"
        description="Internal application health only — not a substitute for infrastructure uptime monitoring."
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <DashboardGaugeCard
            title="Database Reachability"
            description={
              metrics.systemHealth.databaseReachable
                ? "Database ping succeeded for this dashboard refresh."
                : "Database ping failed — treat other charts as potentially stale."
            }
            value={dbHealthValue}
            max={dbHealthMax}
            unit="Reachable"
          />
          <StatCard
            title="Last Successful Dashboard Check"
            value={lastCheckLabel}
            subtitle="When this snapshot was aggregated"
            tone="blue"
          />
          <StatCard
            title="Recent Failed SMS (7 days)"
            value={metrics.systemHealth.recentFailedSmsCount.toLocaleString("en-PH")}
            subtitle="From SmsDeliveryLog with FAILED status"
            tone={metrics.systemHealth.recentFailedSmsCount > 0 ? "red" : "green"}
          />
          <StatCard
            title="Recent Activity Volume (7 days)"
            value={metrics.systemHealth.recentActivityVolume.toLocaleString("en-PH")}
            subtitle={`≈ ${snapshot.recentActivityAveragePerDay.toLocaleString("en-PH")} events/day`}
            tone="blue"
          />
        </div>
      </SectionCard>
    </section>
  );
}
