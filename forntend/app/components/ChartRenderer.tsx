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

export type ChartSpec = {
  id: string;
  type: "bar";
  title: string;
  subtitle?: string | null;
  x_axis: {
    key: string;
    label: string;
    value_type: "category" | "number" | "date" | "datetime";
  };
  series: Array<{
    key: string;
    label: string;
    format: "number" | "integer" | "currency" | "percent";
    currency?: string | null;
  }>;
  data: Array<Record<string, string | number | boolean | null>>;
};

type ChartRendererProps = {
  chart: ChartSpec;
};

export default function ChartRenderer({
  chart,
}: ChartRendererProps) {
  if (chart.type !== "bar") {
    return (
      <p className="text-sm text-red-700">
        Unsupported chart type: {chart.type}
      </p>
    );
  }

  return (
    <section className="mt-5 rounded-2xl border border-amber-200 bg-white p-5">
      <h3 className="font-bold text-stone-900">
        {chart.title}
      </h3>

      {chart.subtitle && (
        <p className="mt-1 text-sm text-stone-500">
          {chart.subtitle}
        </p>
      )}

      <div className="mt-5 h-80 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chart.data}
            margin={{
              top: 10,
              right: 10,
              bottom: 30,
              left: 10,
            }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#fde68a"
            />

            <XAxis
              dataKey={chart.x_axis.key}
              label={{
                value: chart.x_axis.label,
                position: "insideBottom",
                offset: -15,
              }}
            />

            <YAxis />

            <Tooltip
              formatter={(value, name) => [
                typeof value === "number"
                  ? value.toLocaleString(undefined, {
                      maximumFractionDigits: 2,
                    })
                  : String(value),
                String(name),
              ]}
            />

            {chart.series.map((series) => (
              <Bar
                key={series.key}
                dataKey={series.key}
                name={series.label}
                fill="#f59e0b"
                radius={[6, 6, 0, 0]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}