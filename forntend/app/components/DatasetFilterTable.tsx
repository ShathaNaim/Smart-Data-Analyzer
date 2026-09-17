"use client";

import { useEffect, useRef, useState } from "react";
import { apiUrl, workspaceFetch } from "../lib/api";
import DataValue from "./DataValue";

type Value = string | number | boolean;
type Selection = { values: Value[]; missing: boolean; exclude?: boolean };
type Preview = { rows_before: number; rows_after: number; revision: string; can_apply: boolean; preview: Record<string, unknown>[]; page: number; total_pages: number };
const keyOf = (value: Value) => JSON.stringify(value);

function ColumnMenu({ datasetId, column, selection, anchor, onDone, onClose }: {
  datasetId: string; column: string; selection?: Selection; anchor: { top: number; left: number };
  onDone: (value?: Selection) => void; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [values, setValues] = useState<Value[]>([]);
  const [more, setMore] = useState(false);
  const [hasMissing, setHasMissing] = useState(false);
  const [selected, setSelected] = useState<Selection | undefined>(selection?.exclude ? undefined : selection);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setBusy(true); setError("");
      try {
        const params = new URLSearchParams({ column, search, offset: String(offset) });
        const response = await workspaceFetch(apiUrl(`/datasets/${datasetId}/filter-values?${params}`), { credentials: "include", signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Could not load values.");
        setValues(current => offset ? [...current, ...data.values] : data.values);
        setMore(data.has_more); setHasMissing(data.has_missing);
      } catch (failure) {
        if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Could not load values.");
      } finally { if (!controller.signal.aborted) setBusy(false); }
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [datasetId, column, search, offset]);
  // undefined means all values, including values not yet loaded.
  const [excluded, setExcluded] = useState<Value[]>(selection?.exclude ? selection.values : []);
  const [excludeMissing, setExcludeMissing] = useState(selection?.exclude ? !selection.missing : false);
  const allMode = selected === undefined;
  return <dialog ref={dialog} onCancel={onClose} onClick={event => { if (event.target === event.currentTarget) onClose(); }} style={{ top: anchor.top, left: anchor.left, maxHeight: "calc(100dvh - 24px)" }} className="fixed m-0 overflow-y-auto w-80 max-w-[90vw] rounded-2xl border border-stone-200 bg-white p-5 text-sm text-stone-900 shadow-xl backdrop:bg-black/20">
    <h3 className="font-bold">Filter {column}</h3>
    <input autoFocus aria-label={`Search ${column} values`} placeholder="Search values…" value={search} onChange={event => { setSearch(event.target.value); setOffset(0); setValues([]); setBusy(true); }} className="mt-3 w-full rounded-lg border border-stone-300 px-3 py-2" />
    <div className="my-3 flex gap-3 text-xs font-semibold">
      <button onClick={() => { setSelected(undefined); setExcluded([]); setExcludeMissing(false); }}>Select all</button>
      <button onClick={() => { setSelected({ values: [], missing: false }); setExcluded([]); }}>Clear selection</button>
    </div>
    <div className="max-h-64 overflow-y-auto space-y-2">
      {values.map(value => <label key={keyOf(value)} className="flex items-center gap-2 break-all">
        <input type="checkbox" checked={allMode ? !excluded.some(v => keyOf(v) === keyOf(value)) : selected.values.some(v => keyOf(v) === keyOf(value))} onChange={event => {
          if (allMode) setExcluded(current => event.target.checked ? current.filter(v => keyOf(v) !== keyOf(value)) : [...current, value]);
          else setSelected({ ...selected, values: event.target.checked ? [...selected.values, value] : selected.values.filter(v => keyOf(v) !== keyOf(value)) });
        }} />{value === "" ? "(Empty text)" : String(value)}
      </label>)}
      {hasMissing && <label className="flex items-center gap-2"><input type="checkbox" checked={allMode ? !excludeMissing : selected.missing} onChange={event => { if (allMode) setExcludeMissing(!event.target.checked); else setSelected({ ...selected, missing: event.target.checked }); }} />(Missing)</label>}
      {busy && <p role="status">Loading values…</p>}
      {!busy && !values.length && <p>No matching values.</p>}
      {error && <p role="alert" className="text-red-700">{error}</p>}
      {more && <button disabled={busy} onClick={() => setOffset(values.length)} className="text-amber-800 font-semibold">Load more</button>}
    </div>
    <p className="mt-3 text-xs text-stone-500">Search finds choices; it does not change your selection.</p>
    <div className="mt-4 flex items-center justify-between gap-2">
      <button onClick={() => onDone(undefined)} className="text-amber-800">Clear filter</button>
      <button onClick={onClose}>Cancel</button>
      <button onClick={() => {
        if (allMode && (excluded.length || excludeMissing)) {
          // An exclusion selection is represented separately without fetching every value.
          onDone({ values: excluded, missing: !excludeMissing, exclude: true });
        } else onDone(selected);
      }} className="rounded-lg bg-amber-400 px-4 py-2 font-bold">Done</button>
    </div>
  </dialog>;
}

export default function DatasetFilterTable({ datasetId, columns, rows, page, totalPages, rowCount, disabled, onPage, onApplied, onBusyChange }: {
  datasetId: string; columns: string[]; rows: Record<string, unknown>[]; page: number; totalPages: number; rowCount: number; disabled: boolean;
  onPage: (page: number) => void; onApplied: () => Promise<void>; onBusyChange: (busy: boolean) => void;
}) {
  const [filters, setFilters] = useState<Record<string, Selection & { exclude?: boolean }>>({});
  const [anchor, setAnchor] = useState({ top: 0, left: 0 });
  const [open, setOpen] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewPage, setPreviewPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState("");
  const active = Object.keys(filters).length > 0;
  const conditions = Object.entries(filters).map(([column_name, selection]) => ({ column_name, operator: selection.exclude ? "none_of" : "one_of", value: selection.values, include_missing: selection.missing }));
  const body = JSON.stringify({ transformation_type: "filter_rows", filters: conditions });
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    workspaceFetch(apiUrl(`/datasets/${datasetId}/transformations/preview?page=${previewPage}`), { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body, signal: controller.signal })
      .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Could not preview filters."); return data; })
      .then(data => { if (!controller.signal.aborted) { setPreview(data); setBusy(false); } })
      .catch(failure => { if (!controller.signal.aborted) { setError(failure.message); setBusy(false); } });
    return () => controller.abort();
  }, [active, body, datasetId, previewPage]);
  function change(column: string, selection?: Selection) {
    const next = { ...filters };
    if (selection) next[column] = selection; else delete next[column];
    setFilters(next); setPreview(null); setPreviewPage(1); setError(""); setBusy(Object.keys(next).length > 0); setOpen(null);
  }
  async function apply() {
    if (!preview?.can_apply || busy || disabled || applying) return;
    setApplying(true); onBusyChange(true); setError("");
    try {
      const response = await workspaceFetch(apiUrl(`/datasets/${datasetId}/transformations`), { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...JSON.parse(body), expected_revision: preview.revision }) });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Could not apply filters.");
      try { const stored = JSON.parse(sessionStorage.getItem("currentAnalysis") ?? "null"); if (stored?.result?.file_id === datasetId) sessionStorage.removeItem("currentAnalysis"); } catch { /* Storage may be unavailable. */ }
      await onApplied();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not apply filters."); }
    finally { setApplying(false); onBusyChange(false); }
  }
  const shownRows = active ? preview?.preview ?? [] : rows;
  const shownPage = active ? preview?.page ?? 1 : page;
  const pages = active ? preview?.total_pages ?? 1 : totalPages;
  function navigate(next: number) { if (active) { setBusy(true); setPreviewPage(next); } else onPage(next); }
  return <section className="min-w-0 rounded-2xl border border-stone-200 bg-white shadow-sm">
    <div className="border-b border-stone-200 px-5 py-4">
      <h2 className="font-black">Data preview</h2>
      <p aria-live="polite" className="mt-1 text-xs text-stone-500">{busy ? "Updating preview…" : active && preview ? `${preview.rows_after.toLocaleString()} of ${preview.rows_before.toLocaleString()} rows match` : `${rowCount.toLocaleString()} rows · 20 per page`}</p>
      <p className="mt-1 text-xs text-stone-500">Use the dropdown beside a column name to filter its values.</p>
      {active && <div className="mt-3 space-y-3">
        <div className="flex flex-wrap gap-2">{Object.entries(filters).map(([column, selection]) => <button disabled={disabled || applying} key={column} onClick={() => change(column)} aria-label={`Clear ${column} filter`} className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold">{column}: {selection.exclude ? "excluding " : ""}{selection.values.length} values{selection.missing ? " + missing" : ""} ×</button>)}
        <button disabled={disabled || applying} onClick={() => { setFilters({}); setPreview(null); setBusy(false); setError(""); }} className="text-xs font-bold text-amber-800">Clear all</button></div>
        <button disabled={disabled || busy || applying || !preview?.can_apply} onClick={() => void apply()} className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-40">{applying ? "Applying…" : "Apply to dataset"}</button>
        <p className="text-xs text-stone-500">Preview only until applied. Applying saves these filters for future analyses; Undo latest restores the previous data.</p>
      </div>}
      {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
    <div className="overflow-x-auto"><table className="min-w-full text-left text-sm">
      <thead className="bg-stone-50 text-xs text-stone-500"><tr>{columns.map(column => <th key={column} className="whitespace-nowrap px-4 py-3"><button disabled={disabled || applying} aria-label={`Filter ${column}`} aria-haspopup="dialog" aria-expanded={open === column} onClick={event => { const rect = event.currentTarget.getBoundingClientRect(); setAnchor({ top: Math.max(12, Math.min(rect.bottom + 6, window.innerHeight - 480)), left: Math.max(12, Math.min(rect.left, window.innerWidth - 332)) }); setOpen(column); }} className={`flex items-center gap-2 rounded px-2 py-1 font-bold focus-visible:outline-2 focus-visible:outline-amber-500 ${filters[column] ? "bg-amber-100 text-amber-900" : "hover:bg-stone-200"}`}>{column}<span aria-hidden="true">{filters[column] ? "⏷ ●" : "⏷"}</span></button></th>)}</tr></thead>
      <tbody className="divide-y divide-stone-100">{shownRows.map((row, index) => <tr key={index} className="hover:bg-amber-50/50">{columns.map(column => <td key={column} title={String(row[column] ?? "")} className="max-w-64 truncate whitespace-nowrap px-4 py-3 text-stone-700"><DataValue value={row[column]} /></td>)}</tr>)}
      {!shownRows.length && <tr><td colSpan={columns.length} className="px-5 py-10 text-center text-stone-500">{busy ? "Loading preview…" : error ? "Preview unavailable." : "No rows match. Adjust or clear your filters."}</td></tr>}</tbody>
    </table></div>
    <div className="flex items-center justify-between border-t border-stone-200 px-5 py-4 text-sm"><button disabled={disabled || busy || applying || shownPage <= 1} onClick={() => navigate(shownPage - 1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">Previous</button><span>Page {shownPage} of {pages}</span><button disabled={disabled || busy || applying || shownPage >= pages} onClick={() => navigate(shownPage + 1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">Next</button></div>
    {open && <ColumnMenu key={open} anchor={anchor} datasetId={datasetId} column={open} selection={filters[open]} onDone={selection => change(open, selection)} onClose={() => setOpen(null)} />}
  </section>;
}
