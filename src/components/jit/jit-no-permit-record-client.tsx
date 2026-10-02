"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Plus, Printer } from "lucide-react";
import {
  jitFormControlClass,
  jitSkeletonClass,
  jitTableClass,
} from "@/components/jit/jit-ui-styles";
import { actionButtonStyles } from "@/components/ui/action-button";
import { SectionCard } from "@/components/ui/section-card";
import { InfoBanner } from "@/components/ui/info-banner";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingState } from "@/components/ui/loading-state";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { EB_MAGALONA_CENTER } from "@/lib/eb-magalona";
import { useLineOfBusinessOptions } from "@/hooks/use-line-of-business-options";
import type { PaginationPageSize } from "@/lib/pagination";

const LeafletBusinessMap = dynamic(
  () => import("@/components/maps/leaflet-business-map").then((mod) => mod.LeafletBusinessMap),
  {
    ssr: false,
    loading: () => <div className={`h-[440px] w-full ${jitSkeletonClass}`} />,
  }
);

interface NoPermitRecord {
  id: string;
  ticketNumber: string;
  ticketStatus: "OPEN" | "RESOLVED";
  businessName: string;
  personAttended: string;
  lineOfBusiness: string;
  findings: string;
  remarks?: string;
  latitude: number;
  longitude: number;
  address?: string;
  createdAt: string;
  createdBy: { name: string };
}

const emptyFormData = {
  businessName: "",
  personAttended: "",
  lineOfBusiness: "",
  findings: "",
  remarks: "",
  contactPhone: "",
  contactEmail: "",
  latitude: Number(EB_MAGALONA_CENTER.latitude),
  longitude: Number(EB_MAGALONA_CENTER.longitude),
  address: "",
};

