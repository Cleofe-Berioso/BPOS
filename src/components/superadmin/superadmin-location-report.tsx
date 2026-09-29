"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import {
  superadminAuditPillClass,
  superadminListCardClass,
  superadminMobileRecordCardClass,
  superadminSkeletonClass,
  superadminSummaryLabelClass,
  superadminSummaryTileClass,
} from "@/components/superadmin/superadmin-ui-styles";
import { EB_MAGALONA_CENTER } from "@/lib/eb-magalona";
import { EmptyState } from "@/components/ui/empty-state";
import { InfoBanner } from "@/components/ui/info-banner";
import { MapLegendCard } from "@/components/ui/map-legend-card";
import { SectionCard } from "@/components/ui/section-card";
import { DASHBOARD_CHART_COLORS } from "@/components/ui/dashboard-chart-card";

const LeafletBusinessMap = dynamic(
  () => import("@/components/maps/leaflet-business-map").then((mod) => mod.LeafletBusinessMap),
  {
    ssr: false,
    loading: () => <div className={`h-[480px] w-full ${superadminSkeletonClass}`} />,
  }
);

interface SuperAdminLocationRow {
  locationId: string;
  businessRecordId: string;
  businessName: string;
  applicationNumber: string;
  applicationType: "NEW" | "RENEWAL" | "CLOSURE";
  permitOrCertificateNumber: string | null;
  latitude: number;
  longitude: number;
  address: string | null;
  barangay: string | null;
  status: "PENDING" | "VERIFIED" | "NEEDS_CORRECTION";
  remarks: string | null;
  updatedAt: string;
}

const SUPER_ADMIN_MAP_LEGEND_GROUPS = [
  {
    id: "location-status",
    title: "Location Status",
    items: [
      { id: "pending", label: "Pending", color: DASHBOARD_CHART_COLORS[2], note: "Submitted and awaiting BPLO review." },
      { id: "verified", label: "Verified", color: DASHBOARD_CHART_COLORS[0], note: "Accepted business location." },
      {
        id: "needs-correction",
        label: "Needs Correction",
        color: DASHBOARD_CHART_COLORS[3],
        note: "Returned to the applicant with remarks.",
      },
    ],
  },
  {
    id: "application-type",
    title: "Application Type",
    items: [
      { id: "new", label: "New", color: DASHBOARD_CHART_COLORS[0], note: "Initial business registration record." },
      { id: "renewal", label: "Renewal", color: DASHBOARD_CHART_COLORS[6], note: "Renewed business record." },
      { id: "closure", label: "Closure", color: DASHBOARD_CHART_COLORS[5], note: "Closure-related record." },
    ],
  },
];

function statusClass(status: SuperAdminLocationRow["status"]): string {
  if (status === "VERIFIED") return "ui-badge bg-[var(--success-soft)] text-[var(--success)]";
  if (status === "NEEDS_CORRECTION") return "ui-badge bg-[var(--warning-soft)] text-[var(--warning)]";
  return "ui-badge bg-[var(--info-soft)] text-[var(--info)]";
}

