"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import AppSidebar from "../../components/AppSidebar";
import DataValue from "../../components/DataValue";
import { apiUrl } from "../../lib/api";

type Transformation = {
  id: string;
  transformation_type: "calculated_column" | "rename_column" | "hide_column" | "trim_whitespace" | "remove_duplicates";
  config: Record<string, string | number>;
  created_at: string;
};

type DatasetDetail = {
  id: string;
  original_filename: string;
  extension: string;
  file_size: number;
  row_count: number;
  original_columns: string[];
  columns: string[];
  description: string | null;
  created_at: string;
  preview: Record<string, unknown>[];
  page: number;
  page_size: number;
  total_pages: number;
  transformations: Transformation[];
};

const operators = [
  { value: "add", label: "+" },
  { value: "subtract", label: "−" },
  { value: "multiply", label: "×" },
  { value: "divide", label: "÷" },
];

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function describeTransformation(item: Transformation) {
  const config = item.config;
  if (item.transformation_type === "trim_whitespace") return `Trim whitespace in ${config.column_name}`;
  if (item.transformation_type === "remove_duplicates") return "Remove exact duplicate rows (keep first)";
  if (item.transformation_type === "hide_column") {
    return `Hide ${config.column_name}`;
  }
  if (item.transformation_type === "rename_column") {
    return `Rename ${config.column_name} to ${config.new_column_name}`;
  }
  if (config.expression) {
    return `${config.new_column_name} = ${config.expression}`;
  }
  const symbol = operators.find((entry) => entry.value === config.operator)?.label;
  return `${config.new_column_name} = ${config.column_name} ${symbol} ${config.right_column ?? config.right_value}`;
}

