import { exportData, importData, type BackupBundle } from "./db";
import type { Flight } from "../types";

/**
 * Lightweight cloud sync backed by a single *private* GitHub Gist.
 *
 * The pilot pastes a personal access token (scope: gist) once per device. All
 * devices using the same token share one gist (we look it up by filename rather
 * than creating a new one each time), so:
 *   - after every add/edit/delete the device pushes a snapshot, and
 *   - when a device opens (or regains focus) it pulls the newest snapshot.
 *
 * This gives "change it here, see it there" behaviour. Conflict handling is
 * whole-bundle last-write-wins by timestamp (fine for one writer at a time);
 * the one-time connect step merges by record so a device joining an existing
 * gist doesn't lose the flights it already had. The token lives only in this
 * browser's localStorage and is sent only to api.github.com.
 */

const FILENAME = "logbook-backup.json";
const K_TOKEN = "gistBackup.token";
const K_GIST = "gistBackup.gistId";
const K_LAST = "gistBackup.lastAt";
const K_VER = "gistBackup.syncVersion"; // exportedAt of the data currently local
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

export function disconnect(): void {
  localStorage.removeItem(K_TOKEN);
  localStorage.removeItem(K_GIST);
  localStorage.removeItem(K_LAST);
  localStorage.removeItem(K_VER);
}

function getSyncVersion(): number {
  const v = localStorage.getItem(K_VER);
  const t = v ? Date.parse(v) : NaN;
  return Number.isNaN(t) ? 0 : t;
}
function setSyncVersion(iso: string): void {
  localStorage.setItem(K_VER, iso);
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
  if (res.status === 401)
    throw new Error("GitHub rejected the token (401). Check it has the 'gist' scope.");
  throw new Error(`GitHub API error ${res.status}${detail ? `: ${detail}` : ""}`);
}

/** Find an existing logbook backup gist for this token (so every device with
 * the same token shares one gist). Returns its id, or null if none exists. */
async function findBackupGist(token: string): Promise<string | null> {
  const res = await fetch(`${API}/gists?per_page=100`, { headers: headers(token) });
  if (!res.ok) await ghError(res);
  const gists = (await res.json()) as Array<{ id: string; files: Record<string, unknown> }>;
  for (const g of gists) {
    if (g.files && Object.prototype.hasOwnProperty.call(g.files, FILENAME)) return g.id;
  }
  return null;
}

async function fetchGistBundle(token: string, gistId: string): Promise<BackupBundle | null> {
  const res = await fetch(`${API}/gists/${gistId}`, { headers: headers(token) });
  if (!res.ok) await ghError(res);
  const json = await res.json();
  const file = json.files?.[FILENAME];
  if (!file) return null;
  const text: string = file.truncated ? await (await fetch(file.raw_url)).text() : file.content;
  try {
    return JSON.parse(text) as BackupBundle;
  } catch {
    return null;
  }
}

function score(f: Flight): number {
  return f.updatedAt ?? f.createdAt ?? 0;
}

/** Union two bundles by record id; on a clash keep the most recently edited. */
function mergeBundles(a: BackupBundle, b: BackupBundle): BackupBundle {
  const mergeArr = (x: Flight[], y: Flight[]): Flight[] => {
    const m = new Map(x.map((f) => [f.id, f]));
    for (const f of y) {
      const ex = m.get(f.id);
      if (!ex || score(f) >= score(ex)) m.set(f.id, f);
    }
    return [...m.values()];
  };
  return {
    ...a,
    flights: mergeArr(a.flights ?? [], b.flights ?? []),
    sim: mergeArr(a.sim ?? [], b.sim ?? []),
    meta: {
      ...a.meta,
      // Union the aircraft-type categories from both devices (local wins ties).
      aircraftCategories: {
        ...(b.meta?.aircraftCategories ?? {}),
        ...(a.meta?.aircraftCategories ?? {}),
      },
    },
    exportedAt: new Date().toISOString(),
  };
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
  localStorage.setItem(K_LAST, new Date().toISOString());
  setSyncVersion(data.exportedAt);
  return getGistStatus();
}

/** Connect a token: reuse an existing shared gist (merging this device's data
 * into it) or create a new one from this device's data. */
export async function connect(token: string): Promise<GistStatus> {
  const t = token.trim();
  if (!t) throw new Error("Enter a token.");
  localStorage.setItem(K_TOKEN, t);
  try {
    const existingId = await findBackupGist(t);
    if (existingId) {
      localStorage.setItem(K_GIST, existingId);
      const remote = await fetchGistBundle(t, existingId);
      const local = await exportData();
      const merged = remote ? mergeBundles(local, remote) : local;
      await importData(merged);
      return await backupToGist(merged);
    }
    localStorage.removeItem(K_GIST);
    return await backupToGist();
  } catch (e) {
    disconnect();
    throw e;
  }
}

/** Pull the latest backup from the gist and load it, replacing local data. */
export async function restoreFromGist(): Promise<number> {
  const token = localStorage.getItem(K_TOKEN);
  let gistId = localStorage.getItem(K_GIST);
  if (!token) throw new Error("No backup token configured.");
  if (!gistId) {
    gistId = await findBackupGist(token);
    if (gistId) localStorage.setItem(K_GIST, gistId);
  }
  if (!gistId) throw new Error("No cloud backup exists yet for this token.");
  const bundle = await fetchGistBundle(token, gistId);
  if (!bundle) throw new Error("Backup file not found in the gist.");
  await importData(bundle);
  setSyncVersion(bundle.exportedAt);
  return (bundle.flights?.length ?? 0) + (bundle.sim?.length ?? 0);
}

/**
 * Sync on open / focus. Pulls when the cloud has newer data than this device,
 * pushes when this device is ahead. No-op when not connected. Returns whether
 * local data changed (so the UI can reload).
 */
export async function syncOnOpen(): Promise<{ changed: boolean }> {
  const token = localStorage.getItem(K_TOKEN);
  if (!token) return { changed: false };
  let gistId = localStorage.getItem(K_GIST);
  if (!gistId) {
    gistId = await findBackupGist(token);
    if (gistId) localStorage.setItem(K_GIST, gistId);
  }
  if (!gistId) {
    await backupToGist();
    return { changed: false };
  }
  const remote = await fetchGistBundle(token, gistId);
  if (!remote) {
    await backupToGist();
    return { changed: false };
  }
  const remoteVer = Date.parse(remote.exportedAt) || 0;
  const localVer = getSyncVersion();
  if (remoteVer > localVer) {
    await importData(remote);
    setSyncVersion(remote.exportedAt);
    return { changed: true };
  }
  if (remoteVer < localVer) {
    await backupToGist();
  }
  return { changed: false };
}

let timer: number | null = null;
/** Debounced push after a local change; silent no-op when not connected. */
export function scheduleAutoBackup(): void {
  if (!localStorage.getItem(K_TOKEN)) return;
  if (timer) window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    timer = null;
    backupToGist().catch((e) => console.warn("Auto-backup failed:", e));
  }, 1500);
}
