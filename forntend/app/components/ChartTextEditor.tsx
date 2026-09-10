"use client";

import type { ChartSpec, ChartText } from "./ChartRenderer";

export default function ChartTextEditor({ chart, disabled, onChange }: {
  chart: ChartSpec;
  disabled: boolean;
  onChange: (text: ChartText | null) => void;
}) {
  const text = chart.text ?? {};
  const field = (label: string, value: string, maxLength: number, change: (value: string) => void) => (
    <label className="block text-sm font-semibold text-stone-700">
      {label}
      <input
        value={value}
        maxLength={maxLength}
        onChange={(event) => change(event.target.value)}
        className="mt-1 block w-full rounded-lg border border-amber-200 bg-white px-3 py-2 font-normal focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-100"
      />
    </label>
  );

  return (
    <details className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
      <summary className="cursor-pointer text-sm font-bold text-amber-900">Edit chart text</summary>
      <fieldset disabled={disabled} className="mt-3 grid gap-3 sm:grid-cols-2">
        {field("Chart title", text.title ?? chart.title, 255, (title) => onChange({ ...text, title }))}
        {field("Subtitle", text.subtitle ?? chart.subtitle ?? "", 500, (subtitle) => onChange({ ...text, subtitle }))}
        {chart.type !== "pie" && <>
          {field("X-axis title", text.x_axis ?? chart.x_axis.label, 200, (x_axis) => onChange({ ...text, x_axis }))}
          {field("Y-axis title", text.y_axis ?? "", 200, (y_axis) => onChange({ ...text, y_axis }))}
          {chart.series.map((series) => (
            <div key={series.key}>
              {field(`Legend: ${series.label}`, text.series?.[series.key] ?? series.label, 200,
                (label) => onChange({ ...text, series: { ...text.series, [series.key]: label } }))}
            </div>
          ))}
        </>}
        <p className="text-xs text-stone-600 sm:col-span-2">Preview updates as you type. Use Save dashboard to keep your changes. Leave a field empty to hide its text.</p>
        <button type="button" onClick={() => onChange(null)} className="justify-self-start text-sm font-semibold text-amber-800 underline">
          Reset chart text
        </button>
      </fieldset>
    </details>
  );
}
