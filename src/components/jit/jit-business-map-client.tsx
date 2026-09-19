"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { actionButtonStyles } from "@/components/ui/action-button";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterBar } from "@/components/ui/filter-bar";
import { InfoBanner } from "@/components/ui/info-banner";
import { MapLegendCard } from "@/components/ui/map-legend-card";
import { SectionCard } from "@/components/ui/section-card";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { DASHBOARD_CHART_COLORS } from "@/components/ui/dashboard-chart-card";
import { EB_MAGALONA_CENTER } from "@/lib/eb-magalona";
import type { PaginationPageSize } from "@/lib/pagination";

const LeafletBusinessMap = dynamic(
  () => import("@/components/maps/leaflet-business-map").then((mod) => mod.LeafletBusinessMap),
  {
    ssr: false,
    loading: () => (
      <div className="h-[440px] w-full animate-pulse rounded-2xl border border-[var(--border-color)] bg-[var(--muted-surface)]" />
    ),
  }
);

type ApplicationTypeFilter = "ALL" | "NEW" | "RENEWAL";

interface JitBusinessMapRow {
  locationId: string;
  businessRecordId: string;
  businessName: string;
  ownerName: string;
  businessCategory: string;
  businessCategoryLabel: string;
  businessCategoryColor: string;
  applicationNumber: string;
  applicationType: "NEW" | "RENEWAL";
  permitOrCertificateNumber: string | null;
  permitValidUntil: string | null;
  lineOfBusiness: string | null;
  applicationStatus: string;
  latitude: number;
  longitude: number;
  address: string | null;
  barangay: string | null;
  status: "PENDING" | "VERIFIED" | "NEEDS_CORRECTION";
  remarks: string | null;
  updatedAt: string;
  latestInspectionStatus: string | null;
  mapMarkerStatus: "UNINSPECTED" | "PENDING_INSPECTION" | "COMPLIANT" | "REVOKED";
  mapMarkerColor: string;
}

const JIT_MAP_LEGEND_GROUPS = [
  {
    id: "inspection-status",
    title: "Inspection Status",
    items: [
      { id: "uninspected", label: "Uninspected", color: DASHBOARD_CHART_COLORS[5] },
      { id: "pending-inspection", label: "Pending Inspection / Pending Verification", color: DASHBOARD_CHART_COLORS[1] },
      { id: "compliant", label: "Compliant", color: DASHBOARD_CHART_COLORS[0] },
      { id: "revoked", label: "Revoked / Restricted", color: DASHBOARD_CHART_COLORS[4] },
    ],
  },
];

function inspectionStatusTone(status: JitBusinessMapRow["mapMarkerStatus"]): string {
  if (status === "COMPLIANT") return "border-[var(--success)] bg-[var(--success-soft)] text-[var(--success)]";
  if (status === "REVOKED") return "border-[var(--danger)] bg-[var(--danger-soft)] text-[var(--danger)]";
  if (status === "PENDING_INSPECTION") return "border-[var(--warning)] bg-[var(--warning-soft)] text-[var(--warning)]";
  return "border-[var(--border-color)] bg-[var(--muted-surface)] text-[var(--foreground)]";
}

function inspectionStatusLabel(status: JitBusinessMapRow["mapMarkerStatus"]): string {
  if (status === "COMPLIANT") return "Compliant";
  if (status === "REVOKED") return "Revoked";
  if (status === "PENDING_INSPECTION") return "Pending Inspection";
  return "Uninspected";
}

function toShortDate(iso: string | null): string {
  if (!iso) return "N/A";
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return "N/A";
  return value.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
}

