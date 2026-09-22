"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { DashboardChartCard, DASHBOARD_CHART_COLORS } from "@/components/ui/dashboard-chart-card";

export interface DashboardStackedBarSeries {
  key: string;
  label: string;
  color?: string;
}

export function DashboardStackedBarChart({
  title,
  description,
  data,
  categoryKey,
  series,
  stacked = true,
  loading,
  error,
  emptyTitle,
  emptyDescription,
}: {
  title: string;
  description?: string;
  data: Array<Record<string, string | number>>;
  categoryKey: string;
  series: DashboardStackedBarSeries[];
  stacked?: boolean;
  loading?: boolean;
  error?: string | null;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  const hasData = data.some((row) =>
    series.some((item) => {
      const value = row[item.key];
      return typeof value === "number" && value > 0;
    })
  );

  return (
    <DashboardChartCard
      title={title}
      description={description}
      loading={loading}
      error={error}
      isEmpty={!hasData}
      emptyTitle={emptyTitle ?? "No pending queue records yet."}
      emptyDescription={emptyDescription}
    >
      <div className="h-full w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 12, right: 20, left: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
            <XAxis dataKey={categoryKey} tick={{ fontSize: 12 }} interval="preserveStartEnd" />
            <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
            <Tooltip formatter={(value: number) => value.toLocaleString("en-PH")} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {series.map((item, index) => (
              <Bar
                key={item.key}
                dataKey={item.key}
                stackId={stacked ? "stack" : undefined}
                name={item.label}
                fill={item.color ?? DASHBOARD_CHART_COLORS[index % DASHBOARD_CHART_COLORS.length]}
                radius={stacked ? (index === series.length - 1 ? [6, 6, 0, 0] : [0, 0, 0, 0]) : [4, 4, 0, 0]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </DashboardChartCard>
  );
}
