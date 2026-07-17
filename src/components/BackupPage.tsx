import { useRef, useState } from "react";
import { exportData, importData, type BackupBundle } from "../lib/db";

/**
 * Backup & restore. All flight data lives in this browser's local storage
 * (IndexedDB), so "Download backup" saves a full snapshot to a JSON file the
 * pilot can keep in OneDrive / Files, and "Restore" loads one back.
 */
export function BackupPage({ onRestored }: { onRestored: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

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
    </div>
  );
}
