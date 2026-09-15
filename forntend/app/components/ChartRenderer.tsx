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
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type ChartText = {
  title?: string | null;
  subtitle?: string | null;
  x_axis?: string | null;
  y_axis?: string | null;
  series?: Record<string, string>;
};

export type ChartSpec = {
  id: string;

  // Support every chart type returned by the backend.
  type: "bar" | "line" | "area" | "pie" | "scatter" | "histogram";

  title: string;
  subtitle?: string | null;
  text?: ChartText | null;

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
  colors?: string[];
};

const AXIS_TICK = { fill: "#57534e", fontSize: 12 };
const TOOLTIP_STYLE = {
  border: "1px solid #e7e5e4",
  borderRadius: 12,
  padding: "10px 14px",
  boxShadow: "0 4px 16px rgb(0 0 0 / 0.08)",
  fontSize: 13,
};
const LEGEND_STYLE = { fontSize: 12, color: "#57534e", lineHeight: "24px" };

const CHART_COLORS = [
  "#f59e0b",
  "#0ea5e9",
  "#10b981",
  "#8b5cf6",
  "#ef4444",
];

export default function ChartRenderer({
  chart: sourceChart,
  colors = CHART_COLORS,
}: ChartRendererProps) {
  const chart = {
    ...sourceChart,
    title: sourceChart.text?.title ?? sourceChart.title,
    subtitle: sourceChart.text?.subtitle ?? sourceChart.subtitle,
    x_axis: { ...sourceChart.x_axis, label: sourceChart.text?.x_axis ?? sourceChart.x_axis.label },
    series: sourceChart.series.map((series) => ({
      ...series,
      label: sourceChart.text?.series?.[series.key] ?? series.label,
    })),
  };
  const yAxisLabel = chart.text?.y_axis
    ? { value: chart.text.y_axis, angle: -90, position: "insideLeft" as const }
    : undefined;
  // Let the axis skip crowded labels without removing any plotted values.
  const formatAxisLabel = (value: unknown) => {
    const label = String(value ?? "");
    return label.length > 24 ? `${label.slice(0, 23)}...` : label;
  };

  // This variable will contain the selected Recharts chart.
  let renderedChart: React.ReactNode;

  switch (chart.type) {
    case "scatter":
      renderedChart = (
        <ScatterChart margin={{ top: 20, right: 25, bottom: 35, left: 15 }}>
          <CartesianGrid stroke="#e7e5e4" strokeDasharray="3 3" />
          <XAxis type="number" dataKey={chart.x_axis.key} name={chart.x_axis.label} tick={AXIS_TICK} domain={["auto", "auto"]} label={{ value: chart.x_axis.label, position: "insideBottom", offset: -20 }} />
          <YAxis type="number" dataKey={chart.series[0]?.key} name={chart.series[0]?.label} tick={AXIS_TICK} width={85} domain={["auto", "auto"]} label={yAxisLabel ?? { value: chart.series[0]?.label, angle: -90, position: "insideLeft" }} />
          <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ strokeDasharray: "3 3" }} />
          <Scatter data={chart.data} name={chart.series[0]?.label} fill={colors[0]} fillOpacity={0.7} />
        </ScatterChart>
      );
      break;
    case "histogram":
    case "bar":
      renderedChart = (
        <BarChart
          data={chart.data}
          barCategoryGap={chart.type === "histogram" ? 0 : "10%"}
          margin={{
            top: 10,
            right: 10,
            bottom: 24,
            left: 10,
          }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="#e7e5e4"
            vertical={false}
          />

          <XAxis
            dataKey={chart.x_axis.key}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={{ stroke: "#d6d3d1" }}
            interval="preserveStartEnd"
            minTickGap={20}
            tickFormatter={formatAxisLabel}
            textAnchor="middle"
            height={60}
            tickMargin={10}
            label={{
              value: chart.x_axis.label,
              position: "insideBottom",
              offset: -12,
            }}
          />

          <YAxis
            width={chart.text?.y_axis ? 85 : 60}
            allowDecimals={chart.type !== "histogram"}
            label={yAxisLabel}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            labelStyle={{ color: "#292524", fontWeight: 600, marginBottom: 4 }}
            itemStyle={{ padding: "2px 0" }}
          />
          <Legend verticalAlign="top" iconType="circle" iconSize={8} wrapperStyle={LEGEND_STYLE} />

          {chart.series.map((series, index) => (
            <Bar
              key={series.key}
              dataKey={series.key}
              name={series.label}
              fill={
                colors[
                  index % colors.length
                ]
              }
              radius={chart.type === "histogram" ? [0, 0, 0, 0] : [6, 6, 0, 0]}
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
            bottom: 24,
            left: 10,
          }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="#e7e5e4"
            vertical={false}
          />

          <XAxis
            dataKey={chart.x_axis.key}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={{ stroke: "#d6d3d1" }}
            interval="preserveStartEnd"
            minTickGap={20}
            tickFormatter={formatAxisLabel}
            textAnchor="middle"
            height={60}
            tickMargin={10}
            label={{
              value: chart.x_axis.label,
              position: "insideBottom",
              offset: -12,
            }}
          />

          <YAxis
            width={chart.text?.y_axis ? 85 : 60}
            label={yAxisLabel}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            labelStyle={{ color: "#292524", fontWeight: 600, marginBottom: 4 }}
            itemStyle={{ padding: "2px 0" }}
          />
          <Legend verticalAlign="top" iconType="circle" iconSize={8} wrapperStyle={LEGEND_STYLE} />

          {chart.series.map((series, index) => (
            <Line
              key={series.key}
              type="monotone"
              dataKey={series.key}
              name={series.label}
              stroke={
                colors[
                  index % colors.length
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
            bottom: 24,
            left: 10,
          }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="#e7e5e4"
            vertical={false}
          />

          <XAxis
            dataKey={chart.x_axis.key}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={{ stroke: "#d6d3d1" }}
            interval="preserveStartEnd"
            minTickGap={20}
            tickFormatter={formatAxisLabel}
            textAnchor="middle"
            height={60}
            tickMargin={10}
            label={{
              value: chart.x_axis.label,
              position: "insideBottom",
              offset: -12,
            }}
          />

          <YAxis
            width={chart.text?.y_axis ? 85 : 60}
            label={yAxisLabel}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            labelStyle={{ color: "#292524", fontWeight: 600, marginBottom: 4 }}
            itemStyle={{ padding: "2px 0" }}
          />
          <Legend verticalAlign="top" iconType="circle" iconSize={8} wrapperStyle={LEGEND_STYLE} />

          {chart.series.map((series, index) => (
            <Area
              key={series.key}
              type="monotone"
              dataKey={series.key}
              name={series.label}
              stroke={
                colors[
                  index % colors.length
                ]
              }
              fill={
                colors[
                  index % colors.length
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
      if (!pieSeries) break;

      renderedChart = (
        <PieChart>
          <Pie
            data={chart.data}
            dataKey={pieSeries.key}
            nameKey={chart.x_axis.key}
            cx="50%"
            cy="50%"
            outerRadius="70%"
            stroke="#ffffff"
            strokeWidth={2}
            label
          >
            {chart.data.map((_, index) => (
              <Cell
                key={`${chart.id}-${index}`}
                fill={
                  colors[
                    index % colors.length
                  ]
                }
              />
            ))}
          </Pie>

          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            labelStyle={{ color: "#292524", fontWeight: 600, marginBottom: 4 }}
            itemStyle={{ padding: "2px 0" }}
          />
          <Legend iconType="circle" iconSize={8} wrapperStyle={LEGEND_STYLE} />
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
    <section className="mt-5 min-w-0 rounded-2xl border border-amber-200 bg-white p-4 shadow-sm sm:p-5">
      <h3 className="break-words text-base font-bold leading-6 text-stone-900">
        {chart.title}
      </h3>

      {chart.subtitle && (
        <p className="mt-1 break-words text-sm leading-6 text-stone-600">
          {chart.subtitle}
        </p>
      )}

      {chart.data.length === 0 || chart.series.length === 0 ? (
        <div className="mt-5 flex h-64 items-center justify-center rounded-xl bg-stone-50 px-6 text-center text-sm text-stone-600" role="status">
          No data to display for this chart.
        </div>
      ) : (
        <div className="mt-5 h-96 w-full min-w-0">
          <div className="h-full w-full min-w-0">
            <ResponsiveContainer
              width="100%"
              height="100%"
            >
              {renderedChart}
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </section>
  );
}
