"use client";

import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { DashboardChartCard, DASHBOARD_CHART_COLORS } from "@/components/ui/dashboard-chart-card";

export interface DashboardPieDatum {
  name: string;
  value: number;
}

export function DashboardPieChart({
  title,
  description,
  data,
  loading,
  error,
  emptyTitle,
  emptyDescription,
}: {
  title: string;
  description?: string;
  data: DashboardPieDatum[];
  loading?: boolean;
  error?: string | null;
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
      emptyTitle={emptyTitle ?? "No application data available yet."}
      emptyDescription={emptyDescription}
    >
      <div className="h-full w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%" minHeight={160}>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="48%"
              outerRadius="78%"
              labelLine={false}
            >
              {data.map((entry, index) => (
                <Cell key={`${entry.name}-${index}`} fill={DASHBOARD_CHART_COLORS[index % DASHBOARD_CHART_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(value: number) => value.toLocaleString("en-PH")} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </DashboardChartCard>
  );
}
