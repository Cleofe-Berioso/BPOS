"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { EB_MAGALONA_CENTER, isWithinEbMagalona } from "@/lib/eb-magalona";

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

type LocationValue = {
  latitude: number;
  longitude: number;
};

export interface BusinessLocationPickerProps {
  value?: LocationValue | null;
  onChange: (value: LocationValue | null) => void;
  readOnly?: boolean;
  error?: string;
}

export function BusinessLocationPicker({
  value = null,
  onChange,
  readOnly = false,
  error,
}: BusinessLocationPickerProps) {
  const [validationError, setValidationError] = useState<string | null>(null);
  const selectionKey = `${readOnly}|${value?.latitude ?? "none"}|${value?.longitude ?? "none"}`;
  const [validationSelectionKey, setValidationSelectionKey] = useState(selectionKey);

  if (selectionKey !== validationSelectionKey) {
    setValidationSelectionKey(selectionKey);
    if (validationError !== null) {
      setValidationError(null);
    }
  }

  const selectedPosition = useMemo<[number, number] | null>(() => {
    if (!value) return null;
    return [value.latitude, value.longitude];
  }, [value]);

  function handleSelectPosition(next: LocationValue) {
    if (readOnly) return;

    const latitude = Number(next.latitude);
    const longitude = Number(next.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      setValidationError("Selected point is invalid. Please choose another location.");
      return;
    }

    if (!isWithinEbMagalona(latitude, longitude)) {
      setValidationError("Selected point must stay within EB Magalona.");
      return;
    }

    setValidationError(null);
    onChange({ latitude, longitude });
  }

  const displayError = error ?? validationError;

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-[28px] border border-[var(--border-color)] bg-[var(--surface)] p-3 shadow-sm">
        <LeafletBusinessMap
          center={[EB_MAGALONA_CENTER.latitude, EB_MAGALONA_CENTER.longitude]}
          zoom={13}
          markers={[]}
          selectedPosition={selectedPosition}
          onSelectPosition={readOnly ? undefined : handleSelectPosition}
          selectedLabel={readOnly ? "Pinned Business Location (Locked)" : "Selected Business Location"}
          className="h-[clamp(320px,52vh,480px)] w-full overflow-hidden rounded-2xl border border-[var(--border-color)]"
          useEbMagalonaBounds
          markerVariant="emoji"
        />
      </div>

      <div className="space-y-2 rounded-2xl border border-[var(--border-color)] bg-[var(--muted-surface)] px-4 py-3 text-sm text-[var(--ink-muted)]">
        <div className="flex items-center justify-between gap-2">
          <p className="font-medium text-[var(--foreground)]">
            {readOnly ? "Pinned Business Location (Locked)" : "Pin the actual business location within EB Magalona."}
          </p>
          {readOnly ? (
            <span className="inline-flex items-center rounded-full bg-[var(--surface)] px-2.5 py-0.5 text-xs font-semibold text-[var(--ink-muted)] border border-[var(--border-color)]">
              Locked / View-Only
            </span>
          ) : null}
        </div>
        {readOnly ? (
          <p className="text-xs text-[var(--ink-muted)]">
            Retained from original business application. View-only during renewal.
          </p>
        ) : null}
        <p className="text-sm text-[var(--ink-muted)]">
          {readOnly ? "Pinned Location: " : "Selected Business Location: "}
          {value ? `${value.latitude.toFixed(6)}, ${value.longitude.toFixed(6)}` : "Not selected"}
        </p>
        {displayError ? <p className="text-sm font-medium text-[var(--danger)]">{displayError}</p> : null}
      </div>
    </div>
  );
}
