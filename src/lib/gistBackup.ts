import { exportData, importData, type BackupBundle } from "./db";

/**
 * Automatic cloud backup to a *private* GitHub Gist.
 *
 * The pilot pastes a personal access token (scope: gist only) once. It is kept
 * in this browser's localStorage — never committed to the repo or bundled into
 * the app — and is sent only to api.github.com. Each backup writes the full
 * export bundle to a single secret gist, so the latest snapshot is always in
 * the cloud without any manual step.
 */

const FILENAME = "logbook-backup.json";
const K_TOKEN = "gistBackup.token";
const K_GIST = "gistBackup.gistId";
const K_LAST = "gistBackup.lastAt";
const API = "https://api.github.com";

export interface GistStatus {
  connected: boolean;
  gistId: string | null;
  lastAt: string | null;
}

export function getGistStatus(): GistStatus {
  return {
    connected: !!localStorage.getItem(K_TOKEN),
    gistId: localStorage.getItem(K_GIST),
    lastAt: localStorage.getItem(K_LAST),
  };
}

export function setToken(token: string): void {
  localStorage.setItem(K_TOKEN, token.trim());
}

export function disconnect(): void {
  localStorage.removeItem(K_TOKEN);
  localStorage.removeItem(K_GIST);
  localStorage.removeItem(K_LAST);
}

function headers(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
  };
}

async function ghError(res: Response): Promise<never> {
  let detail = "";
  try {
    detail = (await res.json())?.message ?? "";
  } catch {
    /* ignore */
  }
  if (res.status === 401) throw new Error("GitHub rejected the token (401). Check it has the 'gist' scope.");
  throw new Error(`GitHub API error ${res.status}${detail ? `: ${detail}` : ""}`);
}

/** Push the current on-device data to the gist, creating it on first use. */
export async function backupToGist(bundle?: BackupBundle): Promise<GistStatus> {
  const token = localStorage.getItem(K_TOKEN);
  if (!token) throw new Error("No backup token configured.");
  const data = bundle ?? (await exportData());
  const content = JSON.stringify(data, null, 2);
  const gistId = localStorage.getItem(K_GIST);

  const body = JSON.stringify({
    description: "Pilot Logbook automatic backup",
    public: false,
    files: { [FILENAME]: { content } },
  });

  const res = gistId
    ? await fetch(`${API}/gists/${gistId}`, { method: "PATCH", headers: headers(token), body })
    : await fetch(`${API}/gists`, { method: "POST", headers: headers(token), body });
  if (!res.ok) await ghError(res);

  const json = await res.json();
  if (json.id) localStorage.setItem(K_GIST, json.id);
  const now = new Date().toISOString();
  localStorage.setItem(K_LAST, now);
  return getGistStatus();
}

/** Pull the latest backup from the gist and load it into this device. */
export async function restoreFromGist(): Promise<number> {
  const token = localStorage.getItem(K_TOKEN);
  const gistId = localStorage.getItem(K_GIST);
  if (!token) throw new Error("No backup token configured.");
  if (!gistId) throw new Error("No cloud backup exists yet for this token.");

  const res = await fetch(`${API}/gists/${gistId}`, { headers: headers(token) });
  if (!res.ok) await ghError(res);
  const json = await res.json();
  const file = json.files?.[FILENAME];
  if (!file) throw new Error("Backup file not found in the gist.");

  // Gist file content is truncated in the API response when large; fetch raw.
  const text: string = file.truncated ? await (await fetch(file.raw_url)).text() : file.content;
  const bundle = JSON.parse(text) as BackupBundle;
  await importData(bundle);
  return (bundle.flights?.length ?? 0) + (bundle.sim?.length ?? 0);
}

let timer: number | null = null;
/** Debounced auto-backup used after saves; silent no-op when not connected. */
export function scheduleAutoBackup(): void {
  if (!localStorage.getItem(K_TOKEN)) return;
  if (timer) window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    timer = null;
    backupToGist().catch((e) => console.warn("Auto-backup failed:", e));
  }, 1500);
}
