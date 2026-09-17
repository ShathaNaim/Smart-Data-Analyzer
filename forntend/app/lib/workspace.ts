export const WORKSPACE_CHANGED = "smart-analyzer-workspace-changed";
export const SESSION_EXPIRED = "smart-analyzer-session-expired";

export function clearWorkspaceCache() {
  try {
    for (const key of Object.keys(sessionStorage)) {
      if (key === "currentAnalysis" || key === "workspaceOwner" || key.startsWith("dashboard:")) sessionStorage.removeItem(key);
    }
  } catch { /* Storage may be disabled. */ }
}

export function announceWorkspaceChange() {
  clearWorkspaceCache();
  try { localStorage.setItem(WORKSPACE_CHANGED, crypto.randomUUID()); } catch { /* Optional cross-tab notification. */ }
  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel(WORKSPACE_CHANGED);
    channel.postMessage("changed");
    channel.close();
  }
}
