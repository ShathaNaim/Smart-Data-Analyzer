"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiUrl } from "../lib/api";
import { announceWorkspaceChange } from "../lib/workspace";

import GuestWorkspaceTransfer from "./GuestWorkspaceTransfer";

type Account = { id: string; email: string };

export default function AccountControls() {
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [loggedOut, setLoggedOut] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    async function loadAccount() {
      try {
        const response = await fetch(apiUrl("/auth/me"), {
          credentials: "include",
          cache: "no-store",
          signal: controller.signal,
        });
        if (response.status === 401) {
          setAccount(null);
          setLoggedOut(new URLSearchParams(window.location.search).get("loggedOut") === "1");
          return;
        }
        if (!response.ok) throw new Error("Could not check sign-in status.");
        const data = await response.json();
        if (typeof data?.user?.id !== "string" || typeof data?.user?.email !== "string") {
          throw new Error("Could not check sign-in status.");
        }
        setAccount(data.user);
      } catch (error) {
        if (!controller.signal.aborted) {
          setError(error instanceof Error ? error.message : "Could not check sign-in status.");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadAccount();
    return () => controller.abort();
  }, [attempt]);

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    setError(null);
    try {
      const response = await fetch(apiUrl("/auth/signout"), {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(typeof data?.detail === "string" ? data.detail : "Could not log out. Please try again.");
      }
      // Discard loaded analysis and pending requests after changing identity.
      announceWorkspaceChange();
      window.location.replace("/?new=1&loggedOut=1");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not log out. Please try again.");
      setSigningOut(false);
    }
  }

  const buttonClass = "inline-flex min-h-11 items-center justify-center rounded-lg border border-amber-300 px-4 py-2 text-sm font-bold text-amber-950 transition hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 disabled:cursor-wait disabled:opacity-60";

  return (
    <nav aria-label="Account" className="relative mx-auto mb-8 w-full max-w-3xl rounded-xl border border-amber-200 bg-white/80 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {loading ? (
          <p role="status" className="text-sm text-stone-600">Checking sign-in status...</p>
        ) : account ? (
          <>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-stone-500">Signed in as</p>
              <p className="break-all text-sm font-bold text-stone-900">{account.email}</p>
            </div>
            <button type="button" onClick={() => void signOut()} disabled={signingOut} className={buttonClass}>
              {signingOut ? "Logging out..." : "Log out"}
            </button>
          </>
        ) : error ? (
          <button type="button" className={buttonClass} onClick={() => {
            setError(null);
            setLoading(true);
            setAttempt((value) => value + 1);
          }}>Retry sign-in check</button>
        ) : (
          <>
            <p className="text-sm font-semibold text-stone-600">Browsing as a guest</p>
            <div className="flex flex-wrap gap-2">
              <Link href="/signin" className={buttonClass}>Sign in</Link>
              <Link href="/signup" className={`${buttonClass} bg-amber-400 hover:bg-amber-500`}>Sign up</Link>
            </div>
          </>
        )}
      </div>
      {account && <GuestWorkspaceTransfer accountId={account.id} email={account.email} />}
      {!loading && !account && loggedOut && (
        <p role="status" className="mt-3 text-sm text-stone-600">
          You’re now browsing as a guest. Your saved datasets and dashboards remain in your account. Sign in again to access them.
        </p>
      )}
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
    </nav>
  );
}
