"use client";
import { useState } from "react";
import { apiUrl, workspaceFetch } from "../lib/api";

type FilterPreview = {
  rows_before: number;
  rows_after: number;
  affected_rows: number;
  revision: string;
  can_apply: boolean;
};
type DatasetFilterPanelProps = {
  datasetId: string;
  columns: string[];
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
  onApplied: () => Promise<void>;
};

export default function DatasetFilterPanel({
  datasetId,
  columns,
  onApplied,
  disabled = false,
  onBusyChange,
}: DatasetFilterPanelProps) {
  const [columnName, setColumnName] = useState(columns[0] ?? "");
  const [value, setValue] = useState("");
  const [preview, setPreview] = useState<FilterPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const locked = busy || disabled;

  async function previewFilter() {
    if (locked || !columnName || !columns.includes(columnName)) return;
    setBusy(true);
    onBusyChange?.(true);
    setError(null);
    setPreview(null);
    try {
      const response = await workspaceFetch(
        apiUrl(`/datasets/${datasetId}/transformations/preview`),
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            transformation_type: "filter_rows",
            filters: [{ column_name: columnName, operator: "eq", value }],
          }),
        },
      );
      const data = await response.json().catch(() => null);
      if (!response.ok || !data) {
        throw new Error(
          typeof data?.detail === "string" ? data.detail : "Could not preview this filter.",
        );
      }
      setPreview(data as FilterPreview);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not preview this filter.");
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  }

  async function applyFilter() {
    if (locked || !preview?.can_apply) return;
    setBusy(true);
    onBusyChange?.(true);
    setError(null);
    try {
      const response = await workspaceFetch(apiUrl(`/datasets/${datasetId}/transformations`), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transformation_type: "filter_rows",
          filters: [{ column_name: columnName, operator: "eq", value }],
          expected_revision: preview.revision,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setPreview(null);
        throw new Error(typeof data?.detail === "string" ? data.detail : "Could not apply this filter. Preview it again.");
      }
      setPreview(null);
      // Do not restore old answers/suggestions when returning to the analysis page.
      try {
        const stored = JSON.parse(sessionStorage.getItem("currentAnalysis") ?? "null");
        if (stored?.result?.file_id === datasetId) sessionStorage.removeItem("currentAnalysis");
      } catch { /* Storage availability must not prevent refreshing saved data. */ }
      await onApplied();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not apply this filter.");
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  }

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <h2 className="font-black">Filter data</h2>
      <p className="mt-2 text-sm text-stone-600">
        Keep records that match your conditions.
        Applied filters affect future analyses.
      </p>
      <p className="mt-2 text-xs text-stone-500">Preview currently supports exact, case-sensitive text matches.</p>
      <label className="mt-4 block text-sm font-semibold">
        Column
        <select
          value={columnName}
          disabled={locked}
          onChange={(event) => {
            setColumnName(event.target.value);
            setPreview(null);
            setError(null);
          }}
          className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2"
        >
          {columns.map((column) => (
            <option key={column} value={column}>
              {column}
            </option>
          ))}
        </select>
      </label>

      <label className="mt-4 block text-sm font-semibold">
        Equals
        <input
          type="text"
          value={value}
          disabled={locked}
          onChange={(event) => {
            setValue(event.target.value);
            setPreview(null);
            setError(null);
          }}
          placeholder="Enter an exact value"
          className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2"
        />
      </label>
      <button
        type="button"
        onClick={() => void previewFilter()}
        disabled={locked || !columnName || !columns.includes(columnName)}
        className="mt-4 w-full rounded-xl bg-amber-400 px-4 py-3 font-bold disabled:opacity-50"
      >
        {busy ? "Loading..." : "Preview filter"}
      </button>
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
      {preview && (
        <div aria-live="polite" className="mt-3 text-sm text-stone-700">
          <p>{preview.rows_before} records before filtering. {preview.rows_after} will remain; {preview.affected_rows} will be excluded.</p>
          {!preview.can_apply && <p className="mt-2 text-amber-800">No records match. Adjust the filter before applying it.</p>}
          <button type="button" onClick={() => void applyFilter()} disabled={locked || !preview.can_apply}
            className="mt-3 w-full rounded-xl bg-stone-900 px-4 py-3 font-bold text-white disabled:opacity-50">
            {busy ? "Working..." : "Apply filter"}
          </button>
          <p className="mt-2 text-xs">After applying, use Analyze dataset to ask questions or generate suggestions for the remaining records. Undo latest restores the previous data.</p>
        </div>
      )}
    </section>
  );
}
