"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { DashboardChartCard, DASHBOARD_CHART_COLORS } from "@/components/ui/dashboard-chart-card";

export interface DashboardLineDatum {
  label: string;
  value?: number;
  [key: string]: string | number;
}

export interface DashboardLineSeries {
  key: string;
  label: string;
  color?: string;
}

export function DashboardLineChart({
  title,
  description,
  data,
  loading,
  error,
  lineLabel = "Applications",
  series,
  emptyTitle,
  emptyDescription,
}: {
  title: string;
  description?: string;
  data: DashboardLineDatum[];
  loading?: boolean;
  error?: string | null;
  lineLabel?: string;
  series?: DashboardLineSeries[];
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  const hasData =
    series && series.length > 0
      ? data.some((row) =>
          series.some((item) => {
            const value = row[item.key];
            return typeof value === "number" && value > 0;
          })
        )
      : data.some((item) => (typeof item.value === "number" ? item.value > 0 : false));

  return (
    <DashboardChartCard
      title={title}
      description={description}
      loading={loading}
      error={error}
      isEmpty={!hasData}
      emptyTitle={emptyTitle ?? "No processed applications yet."}
      emptyDescription={emptyDescription}
    >
      <div className="h-full w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%" minHeight={160}>
          <LineChart data={data} margin={{ top: 12, right: 20, left: 4, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
            <XAxis dataKey="label" tick={{ fontSize: 12 }} interval="preserveStartEnd" />
            <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
            <Tooltip formatter={(value: number) => value.toLocaleString("en-PH")} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {series && series.length > 0 ? (
              series.map((item, index) => (
                <Line
                  key={item.key}
                  type="monotone"
                  dataKey={item.key}
                  name={item.label}
                  stroke={item.color ?? DASHBOARD_CHART_COLORS[index % DASHBOARD_CHART_COLORS.length]}
                  strokeWidth={2.5}
                  dot={{ r: 2.5 }}
                  activeDot={{ r: 4 }}
                />
              ))
            ) : (
              <Line
                type="monotone"
                dataKey="value"
                name={lineLabel}
                stroke={DASHBOARD_CHART_COLORS[0]}
                strokeWidth={2.5}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </DashboardChartCard>
  );
}
