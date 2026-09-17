"use client";

import { useEffect, useState } from "react";
import { apiUrl, workspaceFetch } from "../lib/api";

type Preview = {
  rows_before: number;
  rows_after: number;
  affected_rows: number;
  revision: string;
  before: Record<string, unknown>[];
  after: Record<string, unknown>[];
};
type Transformation = { id: string; transformation_type: string };

export default function DataCleaningPanel({ datasetId, columns, disabled }: {
  datasetId: string;
  columns: string[];
  disabled: boolean;
}) {
  const [operation, setOperation] = useState("trim_whitespace");
  const [column, setColumn] = useState(columns[0] ?? "");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [latest, setLatest] = useState<Transformation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    workspaceFetch(apiUrl(`/datasets/${datasetId}`), { credentials: "include", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load cleaning history.");
        const data = await response.json();
        setLatest(data.transformations.at(-1) ?? null);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(error.message);
      });
    return () => controller.abort();
  }, [datasetId]);

  const run = async (action: "preview" | "apply" | "undo") => {
    setBusy(true);
    setError(null);
    try {
      const suffix = action === "preview" ? "/preview" : action === "undo" ? `/${latest?.id}` : "";
      const response = await workspaceFetch(apiUrl(`/datasets/${datasetId}/transformations${suffix}`), {
        method: action === "undo" ? "DELETE" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: action === "undo" ? undefined : JSON.stringify({
          transformation_type: operation,
          ...(operation === "trim_whitespace" ? { column_name: column } : {}),
          ...(action === "apply" ? { expected_revision: preview?.revision } : {}),
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(typeof data?.detail === "string" ? data.detail : "Could not complete cleaning.");
      if (action === "preview") {
        setPreview(data);
      } else {
        // A fresh page prevents earlier analysis requests from restoring stale results.
        const query = new URLSearchParams(window.location.search);
        query.delete("new");
        query.set("dataset", datasetId);
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- Reset all analysis state and pending requests after changing the data.
        window.location.assign(`/?${query}`);
      }
    } catch (error) {
      setPreview(null);
      setError(error instanceof Error ? error.message : "Could not complete cleaning.");
    } finally {
      setBusy(false);
    }
  };

  const canUndo = latest && ["trim_whitespace", "remove_duplicates"].includes(latest.transformation_type);
  const buttonClass = "rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-semibold text-amber-900 disabled:opacity-40";
  return (
    <details className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
      <summary className="cursor-pointer font-bold text-stone-900">Clean data</summary>
      <p className="mt-2 text-sm text-stone-600">Preview a fix before applying it. Your original file is preserved. Missing values and data types stay unchanged.</p>
      <fieldset disabled={busy || disabled} className="mt-3 space-y-3">
        <label className="block text-sm font-semibold">Cleaning operation
          <select value={operation} onChange={(event) => { setOperation(event.target.value); setPreview(null); }} className="mt-1 block w-full rounded-lg border border-amber-200 bg-white p-2">
            <option value="trim_whitespace">Trim leading and trailing spaces</option>
            <option value="remove_duplicates">Remove exact duplicate rows</option>
          </select>
        </label>
        {operation === "trim_whitespace" ? (
          <label className="block text-sm font-semibold">Column
            <select value={column} onChange={(event) => { setColumn(event.target.value); setPreview(null); }} className="mt-1 block w-full rounded-lg border border-amber-200 bg-white p-2">
              {columns.map((name) => <option key={name}>{name}</option>)}
            </select>
          </label>
        ) : <p className="text-sm text-stone-600">Compare all current columns and keep the first occurrence. Identical rows can represent separate events; review before removing them.</p>}
        <div className="flex flex-wrap gap-2">
          <button type="button" className={buttonClass} onClick={() => void run("preview")}>Preview cleaning</button>
          {canUndo && <button type="button" className={buttonClass} onClick={() => void run("undo")}>Undo latest cleaning</button>}
        </div>
        {preview && <div className="space-y-2 text-sm">
          <p role="status">{preview.affected_rows} rows affected. Row count: {preview.rows_before} → {preview.rows_after}.</p>
          {preview.affected_rows > 0 && <>
            <p className="font-semibold">Examples (up to 5 affected rows)</p>
            <div className="overflow-x-auto rounded-lg bg-white p-2">
              <table className="w-full text-left text-xs">
                <thead><tr><th className="p-2">Before</th><th className="p-2">After</th></tr></thead>
                <tbody>{preview.before.map((row, index) => <tr key={index}>
                  <td className="whitespace-pre-wrap break-all p-2 font-mono">{JSON.stringify(operation === "trim_whitespace" ? row[column] : row)}</td>
                  <td className="whitespace-pre-wrap break-all p-2 font-mono">{operation === "remove_duplicates" ? "Removed duplicate" : JSON.stringify(preview.after[index]?.[column])}</td>
                </tr>)}</tbody>
              </table>
            </div>
            <button type="button" className={buttonClass} onClick={() => void run("apply")}>Apply cleaning</button>
          </>}
        </div>}
      </fieldset>
      <p className="mt-3 text-xs text-stone-500">Applying or undoing clears current analysis results. Run analysis again afterward. Saved dashboard charts keep their previously saved results.</p>
      {busy && <p role="status" className="mt-2 text-sm">Working…</p>}
      {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
    </details>
  );
}
