"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import ChartRenderer, {
  type ChartSpec,
} from "../../components/ChartRenderer";
import KpiCard, {
  type KpiSpec,
} from "../../components/KpiCard";


type DashboardItem = {
  id: string;
  title: string;
  item_type: "chart" | "kpi";
  chart_spec: ChartSpec | null;
  kpi_spec: KpiSpec | null;
  color_config: Record<string, string>;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
  created_at: string;
  updated_at: string;
};

type Dashboard = {
  id: string;
  dataset_id: string;
  name: string;
  items: DashboardItem[];
  created_at: string;
  updated_at: string;
};

type DashboardEditorProps = {
  dashboardId: string;
};

type EditableChartType = "bar" | "line" | "area" | "pie";

const FALLBACK_CHART_COLORS = [
  "#0ea5e9",
  "#10b981",
  "#8b5cf6",
  "#ef4444",
];

const KPI_WIDTH_CLASSES: Record<number, string> = {
  3: "col-span-12 sm:col-span-6 lg:col-span-3",
  6: "col-span-12 sm:col-span-6 lg:col-span-6",
};

const CHART_WIDTH_CLASSES: Record<number, string> = {
  6: "col-span-12 lg:col-span-6",
  12: "col-span-12",
};

const sizeButtonClass = (selected: boolean) =>
  selected
    ? "rounded-md bg-amber-400 px-3 py-1.5 text-xs font-bold text-stone-900 shadow-sm"
    : "rounded-md px-3 py-1.5 text-xs font-semibold text-stone-600 transition hover:bg-white";


export default function DashboardEditor({
  dashboardId,
}: DashboardEditorProps) {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    const loadDashboard = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `http://localhost:8000/dashboards/${dashboardId}`,
          { signal: controller.signal, credentials: "include" },
        );
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.detail || "Could not load the dashboard.");
        }

        setDashboard(data);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setError(
          error instanceof Error
            ? error.message
            : "Could not load the dashboard.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    void loadDashboard();

    return () => controller.abort();
  }, [dashboardId]);

  const removeItem = (itemId: string) => {
    setDashboard((previousDashboard) => {
      if (!previousDashboard) return previousDashboard;

      return {
        ...previousDashboard,
        items: previousDashboard.items.filter((item) => item.id !== itemId),
      };
    });
    setSavedMessage(null);
  };

  const changeChartType = (
    itemId: string,
    chartType: EditableChartType,
  ) => {
    setDashboard((previousDashboard) => {
      if (!previousDashboard) return previousDashboard;

      return {
        ...previousDashboard,
        items: previousDashboard.items.map((item) =>
          item.id === itemId && item.chart_spec
            ? {
                ...item,
                chart_spec: {
                  ...item.chart_spec,
                  type: chartType,
                },
              }
            : item,
        ),
      };
    });
    setSavedMessage(null);
  };

  const changeChartColor = (itemId: string, color: string) => {
    setDashboard((previousDashboard) => {
      if (!previousDashboard) return previousDashboard;

      return {
        ...previousDashboard,
        items: previousDashboard.items.map((item) =>
          item.id === itemId && item.chart_spec
            ? {
                ...item,
                color_config: {
                  ...item.color_config,
                  primary: color,
                },
              }
            : item,
        ),
      };
    });
    setSavedMessage(null);
  };

  const saveDashboard = async () => {
    if (!dashboard || saving) return;

    setSaving(true);
    setError(null);
    setSavedMessage(null);

    try {
      const response = await fetch(
        `http://localhost:8000/dashboards/${dashboard.id}`,
        {
          method: "PUT",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: dashboard.name,
            items: dashboard.items.map((item) => ({
              id: item.id,
              title: item.title,
              item_type: item.item_type,
              chart_spec: item.chart_spec,
              kpi_spec: item.kpi_spec,
              color_config: item.color_config,
              position_x: item.position_x,
              position_y: item.position_y,
              width: item.width,
              height: item.height,
            })),
          }),
        },
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Could not save the dashboard.");
      }

      setDashboard(data);
      setSavedMessage("Dashboard saved.");
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not save the dashboard.",
      );
    } finally {
      setSaving(false);
    }
  };

  const copyShareLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setShareCopied(true);
      setShareError(null);
    } catch {
      setShareCopied(false);
      setShareError(
        "The link was created, but automatic copying was blocked. Copy it from the field below.",
      );
    }
  };

  const createShareLink = async () => {
    if (!dashboard || sharing) return;

    setSharing(true);
    setShareError(null);
    setShareCopied(false);

    try {
      const response = await fetch(
        `http://localhost:8000/dashboards/${dashboard.id}/share`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            expires_in_days: null,
          }),
        },
      );
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          data?.detail || "Could not create the share link.",
        );
      }

      const url = `${window.location.origin}/share/${data.token}`;
      setShareUrl(url);
      await copyShareLink(url);
    } catch (error) {
      setShareError(
        error instanceof Error
          ? error.message
          : "Could not create the share link.",
      );
    } finally {
      setSharing(false);
    }
  };

  const changeItemWidth = (
    itemId: string,
    width: number,
  ) => {
    setDashboard((previousDashboard) => {
      if (!previousDashboard) return previousDashboard;

      return {
        ...previousDashboard,
        items: previousDashboard.items.map((item) =>
          item.id === itemId
            ? { ...item, width }
            : item,
        ),
      };
    });

    setSavedMessage(null);
  };

    const moveItem = (
      itemId: string,
      direction: -1 | 1,
    ) => {
      setDashboard((previousDashboard) => {
        if (!previousDashboard) {
          return previousDashboard;
        }

        const currentItem = previousDashboard.items.find(
          (item) => item.id === itemId,
        );

        if (!currentItem) {
          return previousDashboard;
        }

        const sameTypeItems = previousDashboard.items
          .filter(
            (item) =>
              item.item_type === currentItem.item_type,
          )
          .sort(
            (firstItem, secondItem) =>
              firstItem.position_y - secondItem.position_y,
          );

        const currentIndex = sameTypeItems.findIndex(
          (item) => item.id === itemId,
        );

        const targetIndex = currentIndex + direction;

        if (
          currentIndex === -1 ||
          targetIndex < 0 ||
          targetIndex >= sameTypeItems.length
        ) {
          return previousDashboard;
        }

        const targetItem = sameTypeItems[targetIndex];

        return {
          ...previousDashboard,
          items: previousDashboard.items.map((item) => {
            if (item.id === currentItem.id) {
              return {
                ...item,
                position_y: targetItem.position_y,
              };
            }

            if (item.id === targetItem.id) {
              return {
                ...item,
                position_y: currentItem.position_y,
              };
            }

            return item;
          }),
        };
      });

      setSavedMessage(null);
    };

    function LeftArrowIcon() {
  return (
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
        d="M19 12H5m6-6-6 6 6 6"
      />
    </svg>
  );
}