export function JitBusinessMapClient() {
  const [rows, setRows] = useState<JitBusinessMapRow[]>([]);
  const [typeFilter, setTypeFilter] = useState<ApplicationTypeFilter>("ALL");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [searchFilter, setSearchFilter] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PaginationPageSize>(10);

  useEffect(() => {
    async function loadRows() {
      setIsLoading(true);
      setError(null);

      const response = await fetch("/api/jit/business-map", { cache: "no-store" });
      const data = (await response.json()) as { rows?: JitBusinessMapRow[]; error?: string };

      if (!response.ok) {
        setError(data.error ?? "Unable to load JIT business map records");
        setIsLoading(false);
        return;
      }

      setRows(data.rows ?? []);
      setIsLoading(false);
    }

    void loadRows();
  }, []);

  // Reset pagination to page 1 whenever any filter changes
  useEffect(() => {
    setPage(1);
  }, [typeFilter, ownerFilter, searchFilter]);

  const visibleRows = useMemo(
    () =>
      rows.filter((row) => {
        if (typeFilter !== "ALL" && row.applicationType !== typeFilter) return false;

        if (ownerFilter.trim()) {
          const owner = ownerFilter.trim().toLowerCase();
          if (!row.ownerName.toLowerCase().includes(owner)) return false;
        }

        if (searchFilter.trim()) {
          const search = searchFilter.trim().toLowerCase();
          if (!row.businessName.toLowerCase().includes(search)) return false;
        }

        return true;
      }),
    [ownerFilter, rows, searchFilter, typeFilter]
  );

  const totalCount = visibleRows.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);

  const paginatedRows = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return visibleRows.slice(startIndex, startIndex + pageSize);
  }, [visibleRows, currentPage, pageSize]);

  const markers = useMemo(
    () =>
      visibleRows.map((row) => ({
        id: row.locationId,
        latitude: row.latitude,
        longitude: row.longitude,
        title: row.businessName,
        subtitle: `${row.ownerName} • ${row.permitOrCertificateNumber ?? "No permit number"}`,
        applicationType: row.applicationType,
        permitOrCertificateNumber: row.permitOrCertificateNumber,
        address: row.address,
        barangay: row.barangay,
        status: row.status,
        ownerName: row.ownerName,
        mapMarkerColor: row.mapMarkerColor,
      })),
    [visibleRows]
  );

  return (
    <div className="space-y-5">
      {error ? (
        <InfoBanner title="Unable to load JIT business map" description={error} variant="danger" />
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <SectionCard
          title="Active Permitted Businesses"
          description="Released businesses only. This map is read-only for JIT monitoring and planning."
        >
          {isLoading ? (
            <div className="h-[clamp(320px,55vh,520px)] animate-pulse rounded-2xl border border-[var(--border-color)] bg-[var(--muted-surface)]" />
          ) : visibleRows.length === 0 ? (
            <EmptyState
              title="No released businesses found"
              description="Businesses appear here only after permit release with a saved location pin."
            />
          ) : (
            <LeafletBusinessMap
              center={[EB_MAGALONA_CENTER.latitude, EB_MAGALONA_CENTER.longitude]}
              zoom={13}
              markers={markers}
              className="h-[clamp(320px,55vh,520px)] w-full overflow-hidden rounded-2xl"
              useEbMagalonaBounds
            />
          )}
        </SectionCard>

        <div className="space-y-4 self-start">
          <FilterBar
            title="Map Filters"
            description="Filter by application type, owner, and business name."
            contentClassName="grid gap-3"
          >
            <label className="space-y-1 text-sm">
              <span className="font-medium text-[var(--ink-muted)]">Application Type</span>
              <select
                aria-label="Application Type"
                value={typeFilter}
                onChange={(event) => setTypeFilter(event.target.value as ApplicationTypeFilter)}
                className="w-full rounded-xl border border-[var(--border-color)] bg-white px-3 py-2 text-[var(--ink-muted)]"
              >
                <option value="ALL">All</option>
                <option value="NEW">New</option>
                <option value="RENEWAL">Renewal</option>
              </select>
            </label>

            <label className="space-y-1 text-sm">
              <span className="font-medium text-[var(--ink-muted)]">Owner / Operator</span>
              <input
                aria-label="Owner / Operator"
                value={ownerFilter}
                onChange={(event) => setOwnerFilter(event.target.value)}
                placeholder="Search by owner name"
                className="w-full rounded-xl border border-[var(--border-color)] bg-white px-3 py-2 text-[var(--ink-muted)]"
              />
            </label>

            <label className="space-y-1 text-sm">
              <span className="font-medium text-[var(--ink-muted)]">Business Name</span>
              <input
                aria-label="Business Name"
                value={searchFilter}
                onChange={(event) => setSearchFilter(event.target.value)}
                placeholder="Search by business name"
                className="w-full rounded-xl border border-[var(--border-color)] bg-white px-3 py-2 text-[var(--ink-muted)]"
              />
            </label>
          </FilterBar>

          <MapLegendCard
            title="Map Legend"
            subtitle="JIT marker colors are based on inspection and revocation status."
            groups={JIT_MAP_LEGEND_GROUPS}
          />
        </div>
      </div>

      <SectionCard
        title="Released Business Details"
        description="Read-only list for JIT planning. No revocation and no inspection submission in this phase."
        action={
          <Link href="/jit/inspect-a-business" className={actionButtonStyles("secondary", "sm")}>
            Go to Inspection Queue
          </Link>
        }
      >
        <div className="space-y-3">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={index}
                  className="h-28 animate-pulse rounded-2xl border border-[var(--border-color)] bg-[var(--muted-surface)]"
                />
              ))}
            </div>
          ) : paginatedRows.length > 0 ? (
            paginatedRows.map((row) => (
              <article key={row.locationId} className="rounded-2xl border border-[var(--border-color)] bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-base font-semibold text-[var(--foreground)]">{row.businessName}</p>
                    <p className="text-sm text-[var(--ink-muted)]">Owner: {row.ownerName}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${inspectionStatusTone(row.mapMarkerStatus)}`}>
                      {inspectionStatusLabel(row.mapMarkerStatus)}
                    </span>
                  </div>
                </div>
                <div className="mt-3 grid gap-2 text-sm text-[var(--ink-muted)] md:grid-cols-2 xl:grid-cols-4">
                  <p><span className="font-semibold">Line of Business:</span> {row.lineOfBusiness ?? "N/A"}</p>
                  <p><span className="font-semibold">Permit Number:</span> {row.permitOrCertificateNumber ?? "N/A"}</p>
                  <p><span className="font-semibold">Permit Valid Until:</span> {toShortDate(row.permitValidUntil)}</p>
                  <p><span className="font-semibold">Current Status:</span> {row.applicationStatus}</p>
                  <p className="md:col-span-2 xl:col-span-2"><span className="font-semibold">Business Address:</span> {row.address ?? "N/A"}</p>
                  <p><span className="font-semibold">Coordinates:</span> {row.latitude.toFixed(6)}, {row.longitude.toFixed(6)}</p>
                  <p><span className="font-semibold">Application No:</span> {row.applicationNumber}</p>
                </div>
              </article>
            ))
          ) : (
            <EmptyState
              title="No rows matched current filters"
              description="Try resetting filters or wait for newly released permits with pinned locations."
            />
          )}

          {!isLoading && totalCount > 0 ? (
            <div className="pt-2">
              <PaginationControls
                basePath="/jit/business-map"
                queryParams={{}}
                mode="client"
                isLoading={isLoading}
                page={currentPage}
                pageSize={pageSize}
                totalCount={totalCount}
                totalPages={totalPages}
                recordLabel="released businesses"
                onPageChange={(nextPage) => setPage(nextPage)}
                onPageSizeChange={(nextSize) => {
                  setPageSize(nextSize);
                  setPage(1);
                }}
              />
            </div>
          ) : null}
        </div>
      </SectionCard>
    </div>
  );
}
