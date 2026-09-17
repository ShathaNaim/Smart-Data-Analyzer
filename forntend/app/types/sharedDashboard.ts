import type { ChartSpec } from "../components/ChartRenderer";
import type { KpiSpec } from "../components/KpiCard";
import type { DashboardTheme } from "../lib/dashboardThemes";


export type SharedDashboardItem = {
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


export type SharedDashboard = {
  name: string;
  theme: DashboardTheme;
  items: SharedDashboardItem[];
  updated_at: string;
};