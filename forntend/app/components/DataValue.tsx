export default function DataValue({ value, statistic = false }: {
  value: unknown;
  statistic?: boolean;
}) {
  if (value == null || (typeof value === "number" && !Number.isFinite(value))) {
    return <span className="italic text-stone-400">{statistic ? "Not available" : "No value"}</span>;
  }
  if (value === "") return <span className="italic text-stone-400">Empty text</span>;
  return <>{statistic && typeof value === "number"
    ? value.toLocaleString(undefined, { maximumFractionDigits: 2 })
    : String(value)}</>;
}
