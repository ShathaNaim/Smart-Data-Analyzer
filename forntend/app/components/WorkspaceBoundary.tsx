"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { apiUrl } from "../lib/api";
import { announceWorkspaceChange, clearWorkspaceCache, SESSION_EXPIRED, WORKSPACE_CHANGED } from "../lib/workspace";

export default function WorkspaceBoundary({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const publicPage = pathname === "/signin" || pathname === "/signup" || pathname.startsWith("/share/");
  return publicPage ? children : <PrivateWorkspace>{children}</PrivateWorkspace>;
}

function PrivateWorkspace({ children }: { children: ReactNode }) {
  const [state, setState] = useState<"checking" | "ready" | "expired" | "error">("checking");
  const [attempt, setAttempt] = useState(0);
  const owner = useRef<string | null>(null);
  useEffect(() => {
    let disposed = false;
    let sequence = 0;
    const controller = new AbortController();
    function expired() { sequence++; clearWorkspaceCache(); setState("expired"); }
    function changed() {
      sequence++;
      clearWorkspaceCache();
      window.location.replace("/?new=1");
    }
    async function check() {
      const request = ++sequence;
      try {
        const response = await fetch(apiUrl("/auth/workspace"), { credentials: "include", cache: "no-store", signal: controller.signal });
        if (disposed || request !== sequence) return;
        if (response.status === 401) { expired(); return; }
        if (!response.ok) throw new Error("Could not check workspace.");
        const data = await response.json();
        if (disposed || request !== sequence) return;
        if (typeof data.owner_id !== "string") throw new Error("Invalid workspace.");
        if (owner.current && owner.current !== data.owner_id) { changed(); return; }
        try {
          if (sessionStorage.getItem("workspaceOwner") !== data.owner_id) clearWorkspaceCache();
          sessionStorage.setItem("workspaceOwner", data.owner_id);
        } catch { clearWorkspaceCache(); }
        owner.current = data.owner_id;
        setState("ready");
      } catch { if (!disposed && request === sequence) setState("error"); }
    }
    function visibility() { if (document.visibilityState === "visible") void check(); }
    function storage(event: StorageEvent) { if (event.key === WORKSPACE_CHANGED) changed(); }
    const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(WORKSPACE_CHANGED) : null;
    if (channel) channel.onmessage = changed;
    window.addEventListener("storage", storage);
    window.addEventListener("focus", visibility);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener(SESSION_EXPIRED, expired);
    window.addEventListener("pageshow", visibility);
    const interval = window.setInterval(visibility, 60000);
    void check();
    return () => {
      disposed = true; controller.abort(); channel?.close(); clearInterval(interval);
      window.removeEventListener("storage", storage); window.removeEventListener("focus", visibility);
      document.removeEventListener("visibilitychange", visibility); window.removeEventListener(SESSION_EXPIRED, expired);
      window.removeEventListener("pageshow", visibility);
    };
  }, [attempt]);

  async function continueAsGuest() {
    setState("checking");
    try {
      const response = await fetch(apiUrl("/auth/signout"), { method: "POST", credentials: "include" });
      if (!response.ok) throw new Error();
      announceWorkspaceChange();
      window.location.replace("/?new=1");
    } catch { setState("expired"); }
  }
  if (state === "ready") return children;
  return <main className="mx-auto max-w-lg p-8 text-stone-800">
    {state === "checking" ? <p role="status">Checking your workspace…</p> : state === "expired" ? <>
      <h1 className="text-xl font-bold">Please sign in again</h1>
      <p className="my-4">Your session is no longer valid. Your saved account data is still available when you sign in.</p>
      <Link className="mr-5 underline" href="/signin">Sign in</Link>
      <button className="underline" onClick={() => void continueAsGuest()}>Continue as guest</button>
    </> : <><p role="alert">Could not verify your workspace. Check your connection and try again.</p><button className="mt-4 underline" onClick={() => { setState("checking"); setAttempt(value => value + 1); }}>Retry</button></>}
  </main>;
}
