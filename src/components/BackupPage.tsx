import { useRef, useState } from "react";
import { exportData, importData, type BackupBundle } from "../lib/db";
import {
  backupToGist,
  disconnect,
  getGistStatus,
  restoreFromGist,
  setToken,
  type GistStatus,
} from "../lib/gistBackup";

/**
 * Backup & restore. All flight data lives in this browser's local storage
 * (IndexedDB), so "Download backup" saves a full snapshot to a JSON file the
 * pilot can keep in OneDrive / Files, and "Restore" loads one back.
 */
function fmtWhen(iso: string | null): string {
  if (!iso) return "never";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "never" : d.toLocaleString();
}

export function BackupPage({ onRestored }: { onRestored: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [gist, setGist] = useState<GistStatus>(() => getGistStatus());
  const [token, setTokenInput] = useState("");
  const [busy, setBusy] = useState(false);

  async function connect() {
    if (!token.trim()) return;
    setBusy(true);
    try {
      setToken(token);
      const status = await backupToGist();
      setGist(status);
      setTokenInput("");
      setMsg({ kind: "ok", text: "Cloud backup connected and first snapshot saved." });
    } catch (e) {
      disconnect();
      setGist(getGistStatus());
      setMsg({ kind: "err", text: `Could not connect: ${(e as Error).message}` });
    } finally {
      setBusy(false);
    }
  }

  async function backupNow() {
    setBusy(true);
    try {
      setGist(await backupToGist());
      setMsg({ kind: "ok", text: "Backed up to cloud." });
    } catch (e) {
      setMsg({ kind: "err", text: `Cloud backup failed: ${(e as Error).message}` });
    } finally {
      setBusy(false);
    }
  }

  async function cloudRestore() {
    if (!confirm("Restore will REPLACE all data in this browser with the latest cloud backup. Continue?"))
      return;
    setBusy(true);
    try {
      const n = await restoreFromGist();
      setMsg({ kind: "ok", text: `Restored ${n} entries from the cloud backup.` });
      onRestored();
    } catch (e) {
      setMsg({ kind: "err", text: `Cloud restore failed: ${(e as Error).message}` });
    } finally {
      setBusy(false);
    }
  }

  function cloudDisconnect() {
    disconnect();
    setGist(getGistStatus());
    setMsg({ kind: "ok", text: "Cloud backup disconnected on this device." });
  }

  async function download() {
    try {
      const bundle = await exportData();
      const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `logbook-backup-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      const n = bundle.flights.length + bundle.sim.length;
      setMsg({ kind: "ok", text: `Backup downloaded (${n} entries).` });
    } catch (e) {
      setMsg({ kind: "err", text: `Backup failed: ${(e as Error).message}` });
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (
      !confirm(
        "Restore will REPLACE all data currently in this browser with the contents of the " +
          "backup file. Continue?",
      )
    )
      return;
    try {
      const bundle = JSON.parse(await file.text()) as BackupBundle;
      await importData(bundle);
      const n = (bundle.flights?.length ?? 0) + (bundle.sim?.length ?? 0);
      setMsg({ kind: "ok", text: `Restored ${n} entries from ${file.name}.` });
      onRestored();
    } catch (err) {
      setMsg({ kind: "err", text: `Restore failed: ${(err as Error).message}` });
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-800">Backup &amp; Restore</h2>
        <p className="mt-1 text-sm text-slate-500">
          Every flight you add or edit is stored only in this browser on this device. Download a
          backup regularly (and after adding flights) so you never lose data — keep the file in
          OneDrive, Google Drive or Files.
        </p>
      </div>

      {msg && (
        <div
          className={`rounded-md border px-3 py-2 text-sm ${
            msg.kind === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {msg.text}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="font-semibold text-slate-800">Download backup</h3>
          <p className="mt-1 text-sm text-slate-500">
            Saves all flights, simulator sessions and balances to a single JSON file.
          </p>
          <button
            onClick={download}
            className="mt-3 w-full rounded-md bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700"
          >
            Download backup
          </button>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="font-semibold text-slate-800">Restore from backup</h3>
          <p className="mt-1 text-sm text-slate-500">
            Replaces all data on this device with a previously downloaded backup file.
          </p>
          <button
            onClick={() => fileRef.current?.click()}
            className="mt-3 w-full rounded-md border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Choose backup file…
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={onFile}
          />
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-slate-800">Automatic cloud backup</h3>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              gist.connected ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"
            }`}
          >
            {gist.connected ? "Connected" : "Not connected"}
          </span>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          Saves a snapshot to a <span className="font-medium">private GitHub Gist</span> automatically
          whenever you add, edit or delete a flight. The token is stored only in this browser and is
          sent only to GitHub. On a new device, use <span className="font-medium">Restore from cloud</span>{" "}
          first to pull your latest data.
        </p>

        {gist.connected ? (
          <div className="mt-3 space-y-3">
            <div className="text-sm text-slate-600">
              Last backup: <span className="font-medium">{fmtWhen(gist.lastAt)}</span>
              {gist.gistId && (
                <>
                  {" · "}
                  <a
                    href={`https://gist.github.com/${gist.gistId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sky-600 hover:underline"
                  >
                    view gist
                  </a>
                </>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={backupNow}
                disabled={busy}
                className="rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
              >
                Back up now
              </button>
              <button
                onClick={cloudRestore}
                disabled={busy}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Restore from cloud
              </button>
              <button
                onClick={cloudDisconnect}
                disabled={busy}
                className="rounded-md px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                Disconnect
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-600">
              <li>
                On GitHub, open{" "}
                <a
                  href="https://github.com/settings/tokens?type=beta"
                  target="_blank"
                  rel="noreferrer"
                  className="text-sky-600 hover:underline"
                >
                  Settings → Developer settings → Personal access tokens
                </a>
                .
              </li>
              <li>
                Create a token with <span className="font-medium">Account permissions → Gists: Read
                and write</span> (fine-grained), or the <span className="font-medium">gist</span> scope
                (classic). Nothing else is needed.
              </li>
              <li>Paste it below and press Connect.</li>
            </ol>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="password"
                value={token}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder="Paste GitHub token"
                autoComplete="off"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
              <button
                onClick={connect}
                disabled={busy || !token.trim()}
                className="rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
              >
                Connect
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