export function JitNoPermitRecordClient() {
  const [records, setRecords] = useState<NoPermitRecord[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PaginationPageSize>(25);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState(emptyFormData);
  const lineOfBusinessOptions = useLineOfBusinessOptions([formData.lineOfBusiness]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastPrintPath, setLastPrintPath] = useState<string | null>(null);

  const loadRecords = useCallback(async (nextPage: number, nextPageSize: PaginationPageSize) => {
    setIsLoading(true);
    setError(null);

    const params = new URLSearchParams({
      page: String(nextPage),
      pageSize: String(nextPageSize),
    });

    const response = await fetch(`/api/jit/no-permit-record?${params.toString()}`, { cache: "no-store" });
    const data = (await response.json()) as {
      records?: NoPermitRecord[];
      totalCount?: number;
      page?: number;
      pageSize?: PaginationPageSize;
      totalPages?: number;
      error?: string;
    };

    if (!response.ok) {
      setError(data.error ?? "Unable to load no-permit records");
      setRecords([]);
      setTotalCount(0);
      setTotalPages(1);
      setIsLoading(false);
      return;
    }

    setRecords(data.records ?? []);
    setTotalCount(data.totalCount ?? 0);
    setPage(data.page ?? nextPage);
    setPageSize(data.pageSize ?? nextPageSize);
    setTotalPages(data.totalPages ?? 1);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void loadRecords(page, pageSize);
  }, [loadRecords, page, pageSize]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setLastPrintPath(null);

    const response = await fetch("/api/jit/no-permit-record", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData),
    });

    const data = (await response.json()) as {
      error?: string;
      printPath?: string;
      duplicate?: { id: string; ticketNumber: string };
    };

    if (response.status === 409 && data.duplicate) {
      alert(
        `An open no-permit ticket already exists (${data.duplicate.ticketNumber}). Opening the existing printable notice.`
      );
      if (data.printPath) {
        window.open(data.printPath, "_blank", "noopener,noreferrer");
      }
      setIsSubmitting(false);
      return;
    }

    if (!response.ok) {
      alert(data.error ?? "Failed to create record");
      setIsSubmitting(false);
      return;
    }

    setShowForm(false);
    setFormData(emptyFormData);
    setPage(1);
    await loadRecords(1, pageSize);
    if (data.printPath) {
      setLastPrintPath(data.printPath);
    }
    setIsSubmitting(false);
  }

  function handleMapSelect(coords: { latitude: number; longitude: number }) {
    setFormData((prev) => ({
      ...prev,
      latitude: coords.latitude,
      longitude: coords.longitude,
    }));
  }

  if (isLoading && records.length === 0 && totalCount === 0) {
    return <LoadingState message="Loading no-permit records…" />;
  }

  if (error && records.length === 0 && totalCount === 0) {
    return <div className="text-sm text-[var(--danger)]">{error}</div>;
  }

  const markers = records.map((rec) => ({
    id: rec.id,
    latitude: rec.latitude,
    longitude: rec.longitude,
    title: rec.businessName,
    subtitle: rec.ticketNumber,
  }));

  function toShortDate(iso: string): string {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "N/A";
    return date.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
  }

  return (
    <section className="ui-page-stack">
      {lastPrintPath ? (
        <InfoBanner
          title="Notice saved"
          description="The no-permit notice was saved. Print the official notice for the establishment."
          variant="success"
          action={
            <Link href={lastPrintPath} target="_blank" className={actionButtonStyles("primary", "sm")}>
              <Printer className="h-4 w-4" />
              Print Notice
            </Link>
          }
        />
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-[var(--foreground)]">No Permit Records List</h2>
        <button onClick={() => setShowForm(!showForm)} className={actionButtonStyles("primary", "sm")}>
          <Plus className="h-4 w-4" />
          Add Record
        </button>
      </div>

      {showForm && (
        <SectionCard title="Add New No Permit Record" description="Enter details about the business found without a permit record">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[var(--foreground)]">Business Name *</label>
              <input
                type="text"
                required
                value={formData.businessName}
                onChange={(e) => setFormData((prev) => ({ ...prev, businessName: e.target.value }))}
                className={`mt-1 ${jitFormControlClass}`}
                placeholder="Enter business name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--foreground)]">Witness *</label>
              <input
                type="text"
                required
                value={formData.personAttended}
                onChange={(e) => setFormData((prev) => ({ ...prev, personAttended: e.target.value }))}
                className={`mt-1 ${jitFormControlClass}`}
                placeholder="Name of witness during inspection"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--foreground)]">Line of Business *</label>
              <select
                required
                value={formData.lineOfBusiness}
                onChange={(e) => setFormData((prev) => ({ ...prev, lineOfBusiness: e.target.value }))}
                className={`mt-1 ${jitFormControlClass}`}
              >
                <option value="">-- Select line of business --</option>
                {lineOfBusinessOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--foreground)]">Findings (optional)</label>
              <textarea
                value={formData.findings}
                onChange={(e) => setFormData((prev) => ({ ...prev, findings: e.target.value }))}
                className={`mt-1 ${jitFormControlClass}`}
                rows={3}
                placeholder="Inspection findings. Leave blank to auto-generate from line of business and remarks."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--foreground)]">Address (optional)</label>
              <input
                type="text"
                value={formData.address}
                onChange={(e) => setFormData((prev) => ({ ...prev, address: e.target.value }))}
                className={`mt-1 ${jitFormControlClass}`}
                placeholder="Enter address or description"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--foreground)]">Remarks (optional)</label>
              <textarea
                value={formData.remarks}
                onChange={(e) => setFormData((prev) => ({ ...prev, remarks: e.target.value }))}
                className={`mt-1 ${jitFormControlClass}`}
                rows={3}
                placeholder="Additional notes or observations"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-[var(--foreground)]">Contact Phone (optional)</label>
                <input
                  type="tel"
                  value={formData.contactPhone}
                  onChange={(e) => setFormData((prev) => ({ ...prev, contactPhone: e.target.value }))}
                  className={`mt-1 ${jitFormControlClass}`}
                  placeholder="09XXXXXXXXX"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--foreground)]">Contact Email (optional)</label>
                <input
                  type="email"
                  value={formData.contactEmail}
                  onChange={(e) => setFormData((prev) => ({ ...prev, contactEmail: e.target.value }))}
                  className={`mt-1 ${jitFormControlClass}`}
                  placeholder="owner@example.com"
                />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-[var(--foreground)]">Location Pin on Map *</label>
              <p className="ui-caption mb-2">
                Current: Lat {formData.latitude.toFixed(6)}, Lng {formData.longitude.toFixed(6)}
              </p>
              <LeafletBusinessMap
                markers={[
                  {
                    id: "current",
                    latitude: formData.latitude,
                    longitude: formData.longitude,
                    title: formData.businessName || "Location",
                    subtitle: formData.personAttended || "Current location",
                  },
                ]}
                center={[formData.latitude, formData.longitude]}
                onSelectPosition={handleMapSelect}
              />
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className={`${actionButtonStyles("primary", "sm")} w-full sm:w-auto justify-center`}
              >
                {isSubmitting ? "Saving..." : "Save Record & Generate Notice"}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className={`${actionButtonStyles("secondary", "sm")} w-full sm:w-auto justify-center`}
              >
                Cancel
              </button>
            </div>
          </form>
        </SectionCard>
      )}

      {totalCount === 0 && !isLoading ? (
        <EmptyState
          title="No records yet"
          description="Add your first no-permit record from an inspection."
          action={
            <button onClick={() => setShowForm(true)} className={actionButtonStyles("primary", "sm")}>
              <Plus className="h-4 w-4" />
              Add Record
            </button>
          }
        />
      ) : (
        <>
          {/* Mobile Card View */}
          <div className="space-y-3 md:hidden">
            {records.map((rec) => (
              <div
                key={rec.id}
                className="rounded-2xl border border-[var(--border-color)] bg-[var(--surface)] p-4 shadow-sm space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <span className="font-mono text-xs font-semibold text-[var(--accent)]">
                      {rec.ticketNumber}
                    </span>
                    <h3 className="text-base font-semibold text-[var(--foreground)] mt-0.5 truncate">
                      {rec.businessName}
                    </h3>
                  </div>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[var(--warning-soft)] text-[var(--warning)] border border-[var(--warning)]/20 shrink-0">
                    {rec.ticketStatus}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <p className="text-[var(--ink-muted)]">Witness / Attended</p>
                    <p className="font-medium text-[var(--foreground)] mt-0.5 truncate">{rec.personAttended || "—"}</p>
                  </div>
                  <div>
                    <p className="text-[var(--ink-muted)]">Date Recorded</p>
                    <p className="font-medium text-[var(--foreground)] mt-0.5">{toShortDate(rec.createdAt)}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-[var(--ink-muted)]">Line of Business</p>
                    <p className="font-medium text-[var(--foreground)] mt-0.5">{rec.lineOfBusiness || "—"}</p>
                  </div>
                </div>

                <div className="pt-2 border-t border-[var(--border-color)]">
                  <Link
                    href={`/jit/no-permit-record/${rec.id}/print`}
                    target="_blank"
                    className={`${actionButtonStyles("secondary", "sm")} w-full justify-center`}
                  >
                    <Printer className="h-4 w-4" />
                    Print Notice
                  </Link>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop Table View */}
          <div className={`hidden md:block overflow-x-auto ${isLoading ? "opacity-60" : ""}`}>
            <table className={jitTableClass}>
              <thead>
                <tr>
                  <th>Ticket No.</th>
                  <th>Business Name</th>
                  <th>Witness</th>
                  <th>Line of Business</th>
                  <th>Status</th>
                  <th>Created Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {records.map((rec) => (
                  <tr key={rec.id}>
                    <td className="font-medium text-[var(--foreground)]">{rec.ticketNumber}</td>
                    <td className="font-medium text-[var(--foreground)]">{rec.businessName}</td>
                    <td className="text-[var(--ink-muted)]">{rec.personAttended}</td>
                    <td className="text-[var(--ink-muted)]">{rec.lineOfBusiness}</td>
                    <td className="text-[var(--ink-muted)]">{rec.ticketStatus}</td>
                    <td className="text-[var(--ink-muted)]">{toShortDate(rec.createdAt)}</td>
                    <td>
                      <Link
                        href={`/jit/no-permit-record/${rec.id}/print`}
                        target="_blank"
                        className={actionButtonStyles("secondary", "sm")}
                      >
                        <Printer className="h-4 w-4" />
                        Print
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <PaginationControls
            basePath="/jit/no-permit-record"
            queryParams={{}}
            mode="client"
            isLoading={isLoading}
            page={page}
            pageSize={pageSize}
            totalCount={totalCount}
            totalPages={totalPages}
            recordLabel="records"
            onPageChange={setPage}
            onPageSizeChange={(nextSize) => {
              setPageSize(nextSize);
              setPage(1);
            }}
          />

          <SectionCard title="No Permit Records Map" description="Visual reference of recorded locations on this page">
            <LeafletBusinessMap
              markers={markers}
              center={[EB_MAGALONA_CENTER.latitude, EB_MAGALONA_CENTER.longitude]}
            />
          </SectionCard>
        </>
      )}
    </section>
  );
}
