import type { ChartSpec } from "../components/ChartRenderer";
import type { KpiSpec } from "../components/KpiCard";


export type FilterCondition = {
  column: string;
  operator:
    | "eq"
    | "ne"
    | "gt"
    | "gte"
    | "lt"
    | "lte"
    | "contains"
    | "in"
    | "between"
    | "is_null"
    | "is_not_null";
  value:
    | string
    | number
    | boolean
    | Array<string | number>
    | null;
};


export type MeasureSpec = {
  column: string;
  aggregation:
    | "sum"
    | "mean"
    | "median"
    | "min"
    | "max"
    | "count"
    | "nunique";
  alias: string;
};


export type DimensionSpec = {
  column: string;
  alias: string;
  time_granularity:
    | "day"
    | "week"
    | "month"
    | "quarter"
    | "year"
    | null;
};


export type SortSpec = {
  column: string;
  direction: "asc" | "desc";
};


export type KpiAnalysisPlan = {
  output_type: "kpi";
  intent: string;
  title: string;
  description: string | null;
  measure: MeasureSpec;
  filters: FilterCondition[];
  format: "number" | "integer" | "currency" | "percent";
  currency: string | null;
  assumptions: string[];
};


export type ChartAnalysisPlan = {
  output_type: "chart";
  intent: string;
  dimensions: DimensionSpec[];
  measures: MeasureSpec[];
  filters: FilterCondition[];
  sort: SortSpec[];
  row_limit: number;
  chart_type: "line" | "bar" | "area" | "pie";
  assumptions: string[];
};


export type KpiSuggestion = {
  id: string;
  title: string;
  reason: string;
  confidence: number;
  plan: KpiAnalysisPlan;
};


export type ChartSuggestion = {
  id: string;
  title: string;
  reason: string;
  confidence: number;
  plan: ChartAnalysisPlan;
};


export type AnalysisSuggestions = {
  summary: string;
  kpi_suggestions: KpiSuggestion[];
  chart_suggestions: ChartSuggestion[];
  warnings: string[];
};


export type SuggestionPreviewResponse =
  | {
      output_type: "kpi";
      chart: null;
      kpi: KpiSpec;
      warnings: string[];
    }
  | {
      output_type: "chart";
      chart: ChartSpec;
      kpi: null;
      warnings: string[];
    };




