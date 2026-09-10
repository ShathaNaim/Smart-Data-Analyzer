"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { apiUrl } from "../lib/api";


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


type DatasetSummary = {
  id: string;
  original_filename: string;
  extension: string;
  file_size: number;
  row_count: number;
  columns: string[];
  description: string | null;
  created_at: string;
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


export default function AppSidebar({ datasetId }: { datasetId?: string }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigationId = useId();
  const menuButton = useRef<HTMLButtonElement>(null);
  const [datasets, setDatasets] = useState<DatasetSummary[]>([]);
  const [datasetsLoading, setDatasetsLoading] = useState(true);
  const [datasetsError, setDatasetsError] = useState<string | null>(null);
  const [dashboards, setDashboards] = useState<DashboardSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingDashboardId, setDeletingDashboardId] = useState<
    string | null
  >(null);
  const [deletingDatasetId, setDeletingDatasetId] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    const loadDatasets = async () => {
      setDatasetsLoading(true);
      setDatasetsError(null);

      try {
        const response = await fetch(
          apiUrl("/datasets?limit=5"),
          {
            signal: controller.signal,
            credentials: "include",
          },
        );
        const data = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(data?.detail || "Could not load saved datasets.");
        }

        setDatasets(data as DatasetSummary[]);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setDatasetsError(
          error instanceof Error
            ? error.message
            : "Could not connect to the dataset service.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setDatasetsLoading(false);
        }
      }
    };

    void loadDatasets();

    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    const loadDashboards = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(
          apiUrl(`/dashboards?limit=50${datasetId ? `&dataset_id=${encodeURIComponent(datasetId)}` : ""}`),
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
  }, [datasetId]);

  const handleDeleteDashboard = async (dashboard: DashboardSummary) => {
    const confirmed = window.confirm(
      `Delete “${dashboard.name}”? This action cannot be undone.`,
    );

    if (!confirmed) return;

    setDeletingDashboardId(dashboard.id);
    setError(null);

    try {
      const response = await fetch(
        apiUrl(`/dashboards/${dashboard.id}`),
        {
          method: "DELETE",
          credentials: "include",
        },
      );

      if (!response.ok) {
        const data = await response.json().catch(() => null);

        throw new Error(
          data?.detail ?? "Could not delete the dashboard.",
        );
      }

      setDashboards((currentDashboards) =>
        currentDashboards.filter((item) => item.id !== dashboard.id),
      );
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not connect to the dashboard service.",
      );
    } finally {
      setDeletingDashboardId(null);
    }
  };

    const handleDeleteDataset = async (dataset: DatasetSummary) => {
    const confirmed = window.confirm(
      `Delete “${dataset.original_filename}”? This action cannot be undone.`,
    );

    if (!confirmed) return;

    setDeletingDatasetId(dataset.id);
    setDatasetsError(null);

    try {
      const response = await fetch(
        apiUrl(`/datasets/${dataset.id}`),
        {
          method: "DELETE",
          credentials: "include",
        },
      );

      if (!response.ok) {
        const data = await response.json().catch(() => null);

        throw new Error(
          data?.detail ?? "Could not delete the dataset.",
        );
      }

      setDatasets((currentDatasets) =>
        currentDatasets.filter((item) => item.id !== dataset.id),
      );
      setDashboards((currentDashboards) =>
        currentDashboards.filter((item) => item.dataset_id !== dataset.id),
      );
    } catch (error) {
      setDatasetsError(
        error instanceof Error
          ? error.message
          : "Could not connect to the dataset service.",
      );
    } finally {
      setDeletingDatasetId(null);
    }
  };

  return (
    <aside
      aria-label="Workspace navigation"
      className="w-full shrink-0 border-b border-stone-200 bg-white lg:min-h-screen lg:w-72 lg:border-b-0 lg:border-r"
      onKeyDown={(event) => {
        if (event.key === "Escape" && mobileOpen) {
          setMobileOpen(false);
          menuButton.current?.focus();
        }
      }}
    >
      <div className="flex items-center justify-between gap-3 px-5 py-3 lg:hidden">
        <span className="font-black text-stone-900">Smart Analyzer</span>
        <button
          ref={menuButton}
          type="button"
          aria-expanded={mobileOpen}
          aria-controls={navigationId}
          onClick={() => setMobileOpen((open) => !open)}
          className="min-h-11 rounded-lg border border-amber-300 px-4 py-2 font-bold text-amber-900 focus:outline-none focus:ring-4 focus:ring-amber-200"
        >
          {mobileOpen ? "Close menu" : "Menu"}
        </button>
      </div>
      <div
        id={navigationId}
        className={`${mobileOpen ? "flex" : "hidden"} max-h-[75dvh] flex-col overflow-y-auto p-5 lg:sticky lg:top-0 lg:flex lg:h-screen lg:max-h-none`}
      >
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-amber-600">
            Smart Analyzer
          </p>
          <h2 className="mt-1 text-xl font-black text-stone-900">
            Workspace
          </h2>
        </div>

        <button
          type="button"
          onClick={() => {
            // Reset the entire analysis page, including pending requests and file inputs.
            // eslint-disable-next-line @next/next/no-location-assign-relative-destination
            window.location.assign("/?new=1");
          }}
          className="mt-6 block rounded-xl bg-amber-400 px-4 py-3 text-center font-bold text-stone-950 transition hover:bg-amber-500 focus:outline-none focus:ring-4 focus:ring-amber-200"
        >
          New analysis
        </button>

        <div className="mt-8">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-bold uppercase tracking-wider text-stone-700">
              My datasets
            </h3>
            <span className="rounded-full bg-sky-100 px-2 py-1 text-xs font-bold text-sky-800">
              {datasets.length}
            </span>
          </div>

          {datasetsLoading && (
            <p className="mt-4 text-sm text-stone-500" aria-live="polite">
              Loading datasets...
            </p>
          )}

          {datasetsError && (
            <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {datasetsError}
            </p>
          )}

          {!datasetsLoading && !datasetsError && datasets.length === 0 && (
            <div className="mt-4 rounded-xl border border-dashed border-sky-300 bg-sky-50 p-4">
              <p className="text-sm font-semibold text-stone-700">
                No uploaded datasets yet.
              </p>
            </div>
          )}

          {!datasetsLoading && datasets.length > 0 && (
            <div className="mt-3 space-y-2" aria-label="Uploaded datasets">
              {datasets.map((dataset) => (
                <div key={dataset.id} className="group relative rounded-xl border border-transparent transition hover:border-sky-200 hover:bg-sky-50">
                <Link
                  
                  href={`/dataset/${dataset.id}`}
                  onClick={() => setMobileOpen(false)}
                  className="block rounded-xl border border-transparent py-3 pl-3 pr-16 transition hover:border-sky-200 hover:bg-sky-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-sky-400"
                >
                  <p className="truncate font-bold text-stone-800" title={dataset.original_filename}>
                    {dataset.original_filename}
                  </p>
                  <p className="mt-1 text-xs text-stone-500">
                    {dataset.row_count.toLocaleString()} rows
                    {" · "}
                    {dataset.columns.length.toLocaleString()} columns
                  </p>
                  <p className="mt-1 text-xs text-stone-400">
                    Uploaded {formatUpdatedDate(dataset.created_at)}
                  </p>
                </Link>
                  <button
                    type="button"
                    onClick={() => void handleDeleteDataset(dataset)}
                    disabled={deletingDatasetId !== null}
                    aria-label={`Delete ${dataset.original_filename}`}
                    title={`Delete ${dataset.original_filename}`}
                    className="absolute right-2 top-2 grid h-11 w-11 place-items-center rounded-lg text-stone-400 opacity-100 transition lg:opacity-0 hover:bg-red-100 hover:text-red-600 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-red-300 disabled:cursor-wait disabled:opacity-50 group-hover:opacity-100"
                  >
                    {deletingDatasetId === dataset.id ? (
                      <span
                        aria-hidden="true"
                        className="h-4 w-4 animate-spin rounded-full border-2 border-red-200 border-t-red-600"
                      />
                    ) : (
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        className="h-4 w-4"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M4 7h16M10 11v6m4-6v6M9 7l1-3h4l1 3m3 0-1 13H7L6 7"
                        />
                      </svg>
                    )}
                  </button>
                </div>
                
              ))}
            </div>
          )}
        </div>

        <div className="mt-8">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-bold uppercase tracking-wider text-stone-700">
              {datasetId ? "Dataset dashboards" : "My dashboards"}
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
                <div
                  key={dashboard.id}
                  className="group relative rounded-xl border border-transparent transition hover:border-amber-200 hover:bg-amber-50"
                >
                  <Link
                    href={`/dashboard/${dashboard.id}`}
                    onClick={() => setMobileOpen(false)}
                    className="block rounded-xl py-3 pl-3 pr-16 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-amber-400"
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

                  <button
                    type="button"
                    onClick={() => void handleDeleteDashboard(dashboard)}
                    disabled={deletingDashboardId !== null}
                    aria-label={`Delete ${dashboard.name}`}
                    title={`Delete ${dashboard.name}`}
                    className="absolute right-2 top-2 grid h-11 w-11 place-items-center rounded-lg text-stone-400 opacity-100 transition lg:opacity-0 hover:bg-red-100 hover:text-red-600 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-red-300 disabled:cursor-wait disabled:opacity-50 group-hover:opacity-100"
                  >
                    {deletingDashboardId === dashboard.id ? (
                      <span
                        aria-hidden="true"
                        className="h-4 w-4 animate-spin rounded-full border-2 border-red-200 border-t-red-600"
                      />
                    ) : (
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        className="h-4 w-4"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M4 7h16M10 11v6m4-6v6M9 7l1-3h4l1 3m3 0-1 13H7L6 7"
                        />
                      </svg>
                    )}
                  </button>
                </div>
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
