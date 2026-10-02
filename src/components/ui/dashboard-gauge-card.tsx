"use client";

import {
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
} from "recharts";
import { DashboardChartCard } from "@/components/ui/dashboard-chart-card";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function DashboardGaugeCard({
  title,
  description,
  value,
  max,
  unit,
  loading,
  error,
}: {
  title: string;
  description?: string;
  value: number;
  max: number;
  unit?: string;
  loading?: boolean;
  error?: string | null;
}) {
  const safeMax = max > 0 ? max : 1;
  const safeValue = clamp(value, 0, safeMax);
  const percent = (safeValue / safeMax) * 100;
  const hasData = safeValue > 0 || safeMax > 0;

  return (
    <DashboardChartCard title={title} description={description} loading={loading} error={error} isEmpty={!hasData}>
      <div className="h-full w-full min-w-0">
        <div className="relative h-full w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%" minHeight={160}>
            <RadialBarChart
              data={[{ name: title, value: percent }]}
              startAngle={210}
              endAngle={-30}
              innerRadius="60%"
              outerRadius="100%"
            >
              <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
              <RadialBar dataKey="value" fill="var(--primary)" background cornerRadius={8} />
            </RadialBarChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <p className="ui-gauge-value">{safeValue.toLocaleString("en-PH")}</p>
            <p className="ui-caption mt-0.5 font-medium uppercase tracking-wide">
              {unit ?? "Value"} / {safeMax.toLocaleString("en-PH")}
            </p>
          </div>
        </div>
      </div>
    </DashboardChartCard>
  );
}
