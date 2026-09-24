"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { FileText, Calendar, ChevronDown } from "lucide-react";

export interface TransactionOutcomeDatum {
  label: string;
  dateKey?: string;
  submitted: number;
  approvals: number;
  returnsRejections: number;
  inspections: number;
  paymentVerification: number;
  permitReleases: number;
  smsSent: number;
  smsFailed: number;
  logins: number;
  [key: string]: string | number | undefined;
}

interface OutcomeCategory {
  key:
    | "submitted"
    | "approvals"
    | "inspections"
    | "logins"
    | "paymentVerification"
    | "permitReleases"
    | "returnsRejections"
    | "smsSent";
  label: string;
  color: string;
}

const CATEGORIES: OutcomeCategory[] = [
  {
    key: "submitted",
    label: "Applications Submitted",
    color: "#2563EB",
  },
  {
    key: "approvals",
    label: "Approvals",
    color: "#047857",
  },
  {
    key: "inspections",
    label: "Inspections",
    color: "#7A9A8B",
  },
  {
    key: "logins",
    label: "Logins (if tracked)",
    color: "#576858",
  },
  {
    key: "paymentVerification",
    label: "Payment Verification",
    color: "#C25E23",
  },
  {
    key: "permitReleases",
    label: "Permit Releases",
    color: "#F59E0B",
  },
  {
    key: "returnsRejections",
    label: "Returns/Rejections",
    color: "#DC2626",
  },
  {
    key: "smsSent",
    label: "SMS Sent",
    color: "#059669",
  },
];

function parseDate(dateStr?: string, label?: string): Date | null {
  if (dateStr) {
    const parts = dateStr.split("-");
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      return new Date(Date.UTC(year, month, day));
    }
  }
  if (label && label.includes("/")) {
    const [m, d] = label.split("/");
    const year = new Date().getFullYear();
    return new Date(Date.UTC(year, parseInt(m, 10) - 1, parseInt(d, 10)));
  }
  return null;
}

function formatFullDate(dateStr?: string, label?: string): string {
  const d = parseDate(dateStr, label);
  if (!d || isNaN(d.getTime())) return label || "";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    dataKey: string;
    name: string;
    value: number;
    color: string;
    payload: TransactionOutcomeDatum;
  }>;
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  const datum = payload[0]?.payload;
  const formattedDate = formatFullDate(datum?.dateKey, label);
  const catMap = new Map(payload.map((p) => [p.dataKey, p]));

  const activeEntries = CATEGORIES.map((cat) => {
    const entry = catMap.get(cat.key);
    const val = Number(entry?.value ?? datum?.[cat.key] ?? 0);
    return { ...cat, value: val };
  }).filter((item) => item.value > 0);

  return (
    <div className="rounded-xl border border-slate-100 bg-white/95 p-3.5 shadow-xl backdrop-blur-xs min-w-[185px] pointer-events-none transition-all">
      <div className="mb-2 pb-1.5 border-b border-slate-100 text-xs font-bold text-slate-800">
        {formattedDate}
      </div>
      <div className="space-y-1.5">
        {activeEntries.length > 0 ? (
          activeEntries.map((item) => (
            <div key={item.key} className="flex items-center justify-between gap-4 text-xs">
              <div className="flex items-center gap-2">
                <span
                  className="h-2 w-2 rounded-full shrink-0"
                  style={{ backgroundColor: item.color }}
                />
                <span className="font-medium text-slate-600">{item.label}</span>
              </div>
              <span className="font-bold text-slate-900 tabular-nums">
                {item.value.toLocaleString("en-PH")}
              </span>
            </div>
          ))
        ) : (
          <div className="text-xs text-slate-400">No recorded activity</div>
        )}
      </div>
    </div>
  );
}

