"use client";

import { useState } from "react";

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

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<UploadeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<SummaryResult | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [columnDetails, setColumnDetails] = useState<ColumnDetails | null>(null);
  const [columnLoading, setColumnLoading] = useState(false);

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setSummary(null);
    setColumnDetails(null);
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
      </section>
    </main>
  );
}
