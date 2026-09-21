"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ChartRenderer, {
  type ChartSpec,
} from "./components/ChartRenderer";
import KpiCard, {
  type KpiSpec,
} from "./components/KpiCard";
import AppSidebar from "./components/AppSidebar";
import AccountControls from "./components/AccountControls";
import DataCleaningPanel from "./components/DataCleaningPanel";
import DataValue from "./components/DataValue";
import ManualChartBuilder from "./components/ManualChartBuilder";
import { apiUrl, workspaceFetch } from "./lib/api";

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
  description?: string | null;
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
  dataset_id: string;
  name: string;
  items: SavedDashboardItem[];
};

const configuredUploadLimit = Number(process.env.NEXT_PUBLIC_MAX_UPLOAD_SIZE_MB ?? 3);
const MAX_UPLOAD_SIZE_MB = Number.isFinite(configuredUploadLimit) && configuredUploadLimit > 0
  ? configuredUploadLimit
  : 3;
const MAX_UPLOAD_SIZE_BYTES = MAX_UPLOAD_SIZE_MB * 1024 * 1024;
const SUPPORTED_UPLOAD_EXTENSIONS = [".csv", ".xlsx"];

export default function Home() {
  const router = useRouter();
  const analysisResultsRef = useRef<HTMLDivElement>(null);
  const summarySectionRef = useRef<HTMLDivElement>(null);
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
  const [datasetDescription, setDatasetDescription] = useState("");
  const [targetDashboardId, setTargetDashboardId] = useState<string | null>(null);

  const scrollToSection = (getElement: () => HTMLElement | null) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        getElement()?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  };

  const handleFileSelection = (selectedFile: File | null) => {
    setResult(null);
    setSummary(null);
    setError(null);
    setAnswer("");
    setAskError(null);
    setCharts([]);
    setKpis([]);
    setAssumptions([]);
    setWarnings([]);
    setDatasetDescription("");

    if (!selectedFile) {
      setFile(null);
      return;
    }

    const extension = selectedFile.name
      .slice(selectedFile.name.lastIndexOf("."))
      .toLowerCase();

    if (!SUPPORTED_UPLOAD_EXTENSIONS.includes(extension)) {
      setFile(null);
      setError("Only CSV and Excel (.xlsx) files are supported.");
      return;
    }

    if (selectedFile.size === 0) {
      setFile(null);
      setError("The selected file is empty.");
      return;
    }

    if (selectedFile.size > MAX_UPLOAD_SIZE_BYTES) {
      setFile(null);
      setError(
        `The maximum supported file size is ${MAX_UPLOAD_SIZE_MB} MB.`,
      );
      return;
    }

    setFile(selectedFile);
  };

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
      const storedDashboardId =
        targetDashboardId ?? sessionStorage.getItem(dashboardStorageKey);
      let currentDashboard: SavedDashboard | null = null;

      if (storedDashboardId) {
        const response = await workspaceFetch(
          apiUrl(`/dashboards/${storedDashboardId}`),
          { credentials: "include" },
        );
        const data = await response.json();

        if (response.ok) {
          currentDashboard = data;
        } else if (response.status === 404 && !targetDashboardId) {
          sessionStorage.removeItem(dashboardStorageKey);
        } else {
          throw new Error(
            data.detail ||
              (targetDashboardId
                ? "The selected dashboard could not be loaded."
                : "Could not load the dashboard."),
          );
        }
      }

      if (!currentDashboard) {
        const response = await workspaceFetch(
          apiUrl("/dashboards"),
          {
            method: "POST",
            credentials: "include",
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

      if (currentDashboard.dataset_id !== result.file_id) {
        throw new Error("This dashboard belongs to a different dataset.");
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

      const response = await workspaceFetch(
        apiUrl(`/dashboards/${dashboard.id}`),
        {
          method: "PUT",
          credentials: "include",
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
    const response = await workspaceFetch(
      apiUrl(`/dataset/${result.file_id}/analysis-suggestions`),
      {
        method: "POST",
        credentials: "include",
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

    if (file.size > MAX_UPLOAD_SIZE_BYTES) {
      setError(
        `The maximum supported file size is ${MAX_UPLOAD_SIZE_MB} MB.`,
      );
      return;
    }

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
    if (datasetDescription.trim()) {
      formData.append(
        "description",
        datasetDescription.trim(),
      );
    }
    try {
      const response = await workspaceFetch(apiUrl("/upload"), {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          data?.detail ||
            (response.status === 413
              ? `The maximum supported file size is ${MAX_UPLOAD_SIZE_MB} MB.`
              : "Could not upload the file."),
        );
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
      const query = new URLSearchParams(window.location.search);
      // A full navigation resets local state and detaches pending requests.
      // Clear the persisted result before the normal restoration path runs.
      if (query.get("new") === "1") {
        sessionStorage.removeItem("currentAnalysis");
        window.history.replaceState(window.history.state, "", "/");
        setAnalysisRestored(true);
        return;
      }
      const requestedDatasetId = query.get("dataset");
      const requestedDashboardId = query.get("dashboard");

      if (requestedDatasetId) {
        setTargetDashboardId(requestedDashboardId);
        setLoading(true);
        setError(null);
        void workspaceFetch(
          apiUrl(`/datasets/${requestedDatasetId}?page=1&page_size=20`),
          { credentials: "include" },
        )
          .then(async (response) => {
            const data = await response.json().catch(() => null);
            if (!response.ok) {
              throw new Error(data?.detail || "Could not reopen this dataset.");
            }
            setResult({
              file_id: data.id,
              filename: data.original_filename,
              rows: data.row_count,
              columns: data.columns,
              preview: data.preview,
              description: data.description,
            });
            setCharts([]);
            setKpis([]);
            setAnswer("");
            setAssumptions([]);
            setWarnings([]);
            setSuggestions(null);
          })
          .catch((restoreError) => {
            setError(
              restoreError instanceof Error
                ? restoreError.message
                : "Could not reopen this dataset.",
            );
          })
          .finally(() => {
            setLoading(false);
            setAnalysisRestored(true);
          });
        return;
      }

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
      const response = await workspaceFetch(
        apiUrl(`/dataset/${result.file_id}/summary`),
        { credentials: "include" },
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "Could not analyze the dataset.");
      }
      setSummary(data);
      scrollToSection(() => summarySectionRef.current);
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
    const response = await workspaceFetch(
      apiUrl(`/dataset/${result.file_id}/column/${encodeURIComponent(column)}`),
      { credentials: "include" },
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
      const response = await workspaceFetch(
      apiUrl(`/dataset/${result.file_id}/ask`),
        {
          method: "POST",
          credentials: "include",
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
      scrollToSection(() => analysisResultsRef.current);
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

    const response = await workspaceFetch(
      apiUrl(`/dataset/${result.file_id}/suggestion-preview`),
      {
        method: "POST",
        credentials: "include",
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
    scrollToSection(() => analysisResultsRef.current);
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
    <div className="min-h-screen bg-amber-50 lg:flex">
      <AppSidebar />
      <main className="relative min-h-screen min-w-0 flex-1 overflow-hidden bg-amber-50 px-5 py-10 text-stone-900 sm:px-8 sm:py-16">
      <AccountControls />
      <section className="relative mx-auto flex w-full max-w-3xl flex-col">
        {!result && <header className="mb-8 text-center">
          <span className="mb-4 inline-flex items-center gap-2 rounded-full border border-amber-300 bg-yellow-100 px-4 py-2 text-sm font-semibold text-amber-900 shadow-sm">
            <span className="h-2 w-2 rounded-full bg-amber-500" />
            Smart Data Analyzer
          </span>
          <h1 className="text-4xl font-black tracking-tight text-stone-900 sm:text-5xl">
            Turn your spreadsheet into
            <span className="block text-amber-500">clear insights.</span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-stone-600 sm:text-lg">
            Upload your dataset and get a quick, simple overview of its rows,
            columns, and contents.
          </p>
        </header>}

        <div className={result ? "contents" : "rounded-3xl border border-stone-200 bg-white p-5 shadow-sm sm:p-8"}>
          {!result && (
            <>
          <label className="group flex cursor-pointer flex-col items-center rounded-2xl border-2 border-dashed border-amber-300 bg-amber-50/70 px-6 py-10 text-center transition hover:border-amber-500 hover:bg-yellow-50">
            <span className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-amber-400 text-stone-900 shadow-sm transition group-hover:-translate-y-1">
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
              {file ? file.name : "Choose a CSV or Excel file"}
            </span>
            <span className="mt-1 text-sm text-stone-500">
              {file
                ? `${(file.size / (1024 * 1024)).toFixed(2)} MB · Ready to analyze`
                : `CSV or Excel (.xlsx), up to ${MAX_UPLOAD_SIZE_MB} MB`}
            </span>
            <input
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(event) => {
                handleFileSelection(event.target.files?.[0] ?? null);
                event.target.value = "";
              }}
              className="sr-only"
            />
          </label>

          <div className="mt-5">
            <div className="flex items-center justify-between gap-3">
              <label
                htmlFor="dataset-description"
                className="text-sm font-bold text-stone-800"
              >
                Describe your dataset
              </label>
              <span className="text-xs font-medium text-stone-400">
                Optional
              </span>
            </div>
            <p className="mt-1 text-xs leading-5 text-stone-500">
              Explain what each row represents, important columns, units,
              currencies, or values the AI should understand.
            </p>
            <textarea
              id="dataset-description"
              value={datasetDescription}
              onChange={(event) =>
                setDatasetDescription(event.target.value)
              }
              maxLength={2000}
              rows={4}
              placeholder="Example: Each row is an online order. Amount is revenue in JOD, and cancelled orders should not count as completed sales."
              className="mt-3 block w-full resize-y rounded-xl border border-amber-200 bg-amber-50/50 px-4 py-3 text-sm leading-6 text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-amber-500 focus:bg-white focus:ring-4 focus:ring-amber-100"
            />
            <p className="mt-1 text-right text-xs text-stone-400">
              {datasetDescription.length.toLocaleString()} / 2,000
            </p>
          </div>

          <button
            onClick={handleUpload}
            disabled={!file || loading}
            className="mt-5 w-full rounded-xl bg-amber-400 px-5 py-3.5 font-bold text-stone-950 shadow-sm transition hover:bg-amber-500 focus:outline-none focus:ring-4 focus:ring-amber-200 disabled:cursor-not-allowed disabled:bg-stone-200 disabled:text-stone-600 disabled:shadow-none"
          >
            {loading ? "Analyzing your file..." : "Upload"}
          </button>
            </>
          )}

          {error && (
            <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {error}
            </p>
          )}

          {result && (
            <div className="contents">
              <div className="order-1 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-amber-600">
                    Current dataset
                  </p>
                  <h2 className="mt-1 break-all text-xl font-bold text-stone-900">
                    {result.filename}
                  </h2>
                </div>
                <label className="cursor-pointer rounded-lg border border-amber-300 bg-white px-4 py-2 text-center text-sm font-bold text-amber-800 transition hover:bg-amber-50">
                  Choose a different file
                  <input
                    type="file"
                    accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    onChange={(event) => {
                      handleFileSelection(event.target.files?.[0] ?? null);
                      event.target.value = "";
                    }}
                    className="sr-only"
                  />
                </label>
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

              <DataCleaningPanel
                key={result.file_id}
                datasetId={result.file_id}
                columns={result.columns}
                disabled={loading || summaryLoading || askLoading || columnLoading || suggestionsLoading || previewingSuggestionId !== null || addingItemId !== null}
              />
              <button
                onClick={handleSummary}
                disabled={loading || summaryLoading}
                className="mt-4 w-full rounded-xl bg-amber-400 px-5 py-3 font-bold text-stone-950 shadow-sm transition hover:bg-amber-500 focus:outline-none focus:ring-4 focus:ring-amber-200 disabled:cursor-not-allowed disabled:bg-stone-200 disabled:text-stone-600 disabled:shadow-none"
              >
                {summaryLoading ? "Analyzing your file..." : "Analyze"}
              </button>
              </div>

                <div
                  ref={summarySectionRef}
                  className="order-4 mt-8 scroll-mt-6 rounded-3xl border border-stone-200 bg-white p-5 shadow-sm sm:p-8"
                >
              {result.preview.length > 0 && (
                <div className="mt-5 overflow-hidden rounded-xl border border-amber-200">
                  <div className="border-b border-amber-200 bg-yellow-50 px-4 py-3">
                    <h3 className="font-bold text-stone-800">Data preview</h3>
                    <p className="text-xs text-stone-500">
                      Showing the first {result.preview.length} rows
                    </p>
                    <p className="mt-1 text-xs text-stone-500">No value means the cell is missing or unavailable. Zero is shown as 0.</p>
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
                                <DataValue value={row[column]} />
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
                                <DataValue value={columnDetails[statistic]} statistic />
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
                                  <DataValue value={values[statistic]} statistic />
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
            </div>
          )}
        </div>

        {result && <ManualChartBuilder
          key={result.file_id}
          datasetId={result.file_id}
          columns={result.columns}
          disabled={loading}
          saving={addingItemId !== null}
          saveError={dashboardError}
          onAdd={(chart) => handleAddToDashboard({ type: "chart", spec: chart })}
        />}

        {result && <div className="contents">
          <div className="order-5 mt-8 rounded-3xl border border-stone-200 bg-white p-5 shadow-sm sm:p-8">
          <div className="flex items-start gap-4">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-amber-400 text-xl shadow-sm">
              ✦
            </span>
            <div>
              <h2 className="text-2xl font-black text-stone-900">Ask your data</h2>
              <p className="mt-1 text-sm leading-6 text-stone-500">
                Ask a plain-language question and the agent will analyze your uploaded dataset.
              </p>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50/70 p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="font-bold text-amber-950">
                  AI analysis suggestions
                </h3>
                <p className="mt-1 text-sm leading-6 text-amber-800">
                  Let the agent study the meaning of your columns and recommend
                  useful KPI cards and charts.
                </p>
              </div>

              <button
                type="button"
                onClick={() => void handleGenerateSuggestions()}
                disabled={!result || suggestionsLoading}
                className="shrink-0 rounded-xl bg-amber-400 px-5 py-3 font-bold text-stone-950 transition hover:bg-amber-500 disabled:cursor-not-allowed disabled:bg-stone-200 disabled:text-stone-600"
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
                className="mt-4 rounded-xl border border-amber-200 bg-white px-4 py-3"
                aria-live="polite"
              >
                <p className="font-semibold text-amber-900">
                  The AI is studying your dataset...
                </p>
                <p className="mt-1 text-sm text-amber-700">
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
                <p className="text-sm leading-6 text-amber-900">
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
                    <h4 className="text-sm font-bold uppercase tracking-wider text-amber-800">
                      Suggested KPIs
                    </h4>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      {suggestions.kpi_suggestions.map((suggestion) => (
                        <article
                          key={suggestion.id}
                          className="rounded-xl border border-amber-200 bg-white p-4"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <h5 className="font-bold text-stone-900">
                              {suggestion.title}
                            </h5>
                            <span className="shrink-0 rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">
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
                            className="mt-4 w-full rounded-lg bg-amber-400 px-4 py-2.5 text-sm font-bold text-stone-950 transition hover:bg-amber-500 disabled:cursor-wait disabled:bg-stone-200 disabled:text-stone-600"
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
                    <h4 className="text-sm font-bold uppercase tracking-wider text-amber-800">
                      Suggested charts
                    </h4>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      {suggestions.chart_suggestions.map((suggestion) => (
                        <article
                          key={suggestion.id}
                          className="rounded-xl border border-amber-200 bg-white p-4"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <h5 className="font-bold text-stone-900">
                              {suggestion.title}
                            </h5>
                            <span className="shrink-0 rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">
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
                            className="mt-4 w-full rounded-lg bg-amber-400 px-4 py-2.5 text-sm font-bold text-stone-950 transition hover:bg-amber-500 disabled:cursor-wait disabled:bg-stone-200 disabled:text-stone-600"
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
                className="inline-flex min-w-36 items-center justify-center gap-2 rounded-xl bg-stone-900 px-5 py-3.5 font-bold text-white shadow-sm transition hover:bg-amber-500 hover:text-stone-950 focus:outline-none focus:ring-4 focus:ring-amber-200 disabled:cursor-not-allowed disabled:bg-stone-200 disabled:text-stone-600 disabled:shadow-none"
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
          </div>

          <div
            ref={analysisResultsRef}
            className="order-2 scroll-mt-6"
            aria-hidden="true"
          />

          {answer && !askLoading && (
            <div className="order-3 mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-5" aria-live="polite">
              <div className="flex items-center gap-2">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-amber-400 text-xs font-black text-stone-900">✓</span>
                <h3 className="font-bold text-stone-900">Agent answer</h3>
              </div>
              <p className="mt-3 whitespace-pre-wrap leading-7 text-stone-700">{answer}</p>
            </div>
          )}

          {assumptions.length > 0 && !askLoading && (
            <div className="order-3 mt-5 rounded-2xl border border-sky-200 bg-sky-50 p-5">
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
              className="order-3 mt-5 rounded-2xl border border-orange-200 bg-orange-50 p-5"
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
            <div className="order-2 mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {kpis.map((kpi) => (
                <div key={kpi.id}>
                  <KpiCard kpi={kpi} />
                  <button
                    type="button"
                    onClick={() =>
                      void handleAddToDashboard({ type: "kpi", spec: kpi })
                    }
                    disabled={addingItemId !== null}
                    className="mt-3 w-full rounded-xl bg-stone-900 px-5 py-3 font-bold text-white transition hover:bg-amber-500 hover:text-stone-950 disabled:cursor-wait disabled:bg-stone-200 disabled:text-stone-600"
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
            <div className="order-3 mt-8 space-y-5">
              {charts.map((chart) => (
                <div key={chart.id}>
                  <ChartRenderer chart={chart} />
                  <button
                    type="button"
                    onClick={() =>
                      void handleAddToDashboard({ type: "chart", spec: chart })
                    }
                    disabled={addingItemId !== null}
                    className="mt-3 w-full rounded-xl bg-stone-900 px-5 py-3 font-bold text-white transition hover:bg-amber-500 hover:text-stone-950 disabled:cursor-wait disabled:bg-stone-200 disabled:text-stone-600"
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
              className="order-3 mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
            >
              {dashboardError}
            </p>
          )}
        </div>}
      </section>
      </main>
    </div>
  );
}
