"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import ChartRenderer, {
  type ChartSpec,
} from "../../components/ChartRenderer";


type DashboardItem = {
  id: string;
  title: string;
  chart_spec: ChartSpec;
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


export default function DashboardEditor({
  dashboardId,
}: DashboardEditorProps) {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    const loadDashboard = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `http://127.0.0.1:8000/dashboards/${dashboardId}`,
          { signal: controller.signal },
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
          item.id === itemId
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
          item.id === itemId
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
        `http://127.0.0.1:8000/dashboards/${dashboard.id}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: dashboard.name,
            items: dashboard.items.map((item) => ({
              id: item.id,
              title: item.title,
              chart_spec: item.chart_spec,
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
              onClick={() => void saveDashboard()}
              disabled={saving || !dashboard.name.trim()}
              className="rounded-xl bg-stone-900 px-5 py-3 font-bold text-white transition hover:bg-amber-500 hover:text-stone-950 disabled:cursor-not-allowed disabled:bg-stone-300"
            >
              {saving ? "Saving..." : "Save dashboard"}
            </button>
          </div>
        </header>

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
              Generate and add a chart
            </Link>
          </div>
        ) : (
          <div className="mt-6 grid gap-5 lg:grid-cols-2">
            {dashboard.items.map((item) => (
              <article key={item.id} className="rounded-2xl border border-amber-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-end justify-between gap-3">
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
                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    className="rounded-lg px-3 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50"
                  >
                    Remove
                  </button>
                </div>
                <ChartRenderer
                  chart={item.chart_spec}
                  colors={[
                    item.color_config.primary || "#f59e0b",
                    ...FALLBACK_CHART_COLORS,
                  ]}
                />
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