function RightArrowIcon() {
  return (
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
        d="M5 12h14m-6-6 6 6-6 6"
      />
    </svg>
  );
}

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center bg-amber-50 text-stone-700">
        Loading dashboard...
      </main>
    );
  }

  if (!dashboard) {
    return (
      <main className="grid min-h-screen place-items-center bg-amber-50 px-5">
        <div className="max-w-md rounded-2xl border border-red-200 bg-white p-6 text-center">
          <p className="font-semibold text-red-700">
            {error || "Dashboard not found."}
          </p>
          <Link className="mt-4 inline-block font-bold text-amber-700" href="/">
            Return to analysis
          </Link>
        </div>
      </main>
    );
  }

      const kpiItems = dashboard.items
        .filter(
          (item) =>
            item.item_type === "kpi" &&
            item.kpi_spec,
        )
        .sort(
          (firstItem, secondItem) =>
            firstItem.position_y - secondItem.position_y,
        );

      const chartItems = dashboard.items
        .filter(
          (item) =>
            item.item_type === "chart" &&
            item.chart_spec,
        )
        .sort(
          (firstItem, secondItem) =>
            firstItem.position_y - secondItem.position_y,
        );
  return (
    <main className="min-h-screen bg-amber-50 px-5 py-8 text-stone-900 sm:px-8">
      <section className="mx-auto max-w-6xl">
        <header className="flex flex-col gap-4 rounded-2xl border border-amber-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1">
            <label className="text-xs font-bold uppercase tracking-widest text-amber-700" htmlFor="dashboard-name">
              Dashboard name
            </label>
            <input
              id="dashboard-name"
              value={dashboard.name}
              onChange={(event) => {
                setDashboard({ ...dashboard, name: event.target.value });
                setSavedMessage(null);
              }}
              className="mt-1 block w-full rounded-lg border border-amber-200 px-3 py-2 text-2xl font-black outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-100"
            />
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/"
              className="rounded-xl border border-amber-300 px-4 py-3 font-bold text-amber-800 transition hover:bg-amber-50"
            >
              Back to analysis
            </Link>
            <button
              type="button"
              onClick={() => void createShareLink()}
              disabled={sharing}
              className="rounded-xl border border-violet-300 px-4 py-3 font-bold text-violet-800 transition hover:bg-violet-50 disabled:cursor-wait disabled:border-stone-200 disabled:text-stone-400"
            >
              {sharing ? "Creating link..." : "Share"}
            </button>
            <button
              type="button"
              onClick={() => void saveDashboard()}
              disabled={saving || !dashboard.name.trim()}
              className="rounded-xl bg-stone-900 px-5 py-3 font-bold text-white transition hover:bg-amber-500 hover:text-stone-950 disabled:cursor-not-allowed disabled:bg-stone-300"
            >
              {saving ? "Saving..." : "Save dashboard"}
            </button>
          </div>
        </header>

        {(shareUrl || shareError) && (
          <section className="mt-4 rounded-2xl border border-violet-200 bg-violet-50 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <label className="min-w-0 flex-1 text-xs font-bold uppercase tracking-wide text-violet-800">
                Read-only share link
                <input
                  readOnly
                  value={shareUrl || ""}
                  onFocus={(event) => event.currentTarget.select()}
                  className="mt-1 block w-full rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm font-medium normal-case tracking-normal text-stone-700 outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
                />
              </label>
              {shareUrl && (
                <button
                  type="button"
                  onClick={() => void copyShareLink(shareUrl)}
                  className="rounded-lg bg-violet-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-violet-800"
                >
                  {shareCopied ? "Copied" : "Copy link"}
                </button>
              )}
            </div>
            <p className="mt-2 text-xs leading-5 text-violet-700">
              Anyone with this link can view the last saved dashboard, but cannot edit it.
            </p>
            {shareError && (
              <p role="alert" className="mt-2 text-sm font-medium text-red-700">
                {shareError}
              </p>
            )}
          </section>
        )}

        {error && (
          <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-700">
            {error}
          </p>
        )}
        {savedMessage && (
          <p role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-700">
            {savedMessage}
          </p>
        )}

        {dashboard.items.length === 0 ? (
          <div className="mt-6 rounded-2xl border-2 border-dashed border-amber-300 bg-white/70 p-12 text-center">
            <p className="font-bold text-stone-800">This dashboard is empty.</p>
            <Link href="/" className="mt-2 inline-block text-sm font-semibold text-amber-700">
              Generate and add a chart or KPI
            </Link>
          </div>
        ) : (
          <div className="mt-6 space-y-6">
            {kpiItems.length > 0 && (
              <section aria-label="Dashboard KPIs">
                <div className="grid grid-cols-12 gap-4">
                  {kpiItems.map((item, index) => (
                    
                    <div
                      key={item.id}
                      className={KPI_WIDTH_CLASSES[item.width] ?? KPI_WIDTH_CLASSES[3]}
                    >


                       <div
                              className="flex rounded-lg border border-amber-200 bg-white p-1"
                              aria-label={`Reorder ${item.title}`}
                            >
                              <button
                                type="button"
                                onClick={() => moveItem(item.id, -1)}
                                disabled={index === 0}
                                aria-label={`Move ${item.title} left`}
                                title="Move left"
                                className="grid h-8 w-8 place-items-center rounded-md text-stone-600 transition hover:bg-amber-100 hover:text-stone-900 disabled:cursor-not-allowed disabled:opacity-30"
                              >
                                <LeftArrowIcon />
                              </button>

                              <button
                                type="button"
                                onClick={() => moveItem(item.id, 1)}
                                disabled={index === kpiItems.length - 1}
                                aria-label={`Move ${item.title} right`}
                                title="Move right"
                                className="grid h-8 w-8 place-items-center rounded-md text-stone-600 transition hover:bg-amber-100 hover:text-stone-900 disabled:cursor-not-allowed disabled:opacity-30"
                              >
                                <RightArrowIcon />
                              </button>
                            </div>
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <div className="flex rounded-lg bg-amber-100/70 p-1" aria-label="KPI size">
                          <button
                            type="button"
                            onClick={() => changeItemWidth(item.id, 3)}
                            aria-pressed={item.width === 3}
                            className={sizeButtonClass(item.width === 3)}
                          >
                            Small
                          </button>
                          <button
                            type="button"
                            onClick={() => changeItemWidth(item.id, 6)}
                            aria-pressed={item.width === 6}
                            className={sizeButtonClass(item.width === 6)}
                          >
                            Wide
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeItem(item.id)}
                          className="rounded-lg px-2 py-1 text-xs font-semibold text-red-700 transition hover:bg-red-50"
                        >
                          Remove
                        </button>
                      </div>
                      {item.kpi_spec && <KpiCard kpi={item.kpi_spec} />}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {chartItems.length > 0 && (
              <section
                aria-label="Dashboard charts"
                className="grid grid-cols-12 gap-5"
              >
            {chartItems.map((item, index) => (
              <article
                key={item.id}
                className={`${CHART_WIDTH_CLASSES[item.width] ?? CHART_WIDTH_CLASSES[6]} rounded-2xl border border-amber-200 bg-white p-4 shadow-sm`}
              >

                <div className="flex flex-wrap items-end justify-between gap-3">
                  {item.chart_spec && (
                  <div className="flex flex-wrap items-end gap-3">
                    <label className="text-xs font-bold uppercase tracking-wide text-stone-600">
                      Chart type
                      <select
                        value={item.chart_spec.type}
                        onChange={(event) =>
                          changeChartType(
                            item.id,
                            event.target.value as EditableChartType,
                          )
                        }
                        className="mt-1 block rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm font-semibold normal-case tracking-normal outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-100"
                      >
                        <option value="bar">Bar</option>
                        <option value="line">Line</option>
                        <option value="area">Area</option>
                        {item.chart_spec.series.length === 1 && (
                          <option value="pie">Pie</option>
                        )}
                      </select>
                    </label>

                    <label className="text-xs font-bold uppercase tracking-wide text-stone-600">
                      Primary color
                      <input
                        type="color"
                        value={item.color_config.primary || "#f59e0b"}
                        onChange={(event) =>
                          changeChartColor(item.id, event.target.value)
                        }
                        className="mt-1 block h-10 w-16 cursor-pointer rounded-lg border border-amber-200 bg-white p-1"
                      />
                    </label>
                  </div>
                  )}
                  <div className="flex items-center gap-2">
                    <div
                      className="flex rounded-lg border border-amber-200 bg-white p-1"
                      aria-label={`Reorder ${item.title}`}
                    >
                      <button
                        type="button"
                        onClick={() => moveItem(item.id, -1)}
                        disabled={index === 0}
                        aria-label={`Move ${item.title} earlier`}
                        title="Move left"
                        className="grid h-8 w-8 place-items-center rounded-md text-stone-600 transition hover:bg-amber-100 hover:text-stone-900 disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        <LeftArrowIcon />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveItem(item.id, 1)}
                        disabled={index === chartItems.length - 1}
                        aria-label={`Move ${item.title} later`}
                        title="Move right"
                        className="grid h-8 w-8 place-items-center rounded-md text-stone-600 transition hover:bg-amber-100 hover:text-stone-900 disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        <RightArrowIcon />
                      </button>
                    </div>
                    <div className="flex rounded-lg bg-amber-100/70 p-1" aria-label="Chart size">
                      <button
                        type="button"
                        onClick={() => changeItemWidth(item.id, 6)}
                        aria-pressed={item.width === 6}
                        className={sizeButtonClass(item.width === 6)}
                      >
                        Half
                      </button>
                      <button
                        type="button"
                        onClick={() => changeItemWidth(item.id, 12)}
                        aria-pressed={item.width === 12}
                        className={sizeButtonClass(item.width === 12)}
                      >
                        Full
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      className="rounded-lg px-3 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50"
                    >
                      Remove
                    </button>
                  </div>
                </div>
                {item.chart_spec && (
                  <ChartRenderer
                    chart={item.chart_spec}
                    colors={[
                      item.color_config.primary || "#f59e0b",
                      ...FALLBACK_CHART_COLORS,
                    ]}
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
