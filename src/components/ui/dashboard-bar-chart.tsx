"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { DashboardChartCard, DASHBOARD_CHART_COLORS } from "@/components/ui/dashboard-chart-card";

export interface DashboardBarDatum {
  label: string;
  value: number;
}

export function DashboardBarChart({
  title,
  description,
  data,
  loading,
  error,
  barLabel = "Average Hours",
  emptyTitle,
  emptyDescription,
}: {
  title: string;
  description?: string;
  data: DashboardBarDatum[];
  loading?: boolean;
  error?: string | null;
  barLabel?: string;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  const hasData = data.some((item) => item.value > 0);

  return (
    <DashboardChartCard
      title={title}
      description={description}
      loading={loading}
      error={error}
      isEmpty={!hasData}
      emptyTitle={emptyTitle ?? "No processing duration records yet."}
      emptyDescription={emptyDescription}
    >
      <div className="h-full w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%" minHeight={160}>
          <BarChart data={data} margin={{ top: 12, right: 20, left: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
            <XAxis dataKey="label" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip formatter={(value: number) => `${value.toFixed(1)} hrs`} />
            <Bar dataKey="value" name={barLabel} fill={DASHBOARD_CHART_COLORS[0]} radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </DashboardChartCard>
  );
}
