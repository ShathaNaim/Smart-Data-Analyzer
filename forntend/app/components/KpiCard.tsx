export type KpiSpec = {
  id: string;
  title: string;
  value: number;
  format: "number" | "integer" | "currency" | "percent";
  currency?: string | null;
  description?: string | null;
};

type KpiCardProps = {
  kpi: KpiSpec;
};

function formatKpiValue(kpi: KpiSpec): string {
  if (kpi.format === "currency" && kpi.currency) {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: kpi.currency,
      maximumFractionDigits: 2,
    }).format(kpi.value);
  }

  if (kpi.format === "percent") {
    return new Intl.NumberFormat(undefined, {
      style: "percent",
      maximumFractionDigits: 2,
    }).format(kpi.value);
  }

  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: kpi.format === "integer" ? 0 : 2,
  }).format(kpi.value);
}

export default function KpiCard({ kpi }: KpiCardProps) {
  return (
    <article className="rounded-2xl border border-dashboard-border bg-white p-5 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-widest text-dashboard-accent">
        KPI
      </p>
      <h3 className="mt-2 text-sm font-bold text-stone-600">
        {kpi.title}
      </h3>
      <p className="mt-2 break-words text-3xl font-black text-stone-900 sm:text-4xl">
        {formatKpiValue(kpi)}
      </p>
      {kpi.description && (
        <p className="mt-3 text-sm leading-6 text-stone-500">
          {kpi.description}
        </p>
      )}
    </article>
  );
}
