"use client";

import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Clock, Calendar, ChevronDown } from "lucide-react";

export interface StageWorkloadDatum {
  label: string;
  dateKey?: string;
  bploReview: number;
  bploAssessment: number;
  bploPayment: number;
  bploRelease: number;
  departmentHeadApproval: number;
  jitInspection: number;
  [key: string]: string | number | undefined;
}

interface StageConfig {
  key:
    | "bploAssessment"
    | "bploPayment"
    | "bploRelease"
    | "bploReview"
    | "departmentHeadApproval"
    | "jitInspection";
  label: string;
  color: string;
  gradientId: string;
  bgTint: string;
  borderTint: string;
}

const STAGES: StageConfig[] = [
  {
    key: "bploAssessment",
    label: "BPLO Assessment",
    color: "#5E9E82",
    gradientId: "gradient-bploAssessment",
    bgTint: "bg-emerald-50/25",
    borderTint: "border-emerald-200/60",
  },
  {
    key: "bploPayment",
    label: "BPLO Payment",
    color: "#EA580C",
    gradientId: "gradient-bploPayment",
    bgTint: "bg-amber-50/35",
    borderTint: "border-amber-200/60",
  },
  {
    key: "bploRelease",
    label: "BPLO Release",
    color: "#059669",
    gradientId: "gradient-bploRelease",
    bgTint: "bg-green-50/30",
    borderTint: "border-green-200/60",
  },
  {
    key: "bploReview",
    label: "BPLO Review",
    color: "#2563EB",
    gradientId: "gradient-bploReview",
    bgTint: "bg-blue-50/30",
    borderTint: "border-blue-200/60",
  },
  {
    key: "departmentHeadApproval",
    label: "Department Head Approval",
    color: "#64748B",
    gradientId: "gradient-departmentHeadApproval",
    bgTint: "bg-slate-50/50",
    borderTint: "border-slate-200/70",
  },
  {
    key: "jitInspection",
    label: "JIT Inspection",
    color: "#DC2626",
    gradientId: "gradient-jitInspection",
    bgTint: "bg-rose-50/30",
    borderTint: "border-rose-200/60",
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

function Sparkline({
  data,
  color,
  stageKey,
}: {
  data: number[];
  color: string;
  stageKey: string;
}) {
  const width = 64;
  const height = 24;
  const padding = 2;

  const min = Math.min(...data, 0);
  const max = Math.max(...data, 1);
  const range = max - min || 1;

  const points: [number, number][] = data.map((val, idx) => {
    const x = padding + (idx / Math.max(data.length - 1, 1)) * (width - padding * 2);
    const y = height - padding - ((val - min) / range) * (height - padding * 2);
    return [x, y];
  });

  let pathD = `M ${points[0][0].toFixed(1)} ${points[0][1].toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? i : i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2 < points.length ? i + 2 : i + 1];
    const cp1x = p1[0] + (p2[0] - p0[0]) / 5;
    const cp1y = p1[1] + (p2[1] - p0[1]) / 5;
    const cp2x = p2[0] - (p3[0] - p1[0]) / 5;
    const cp2y = p2[1] - (p3[1] - p1[1]) / 5;
    pathD += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }

  const areaD = `${pathD} L ${width - padding} ${height} L ${padding} ${height} Z`;
  const gradId = `spark-grad-${stageKey}`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-16 h-6 overflow-visible shrink-0">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.35} />
          <stop offset="100%" stopColor={color} stopOpacity={0.0} />
        </linearGradient>
      </defs>
      <path d={areaD} fill={`url(#${gradId})`} />
      <path
        d={pathD}
        fill="none"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    dataKey: string;
    name: string;
    value: number;
    color: string;
    payload: StageWorkloadDatum;
  }>;
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  const datum = payload[0]?.payload;
  const formattedDate = formatFullDate(datum?.dateKey, label);
  const stageMap = new Map(payload.map((p) => [p.dataKey, p]));

  return (
    <div className="rounded-xl border border-slate-100 bg-white/95 p-3.5 shadow-xl backdrop-blur-xs min-w-[185px] pointer-events-none transition-all">
      <div className="mb-2 pb-1.5 border-b border-slate-100 text-xs font-bold text-slate-800">
        {formattedDate}
      </div>
      <div className="space-y-1.5">
        {STAGES.map((stage) => {
          const entry = stageMap.get(stage.key);
          const val = entry?.value ?? datum?.[stage.key] ?? 0;
          return (
            <div key={stage.key} className="flex items-center justify-between gap-4 text-xs">
              <div className="flex items-center gap-2">
                <span
                  className="h-2 w-2 rounded-full shrink-0"
                  style={{ backgroundColor: stage.color }}
                />
                <span className="font-medium text-slate-600">{stage.label}</span>
              </div>
              <span className="font-bold text-slate-900 tabular-nums">
                {Number(val).toLocaleString("en-PH")}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function WhereIsWorkWaitingChart({
  data = [],
  className = "",
}: {
  data?: StageWorkloadDatum[];
  className?: string;
}) {
  const [hiddenStages, setHiddenStages] = useState<Record<string, boolean>>({});

  const toggleStage = (key: string) => {
    setHiddenStages((prev) => ({
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

  // Sparkline data array per stage
  const stageSparklines = useMemo(() => {
    const res: Record<string, number[]> = {
      bploAssessment: [],
      bploPayment: [],
      bploRelease: [],
      bploReview: [],
      departmentHeadApproval: [],
      jitInspection: [],
    };
    for (const row of data) {
      for (const stage of STAGES) {
        res[stage.key].push(Number(row[stage.key]) || 0);
      }
    }
    return res;
  }, [data]);

  // Current (latest date) workload counts & percentage share
  const { currentCounts, totalCurrentWorkload } = useMemo(() => {
    const lastRow = data.length > 0 ? data[data.length - 1] : null;
    const counts: Record<string, number> = {
      bploAssessment: 0,
      bploPayment: 0,
      bploRelease: 0,
      bploReview: 0,
      departmentHeadApproval: 0,
      jitInspection: 0,
    };
    let total = 0;
    if (lastRow) {
      for (const stage of STAGES) {
        const val = Number(lastRow[stage.key]) || 0;
        counts[stage.key] = val;
        total += val;
      }
    }
    return { currentCounts: counts, totalCurrentWorkload: total };
  }, [data]);

  // Peak workload value for dynamic Y-axis domain
  const maxVal = useMemo(() => {
    let max = 0;
    for (const row of data) {
      for (const stage of STAGES) {
        if (!hiddenStages[stage.key]) {
          const val = Number(row[stage.key]) || 0;
          if (val > max) max = val;
        }
      }
    }
    return max;
  }, [data, hiddenStages]);

  const yAxisUpper = Math.max(12, Math.ceil((maxVal + 1) / 3) * 3);

  return (
    <div
      className={`rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6 shadow-xs transition-shadow hover:shadow-sm ${className}`}
    >
      {/* Header section */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start sm:items-center gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 border border-blue-100/60 shadow-2xs">
            <Clock className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold tracking-tight text-slate-900">
              Where is work waiting?
            </h3>
            <p className="mt-0.5 max-w-2xl text-xs leading-relaxed text-slate-500">
              Daily open workload by office stage. The highest line indicates the current bottleneck
              where applicants are waiting on a next action.
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
          <AreaChart
            data={data}
            margin={{ top: 15, right: 15, left: -10, bottom: 5 }}
          >
            <defs>
              {STAGES.map((stage) => (
                <linearGradient
                  key={stage.gradientId}
                  id={stage.gradientId}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="5%" stopColor={stage.color} stopOpacity={0.2} />
                  <stop offset="95%" stopColor={stage.color} stopOpacity={0.0} />
                </linearGradient>
              ))}
            </defs>

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
              cursor={{
                stroke: "#94A3B8",
                strokeWidth: 1.2,
                strokeDasharray: "4 4",
              }}
            />

            {STAGES.map((stage) => (
              <Area
                key={stage.key}
                type="monotone"
                dataKey={stage.key}
                name={stage.label}
                stroke={stage.color}
                strokeWidth={2.2}
                fill={`url(#${stage.gradientId})`}
                fillOpacity={1}
                hide={Boolean(hiddenStages[stage.key])}
                dot={{
                  r: 3,
                  fill: stage.color,
                  stroke: "#FFFFFF",
                  strokeWidth: 1.5,
                }}
                activeDot={{
                  r: 5,
                  fill: stage.color,
                  stroke: "#FFFFFF",
                  strokeWidth: 2,
                }}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Bottom 6 Stage Metric Cards with Sparklines */}
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-2">
        {STAGES.map((stage) => {
          const isHidden = Boolean(hiddenStages[stage.key]);
          const currentCount = currentCounts[stage.key] ?? 0;
          const sharePct =
            totalCurrentWorkload > 0
              ? Math.round((currentCount / totalCurrentWorkload) * 100)
              : 0;
          const sparkData = stageSparklines[stage.key] || [];

          return (
            <button
              key={stage.key}
              type="button"
              onClick={() => toggleStage(stage.key)}
              title={isHidden ? `Show ${stage.label}` : `Hide ${stage.label}`}
              className={`flex flex-col justify-between rounded-xl border p-3.5 shadow-2xs transition-all text-left ${
                isHidden
                  ? "border-slate-200/60 bg-slate-50/70 opacity-40 hover:opacity-75"
                  : `${stage.bgTint} ${stage.borderTint} hover:border-slate-300 hover:shadow-xs`
              }`}
            >
              {/* Header: Stage Dot & Name */}
              <div className="flex items-center gap-2 min-w-0 mb-2">
                <span
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: stage.color }}
                />
                <span className="truncate text-xs font-semibold text-slate-700">
                  {stage.label}
                </span>
              </div>

              {/* Middle: Big Metric Number */}
              <div className="mb-2">
                <span className="font-bold text-slate-900 tracking-tight text-2xl tabular-nums">
                  {currentCount.toLocaleString("en-PH")}
                </span>
              </div>

              {/* Bottom: Share % & Sparkline */}
              <div className="flex items-end justify-between gap-1 pt-1">
                <span className="text-xs font-medium text-slate-500 tabular-nums">
                  {sharePct}%
                </span>
                <Sparkline
                  data={sparkData}
                  color={stage.color}
                  stageKey={stage.key}
                />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
