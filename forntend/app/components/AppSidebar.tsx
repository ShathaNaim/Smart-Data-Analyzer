"use client";

import Link from "next/link";
import { useEffect, useState } from "react";


type DashboardSummary = {
  id: string;
  dataset_id: string;
  name: string;
  item_count: number;
  kpi_count: number;
  chart_count: number;
  created_at: string;
  updated_at: string;
};


function formatUpdatedDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown update time";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}


export default function AppSidebar() {
  const [dashboards, setDashboards] = useState<DashboardSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    const loadDashboards = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(
          "http://localhost:8000/dashboards?limit=5",
          {
            signal: controller.signal,
            credentials: "include",
          },
        );

        const data = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(
            data?.detail ||
              "Could not load saved dashboards.",
          );
        }

        setDashboards(data as DashboardSummary[]);
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
            : "Could not connect to the dashboard service.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    void loadDashboards();

    return () => controller.abort();
  }, []);

  return (
    <aside className="hidden min-h-screen w-72 shrink-0 border-r border-stone-200 bg-white lg:block">
      <div className="sticky top-0 flex h-screen flex-col overflow-y-auto p-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-amber-600">
            Smart Analyzer
          </p>
          <h2 className="mt-1 text-xl font-black text-stone-900">
            Workspace
          </h2>
        </div>

        <Link
          href="/"
          className="mt-6 block rounded-xl bg-amber-400 px-4 py-3 text-center font-bold text-stone-950 transition hover:bg-amber-500 focus:outline-none focus:ring-4 focus:ring-amber-200"
        >
          New analysis
        </Link>

        <div className="mt-8">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-bold uppercase tracking-wider text-stone-700">
              My dashboards
            </h3>

            <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-bold text-amber-800">
              {dashboards.length}
            </span>
          </div>

          {loading && (
            <p
              className="mt-4 text-sm text-stone-500"
              aria-live="polite"
            >
              Loading dashboards...
            </p>
          )}

          {error && (
            <p
              role="alert"
              className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              {error}
            </p>
          )}

          {!loading && !error && dashboards.length === 0 && (
            <div className="mt-4 rounded-xl border border-dashed border-amber-300 bg-amber-50 p-4">
              <p className="text-sm font-semibold text-stone-700">
                No saved dashboards yet.
              </p>
              <p className="mt-1 text-xs leading-5 text-stone-500">
                Run an analysis and add a KPI or chart to create one.
              </p>
            </div>
          )}

          {!loading && dashboards.length > 0 && (
            <nav
              className="mt-3 space-y-2"
              aria-label="Saved dashboards"
            >
              {dashboards.map((dashboard) => (
                <Link
                  key={dashboard.id}
                  href={`/dashboard/${dashboard.id}`}
                  className="block rounded-xl border border-transparent p-3 transition hover:border-amber-200 hover:bg-amber-50"
                >
                  <p className="truncate font-bold text-stone-800">
                    {dashboard.name}
                  </p>

                  <p className="mt-1 text-xs text-stone-500">
                    {dashboard.kpi_count} KPI
                    {dashboard.kpi_count === 1 ? "" : "s"}
                    {" · "}
                    {dashboard.chart_count} chart
                    {dashboard.chart_count === 1 ? "" : "s"}
                  </p>

                  <p className="mt-1 text-xs text-stone-400">
                    Updated {formatUpdatedDate(dashboard.updated_at)}
                  </p>
                </Link>
              ))}
            </nav>
          )}
        </div>

        <p className="mt-auto pt-6 text-xs leading-5 text-stone-400">
          Saved dashboards are available in this workspace.
        </p>
      </div>
    </aside>
  );
}
