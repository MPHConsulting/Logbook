import { useState } from "react";
import type { Profile } from "../lib/db";

/**
 * Pilot identity. CASR 61.345(2) requires the logbook to record the holder's
 * full name and date of birth; these appear on the logbook pages and printouts.
 */
export function ProfilePage({
  initial,
  onSave,
}: {
  initial: Profile | null;
  onSave: (p: Profile) => Promise<void> | void;
}) {
  const [fullName, setFullName] = useState(initial?.fullName ?? "");
  const [dob, setDob] = useState(initial?.dob ?? "");
  const [saved, setSaved] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await onSave({ fullName: fullName.trim(), dob });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const field =
    "w-full rounded-md border border-slate-300 px-3 py-2.5 text-base focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500";
  const label = "block text-xs font-medium uppercase tracking-wide text-slate-500 mb-1";

  return (
    <form onSubmit={submit} className="mx-auto max-w-lg space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-slate-800">Pilot details</h2>
        <p className="mt-1 text-sm text-slate-500">
          Your full name and date of birth are required on the logbook by CASA (CASR 61.345). They
          appear at the top of each logbook page and on printouts.
        </p>
      </div>

      <div>
        <label className={label}>Full name</label>
        <input
          className={field}
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="e.g. John Andrew Smith"
          autoCapitalize="words"
          autoComplete="name"
        />
      </div>

      <div>
        <label className={label}>Date of birth</label>
        <input type="date" className={field} value={dob} onChange={(e) => setDob(e.target.value)} />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          className="rounded-md bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700"
        >
          Save details
        </button>
        {saved && <span className="text-sm font-medium text-emerald-600">Saved ✓</span>}
      </div>
    </form>
  );
}