export function SuperAdminLocationReport({ rows }: { rows: SuperAdminLocationRow[] }) {
  const [recenterKey, setRecenterKey] = useState<number>(0);

  const handleRecenter = () => {
    setRecenterKey((prev) => prev + 1);
  };

  const markers = rows.map((row) => ({
    id: row.locationId,
    latitude: row.latitude,
    longitude: row.longitude,
    title: row.businessName,
    subtitle: `${row.applicationNumber} • ${row.permitOrCertificateNumber ?? "No document number"}`,
    applicationType: row.applicationType,
    permitOrCertificateNumber: row.permitOrCertificateNumber,
    address: row.address,
    barangay: row.barangay,
    status: row.status,
  }));

  const summary = rows.reduce(
    (accumulator, row) => {
      accumulator.total += 1;

      if (row.status === "PENDING") accumulator.pending += 1;
      if (row.status === "VERIFIED") accumulator.verified += 1;
      if (row.status === "NEEDS_CORRECTION") accumulator.needsCorrection += 1;

      if (row.applicationType === "NEW") accumulator.newCount += 1;
      if (row.applicationType === "RENEWAL") accumulator.renewalCount += 1;
      if (row.applicationType === "CLOSURE") accumulator.closureCount += 1;

      return accumulator;
    },
    {
      total: 0,
      pending: 0,
      verified: 0,
      needsCorrection: 0,
      newCount: 0,
      renewalCount: 0,
      closureCount: 0,
    }
  );

  return (
    <SectionCard
      title="Business Location Report"
      description="Read-only map and Business Location records for released-business submissions."
      className="overflow-visible"
      action={
        <span className={`${superadminAuditPillClass} px-2.5 py-1 text-xs font-semibold`}>
          {rows.length} records
        </span>
      }
    >
      <div className="space-y-5">
        {rows.length === 0 ? (
          <EmptyState
            title="No location records yet"
            description="This report populates after applicants submit business locations."
          />
        ) : (
          <>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className={superadminSummaryTileClass}>
                <p className={superadminSummaryLabelClass}>Total Locations</p>
                <p className="mt-2 text-2xl font-semibold tracking-tight text-[var(--foreground)]">{summary.total}</p>
                <p className="mt-1 text-sm text-[var(--ink-muted)]">All read-only map records currently stored.</p>
              </div>
              <div className={superadminSummaryTileClass}>
                <p className={superadminSummaryLabelClass}>Status Mix</p>
                <div className="mt-2 space-y-1.5 text-sm text-[var(--ink-muted)]">
                  <p>Pending: <span className="font-semibold text-[var(--foreground)]">{summary.pending}</span></p>
                  <p>Verified: <span className="font-semibold text-[var(--foreground)]">{summary.verified}</span></p>
                  <p>Needs Correction: <span className="font-semibold text-[var(--foreground)]">{summary.needsCorrection}</span></p>
                </div>
              </div>
              <div className={superadminSummaryTileClass}>
                <p className={superadminSummaryLabelClass}>Application Types</p>
                <div className="mt-2 space-y-1.5 text-sm text-[var(--ink-muted)]">
                  <p>New: <span className="font-semibold text-[var(--foreground)]">{summary.newCount}</span></p>
                  <p>Renewal: <span className="font-semibold text-[var(--foreground)]">{summary.renewalCount}</span></p>
                  <p>Closure: <span className="font-semibold text-[var(--foreground)]">{summary.closureCount}</span></p>
                </div>
              </div>
              <div className={superadminSummaryTileClass}>
                <p className={superadminSummaryLabelClass}>Viewing Mode</p>
                <p className="mt-2 text-sm font-semibold text-[var(--foreground)]">Read-only report</p>
                <p className="mt-1 text-sm text-[var(--ink-muted)]">No verify, edit, or return controls are available here.</p>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
              <div className="space-y-3">
                <div className="rounded-[var(--radius-card)] border border-[var(--border-color)] bg-[var(--surface)] p-3 shadow-sm">
                  <div className={`flex flex-wrap items-center justify-between gap-3 ${superadminListCardClass}`}>
                    <div>
                      <p className="text-sm font-semibold text-[var(--foreground)]">EB Magalona Oversight Map</p>
                      <p className="mt-1 ui-caption">
                        Interactive OpenStreetMap workspace for inspecting stored business location submissions.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleRecenter}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--surface)] hover:bg-[var(--muted-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--foreground)] transition-colors shadow-xs active:scale-95 cursor-pointer"
                        title="Recenter map view to EB Magalona center"
                      >
                        <span className="text-sm">🎯</span>
                        <span>Recenter Map</span>
                      </button>
                      <span className={`${superadminAuditPillClass} uppercase tracking-wide`}>View Only</span>
                    </div>
                  </div>

                  <div className="mt-3">
                    <LeafletBusinessMap
                      center={[EB_MAGALONA_CENTER.latitude, EB_MAGALONA_CENTER.longitude]}
                      zoom={13}
                      markers={markers}
                      className="h-[clamp(440px,65vh,640px)] w-full overflow-hidden rounded-[var(--radius-card)]"
                      useEbMagalonaBounds={false}
                      showRecenterButton
                      recenterKey={recenterKey}
                      onRecenter={handleRecenter}
                    />
                  </div>
                </div>
                <p className="ui-caption leading-5">
                  Drag and pan freely to explore any area. Click &quot;Recenter Map&quot; anytime to return to the EB Magalona center.
                </p>
              </div>

              <div className="space-y-4 self-start">
                <InfoBanner
                  title="Read-only location monitoring"
                  description="IT Administrator can inspect map points, statuses, and summary counts here, but cannot verify, edit, or return any Business Location record."
                  variant="readOnly"
                />

                <MapLegendCard
                  title="Map Legend"
                  subtitle="Legend remains outside the map so reports stay readable on desktop and mobile."
                  groups={SUPER_ADMIN_MAP_LEGEND_GROUPS}
                  footer="EB Magalona business map only."
                />
              </div>
            </div>

            <div className="space-y-3">
              {rows.map((row) => (
                <div key={row.locationId} className={superadminMobileRecordCardClass}>
                  <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_200px] xl:items-start">
                    <div className="min-w-0 space-y-3">
                      <div>
                        <p className="text-base font-semibold tracking-tight text-[var(--foreground)]">
                          {row.businessName}
                        </p>
                        <p className="mt-0.5 ui-caption">
                          {row.applicationNumber} · {row.applicationType}
                        </p>
                      </div>

                      <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                        <div>
                          <p className={superadminSummaryLabelClass}>Coordinates</p>
                          <p className="mt-1 font-mono text-sm font-semibold text-[var(--foreground)]">
                            {row.latitude.toFixed(6)}, {row.longitude.toFixed(6)}
                          </p>
                          <p className="mt-0.5 ui-caption">Saved map point from the applicant submission.</p>
                        </div>
                        <div>
                          <p className={superadminSummaryLabelClass}>Permit / Certificate</p>
                          <p className="mt-1 text-sm font-semibold text-[var(--foreground)]">
                            {row.permitOrCertificateNumber ?? "No number recorded"}
                          </p>
                          <p className="mt-0.5 ui-caption">Barangay: {row.barangay ?? "Not specified"}</p>
                        </div>
                        <div className="sm:col-span-2">
                          <p className={superadminSummaryLabelClass}>Address and Remarks</p>
                          <p className="mt-1 text-sm font-medium text-[var(--foreground)]">
                            {row.address ?? "No address provided"}
                          </p>
                          <p className="mt-1 ui-caption">Remarks: {row.remarks ?? "No remarks recorded"}</p>
                          <p className="mt-0.5 ui-caption">
                            Updated at {new Date(row.updatedAt).toLocaleString("en-PH")}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2 border-t border-[var(--border-color)] pt-3 xl:border-l xl:border-t-0 xl:pl-4 xl:pt-0">
                      <p className="text-sm font-semibold text-[var(--foreground)]">Record Status</p>
                      <span className={statusClass(row.status)}>{row.status}</span>
                      <p className="ui-caption leading-5">
                        View-only monitoring of the current Business Location status.
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </SectionCard>
  );
}
