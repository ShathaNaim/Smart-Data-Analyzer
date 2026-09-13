"use client";

import { useState } from "react";
import { apiUrl } from "../lib/api";

type RemovalPreview = {
  removed_columns: string[];
  columns_after: string[];
  rows_after: number;
  revision: string;
};

export default function RemoveColumnsPanel({ datasetId, columns, busy, setBusy, onApplied }: {
  datasetId: string;
  columns: string[];
  busy: boolean;
  setBusy: (busy: boolean) => void;
  onApplied: () => Promise<void>;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [preview, setPreview] = useState<RemovalPreview | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(apply: boolean) {
    if (busy || !selected.length || (apply && !preview)) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(apiUrl(`/datasets/${datasetId}/transformations${apply ? "" : "/preview"}`), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transformation_type: "hide_column",
          column_names: selected,
          ...(apply ? { expected_revision: preview!.revision } : {}),
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setPreview(null);
        throw new Error(typeof data?.detail === "string" ? data.detail : "Could not remove columns. Try again.");
      }
      if (apply) {
        setPreview(null);
        setSelected([]);
        await onApplied();
      } else {
        setPreview(data as RemovalPreview);
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not remove columns.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="mt-4 space-y-4">
    <p className="text-sm text-stone-600">Select columns to remove from future analyses. Your original upload is preserved.</p>
    <fieldset disabled={busy} className="max-h-60 space-y-2 overflow-y-auto rounded-xl border border-stone-200 p-3">
      <legend className="px-1 text-sm font-bold">Columns to remove</legend>
      {columns.map((column) => <label key={column} className="flex items-start gap-2 break-all text-sm">
        <input type="checkbox" className="mt-1" checked={selected.includes(column)} onChange={(event) => {
          setSelected(event.target.checked ? [...selected, column] : selected.filter((name) => name !== column));
          setPreview(null);
          setError(null);
        }} />{column}
      </label>)}
    </fieldset>
    {selected.length === columns.length && <p className="text-sm text-amber-800">Keep at least one column.</p>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {preview && <div aria-live="polite" className="space-y-2 rounded-xl bg-amber-50 p-3 text-sm">
      <p className="font-bold">Remove {preview.removed_columns.length} columns:</p>
      <ul className="list-inside list-disc break-all">{preview.removed_columns.map((column) => <li key={column}>{column}</li>)}</ul>
      <p>{preview.columns_after.length} columns and {preview.rows_after.toLocaleString()} rows will remain.</p>
      <p>You can restore these columns with Undo latest.</p>
    </div>}
    <button disabled={busy || !selected.length || selected.length >= columns.length} onClick={() => void submit(Boolean(preview))}
      className="w-full rounded-xl bg-amber-400 px-4 py-3 font-black hover:bg-amber-500 disabled:opacity-50">
      {busy ? "Working..." : preview ? "Apply removal" : "Preview removal"}
    </button>
  </div>;
}
