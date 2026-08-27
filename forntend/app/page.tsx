"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ChartRenderer, {
  type ChartSpec,
} from "./components/ChartRenderer";
import KpiCard, {
  type KpiSpec,
} from "./components/KpiCard";

import type {
  AnalysisSuggestions,
  ChartSuggestion,
  KpiSuggestion,
  SuggestionPreviewResponse,
} from "./types/analysisSuggestions";


type UploadeResult = {
  file_id: string;
  filename: string;
  rows: number;
  columns: string[];
  preview: Record<string, unknown>[];
};

type NumericStats = Record<string, Record<string, number | null>>;

type SummaryResult = {
  rows: number;
  columns: number;
  column_names: string[];
  data_types: Record<string, string>;
  missing_values: Record<string, number>;
  numeric_summary: NumericStats;
};

type ColumnDetails = {
  column_name: string;
  data_type: string;
  missing_values: number;
  unique_values: number;
  top_5_values: Record<string, number>;
  mean?: number | null;
  min?: number | null;
  max?: number | null;
};

type AskResponse =
  | {
      status: "needs_clarification";
      conversation_id: string;
      message: string;
      options: Array<{
        value: string;
        label: string;
      }>;
      allow_free_text: boolean;
    }
  | {
      status: "complete";
      conversation_id: string;
      answer: string;
      charts: ChartSpec[];
      kpis: KpiSpec[];
      assumptions: string[];
      warnings: string[];
    };

type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

type Clarification = {
  message: string;
  options: Array<{
    value: string;
    label: string;
  }>;
  allowFreeText: boolean;
};

type SavedDashboardItem = {
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
};

type SavedDashboard = {
  id: string;
  name: string;
  items: SavedDashboardItem[];
};

