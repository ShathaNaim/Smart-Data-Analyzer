"use client";

import { useEffect, useRef, useState } from "react";
import ChartRenderer, { type ChartSpec } from "./ChartRenderer";
import { apiUrl } from "../lib/api";
import type { ChartAnalysisPlan, DimensionSpec, MeasureSpec, SuggestionPreviewResponse } from "../types/analysisSuggestions";

const inputClass = "mt-1 block w-full rounded-lg border border-stone-300 bg-white px-3 py-2 font-normal focus:outline-none focus:ring-2 focus:ring-amber-400";
const buttonClass = "rounded-xl bg-amber-400 px-5 py-3 text-sm font-bold text-stone-950 hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-50";
const calculations: Array<[MeasureSpec["aggregation"], string]> = [
  ["count", "Count non-empty values"], ["nunique", "Count distinct values"],
  ["sum", "Sum"], ["mean", "Average"], ["median", "Median"], ["min", "Minimum"], ["max", "Maximum"],
];

export default function ManualChartBuilder({ datasetId, columns, disabled, saving, saveError, onAdd }: {
  datasetId: string;
  columns: string[];
  disabled: boolean;
  saving: boolean;
  saveError: string | null;
  onAdd: (chart: ChartSpec) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<ChartSpec["type"]>("bar");
  const [dimension, setDimension] = useState(columns[0] ?? "");
  const [measure, setMeasure] = useState(columns[0] ?? "");
  const [aggregation, setAggregation] = useState<MeasureSpec["aggregation"]>("count");
  const [granularity, setGranularity] = useState<DimensionSpec["time_granularity"]>(null);
  const [sort, setSort] = useState("category_asc");
  const [limit, setLimit] = useState("20");
  const [bins, setBins] = useState("10");
  const advanced = type === "scatter" || type === "histogram";
  const isPartOfWhole = type === "pie" || type === "donut";
  const [title, setTitle] = useState("");
  const [preview, setPreview] = useState<ChartSpec | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);

  const previewChart = async () => {
    if (loading || disabled || saving) return;
    setError(null);
    setPreview(null);
    setWarnings([]);
    const rowLimit = type === "histogram" ? 1000 : Number(limit);
    const binCount = Number(bins);
    if (type === "histogram" && (!Number.isInteger(binCount) || binCount < 2 || binCount > 50)) {
      setError("Choose between 2 and 50 histogram bins.");
      return;
    }
    if (!dimension || !measure || !Number.isInteger(rowLimit) || rowLimit < 1 || rowLimit > 1000) {
      setError("Choose a category and value column, and a category limit between 1 and 1,000.");
      return;
    }
    const availableAlias = (base: string) => {
      let alias = base;
      while (columns.includes(alias)) alias = `_${alias}`;
      return alias;
    };
    const categoryAlias = availableAlias("manual_category");
    const valueAlias = availableAlias("manual_value");
    const plan: ChartAnalysisPlan = {
      output_type: "chart",
      intent: type === "histogram" ? `Distribution of ${dimension}` : type === "scatter" ? `${measure} vs ${dimension}` : `${calculations.find(([value]) => value === aggregation)?.[1]} of ${measure} by ${dimension}`,
      chart_type: type,
      dimensions: [{ column: dimension, alias: categoryAlias, time_granularity: advanced ? null : granularity }],
      measures: type === "histogram" ? [] : [{ column: measure, alias: valueAlias, aggregation: type === "scatter" ? "none" : aggregation }],
      filters: [],
      bin_count: type === "histogram" ? binCount : null,
      sort: advanced ? [] : [{ column: sort.startsWith("category") ? categoryAlias : valueAlias, direction: sort.endsWith("asc") ? "asc" : "desc" }],
      row_limit: rowLimit,
      assumptions: [],
    };
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    try {
      const response = await fetch(apiUrl(`/dataset/${datasetId}/suggestion-preview`), {
        method: "POST", credentials: "include", signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ output_type: "chart", chart_plan: plan, kpi_plan: null }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "These settings could not produce a chart. Check the selected columns and calculation.");
      const result = data as SuggestionPreviewResponse;
      if (result.output_type !== "chart" || !result.chart) throw new Error("The preview did not return a chart.");
      if (isPartOfWhole && (result.chart.data.some((row) => Number(row[valueAlias]) < 0) || !result.chart.data.some((row) => Number(row[valueAlias]) > 0))) {
        throw new Error("Pie and doughnut charts need non-negative values and at least one positive value. Try a bar chart for this calculation.");
      }
      const chart = result.chart;
      setPreview({
        ...chart,
        // Manual charts with different settings must not collide when saved.
        id: `manual-${crypto.randomUUID()}`,
        title: title.trim() || plan.intent.slice(0, 255),
        x_axis: { ...chart.x_axis, label: dimension },
        series: chart.series.map((series) => ({ ...series, label: type === "histogram" ? "Count" : type === "scatter" ? measure : `${calculations.find(([value]) => value === aggregation)?.[1]} of ${measure}` })),
      });
      setWarnings(result.warnings);
    } catch (error) {
      if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Could not create the chart preview.");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  };

  return (
    <section className="order-4 mt-8 rounded-3xl border border-stone-200 bg-white p-5 shadow-sm sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-stone-900">Create your own chart</h2>
          <p className="mt-1 text-sm text-stone-600">Choose columns and a calculation, preview the result, then add it to your dashboard.</p>
        </div>
        <button type="button" className={buttonClass} aria-expanded={open} aria-controls="manual-chart-builder" onClick={() => setOpen(!open)}>{open ? "Hide builder" : "Create chart"}</button>
      </div>
      {open && <div id="manual-chart-builder" className="mt-6 grid gap-6 xl:grid-cols-[minmax(280px,1fr)_minmax(0,2fr)]">
        <form onSubmit={(event) => { event.preventDefault(); void previewChart(); }} onChange={() => { setPreview(null); setWarnings([]); setError(null); }}>
          <fieldset disabled={loading || disabled || saving} className="grid gap-4 text-sm font-semibold text-stone-700 disabled:opacity-60">
            <label>Chart title (optional)<input className={inputClass} maxLength={255} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Orders by region" /></label>
            <label>Chart type<select className={inputClass} value={type} onChange={(event) => { setType(event.target.value as ChartSpec["type"]); setLimit(event.target.value === "scatter" ? "1000" : "20"); }}>
              <option value="donut">Doughnut — show parts of a whole</option>
              <option value="horizontal_bar">Horizontal bar — compare categories with long names</option>
              <option value="bar">Bar — compare categories</option><option value="line">Line — show trends</option><option value="area">Area — show volume trends</option><option value="pie">Pie — show parts of a whole</option><option value="scatter">Scatter — explore relationships</option><option value="histogram">Histogram — show distribution</option>
            </select></label>
            <label>{advanced ? (type === "scatter" ? "X-axis numeric column" : "Numeric column") : "Category / date column"}<select className={inputClass} value={dimension} onChange={(event) => { setDimension(event.target.value); setGranularity(null); }} required>{columns.map((column) => <option key={column}>{column}</option>)}</select></label>
            {type !== "histogram" && <label>{type === "scatter" ? "Y-axis numeric column" : "Value column"}<select className={inputClass} value={measure} onChange={(event) => setMeasure(event.target.value)} required>{columns.map((column) => <option key={column}>{column}</option>)}</select></label>}
            {!advanced && <><label>Calculation<select className={inputClass} value={aggregation} onChange={(event) => setAggregation(event.target.value as MeasureSpec["aggregation"])}>{calculations.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <p className="text-xs font-normal text-stone-500">Sum, average, median, minimum, and maximum require a numeric value column. Count excludes empty values.</p>
            <label>Date grouping<select className={inputClass} value={granularity ?? ""} onChange={(event) => setGranularity(event.target.value as DimensionSpec["time_granularity"] || null)}>
              <option value="">No date grouping</option>{["day", "week", "month", "quarter", "year"].map((value) => <option key={value} value={value}>{value}</option>)}
            </select><span className="mt-1 block text-xs font-normal text-stone-500">Use only when the category column contains dates.</span></label>
            <label>Sort by<select className={inputClass} value={sort} onChange={(event) => setSort(event.target.value)}><option value="category_asc">Category: ascending</option><option value="category_desc">Category: descending</option><option value="value_desc">Value: highest first</option><option value="value_asc">Value: lowest first</option></select></label>
            </>}
            {type !== "histogram" && <label>{type === "scatter" ? "Maximum points" : "Maximum categories"}<input className={inputClass} type="number" min={type === "scatter" ? 2 : 1} max={1000} step={1} required value={limit} onChange={(event) => setLimit(event.target.value)} /></label>}
            {type === "histogram" && <label>Number of bins<input className={inputClass} type="number" min={2} max={50} step={1} required value={bins} onChange={(event) => setBins(event.target.value)} /></label>}
            {advanced && <p className="text-xs font-normal text-stone-600">{type === "scatter" ? "Select two different numeric columns. Each point is one observation; large datasets are sampled." : "All valid numeric values are counted in equal-width bins. Missing and infinite values are excluded."}</p>}
            {isPartOfWhole && <p className="text-xs font-normal text-stone-600">Pie and doughnut charts work best with a few categories. The chart shows only the categories within your limit.</p>}
            <button className={buttonClass} type="submit">{loading ? "Calculating preview…" : "Update preview"}</button>
          </fieldset>
        </form>
        <div className="min-w-0" aria-busy={loading}>
          {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
          {preview ? <>
            <ChartRenderer chart={preview} />
            {warnings.length > 0 && <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-amber-800">{warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>}
            <button type="button" disabled={saving || disabled} className={`${buttonClass} mt-4`} onClick={() => void onAdd(preview)}>{saving ? "Adding to dashboard…" : "Add to dashboard"}</button>
            {saveError && <p role="alert" className="mt-3 text-sm text-red-700">{saveError}</p>}
          </> : <div role="status" className="mt-5 flex min-h-64 items-center justify-center rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-6 text-center text-sm text-stone-600">{loading ? "Calculating your chart…" : "Choose your settings and select Update preview to see your chart."}</div>}
        </div>
      </div>}
    </section>
  );
}