export default function DatasetWorkspace({ datasetId }: { datasetId: string }) {
  const [dataset, setDataset] = useState<DatasetDetail | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"calculate" | "rename" | "hide">("calculate");
  const [columnName, setColumnName] = useState("");
  const [newColumnName, setNewColumnName] = useState("");
  const [expression, setExpression] = useState("");

  const loadDataset = useCallback(async (requestedPage: number) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        apiUrl(`/datasets/${datasetId}?page=${requestedPage}&page_size=20`),
        { credentials: "include" },
      );
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.detail || "Could not load this dataset.");
      const detail = data as DatasetDetail;
      setDataset(detail);
      setPage(detail.page);
      setColumnName((current) => current || detail.columns[0] || "");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load this dataset.");
    } finally {
      setLoading(false);
    }
  }, [datasetId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadDataset(page), 0);
    return () => window.clearTimeout(timer);
  }, [loadDataset, page]);

  const saveTransformation = async () => {
    if (!dataset || !columnName || saving) return;
    setSaving(true);
    setError(null);
    let body: Record<string, unknown>;
    if (mode === "calculate") {
      body = {
        transformation_type: "calculated_column",
        column_name: columnName,
        new_column_name: newColumnName.trim(),
        expression: expression.trim(),
      };
    } else if (mode === "rename") {
      body = {
        transformation_type: "rename_column",
        column_name: columnName,
        new_column_name: newColumnName.trim(),
      };
    } else {
      body = { transformation_type: "hide_column", column_name: columnName };
    }

    try {
      const response = await fetch(
        apiUrl(`/datasets/${datasetId}/transformations`),
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.detail || "Could not save the change.");
      setNewColumnName("");
      setExpression("");
      await loadDataset(1);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save the change.");
    } finally {
      setSaving(false);
    }
  };

  const undoLatest = async () => {
    const latest = dataset?.transformations.at(-1);
    if (!latest || saving) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(
        apiUrl(`/datasets/${datasetId}/transformations/${latest.id}`),
        { method: "DELETE", credentials: "include" },
      );
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.detail || "Could not undo the latest change.");
      }
      await loadDataset(1);
    } catch (undoError) {
      setError(undoError instanceof Error ? undoError.message : "Could not undo the change.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-amber-50 lg:flex">
      <AppSidebar datasetId={datasetId} />
      <main className="min-w-0 flex-1 px-5 py-8 text-stone-900 sm:px-8">
        <div className="mx-auto max-w-7xl">
          <Link href="/" className="text-sm font-bold text-amber-700 hover:text-amber-900">
            ← New analysis
          </Link>

          {loading && !dataset && <p className="mt-8 text-stone-600">Loading dataset...</p>}
          {error && <p role="alert" className="mt-6 rounded-xl bg-red-50 p-4 text-red-700">{error}</p>}

          {dataset && (
            <>
              <header className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-amber-600">Dataset workspace</p>
                  <h1 className="mt-1 break-all text-3xl font-black">{dataset.original_filename}</h1>
                  <p className="mt-2 text-sm text-stone-500">
                    {dataset.row_count.toLocaleString()} rows · {dataset.columns.length} visible columns · {formatBytes(dataset.file_size)}
                  </p>
                  {dataset.description && <p className="mt-3 max-w-2xl text-stone-600">{dataset.description}</p>}
                </div>
                <Link
                  href={`/?dataset=${dataset.id}`}
                  className="shrink-0 rounded-xl bg-stone-900 px-5 py-3 text-center font-bold text-white transition hover:bg-amber-500 hover:text-stone-950"
                >
                  Analyze dataset
                </Link>
              </header>

              <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
                <section className="min-w-0 rounded-2xl border border-stone-200 bg-white shadow-sm">
                  <div className="flex items-center justify-between border-b border-stone-200 px-5 py-4">
                    <div>
                      <h2 className="font-black">Data preview</h2>
                      <p className="text-xs text-stone-500">Showing 20 rows per page</p>
                    </div>
                    {loading && <span className="text-xs font-semibold text-amber-700">Refreshing...</span>}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                      <thead className="bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
                        <tr>{dataset.columns.map((column) => <th key={column} className="whitespace-nowrap px-4 py-3">{column}</th>)}</tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100">
                        {dataset.preview.map((row, index) => (
                          <tr key={index} className="hover:bg-amber-50/50">
                            {dataset.columns.map((column) => (
                              <td key={column} className="max-w-64 truncate whitespace-nowrap px-4 py-3 text-stone-700" title={String(row[column] ?? "")}>
                                <DataValue value={row[column]} />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex items-center justify-between border-t border-stone-200 px-5 py-4 text-sm">
                    <button className="rounded-lg border px-3 py-2 font-semibold disabled:opacity-40" disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}>Previous</button>
                    <span className="text-stone-500">Page {dataset.page} of {dataset.total_pages}</span>
                    <button className="rounded-lg border px-3 py-2 font-semibold disabled:opacity-40" disabled={page >= dataset.total_pages || loading} onClick={() => setPage((value) => value + 1)}>Next</button>
                  </div>
                </section>

                <aside className="space-y-6">
                  <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
                    <h2 className="font-black">Transform data</h2>
                    <div className="mt-4 grid grid-cols-3 rounded-xl bg-stone-100 p-1 text-xs font-bold">
                      {(["calculate", "rename", "hide"] as const).map((item) => (
                        <button key={item} onClick={() => setMode(item)} className={`rounded-lg px-2 py-2 capitalize ${mode === item ? "bg-white text-amber-700 shadow-sm" : "text-stone-500"}`}>{item}</button>
                      ))}
                    </div>
                    <label className="mt-4 block text-xs font-bold uppercase tracking-wide text-stone-500">Source column</label>
                    <select value={columnName} onChange={(event) => setColumnName(event.target.value)} className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5">
                      {dataset.columns.map((column) => <option key={column}>{column}</option>)}
                    </select>

                    {mode !== "hide" && (
                      <>
                        <label className="mt-4 block text-xs font-bold uppercase tracking-wide text-stone-500">{mode === "rename" ? "New name" : "Calculated column name"}</label>
                        <input value={newColumnName} onChange={(event) => setNewColumnName(event.target.value)} placeholder={mode === "rename" ? "New column name" : "e.g. profit"} className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2.5" />
                      </>
                    )}

                    {mode === "calculate" && (
                      <>
                        <label className="mt-4 block text-xs font-bold uppercase tracking-wide text-stone-500">Formula</label>
                        <textarea
                          value={expression}
                          onChange={(event) => setExpression(event.target.value)}
                          placeholder="col1 * 10 - col2 + col3"
                          rows={3}
                          className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2.5 font-mono text-sm"
                        />
                        <p className="mt-2 text-xs leading-5 text-stone-500">
                          Use +, −, ×, ÷ and parentheses. Columns with spaces use braces, such as {`{Unit Price}`}.
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2" aria-label="Insert a column into the formula">
                          {dataset.columns.map((column) => (
                            <button
                              key={column}
                              type="button"
                              onClick={() => setExpression((current) => `${current}${current && !current.endsWith(" ") ? " " : ""}{${column}}`)}
                              className="max-w-full truncate rounded-lg bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-800 hover:bg-sky-100"
                              title={`Insert ${column}`}
                            >
                              + {column}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                    <button onClick={() => void saveTransformation()} disabled={saving || (mode !== "hide" && !newColumnName.trim()) || (mode === "calculate" && !expression.trim())} className="mt-5 w-full rounded-xl bg-amber-400 px-4 py-3 font-black transition hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-50">
                      {saving ? "Saving..." : mode === "hide" ? "Hide column" : "Apply change"}
                    </button>
                  </section>

                  <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
                    <div className="flex items-center justify-between">
                      <h2 className="font-black">Change history</h2>
                      <button disabled={!dataset.transformations.length || saving} onClick={() => void undoLatest()} className="text-sm font-bold text-amber-700 disabled:text-stone-300">Undo latest</button>
                    </div>
                    {!dataset.transformations.length ? <p className="mt-3 text-sm text-stone-500">The original upload is unchanged.</p> : (
                      <ol className="mt-3 space-y-2">
                        {dataset.transformations.map((item, index) => <li key={item.id} className="rounded-lg bg-stone-50 px-3 py-2 text-sm"><span className="mr-2 text-stone-400">{index + 1}.</span>{describeTransformation(item)}</li>)}
                      </ol>
                    )}
                  </section>
                </aside>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