export default function Home() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<UploadeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<SummaryResult | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [columnDetails, setColumnDetails] = useState<ColumnDetails | null>(null);
  const [columnLoading, setColumnLoading] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [askLoading, setAskLoading] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);
  const [charts, setCharts] = useState<ChartSpec[]>([]);
  const [kpis, setKpis] = useState<KpiSpec[]>([]);
  const [assumptions, setAssumptions] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversationHistory, setConversationHistory] = useState<
    ConversationMessage[]
  >([]);
  const [clarification, setClarification] =
    useState<Clarification | null>(null);
  const [addingItemId, setAddingItemId] = useState<string | null>(null);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [analysisRestored, setAnalysisRestored] = useState(false);
  const [suggestions, setSuggestions] =useState<AnalysisSuggestions | null>(null);

  const [suggestionsLoading, setSuggestionsLoading] =useState(false);
  const [previewingSuggestionId,setPreviewingSuggestionId,] = useState<string | null>(null);
  const [suggestionPreviewError,setSuggestionPreviewError,] = useState<string | null>(null);

  const [suggestionsError, setSuggestionsError] =useState<string | null>(null);

  const handleAddToDashboard = async (
    dashboardItem:
      | { type: "chart"; spec: ChartSpec }
      | { type: "kpi"; spec: KpiSpec },
  ) => {
    if (!result || addingItemId) return;

    const itemId = dashboardItem.spec.id;
    const itemTitle = dashboardItem.spec.title;

    setAddingItemId(itemId);
    setDashboardError(null);

    const dashboardStorageKey = `dashboard:${result.file_id}`;

    try {
      const storedDashboardId = sessionStorage.getItem(dashboardStorageKey);
      let currentDashboard: SavedDashboard | null = null;

      if (storedDashboardId) {
        const response = await fetch(
          `http://127.0.0.1:8000/dashboards/${storedDashboardId}`,
        );
        const data = await response.json();

        if (response.ok) {
          currentDashboard = data;
        } else if (response.status === 404) {
          sessionStorage.removeItem(dashboardStorageKey);
        } else {
          throw new Error(data.detail || "Could not load the dashboard.");
        }
      }

      if (!currentDashboard) {
        const response = await fetch(
          "http://127.0.0.1:8000/dashboards",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              dataset_id: result.file_id,
              name: `${result.filename} dashboard`,
            }),
          },
        );
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.detail || "Could not create the dashboard.");
        }

        currentDashboard = data;
        sessionStorage.setItem(dashboardStorageKey, data.id);
      }

      if (!currentDashboard) {
        throw new Error("Could not prepare the dashboard.");
      }

      const dashboard = currentDashboard;
      const existingItems = dashboard.items.map((item) => ({
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
      }));
      const itemAlreadyAdded = existingItems.some(
        (item) =>
          item.item_type === dashboardItem.type &&
          (item.chart_spec?.id === itemId || item.kpi_spec?.id === itemId),
      );
      const nextPositionY = existingItems.reduce(
        (lowestRow, item) =>
          Math.max(lowestRow, item.position_y + item.height),
        0,
      );
      const items = itemAlreadyAdded
        ? existingItems
        : [
            ...existingItems,
            {
              id: null,
              title: itemTitle,
              item_type: dashboardItem.type,
              chart_spec:
                dashboardItem.type === "chart" ? dashboardItem.spec : null,
              kpi_spec:
                dashboardItem.type === "kpi" ? dashboardItem.spec : null,
              color_config: { primary: "#f59e0b" },
              position_x: 0,
              position_y: nextPositionY,
              width: dashboardItem.type === "chart" ? 6 : 3,
              height: dashboardItem.type === "chart" ? 4 : 2,
            },
          ];

      const response = await fetch(
        `http://127.0.0.1:8000/dashboards/${dashboard.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: dashboard.name,
            items,
          }),
        },
      );
      const savedDashboard = await response.json();

      if (!response.ok) {
        throw new Error(
          savedDashboard.detail || "Could not add the item to the dashboard.",
        );
      }

      sessionStorage.setItem(dashboardStorageKey, savedDashboard.id);
      router.push(`/dashboard/${savedDashboard.id}`);
    } catch (error) {
      setDashboardError(
        error instanceof Error
          ? error.message
          : "Could not add the item to the dashboard.",
      );
    } finally {
      setAddingItemId(null);
    }
  };
  const handleGenerateSuggestions = async () => {
  if (!result || suggestionsLoading) {
    return;
  }

  setSuggestionsLoading(true);
  setSuggestionsError(null);
  setSuggestions(null);

  try {
    const response = await fetch(
      `http://127.0.0.1:8000/dataset/${result.file_id}/analysis-suggestions`,
      {
        method: "POST",
      },
    );

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(
        data?.detail ||
          "Could not generate analysis suggestions.",
      );
    }

    setSuggestions(data as AnalysisSuggestions);
  } catch (error) {
    setSuggestionsError(
      error instanceof Error
        ? error.message
        : "Could not connect to the suggestion service.",
    );
  } finally {
    setSuggestionsLoading(false);
  }
};

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setSummary(null);
    setColumnDetails(null);
    setConversationId(null);
    setConversationHistory([]);
    setClarification(null);
    setQuestion("");
    setAnswer("");
    setCharts([]);
    setKpis([]);
    setAssumptions([]);
    setWarnings([]);
    setAskError(null);
    setSuggestions(null);
    setSuggestionsError(null);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("http://127.0.0.1:8000/upload", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "Could not upload the file.");
      }
      setResult(data);
    } catch (error) {
      console.error("Error uploading file:", error);
      setError(error instanceof Error ? error.message : "Could not upload the file.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    const restoreTimer = window.setTimeout(() => {
      const stored = sessionStorage.getItem("currentAnalysis");

      if (stored) {
        try {
          const analysis = JSON.parse(stored);

          setResult(analysis.result ?? null);
          setCharts(analysis.charts ?? []);
          setKpis(analysis.kpis ?? []);
          setAnswer(analysis.answer ?? "");
          setAssumptions(analysis.assumptions ?? []);
          setWarnings(analysis.warnings ?? []);
          setSuggestions(analysis.suggestions ?? null);
        } catch {
          sessionStorage.removeItem("currentAnalysis");
        }
      }

      setAnalysisRestored(true);
    }, 0);

    return () => window.clearTimeout(restoreTimer);
  }, []);

  useEffect(() => {
    if (!analysisRestored) return;

    if (!result) {
      sessionStorage.removeItem("currentAnalysis");
      return;
    }

    sessionStorage.setItem(
      "currentAnalysis",
      JSON.stringify({
        result,
        charts,
        kpis,
        answer,
        assumptions,
        warnings,
        suggestions,
      }),
    );
  }, [
    analysisRestored,
    result,
    charts,
    kpis,
    answer,
    assumptions,
    warnings,
    suggestions,
  ]);

  const handleSummary = async () => {
    if (!result) return;
    setSummaryLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `http://127.0.0.1:8000/dataset/${result.file_id}/summary`,
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "Could not analyze the dataset.");
      }
      setSummary(data);
    } catch (error) {
      console.error("Error analyzing file:", error);
      setError(
        error instanceof Error ? error.message : "Could not analyze the dataset.",
      );
    } finally {
      setSummaryLoading(false);
    }
  };

