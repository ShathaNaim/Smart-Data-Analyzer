import type { CSSProperties } from "react";

export const dashboardThemes = {
  orange: {
    label: "Orange",
    background: "#fff7ed",
    soft: "#ffedd5",
    border: "#fed7aa",
    accent: "#c2410c",
    accentHover: "#9a3412",
  },
  blue: {
    label: "Blue",
    background: "#eff6ff",
    soft: "#dbeafe",
    border: "#bfdbfe",
    accent: "#1d4ed8",
    accentHover: "#1e40af",
  },
  green: {
    label: "Green",
    background: "#f0fdf4",
    soft: "#dcfce7",
    border: "#bbf7d0",
    accent: "#15803d",
    accentHover: "#166534",
  },
  purple: {
    label: "Purple",
    background: "#faf5ff",
    soft: "#f3e8ff",
    border: "#e9d5ff",
    accent: "#7e22ce",
    accentHover: "#6b21a8",
  },
  neutral: {
    label: "Neutral",
    background: "#f8fafc",
    soft: "#f1f5f9",
    border: "#cbd5e1",
    accent: "#475569",
    accentHover: "#334155",
  },
  teal: {
    label: "Teal",
    background: "#f0fdfa",
    soft: "#ccfbf1",
    border: "#99f6e4",
    accent: "#0f766e",
    accentHover: "#115e59",
  },
  cyan: {
    label: "Cyan",
    background: "#ecfeff",
    soft: "#cffafe",
    border: "#a5f3fc",
    accent: "#0e7490",
    accentHover: "#155e75",
  },
  pink: {
    label: "Pink",
    background: "#fdf2f8",
    soft: "#fce7f3",
    border: "#fbcfe8",
    accent: "#be185d",
    accentHover: "#9d174d",
  },
  rose: {
    label: "Rose",
    background: "#fff1f2",
    soft: "#ffe4e6",
    border: "#fecdd3",
    accent: "#be123c",
    accentHover: "#9f1239",
  },
  red: {
    label: "Red",
    background: "#fef2f2",
    soft: "#fee2e2",
    border: "#fecaca",
    accent: "#b91c1c",
    accentHover: "#991b1b",
  },
  indigo: {
    label: "Indigo",
    background: "#eef2ff",
    soft: "#e0e7ff",
    border: "#c7d2fe",
    accent: "#4338ca",
    accentHover: "#3730a3",
  },
  yellow: {
    label: "Yellow",
    background: "#fefce8",
    soft: "#fef9c3",
    border: "#fef08a",
    accent: "#854d0e",
    accentHover: "#713f12",
  },
} as const;

export type DashboardTheme = keyof typeof dashboardThemes;

export function resolveDashboardTheme(
  value: unknown,
): DashboardTheme {
  if (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(dashboardThemes, value)
  ) {
    return value as DashboardTheme;
  }

  return "orange";
}


export function dashboardThemeStyle(value: unknown): CSSProperties {
  const palette = dashboardThemes[resolveDashboardTheme(value)];

  return {
    "--dashboard-background": palette.background,
    "--dashboard-soft": palette.soft,
    "--dashboard-border": palette.border,
    "--dashboard-accent": palette.accent,
    "--dashboard-accent-hover": palette.accentHover,
  } as CSSProperties;
}