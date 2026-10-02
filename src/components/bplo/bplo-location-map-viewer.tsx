"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import { EB_MAGALONA_CENTER } from "@/lib/eb-magalona";
import { MapPin, CheckCircle, XCircle } from "lucide-react";

const LeafletBusinessMap = dynamic(
  () =>
    import("@/components/maps/leaflet-business-map").then(
      (mod) => mod.LeafletBusinessMap
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-[320px] items-center justify-center rounded-2xl border border-[var(--border-color)] bg-[var(--muted-surface)] text-sm text-[var(--ink-muted)]">
        Loading map…
      </div>
    ),
  }
);

interface BploLocationMapViewerProps {
  latitude: number | null;
  longitude: number | null;
  businessName?: string;
  barangay?: string;
  businessAddress?: string;
}

export function BploLocationMapViewer({
  latitude,
  longitude,
  businessName,
  barangay,
  businessAddress,
}: BploLocationMapViewerProps) {
  const hasPinned = latitude != null && longitude != null;

  const selectedPosition = useMemo<[number, number] | null>(() => {
    if (!hasPinned) return null;
    return [latitude!, longitude!];
  }, [hasPinned, latitude, longitude]);

  const mapCenter = useMemo<[number, number]>(() => {
    if (hasPinned) return [latitude!, longitude!];
    return [EB_MAGALONA_CENTER.latitude, EB_MAGALONA_CENTER.longitude];
  }, [hasPinned, latitude, longitude]);

  return (
    <div className="space-y-3">
      {/* Status banner */}
      <div
        className={`flex items-center gap-2.5 rounded-2xl border px-4 py-3 text-sm ${
          hasPinned
            ? "border-[var(--success)] bg-[var(--success-soft)] text-[var(--success)]"
            : "border-[var(--warning)] bg-[var(--warning-soft)] text-[var(--warning)]"
        }`}
      >
        {hasPinned ? (
          <CheckCircle className="h-4 w-4 shrink-0" />
        ) : (
          <XCircle className="h-4 w-4 shrink-0" />
        )}
        <span className="font-medium">
          {hasPinned
            ? "GIS pin recorded — location available for verification"
            : "No GIS pin recorded for this application"}
        </span>
      </div>

      {/* Map — only rendered when a pin exists */}
      {hasPinned ? (
        <div className="overflow-hidden rounded-[28px] border border-[var(--border-color)] bg-[var(--surface)] p-3 shadow-sm">
          <LeafletBusinessMap
            center={mapCenter}
            zoom={16}
            markers={[]}
            selectedPosition={selectedPosition}
            selectedLabel={businessName ? `📍 ${businessName}` : "Pinned Business Location"}
            className="h-[clamp(300px,48vh,460px)] w-full overflow-hidden rounded-2xl border border-[var(--border-color)]"
            useEbMagalonaBounds
            markerVariant="emoji"
          />
        </div>
      ) : (
        <div className="flex min-h-[200px] items-center justify-center rounded-2xl border border-dashed border-[var(--border-color)] bg-[var(--muted-surface)] text-sm text-[var(--ink-muted)]">
          Map unavailable — applicant did not submit a GIS pin.
        </div>
      )}

      {/* Coordinate + address details */}
      <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--muted-surface)] px-4 py-3 text-sm text-[var(--ink-muted)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 font-semibold text-[var(--foreground)]">
              <MapPin className="h-3.5 w-3.5 text-[var(--primary)]" />
              Pinned Location Details
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
              <span className="text-[var(--ink-muted)]">Latitude</span>
              <span className="font-mono text-[var(--foreground)]">
                {hasPinned ? latitude!.toFixed(6) : "—"}
              </span>
              <span className="text-[var(--ink-muted)]">Longitude</span>
              <span className="font-mono text-[var(--foreground)]">
                {hasPinned ? longitude!.toFixed(6) : "—"}
              </span>
              {barangay ? (
                <>
                  <span className="text-[var(--ink-muted)]">Barangay</span>
                  <span className="text-[var(--foreground)]">{barangay}</span>
                </>
              ) : null}
              {businessAddress ? (
                <>
                  <span className="text-[var(--ink-muted)]">Address</span>
                  <span className="text-[var(--foreground)]">{businessAddress}</span>
                </>
              ) : null}
            </div>
          </div>
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
              hasPinned
                ? "border-[var(--success)] bg-[var(--success-soft)] text-[var(--success)]"
                : "border-[var(--warning)] bg-[var(--warning-soft)] text-[var(--warning)]"
            }`}
          >
            {hasPinned ? "✓ Pin on Record" : "⚠ Not Pinned"}
          </span>
        </div>
      </div>

      <p className="px-1 text-xs text-[var(--ink-muted)]">
        <strong>Read-only verification view.</strong> The pin was submitted by the applicant. Staff may record discrepancies in the application remarks.
      </p>
    </div>
  );
}
