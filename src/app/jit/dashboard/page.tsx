import Link from "next/link";
import { notFound } from "next/navigation";
import {
  BarChart3,
  FlagTriangleRight,
  ShieldCheck,
  ArrowRight,
  MapPinned,
  ClipboardList,
} from "lucide-react";
import { DashboardSummaryCard } from "@/components/applicant/dashboard-summary-card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { RoleBadge } from "@/components/ui/role-badge";
import { SectionCard } from "@/components/ui/section-card";
import { StatCard } from "@/components/ui/stat-card";
import { actionButtonStyles } from "@/components/ui/action-button";
import { DashboardQueueCard } from "@/components/ui/dashboard-queue-card";
import { DashboardPieChart } from "@/components/ui/dashboard-pie-chart";
import { DashboardLineChart } from "@/components/ui/dashboard-line-chart";
import { DashboardStackedBarChart } from "@/components/ui/dashboard-stacked-bar-chart";
import { DASHBOARD_CHART_COLORS } from "@/components/ui/dashboard-chart-card";
import { bploListCardClass, bploPanelClass } from "@/components/bplo/bplo-ui-styles";
import { requireJitSession } from "@/lib/jit-api";
import { getJitDashboardMetrics, getJitDashboardSummary } from "@/lib/jit-dashboard";

export default async function JitDashboardPage() {
  const session = await requireJitSession();
  if (!session) notFound();

  const [summary, metrics] = await Promise.all([getJitDashboardSummary(), getJitDashboardMetrics()]);

  return (
    <section className="space-y-4">
      <PageHeader
        eyebrow="JIT"
        title="JIT Dashboard"
        description="Inspection summary and compliance indicators for active released businesses."
        badge={<RoleBadge roleType="VIEW_ONLY" label="JIT" />}
        showHeroWatermark
        actions={
          <>
            <Link href="/jit/inspect-a-business" className={actionButtonStyles("primary", "sm")}>
              Go to Inspection Queue
            </Link>
            <Link href="/jit/business-map" className={actionButtonStyles("secondary", "sm")}>
              View Business Map
            </Link>
          </>
        }
      />

      <SectionCard title="Action Required Now" description="Inspection queues and compliance indicators.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <DashboardQueueCard
            title="Inspection Queue"
            description="Released businesses available for inspection."
            count={summary.visibleBusinessCount}
            href="/jit/inspect-a-business"
            tone="info"
            icon={<ClipboardList className="h-4 w-4" />}
          />
          <DashboardQueueCard
            title="Flagged Businesses"
            description="Businesses with flagged or revoked inspection status."
            count={summary.flaggedBusinessesCount}
            href="/jit/inspect-a-business"
            tone="warning"
            icon={<FlagTriangleRight className="h-4 w-4" />}
          />
          <DashboardQueueCard
            title="Non-Compliant Records"
            description="Inspection records marked non-compliant or under review."
            count={summary.nonCompliantCount}
            href="/jit/inspect-a-business"
            tone="success"
            icon={<ShieldCheck className="h-4 w-4" />}
          />
        </div>
      </SectionCard>

      <SectionCard title="Key Metrics" description="Live counts from released-business and inspection data.">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <DashboardSummaryCard
            title="Inspection Summary"
            value={summary.inspectionSummary.toLocaleString("en-PH")}
            subtitle="Total inspections submitted by JIT"
            icon={<BarChart3 className="h-4 w-4" />}
            tone="blue"
          />
          <DashboardSummaryCard
            title="Flagged Businesses Count"
            value={summary.flaggedBusinessesCount.toLocaleString("en-PH")}
            subtitle="Latest inspection is flagged or revoked"
            icon={<FlagTriangleRight className="h-4 w-4" />}
            tone="amber"
          />
          <DashboardSummaryCard
            title="Compliant Count"
            value={summary.compliantCount.toLocaleString("en-PH")}
            subtitle="Businesses with latest COMPLIANT inspection"
            icon={<ShieldCheck className="h-4 w-4" />}
            tone="green"
          />
          <DashboardSummaryCard
            title="Non-Compliant Count"
            value={summary.nonCompliantCount.toLocaleString("en-PH")}
            subtitle="NON_COMPLIANT and REVOCATION_REVIEW records"
            icon={<ArrowRight className="h-4 w-4" />}
            tone="blue"
          />
        </div>
      </SectionCard>

      <div className="grid gap-4 xl:grid-cols-2">
        <DashboardPieChart
          title="Inspection Results Distribution"
          description="Current JIT inspection outcomes on released businesses only."
          data={metrics.inspectionResultsDistribution}
          emptyTitle="No inspection results available yet."
        />
        <DashboardLineChart
          title="Inspections Conducted Per Week"
          description="Weekly JIT inspection activity based on inspection record creation time."
          data={metrics.inspectionsConductedPerWeek}
          lineLabel="Inspections"
          emptyTitle="No inspections conducted yet."
        />
        <DashboardStackedBarChart
          title="Violations by Business Type"
          description="Non-compliant and verified non-compliant inspection counts by business type."
          data={metrics.violationsByBusinessType}
          categoryKey="label"
          series={[
            { key: "nonCompliant", label: "Non-compliant", color: DASHBOARD_CHART_COLORS[4] },
            { key: "verifiedNonCompliant", label: "Verified non-compliant", color: DASHBOARD_CHART_COLORS[3] },
          ]}
          emptyTitle="No violation records available yet."
        />
        <SectionCard
          title="Inspection Locations Map Summary"
          description="Released-business inspection locations grouped from active permitted business records."
          action={
            <Link href="/jit/business-map" className={actionButtonStyles("secondary", "sm")}>
              Open Business Map
            </Link>
          }
        >
          {metrics.locationSummary.totalInspectionLocations === 0 ? (
            <EmptyState
              title="No inspection locations available yet."
              description="Inspection locations appear here only after business permits are released and location records exist."
            />
          ) : (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <StatCard
                  title="Total Inspection Locations"
                  value={metrics.locationSummary.totalInspectionLocations.toLocaleString("en-PH")}
                  subtitle="Released businesses available for inspection"
                  icon={<MapPinned className="h-4 w-4" />}
                  tone="blue"
                />
                <StatCard
                  title="Barangays With Locations"
                  value={metrics.locationSummary.barangayCounts.length.toLocaleString("en-PH")}
                  subtitle="Grouped from active released-business locations"
                  icon={<MapPinned className="h-4 w-4" />}
                  tone="green"
                />
              </div>
              <div className={bploPanelClass}>
                <p className="text-sm font-semibold text-[var(--foreground)]">Top Barangay Groups</p>
                <div className="mt-3 space-y-2">
                  {metrics.locationSummary.barangayCounts.slice(0, 6).map((row) => (
                    <div key={row.label} className={`flex items-center justify-between gap-3 ${bploListCardClass}`}>
                      <span className="text-sm text-[var(--ink-muted)]">{row.label}</span>
                      <span className="text-sm font-semibold text-[var(--foreground)]">{row.value.toLocaleString("en-PH")}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </SectionCard>
      </div>
    </section>
  );
}