const handleColumnClick = async (column: string) => {
  if (!result) return;

  setColumnLoading(true);
  setError(null);
  setColumnDetails(null);

  try {
    const response = await fetch(
      `http://127.0.0.1:8000/dataset/${result.file_id}/column/${encodeURIComponent(column)}`,
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.detail || "Could not fetch column details.");
    }

    setColumnDetails(data);
  } catch (error) {
    console.error("Error fetching column details:", error);
    setError(
      error instanceof Error
        ? error.message
        : "Could not fetch column details.",
    );
  } finally {
    setColumnLoading(false);
  }
};  
      
  const handleAsk = async (
    questionOverride?: string,
  ) => {
    const submittedQuestion = (
      questionOverride ?? question
    ).trim();

    if (
      !result ||
      !submittedQuestion ||
      askLoading
    ) {
      return;
    }

    setAskLoading(true);
    setAskError(null);
    setAnswer("");
    setCharts([]);
    setKpis([]);
    setAssumptions([]);
    setWarnings([]);

    try {
      const response = await fetch(
        `http://127.0.0.1:8000/dataset/${result.file_id}/ask`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            question: submittedQuestion,
            conversation_id: conversationId,
            history: conversationHistory,
          }),
        },
      );

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          data?.detail ||
            "The agent could not answer this question.",
        );
      }

      const askResponse = data as AskResponse;

      setConversationId(askResponse.conversation_id);

      if (
        askResponse.status ===
        "needs_clarification"
      ) {
        const updatedHistory = ([
          ...conversationHistory,
          {
            role: "user",
            content: submittedQuestion,
          },
          {
            role: "assistant",
            content: askResponse.message,
          },
        ] satisfies ConversationMessage[]).slice(-10);

        setConversationHistory(updatedHistory);

        setClarification({
          message: askResponse.message,
          options: askResponse.options,
          allowFreeText: askResponse.allow_free_text,
        });

        setQuestion("");
        return;
      }

      const updatedHistory = ([
        ...conversationHistory,
        {
          role: "user",
          content: submittedQuestion,
        },
        {
          role: "assistant",
          content: askResponse.answer,
        },
      ] satisfies ConversationMessage[]).slice(-10);

      setConversationHistory(updatedHistory);
      setClarification(null);
      setAnswer(askResponse.answer);
      setCharts(askResponse.charts);
      setKpis(askResponse.kpis);
      setAssumptions(askResponse.assumptions);
      setWarnings(askResponse.warnings);
      setQuestion("");
    } catch (error) {
      console.error(
        "Error asking the data agent:",
        error,
      );

      setAskError(
        error instanceof Error
          ? error.message
          : "Could not connect to the data agent.",
      );
    } finally {
      setAskLoading(false);
    }
  };

  const handleRunSuggestion = async (
  selected:
    | {
        type: "kpi";
        suggestion: KpiSuggestion;
      }
    | {
        type: "chart";
        suggestion: ChartSuggestion;
      },
) => {
  if (
    !result ||
    previewingSuggestionId !== null
  ) {
    return;
  }

  const { suggestion } = selected;

  setPreviewingSuggestionId(suggestion.id);
  setSuggestionPreviewError(null);
  setAskError(null);

  try {
    const requestBody =
      selected.type === "kpi"
        ? {
            output_type: "kpi" as const,
            chart_plan: null,
            kpi_plan: selected.suggestion.plan,
          }
        : {
            output_type: "chart" as const,
            chart_plan: selected.suggestion.plan,
            kpi_plan: null,
          };

    const response = await fetch(
      `http://127.0.0.1:8000/dataset/${result.file_id}/suggestion-preview`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      },
    );

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(
        data?.detail ||
          "Could not calculate the selected suggestion.",
      );
    }

    const preview = data as SuggestionPreviewResponse;

    if (preview.output_type !== selected.type) {
      throw new Error(
        "The preview result did not match the selected suggestion.",
      );
    }

    if (preview.output_type === "kpi") {
      setKpis([preview.kpi]);
      setCharts([]);
    } else {
      setCharts([preview.chart]);
      setKpis([]);
    }

    setAnswer(
      `${suggestion.title}\n\n${suggestion.reason}`,
    );

    setAssumptions(suggestion.plan.assumptions);
    setWarnings(preview.warnings);
  } catch (error) {
    setSuggestionPreviewError(
      error instanceof Error
        ? error.message
        : "Could not connect to the preview service.",
    );
  } finally {
    setPreviewingSuggestionId(null);
  }
};
          

  return (
    <main className="relative min-h-screen overflow-hidden bg-amber-50 px-5 py-10 text-stone-900 sm:px-8 sm:py-16">
      <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-yellow-300/35 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-20 h-96 w-96 rounded-full bg-amber-300/30 blur-3xl" />

      <section className="relative mx-auto w-full max-w-3xl">
        <header className="mb-8 text-center">
          <span className="mb-4 inline-flex items-center gap-2 rounded-full border border-amber-300 bg-yellow-100 px-4 py-2 text-sm font-semibold text-amber-900 shadow-sm">
            <span className="h-2 w-2 rounded-full bg-amber-500" />
            Smart Data Analyzer
          </span>
          <h1 className="text-4xl font-black tracking-tight text-stone-900 sm:text-5xl">
            Turn your CSV into
            <span className="block text-amber-500">clear insights.</span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-stone-600 sm:text-lg">
            Upload your dataset and get a quick, simple overview of its rows,
            columns, and contents.
          </p>
        </header>

        <div className="rounded-3xl border border-amber-200 bg-white/90 p-5 shadow-[0_24px_70px_-28px_rgba(180,83,9,0.35)] backdrop-blur sm:p-8">
          <label className="group flex cursor-pointer flex-col items-center rounded-2xl border-2 border-dashed border-amber-300 bg-amber-50/70 px-6 py-10 text-center transition hover:border-amber-500 hover:bg-yellow-50">
            <span className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-amber-400 text-stone-900 shadow-lg shadow-amber-200 transition group-hover:-translate-y-1">
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="h-7 w-7"
              >
                <path d="M12 16V4m0 0L7 9m5-5 5 5" />
                <path d="M5 14v5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5" />
              </svg>
            </span>
            <span className="text-lg font-bold text-stone-800">
              {file ? file.name : "Choose your CSV file"}
            </span>
            <span className="mt-1 text-sm text-stone-500">
              {file ? "Ready to analyze" : "Click here to browse your computer"}
            </span>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => {
                setFile(event.target.files ? event.target.files[0] : null);
                setResult(null);
                setSummary(null);
                setError(null);
                setAnswer("");
                setAskError(null);
                setCharts([]);
                setKpis([]);
                setAssumptions([]);
                setWarnings([]);
              }}
              className="sr-only"
            />
          </label>

          <button
            onClick={handleUpload}
            disabled={!file || loading}
            className="mt-5 w-full rounded-xl bg-amber-400 px-5 py-3.5 font-bold text-stone-950 shadow-lg shadow-amber-200 transition hover:bg-amber-500 hover:shadow-xl focus:outline-none focus:ring-4 focus:ring-amber-200 disabled:cursor-not-allowed disabled:bg-stone-200 disabled:text-stone-400 disabled:shadow-none"
          >
            {loading ? "Analyzing your file..." : "Upload"}
          </button>

           <button
            onClick={handleSummary}
            disabled={!result || loading || summaryLoading}
            className="mt-5 w-full rounded-xl bg-amber-400 px-5 py-3.5 font-bold text-stone-950 shadow-lg shadow-amber-200 transition hover:bg-amber-500 hover:shadow-xl focus:outline-none focus:ring-4 focus:ring-amber-200 disabled:cursor-not-allowed disabled:bg-stone-200 disabled:text-stone-400 disabled:shadow-none"
          >
            {summaryLoading ? "Analyzing your file..." : "Analyze"}
          </button>

          {error && (
            <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {error}
            </p>
          )}

          {result && (
            <div className="mt-8 border-t border-amber-100 pt-7">
              <div className="mb-5 flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-amber-600">
                    Analysis complete
                  </p>
                  <h2 className="mt-1 break-all text-xl font-bold text-stone-900">
                    {result.filename}
                  </h2>
                </div>
                <span className="rounded-full bg-yellow-100 px-3 py-1 text-xs font-semibold text-amber-800">
                  CSV
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-amber-50 p-4">
                  <p className="text-sm text-stone-500">Rows</p>
                  <p className="mt-1 text-2xl font-black text-amber-600">
                    {result.rows.toLocaleString()}
                  </p>
                </div>
                <div className="rounded-xl bg-amber-50 p-4">
                  <p className="text-sm text-stone-500">Columns</p>
                  <p className="mt-1 text-2xl font-black text-amber-600">
                    {result.columns.length.toLocaleString()}
                  </p>
                </div>
              </div>

              {result.preview.length > 0 && (
                <div className="mt-5 overflow-hidden rounded-xl border border-amber-200">
                  <div className="border-b border-amber-200 bg-yellow-50 px-4 py-3">
                    <h3 className="font-bold text-stone-800">Data preview</h3>
                    <p className="text-xs text-stone-500">
                      Showing the first {result.preview.length} rows
                    </p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full border-collapse text-left text-sm">
                      <thead className="bg-amber-100 text-amber-950">
                        <tr>
                          {result.columns.map((column) => (
                            <th
                              key={column}
                              scope="col"
                              className="whitespace-nowrap border-b border-r border-amber-200 px-4 py-3 font-bold last:border-r-0"
                            >
                              {column}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-amber-100 bg-white">
                        {result.preview.map((row, rowIndex) => (
                          <tr key={rowIndex} className="hover:bg-yellow-50/70">
                            {result.columns.map((column) => (
                              <td
                                key={column}
                                className="max-w-64 whitespace-nowrap border-r border-amber-100 px-4 py-3 text-stone-600 last:border-r-0"
                              >
                                {row[column] == null ? "—" : String(row[column])}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              <p className="mt-3 truncate text-xs text-stone-400">
                File ID: {result.file_id}
              </p>

              {summary && (
                <div className="mt-7 border-t border-amber-100 pt-7">
                  <h3 className="text-xl font-black text-stone-900">Dataset summary</h3>
                  <p className="mt-1 text-sm text-stone-500">
                    Column types, missing values, and numeric statistics.
                  </p>

                  <div className="mt-4 overflow-x-auto rounded-xl border border-amber-200">
                    <table className="min-w-full text-left text-sm">
                      <thead className="bg-amber-100 text-amber-950">
                        <tr>
                          <th className="px-4 py-3">Column</th>
                          <th className="px-4 py-3">Type</th>
                          <th className="px-4 py-3">Missing</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-amber-100 bg-white">
                        {summary.column_names.map((column) => (
                          <tr key={column}>
                            <td className="whitespace-nowrap px-4 py-3">
                                      <button
                                        type="button"
                                        onClick={() => handleColumnClick(column)}
                                        disabled={columnLoading}
                                        className="font-semibold text-amber-700 underline decoration-amber-300 underline-offset-4 transition hover:text-amber-900 disabled:cursor-wait disabled:opacity-50"
                                      >
                                        {column}
                                      </button>
                                    </td>
                            <td className="whitespace-nowrap px-4 py-3 text-stone-600">{summary.data_types[column]}</td>
                            <td className="px-4 py-3 text-stone-600">{summary.missing_values[column]}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {columnLoading && (
                    <p className="mt-5 rounded-xl bg-yellow-50 px-4 py-3 text-sm font-medium text-amber-800">
                      Loading column details...
                    </p>
                  )}

                  {columnDetails && !columnLoading && (
                    <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-5">
                      <h4 className="text-lg font-black text-stone-900">
                        {columnDetails.column_name}
                      </h4>

                      <div className="mt-4 grid gap-3 sm:grid-cols-3">
                        <div className="rounded-lg bg-white p-3">
                          <p className="text-xs font-semibold uppercase text-stone-500">Type</p>
                          <p className="mt-1 font-bold text-stone-800">{columnDetails.data_type}</p>
                        </div>
                        <div className="rounded-lg bg-white p-3">
                          <p className="text-xs font-semibold uppercase text-stone-500">Missing</p>
                          <p className="mt-1 font-bold text-stone-800">{columnDetails.missing_values}</p>
                        </div>
                        <div className="rounded-lg bg-white p-3">
                          <p className="text-xs font-semibold uppercase text-stone-500">Unique</p>
                          <p className="mt-1 font-bold text-stone-800">{columnDetails.unique_values}</p>
                        </div>
                      </div>

                      {columnDetails.mean !== undefined && (
                        <div className="mt-3 grid gap-3 sm:grid-cols-3">
                          {(["mean", "min", "max"] as const).map((statistic) => (
                            <div key={statistic} className="rounded-lg bg-white p-3">
                              <p className="text-xs font-semibold uppercase text-stone-500">{statistic}</p>
                              <p className="mt-1 font-bold text-stone-800">
                                {columnDetails[statistic] == null
                                  ? "—"
                                  : columnDetails[statistic].toLocaleString(undefined, { maximumFractionDigits: 2 })}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="mt-4">
                        <p className="text-sm font-bold text-stone-800">Top 5 values</p>
                        {Object.keys(columnDetails.top_5_values).length > 0 ? (
                          <ul className="mt-2 divide-y divide-amber-100 rounded-lg bg-white px-4">
                            {Object.entries(columnDetails.top_5_values).map(([value, count]) => (
                              <li key={value} className="flex justify-between gap-4 py-2 text-sm">
                                <span className="break-all text-stone-700">{value}</span>
                                <span className="font-bold text-amber-700">{count}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="mt-2 text-sm text-stone-500">No non-empty values found.</p>
                        )}
                      </div>
                    </div>
                  )}

                  {Object.keys(summary.numeric_summary).length > 0 && (
                    <div className="mt-5 overflow-x-auto rounded-xl border border-amber-200">
                      <table className="min-w-full text-left text-sm">
                        <thead className="bg-amber-100 text-amber-950">
                          <tr>
                            <th className="px-4 py-3">Statistic</th>
                            {Object.keys(summary.numeric_summary).map((column) => (
                              <th key={column} className="whitespace-nowrap px-4 py-3">{column}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-amber-100 bg-white">
                          {Object.keys(Object.values(summary.numeric_summary)[0] ?? {}).map((statistic) => (
                            <tr key={statistic}>
                              <td className="px-4 py-3 font-semibold text-stone-800">{statistic}</td>
                              {Object.entries(summary.numeric_summary).map(([column, values]) => (
                                <td key={column} className="whitespace-nowrap px-4 py-3 text-stone-600">
                                  {values[statistic] == null ? "—" : Number(values[statistic]).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="mt-8 rounded-3xl border border-amber-200 bg-white/90 p-5 shadow-[0_24px_70px_-28px_rgba(180,83,9,0.3)] backdrop-blur sm:p-8">
          <div className="flex items-start gap-4">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-amber-400 text-xl shadow-md shadow-amber-200">
              ✦
            </span>
            <div>
              <h2 className="text-2xl font-black text-stone-900">Ask your data</h2>
              <p className="mt-1 text-sm leading-6 text-stone-500">
                Ask a plain-language question and the agent will analyze your uploaded dataset.
              </p>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-violet-200 bg-violet-50/60 p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="font-bold text-violet-950">
                  AI analysis suggestions
                </h3>
                <p className="mt-1 text-sm leading-6 text-violet-700">
                  Let the agent study the meaning of your columns and recommend
                  useful KPI cards and charts.
                </p>
              </div>

              <button
                type="button"
                onClick={() => void handleGenerateSuggestions()}
                disabled={!result || suggestionsLoading}
                className="shrink-0 rounded-xl bg-violet-700 px-5 py-3 font-bold text-white transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:bg-stone-300"
              >
                {suggestionsLoading
                  ? "Studying dataset..."
                  : suggestions
                    ? "Regenerate suggestions"
                    : "Suggest analyses"}
              </button>
            </div>

            {suggestionsLoading && (
              <div
                className="mt-4 rounded-xl border border-violet-200 bg-white px-4 py-3"
                aria-live="polite"
              >
                <p className="font-semibold text-violet-900">
                  The AI is studying your dataset...
                </p>
                <p className="mt-1 text-sm text-violet-600">
                  It is identifying column meanings and useful analytical roles.
                </p>
              </div>
            )}

            {suggestionsError && (
              <p
                role="alert"
                className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
              >
                {suggestionsError}
              </p>
            )}

            {suggestions && !suggestionsLoading && (
              <div className="mt-5 space-y-5">
                <p className="text-sm leading-6 text-violet-900">
                  {suggestions.summary}
                </p>

                {suggestionPreviewError && (
                  <p
                    role="alert"
                    className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
                  >
                    {suggestionPreviewError}
                  </p>
                )}

                {suggestions.kpi_suggestions.length > 0 && (
                  <section>
                    <h4 className="text-sm font-bold uppercase tracking-wider text-violet-800">
                      Suggested KPIs
                    </h4>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      {suggestions.kpi_suggestions.map((suggestion) => (
                        <article
                          key={suggestion.id}
                          className="rounded-xl border border-violet-200 bg-white p-4"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <h5 className="font-bold text-stone-900">
                              {suggestion.title}
                            </h5>
                            <span className="shrink-0 rounded-full bg-violet-100 px-2 py-1 text-xs font-semibold text-violet-700">
                              {Math.round(suggestion.confidence * 100)}%
                            </span>
                          </div>
                          <p className="mt-2 text-sm leading-6 text-stone-600">
                            {suggestion.reason}
                          </p>
                          <button
                            type="button"
                            onClick={() =>
                              void handleRunSuggestion({
                                type: "kpi",
                                suggestion,
                              })
                            }
                            disabled={previewingSuggestionId !== null}
                            className="mt-4 w-full rounded-lg bg-violet-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-violet-800 disabled:cursor-wait disabled:bg-stone-300"
                          >
                            {previewingSuggestionId === suggestion.id
                              ? "Running analysis..."
                              : "Run analysis"}
                          </button>
                        </article>
                      ))}
                    </div>
                  </section>
                )}

                {suggestions.chart_suggestions.length > 0 && (
                  <section>
                    <h4 className="text-sm font-bold uppercase tracking-wider text-violet-800">
                      Suggested charts
                    </h4>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      {suggestions.chart_suggestions.map((suggestion) => (
                        <article
                          key={suggestion.id}
                          className="rounded-xl border border-violet-200 bg-white p-4"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <h5 className="font-bold text-stone-900">
                              {suggestion.title}
                            </h5>
                            <span className="shrink-0 rounded-full bg-violet-100 px-2 py-1 text-xs font-semibold text-violet-700">
                              {Math.round(suggestion.confidence * 100)}%
                            </span>
                          </div>
                          <p className="mt-2 text-sm leading-6 text-stone-600">
                            {suggestion.reason}
                          </p>
                          <button
                            type="button"
                            onClick={() =>
                              void handleRunSuggestion({
                                type: "chart",
                                suggestion,
                              })
                            }
                            disabled={previewingSuggestionId !== null}
                            className="mt-4 w-full rounded-lg bg-violet-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-violet-800 disabled:cursor-wait disabled:bg-stone-300"
                          >
                            {previewingSuggestionId === suggestion.id
                              ? "Running analysis..."
                              : "Run analysis"}
                          </button>
                        </article>
                      ))}
                    </div>
                  </section>
                )}

                {suggestions.warnings.length > 0 && (
                  <div className="rounded-xl border border-orange-200 bg-orange-50 p-4">
                    <h4 className="font-bold text-orange-900">
                      Suggestion warnings
                    </h4>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-orange-800">
                      {suggestions.warnings.map((warning, index) => (
                        <li key={`${index}-${warning}`}>
                          {warning}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>

          <form
            className="mt-6"
            onSubmit={(event) => {
              event.preventDefault();
              void handleAsk();
            }}
          >
            <label htmlFor="data-question" className="text-sm font-bold text-stone-700">
              {clarification ? "Your clarification" : "Your question"}
            </label>
            <div className="mt-2 flex flex-col gap-3 sm:flex-row">
              <input
                id="data-question"
                type="text"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                disabled={askLoading}
                placeholder={
                  !result
                    ? "Upload a dataset first to ask a question"
                    : clarification
                      ? "Type your clarification..."
                      : "Example: Which category has the highest average sales?"
                }
                className="min-w-0 flex-1 rounded-xl border border-amber-200 bg-amber-50/50 px-4 py-3.5 text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-amber-500 focus:bg-white focus:ring-4 focus:ring-amber-100 disabled:cursor-not-allowed disabled:bg-stone-100"
              />

              <button
                type="submit"
                disabled={!result || !question.trim() || askLoading}
                className="inline-flex min-w-36 items-center justify-center gap-2 rounded-xl bg-stone-900 px-5 py-3.5 font-bold text-white shadow-lg transition hover:bg-amber-500 hover:text-stone-950 focus:outline-none focus:ring-4 focus:ring-amber-200 disabled:cursor-not-allowed disabled:bg-stone-200 disabled:text-stone-400 disabled:shadow-none"
              >
                {askLoading && (
                  <span
                    aria-hidden="true"
                    className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
                  />
                )}
                {askLoading
                  ? "Thinking..."
                  : clarification
                    ? "Continue"
                    : "Ask agent"}
              </button>
            </div>
          </form>

          {clarification && !askLoading && (
            <div
              className="mt-5 rounded-2xl border border-sky-200 bg-sky-50 p-5"
              aria-live="polite"
            >
              <p className="text-xs font-bold uppercase tracking-widest text-sky-700">
                Clarification needed
              </p>
              <p className="mt-2 font-semibold text-stone-900">
                {clarification.message}
              </p>

              {clarification.options.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {clarification.options.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      disabled={askLoading}
                      onClick={() => void handleAsk(option.value)}
                      className="rounded-lg border border-sky-300 bg-white px-4 py-2 text-sm font-semibold text-sky-800 transition hover:bg-sky-100 focus:outline-none focus:ring-4 focus:ring-sky-100 disabled:opacity-50"
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              )}

              {clarification.allowFreeText && (
                <p className="mt-3 text-sm text-stone-600">
                  Select an option or type your answer above.
                </p>
              )}
            </div>
          )}

          {askLoading && (
            <div aria-live="polite" className="mt-5 rounded-xl border border-amber-200 bg-yellow-50 px-4 py-3">
              <p className="font-semibold text-amber-900">The agent is analyzing your data…</p>
              <p className="mt-1 text-sm text-amber-700">Complex questions may take a few moments.</p>
            </div>
          )}

          {askError && (
            <div role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
              <p className="font-bold text-red-800">Couldn’t get an answer</p>
              <p className="mt-1 text-sm text-red-700">{askError}</p>
            </div>
          )}

          {answer && !askLoading && (
            <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-5" aria-live="polite">
              <div className="flex items-center gap-2">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-amber-400 text-xs font-black text-stone-900">✓</span>
                <h3 className="font-bold text-stone-900">Agent answer</h3>
              </div>
              <p className="mt-3 whitespace-pre-wrap leading-7 text-stone-700">{answer}</p>
            </div>
          )}

          {assumptions.length > 0 && !askLoading && (
            <div className="mt-5 rounded-2xl border border-sky-200 bg-sky-50 p-5">
              <h3 className="font-bold text-sky-900">Assumptions</h3>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-sky-900">
                {assumptions.map((assumption, index) => (
                  <li key={`${index}-${assumption}`}>{assumption}</li>
                ))}
              </ul>
            </div>
          )}

          {warnings.length > 0 && !askLoading && (
            <div
              className="mt-5 rounded-2xl border border-orange-200 bg-orange-50 p-5"
              role="status"
            >
              <h3 className="font-bold text-orange-900">Data warnings</h3>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-orange-900">
                {warnings.map((warning, index) => (
                  <li key={`${index}-${warning}`}>{warning}</li>
                ))}
              </ul>
            </div>
          )}

          {kpis.length > 0 && !askLoading && (
            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {kpis.map((kpi) => (
                <div key={kpi.id}>
                  <KpiCard kpi={kpi} />
                  <button
                    type="button"
                    onClick={() =>
                      void handleAddToDashboard({ type: "kpi", spec: kpi })
                    }
                    disabled={addingItemId !== null}
                    className="mt-3 w-full rounded-xl bg-stone-900 px-5 py-3 font-bold text-white transition hover:bg-amber-500 hover:text-stone-950 disabled:cursor-wait disabled:bg-stone-300"
                  >
                    {addingItemId === kpi.id
                      ? "Adding to dashboard..."
                      : "Add to dashboard"}
                  </button>
                </div>
              ))}
            </div>
          )}

          {charts.length > 0 && !askLoading && (
            <div className="space-y-5">
              {charts.map((chart) => (
                <div key={chart.id}>
                  <ChartRenderer chart={chart} />
                  <button
                    type="button"
                    onClick={() =>
                      void handleAddToDashboard({ type: "chart", spec: chart })
                    }
                    disabled={addingItemId !== null}
                    className="mt-3 w-full rounded-xl bg-stone-900 px-5 py-3 font-bold text-white transition hover:bg-amber-500 hover:text-stone-950 disabled:cursor-wait disabled:bg-stone-300"
                  >
                    {addingItemId === chart.id
                      ? "Adding to dashboard..."
                      : "Add to dashboard"}
                  </button>
                </div>
              ))}
            </div>
          )}

          {dashboardError && !askLoading && (
            <p
              role="alert"
              className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
            >
              {dashboardError}
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