export function DailyTransactionOutcomesChart({
  data = [],
  className = "",
}: {
  data?: TransactionOutcomeDatum[];
  className?: string;
}) {
  const [hiddenCategories, setHiddenCategories] = useState<Record<string, boolean>>({});

  const toggleCategory = (key: string) => {
    setHiddenCategories((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const dateRangeLabel = useMemo(() => {
    if (!data || data.length === 0) return "Recent 14 days";
    const first = data[0];
    const last = data[data.length - 1];
    const start = formatFullDate(first?.dateKey, first?.label);
    const end = formatFullDate(last?.dateKey, last?.label);
    if (start && end) {
      return `${start} - ${end}`;
    }
    return "Recent 14 days";
  }, [data]);

  // Aggregate totals per category across the period
  const { categoryTotals, totalAllOutcomes } = useMemo(() => {
    const totals: Record<string, number> = {
      submitted: 0,
      approvals: 0,
      inspections: 0,
      logins: 0,
      paymentVerification: 0,
      permitReleases: 0,
      returnsRejections: 0,
      smsSent: 0,
    };
    let grandTotal = 0;
    for (const row of data) {
      for (const cat of CATEGORIES) {
        const val = Number(row[cat.key]) || 0;
        totals[cat.key] += val;
        grandTotal += val;
      }
    }
    return { categoryTotals: totals, totalAllOutcomes: grandTotal };
  }, [data]);

  // Compute maximum daily stacked sum for dynamic Y-axis domain
  const maxStackSum = useMemo(() => {
    let max = 0;
    for (const row of data) {
      let daySum = 0;
      for (const cat of CATEGORIES) {
        if (!hiddenCategories[cat.key]) {
          daySum += Number(row[cat.key]) || 0;
        }
      }
      if (daySum > max) max = daySum;
    }
    return max;
  }, [data, hiddenCategories]);

  const yAxisUpper = Math.max(20, Math.ceil((maxStackSum + 1) / 5) * 5);

  const visibleCategories = CATEGORIES.filter((c) => !hiddenCategories[c.key]);

  return (
    <div
      className={`rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6 shadow-xs transition-shadow hover:shadow-sm ${className}`}
    >
      {/* Header section */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start sm:items-center gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 border border-blue-100/60 shadow-2xs">
            <FileText className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold tracking-tight text-slate-900">
              Daily transaction outcomes
            </h3>
            <p className="mt-0.5 max-w-2xl text-xs leading-relaxed text-slate-500">
              Submissions, approvals, returns/rejections, inspections, payment checks, permit
              releases, and SMS outcomes. Spikes in returns/rejections often predict follow-up
              applicant traffic.
            </p>
          </div>
        </div>

        {/* Date range picker badge */}
        <div className="flex items-center shrink-0">
          <div className="inline-flex items-center gap-2 rounded-lg border border-slate-200/90 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-700 shadow-2xs transition-colors hover:bg-slate-50 select-none">
            <Calendar className="h-3.5 w-3.5 text-slate-600" />
            <span>{dateRangeLabel}</span>
            <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
          </div>
        </div>
      </div>

      {/* Main Chart Area */}
      <div className="h-[280px] w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 15, right: 15, left: -10, bottom: 5 }}
            barSize={26}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#F1F5F9"
              vertical={false}
            />

            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "#94A3B8" }}
              tickLine={false}
              axisLine={{ stroke: "#E2E8F0" }}
              interval="preserveStartEnd"
              dy={6}
            />

            <YAxis
              allowDecimals={false}
              domain={[0, yAxisUpper]}
              ticks={[0, 5, 10, 15, 20]}
              tick={{ fontSize: 11, fill: "#94A3B8" }}
              tickLine={false}
              axisLine={false}
              label={{
                value: "Count",
                angle: -90,
                position: "insideLeft",
                offset: 14,
                style: { fontSize: 11, fill: "#94A3B8", textAnchor: "middle" },
              }}
            />

            <Tooltip
              content={<CustomTooltip />}
              cursor={{ fill: "rgba(241, 245, 249, 0.6)" }}
            />

            {CATEGORIES.map((cat) => {
              const isTopVisible =
                visibleCategories.length > 0 &&
                visibleCategories[visibleCategories.length - 1].key === cat.key;
              return (
                <Bar
                  key={cat.key}
                  dataKey={cat.key}
                  name={cat.label}
                  stackId="stack"
                  fill={cat.color}
                  hide={Boolean(hiddenCategories[cat.key])}
                  radius={isTopVisible ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                />
              );
            })}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Bottom 8 Metric Cards with Progress Bars */}
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-3.5 pt-2">
        {CATEGORIES.map((cat) => {
          const isHidden = Boolean(hiddenCategories[cat.key]);
          const totalVal = categoryTotals[cat.key] ?? 0;
          const pct =
            totalAllOutcomes > 0
              ? Math.round((totalVal / totalAllOutcomes) * 100)
              : 0;

          return (
            <button
              key={cat.key}
              type="button"
              onClick={() => toggleCategory(cat.key)}
              title={isHidden ? `Show ${cat.label}` : `Hide ${cat.label}`}
              className={`flex flex-col justify-between rounded-xl border p-3.5 shadow-2xs transition-all text-left ${
                isHidden
                  ? "border-slate-200/60 bg-slate-50/70 opacity-40 hover:opacity-75"
                  : "border-slate-200/90 bg-white hover:border-slate-300 hover:shadow-xs"
              }`}
            >
              {/* Header: Dot + Label & Big Number */}
              <div className="flex items-start justify-between gap-2 min-w-0 mb-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: cat.color }}
                  />
                  <span className="truncate text-xs font-semibold text-slate-700">
                    {cat.label}
                  </span>
                </div>
                <span className="font-bold text-slate-900 tracking-tight text-xl tabular-nums ml-1">
                  {totalVal.toLocaleString("en-PH")}
                </span>
              </div>

              {/* Bottom: Share % & Mini Horizontal Progress Bar */}
              <div className="flex items-center justify-between gap-2 pt-1">
                <span className="text-xs font-medium text-slate-500 tabular-nums">
                  {pct}%
                </span>
                <div className="h-1.5 w-24 sm:w-28 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.min(100, Math.max(pct, totalVal > 0 ? 4 : 0))}%`,
                      backgroundColor: cat.color,
                    }}
                  />
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Very bottom row: centered legend list */}
      <div className="mt-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 pt-3 border-t border-slate-100 text-xs text-slate-600 font-medium select-none">
        {CATEGORIES.map((cat) => {
          const isHidden = Boolean(hiddenCategories[cat.key]);
          return (
            <button
              key={cat.key}
              type="button"
              onClick={() => toggleCategory(cat.key)}
              className={`flex items-center gap-2 transition-opacity hover:opacity-80 ${
                isHidden ? "opacity-35 line-through" : "opacity-100"
              }`}
            >
              <span
                className="h-2 w-2 rounded-full shrink-0"
                style={{ backgroundColor: cat.color }}
              />
              <span>{cat.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
