"use client";

import { useEffect, useMemo, useRef, useState, useId, type KeyboardEvent } from "react";

import type { AddressOption } from "@/lib/address-types";

interface SearchableSelectProps {
  options: AddressOption[];
  value: string;
  selectedLabel?: string;
  onChange: (option: AddressOption) => void;
  placeholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  loading?: boolean;
  error?: string;
  className?: string;
  id?: string;
  labelId?: string;
  ariaLabel?: string;
}

/**
 * Searchable dropdown that looks like a native select.
 * - Click trigger to open panel.
 * - Type to filter options.
 * - Click option or press Enter to select.
 * - Press Escape or click outside to close.
 * - Keyboard: ArrowUp/ArrowDown to navigate highlighted option.
 */
export function SearchableSelect({
  options,
  value,
  selectedLabel,
  onChange,
  placeholder = "Select…",
  emptyMessage = "No matches.",
  disabled = false,
  loading = false,
  error,
  className = "",
  id,
  labelId,
  ariaLabel,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightIndex, setHighlightIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const errorId = `${controlId}-error`;

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return options;
    return options.filter(
      (option) => option.label.toLowerCase().includes(normalizedQuery) || option.value.toLowerCase().includes(normalizedQuery)
    );
  }, [options, query]);

  // Reset highlight when filtered list changes
  useEffect(() => {
    setHighlightIndex(0);
  }, [query]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Focus search input when panel opens
  useEffect(() => {
    if (!open) return;
    const timeoutId = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => window.clearTimeout(timeoutId);
  }, [open]);

  function handleTriggerClick() {
    if (disabled) return;
    setOpen((prev) => !prev);
    setQuery("");
  }

  function selectOption(option: AddressOption) {
    onChange(option);
    setOpen(false);
    setQuery("");
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const chosen = filtered[highlightIndex];
      if (chosen) selectOption(chosen);
    } else if (e.key === "Escape") {
      setOpen(false);
      setQuery("");
    }
  }

  const displayLabel = selectedLabel ?? options.find((option) => option.value === value)?.label ?? "";
  const triggerBase =
    "w-full min-h-[2.75rem] rounded-[var(--radius-control)] border px-3 py-2.5 text-sm text-left flex items-center justify-between transition-colors";
  const triggerEnabled =
    "border-[var(--border-color)] bg-[var(--surface)] text-[var(--foreground)] focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--primary)_15%,transparent)] cursor-pointer";
  const triggerDisabled =
    "border-[var(--border-color)] bg-[var(--muted-surface)] text-[var(--ink-muted)] cursor-not-allowed";
  const triggerError = error ? "border-[var(--danger)] focus:border-[var(--danger)] focus:ring-[color-mix(in_srgb,var(--danger)_12%,transparent)]" : "";

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        id={controlId}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={labelId}
        aria-label={labelId ? undefined : ariaLabel ?? placeholder}
        aria-describedby={error ? errorId : undefined}
        disabled={disabled || loading}
        className={`${triggerBase} ${disabled || loading ? triggerDisabled : triggerEnabled} ${triggerError}`}
        onClick={handleTriggerClick}
      >
        <span className={displayLabel ? "text-[var(--foreground)]" : "text-[var(--ink-muted)]"}>
          {loading ? "Loading…" : displayLabel || placeholder}
        </span>
        <svg
          className={`h-4 w-4 shrink-0 text-[var(--ink-muted)] transition-transform ${open ? "rotate-180" : ""}`}
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {open ? (
        <div className="absolute z-50 mt-1 w-full rounded-[var(--radius-card)] border border-[var(--border-color)] bg-[var(--surface)] shadow-lg">
          <div className="border-b border-[var(--border-color)] p-2">
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search…"
              aria-label="Search options"
              aria-invalid={Boolean(error)}
              aria-describedby={error ? errorId : undefined}
              className="w-full rounded-[var(--radius-control)] border border-[var(--border-color)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--ink-muted)] focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--primary)_15%,transparent)]"
            />
          </div>

          {error ? <div id={errorId} className="ui-inline-error px-3 py-2">{error}</div> : null}

          <div role="listbox" className="max-h-56 overflow-y-auto py-1">
            {loading ? (
              <div className="px-3 py-2 text-sm text-[var(--ink-muted)]">Loading…</div>
            ) : error ? (
              <div className="ui-inline-error px-3 py-2">{error}</div>
            ) : filtered.length === 0 ? (
              <div className="px-3 py-2 text-sm italic text-[var(--ink-muted)]">{emptyMessage}</div>
            ) : (
              filtered.map((option, index) => (
                <div
                  key={option.value}
                  role="option"
                  tabIndex={index === highlightIndex ? 0 : -1}
                  aria-selected={option.value === value}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onChange(option);
                    setOpen(false);
                    setQuery("");
                  }}
                  onMouseEnter={() => setHighlightIndex(index)}
                  className={`cursor-pointer px-3 py-2 text-sm transition-colors ${index === highlightIndex
                      ? "bg-[var(--primary-soft)] text-[var(--primary-strong)]"
                      : option.value === value
                        ? "bg-[var(--muted-surface)] font-medium text-[var(--foreground)]"
                        : "text-[var(--foreground)] hover:bg-[var(--muted-surface)]"
                    }`}
                >
                  {option.label}
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
