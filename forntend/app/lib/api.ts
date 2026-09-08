const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "");

export const API_URL = configuredApiUrl || "http://localhost:8000";

export function apiUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_URL}${normalizedPath}`;
}
