const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "");

export const API_URL = configuredApiUrl || "http://localhost:8000";

export function apiUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_URL}${normalizedPath}`;
}

// Private requests notify the workspace boundary before a rejected session can
// leave previously loaded data on screen. Authentication/public routes opt out.
export async function workspaceFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const response = await fetch(input, { ...init, cache: "no-store" });
  if (response.status === 401 && typeof window !== "undefined") {
    window.dispatchEvent(new Event("smart-analyzer-session-expired"));
  }
  return response;
}
