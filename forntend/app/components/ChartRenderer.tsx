"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type ChartSpec = {
  id: string;

  // Support every chart type returned by the backend.
  type: "bar" | "line" | "area" | "pie";

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

  data: Array<
    Record<string, string | number | boolean | null>
  >;
};

type ChartRendererProps = {
  chart: ChartSpec;
};

// Put shared colors outside the component.
// All chart types can use this same color list.
const CHART_COLORS = [
  "#f59e0b",
  "#0ea5e9",
  "#10b981",
  "#8b5cf6",
  "#ef4444",
];

export default function ChartRenderer({
  chart,
}: ChartRendererProps) {
  // This variable will contain the selected Recharts chart.
  let renderedChart: React.ReactNode;

  switch (chart.type) {
    case "bar":
      renderedChart = (
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
          <Tooltip />
          <Legend />

          {chart.series.map((series, index) => (
            <Bar
              key={series.key}
              dataKey={series.key}
              name={series.label}
              fill={
                CHART_COLORS[
                  index % CHART_COLORS.length
                ]
              }
              radius={[6, 6, 0, 0]}
            />
          ))}
        </BarChart>
      );
      break;

    case "line":
      renderedChart = (
        <LineChart
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
          <Tooltip />
          <Legend />

          {chart.series.map((series, index) => (
            <Line
              key={series.key}
              type="monotone"
              dataKey={series.key}
              name={series.label}
              stroke={
                CHART_COLORS[
                  index % CHART_COLORS.length
                ]
              }
              strokeWidth={3}
              activeDot={{ r: 6 }}
            />
          ))}
        </LineChart>
      );
      break;

    case "area":
      renderedChart = (
        <AreaChart
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
          <Tooltip />
          <Legend />

          {chart.series.map((series, index) => (
            <Area
              key={series.key}
              type="monotone"
              dataKey={series.key}
              name={series.label}
              stroke={
                CHART_COLORS[
                  index % CHART_COLORS.length
                ]
              }
              fill={
                CHART_COLORS[
                  index % CHART_COLORS.length
                ]
              }
              fillOpacity={0.25}
              strokeWidth={3}
            />
          ))}
        </AreaChart>
      );
      break;

    case "pie": {
      // The backend requires pie charts to have
      // exactly one numeric series.
      const pieSeries = chart.series[0];

      renderedChart = (
        <PieChart>
          <Pie
            data={chart.data}
            dataKey={pieSeries.key}
            nameKey={chart.x_axis.key}
            cx="50%"
            cy="50%"
            outerRadius={110}
            label
          >
            {chart.data.map((_, index) => (
              <Cell
                key={`${chart.id}-${index}`}
                fill={
                  CHART_COLORS[
                    index % CHART_COLORS.length
                  ]
                }
              />
            ))}
          </Pie>

          <Tooltip />
          <Legend />
        </PieChart>
      );
      break;
    }

    default:
      renderedChart = (
        <p className="text-sm text-red-700">
          Unsupported chart type
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
        <ResponsiveContainer
          width="100%"
          height="100%"
        >
          {renderedChart}
        </ResponsiveContainer>
      </div>
    </section>
  );
}