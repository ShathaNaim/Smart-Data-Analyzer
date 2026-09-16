"use client";

import { useEffect, useState } from "react";

import ChartRenderer from "../../components/ChartRenderer";
import KpiCard from "../../components/KpiCard";
import { apiUrl } from "../../lib/api";
import { createPiePalette } from "../../lib/chartColors";
import type {
  SharedDashboard as SharedDashboardData,
} from "../../types/sharedDashboard";


type SharedDashboardProps = {
  token: string;
};


const KPI_WIDTH_CLASSES: Record<number, string> = {
  3: "col-span-12 sm:col-span-6 lg:col-span-3",
  6: "col-span-12 sm:col-span-6 lg:col-span-6",
};


const CHART_WIDTH_CLASSES: Record<number, string> = {
  6: "col-span-12 lg:col-span-6",
  12: "col-span-12",
};


const FALLBACK_CHART_COLORS = [
  "#f59e0b",
  "#0ea5e9",
  "#10b981",
  "#8b5cf6",
  "#ef4444",
];


const seriesColorKey = (seriesKey: string) => `series:${seriesKey}`;


const getChartColors = (
  item: SharedDashboardData["items"][number],
): string[] => {
  const seriesColors = item.chart_spec?.series.map((series, index) =>
    item.color_config[seriesColorKey(series.key)] ||
    (index === 0 ? item.color_config.primary : undefined) ||
    FALLBACK_CHART_COLORS[index % FALLBACK_CHART_COLORS.length],
  ) ?? FALLBACK_CHART_COLORS;

  return item.chart_spec?.type === "pie" || item.chart_spec?.type === "donut"
    ? createPiePalette(seriesColors[0], item.chart_spec.data.length)
    : seriesColors;
};


function formatUpdatedDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}


export default function SharedDashboard({
  token,
}: SharedDashboardProps) {
  const [dashboard, setDashboard] =
    useState<SharedDashboardData | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    const loadSharedDashboard = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(
          apiUrl(`/shared-dashboards/${encodeURIComponent(token)}`),
          {
            signal: controller.signal,
          },
        );

        const data = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(
            data?.detail ||
              "This shared dashboard is unavailable.",
          );
        }

        setDashboard(data as SharedDashboardData);
      } catch (error) {
        if (
          error instanceof DOMException &&
          error.name === "AbortError"
        ) {
          return;
        }

        setError(
          error instanceof Error
            ? error.message
            : "Could not load the shared dashboard.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    void loadSharedDashboard();

    return () => controller.abort();
  }, [token]);

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center bg-amber-50 text-stone-600">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-amber-200 border-t-amber-500" />
          <p className="mt-4 font-semibold">
            Loading shared dashboard...
          </p>
        </div>
      </main>
    );
  }

  if (!dashboard) {
    return (
      <main className="grid min-h-screen place-items-center bg-amber-50 px-5">
        <div className="max-w-md rounded-2xl border border-red-200 bg-white p-6 text-center shadow-sm">
          <h1 className="text-xl font-black text-stone-900">
            Dashboard unavailable
          </h1>
          <p className="mt-3 text-sm leading-6 text-red-700">
            {error || "This shared dashboard could not be found."}
          </p>
        </div>
      </main>
    );
  }

  const kpiItems = dashboard.items
    .filter(
      (item) =>
        item.item_type === "kpi" &&
        item.kpi_spec !== null,
    )
    .sort(
      (firstItem, secondItem) =>
        firstItem.position_y - secondItem.position_y,
    );

  const chartItems = dashboard.items
    .filter(
      (item) =>
        item.item_type === "chart" &&
        item.chart_spec !== null,
    )
    .sort(
      (firstItem, secondItem) =>
        firstItem.position_y - secondItem.position_y,
    );

  return (
    <main className="min-h-screen bg-amber-50 px-5 py-8 text-stone-900 sm:px-8">
      <section className="mx-auto max-w-6xl">
        <header className="rounded-2xl border border-amber-200 bg-white p-5 shadow-sm">
          <span className="inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-bold uppercase tracking-widest text-amber-800">
            Shared dashboard · View only
          </span>

          <h1 className="mt-3 text-3xl font-black text-stone-900">
            {dashboard.name}
          </h1>

          <p className="mt-2 text-sm text-stone-500">
            Last updated {formatUpdatedDate(dashboard.updated_at)}
          </p>
        </header>

        {dashboard.items.length === 0 ? (
          <div className="mt-6 rounded-2xl border-2 border-dashed border-amber-300 bg-white/70 p-12 text-center">
            <p className="font-bold text-stone-800">
              This shared dashboard is empty.
            </p>
          </div>
        ) : (
          <div className="mt-6 space-y-6">
            {kpiItems.length > 0 && (
              <section
                aria-label="Dashboard KPIs"
                className="grid grid-cols-12 gap-4"
              >
                {kpiItems.map((item, index) => (
                  <div
                    key={`${item.title}-${index}`}
                    className={
                      KPI_WIDTH_CLASSES[item.width] ??
                      KPI_WIDTH_CLASSES[3]
                    }
                  >
                    {item.kpi_spec && (
                      <KpiCard kpi={item.kpi_spec} />
                    )}
                  </div>
                ))}
              </section>
            )}

            {chartItems.length > 0 && (
              <section
                aria-label="Dashboard charts"
                className="grid grid-cols-12 gap-5"
              >
                {chartItems.map((item, index) => (
                  <article
                    key={`${item.title}-${index}`}
                    className={`${
                      CHART_WIDTH_CLASSES[item.width] ??
                      CHART_WIDTH_CLASSES[6]
                    } rounded-2xl border border-amber-200 bg-white p-4 shadow-sm`}
                  >
                    {item.chart_spec && (
                      <ChartRenderer
                        chart={item.chart_spec}
                        colors={getChartColors(item)}
                      />
                    )}
                  </article>
                ))}
              </section>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
