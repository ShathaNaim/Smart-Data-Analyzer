"use client";

import { useEffect, useState } from "react";
import { apiUrl, workspaceFetch } from "../lib/api";
import { announceWorkspaceChange } from "../lib/workspace";

type Summary = { datasets: number; dashboards: number };
export default function GuestWorkspaceTransfer({ accountId, email }: { accountId: string; email: string }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    workspaceFetch(apiUrl("/auth/guest-workspace"), { credentials: "include", signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error("Could not check guest data."); return response.json(); })
      .then(data => { if (!controller.signal.aborted) setSummary(data); })
      .catch(failure => { if (!controller.signal.aborted) setError(failure.message); });
    return () => controller.abort();
  }, [attempt]);
  async function transfer() {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const response = await workspaceFetch(apiUrl("/auth/guest-workspace/transfer"), { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expected_account_id: accountId }) });
      if (!response.ok) { const data = await response.json().catch(() => null); throw new Error(typeof data?.detail === "string" ? data.detail : "Could not move guest data. Please try again."); }
      announceWorkspaceChange();
      window.location.replace("/?new=1");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not move guest data."); setBusy(false); }
  }
  if (!summary?.datasets && !error) return null;
  return <section className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">
    {!!summary?.datasets && <>
      <h2 className="font-bold">Keep your guest workspace</h2>
      <p className="mt-2">This browser has {summary.datasets} guest datasets and {summary.dashboards} dashboards. Move them to {email} to access them on other devices.</p>
      <p className="mt-2 text-stone-600">Only move data that belongs to you. It will leave the guest workspace. Existing shared dashboard links will keep working.</p>
      <button disabled={busy} onClick={() => void transfer()} className="mt-3 rounded-lg bg-amber-400 px-4 py-2 font-bold disabled:opacity-50">{busy ? "Moving…" : "Move guest workspace to my account"}</button>
    </>}
    {error && <p role="alert" className="mt-2 text-red-700">{error}</p>}
    {error && !summary && <button className="mt-2 underline" onClick={() => { setError(""); setAttempt(value => value + 1); }}>Retry</button>}
  </section>;
}
