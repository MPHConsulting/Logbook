import { useState } from "react";
import { TIME_COLUMNS, type TimeColumn } from "../lib/columns";
import { emptyTime } from "../lib/totals";
import { cvBaseType, isKnownType } from "../lib/summary";
import type { AircraftCategories, AircraftCategory } from "../lib/db";
import type { Flight, FlightTime, TimeKey } from "../types";

const SE_COLS = TIME_COLUMNS.filter((c) => c.group === "SINGLE-ENGINE");
const ME_COLS = TIME_COLUMNS.filter((c) => c.group === "MULTI-ENGINE" && c.func !== "CO-PILOT");
const REST_COLS = TIME_COLUMNS.filter(
  (c) => c.func === "CO-PILOT" || c.group === "INSTRUMENT" || c.group === "NVG",
);

function fieldLabel(c: TimeColumn): string {
  if (c.group === "NVG") return "NVG";
  if (c.group === "INSTRUMENT") return `Inst ${c.period}`;
  if (c.func === "CO-PILOT") return `CO-PILOT ${c.period}`;
  return `${c.func.replace("I.C.U.S", "ICUS")} ${c.period}`;
}

interface Props {
  initial?: Flight | null;
  onSave: (f: Flight, newCategory?: { type: string; category: AircraftCategory }) => void;
  onCancel: () => void;
  onDelete?: (id: string) => void;
  /** True when the form is adding/editing a simulator session. */
  isSim?: boolean;
  /** Saved helicopter/fixed-wing classifications, used to decide whether a
   * newly-typed aircraft needs to be classified. */
  categories?: AircraftCategories;
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `app-${crypto.randomUUID()}`;
  }
  return `app-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/** Days between an ISO date and today (positive when the date is in the past). */
function ageInDays(iso: string): number {
  const ms = Date.parse(iso + "T00:00:00");
  if (Number.isNaN(ms)) return 0;
  return (Date.now() - ms) / 86_400_000;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Best-effort ISO date for a flight: the stored ISO date, else built from
 * year/month/day when all three are present (imported rows often store only
 * those). */
function effectiveIso(f?: Flight | null): string | null {
  if (!f) return null;
  if (f.date) return f.date;
  if (f.year && f.month && f.day) return `${f.year}-${pad2(f.month)}-${pad2(f.day)}`;
  return null;
}

/** An existing entry more than 7 days old has its date locked. Works from the
 * ISO date or, when only year/month are known, the 1st of that month. */
function isOldEntry(f?: Flight | null): boolean {
  if (!f) return false;
  const iso = effectiveIso(f);
  if (iso) return ageInDays(iso) > 7;
  if (f.year && f.month) return ageInDays(`${f.year}-${pad2(f.month)}-01`) > 7;
  return false;
}

/** ISO (yyyy-mm-dd) → display "dd/mm/yyyy". */
function isoToDmy(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

/** How the date should read in the field, always dd/mm/yyyy (with "--" for a
 * missing day on partially-dated imported rows). */
function displayDmy(f?: Flight | null): string {
  const iso = effectiveIso(f);
  if (iso) return isoToDmy(iso);
  if (f?.year && f?.month) return `${f.day ? pad2(f.day) : "--"}/${pad2(f.month)}/${f.year}`;
  return "";
}

/** Parse "dd/mm/yyyy" into a valid ISO date, or null if incomplete/invalid. */
function dmyToIso(s: string): string | null {
  const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const dd = +m[1];
  const mm = +m[2];
  const yyyy = +m[3];
  const iso = `${yyyy}-${pad2(mm)}-${pad2(dd)}`;
  const dt = new Date(iso + "T00:00:00");
  // Reject impossible dates like 31/02/2026.
  if (Number.isNaN(dt.getTime()) || dt.getDate() !== dd || dt.getMonth() + 1 !== mm) return null;
  return iso;
}

/** Type-as-you-go dd/mm/yyyy mask: keep digits, auto-insert the slashes. */
function maskDmy(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 8);
  if (d.length > 4) return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
  if (d.length > 2) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return d;
}

export function AddFlightForm({ initial, onSave, onCancel, onDelete, isSim, categories = {} }: Props) {
  // Once a flight is more than 7 days old its date is locked, so an old entry
  // can't accidentally be re-dated (which would shift it out of chronological
  // order). New flights and recent (<=7 day) entries remain editable.
  const dateLocked = isOldEntry(initial);
  // Date is entered/shown as dd/mm/yyyy regardless of the device locale.
  const [dateInput, setDateInput] = useState(
    dateLocked ? displayDmy(initial) : isoToDmy(effectiveIso(initial) ?? new Date().toISOString().slice(0, 10)),
  );
  const [aircraftType, setType] = useState(initial?.aircraftType ?? "AW139");
  const [aircraftRego, setRego] = useState(initial?.aircraftRego ?? "");
  const [pilotInCommand, setPic] = useState(initial?.pilotInCommand ?? "SELF");
  const [otherCrew, setOther] = useState(initial?.otherCrew ?? "");
  const [route, setRoute] = useState(initial?.route ?? "");
  const [remarks, setRemarks] = useState(initial?.remarks ?? "");
  const [time, setTime] = useState<FlightTime>(initial?.time ?? emptyTime());
  const [countsToTotals, setCountsToTotals] = useState(initial?.countsToTotals ?? true);
  const [offshore, setOffshore] = useState(initial?.offshore ?? false);
  const [xCountry, setXCountry] = useState(initial?.xCountry ?? false);
  const [newCategory, setNewCategory] = useState<AircraftCategory>("helicopter");

  // A type the pilot hasn't classified yet (and isn't built-in) needs a
  // helicopter/fixed-wing choice so the CV Summary files it in the right group.
  const baseType = cvBaseType(aircraftType);
  const needsCategory = aircraftType.trim().length >= 2 && !isKnownType(baseType, categories);

  function setTimeField(key: TimeKey, value: string) {
    const v = value === "" ? 0 : parseFloat(value);
    setTime((t) => ({ ...t, [key]: Number.isFinite(v) ? v : 0 }));
  }

  const timeField =
    "w-full rounded-md border border-slate-300 px-3 py-2.5 text-base text-right tabular-nums focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500";

  function renderField(c: TimeColumn) {
    return (
      <div key={c.key}>
        <label className="mb-1 block text-[11px] text-slate-500">{fieldLabel(c)}</label>
        <input
          type="number"
          inputMode="decimal"
          step="0.1"
          min="0"
          enterKeyHint="next"
          className={`${timeField} ${c.period === "Night" ? "bg-slate-100" : "bg-white"}`}
          value={time[c.key] || ""}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => setTimeField(c.key, e.target.value)}
        />
      </div>
    );
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    let iso: string | null;
    let y: number | null;
    let m: number | null;
    let d: number | null;
    if (dateLocked) {
      // A locked (old) entry keeps its original date fields untouched.
      iso = initial?.date ?? null;
      y = initial?.year ?? null;
      m = initial?.month ?? null;
      d = initial?.day ?? null;
    } else if (!dateInput.trim()) {
      iso = null;
      y = m = d = null;
    } else {
      iso = dmyToIso(dateInput);
      if (!iso) {
        alert("Please enter the date as dd/mm/yyyy.");
        return;
      }
      [y, m, d] = iso.split("-").map(Number);
    }
    const flight: Flight = {
      id: initial?.id ?? newId(),
      sourceRow: initial?.sourceRow ?? null,
      date: iso,
      year: y,
      month: m,
      day: d,
      aircraftType: aircraftType.trim().toUpperCase(),
      aircraftRego: aircraftRego.trim().toUpperCase(),
      pilotInCommand: pilotInCommand.trim().toUpperCase(),
      otherCrew: otherCrew.trim().toUpperCase(),
      route: route.trim().toUpperCase(),
      remarks: remarks.trim(),
      noteRaw:
        initial?.noteRaw ??
        [pilotInCommand.trim().toUpperCase(), route.trim().toUpperCase(), remarks.trim()]
          .filter(Boolean)
          .join("\n"),
      time,
      needsReview: false,
      origin: initial?.origin ?? "app",
      createdAt: initial?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
      ...(isSim ? { countsToTotals } : { offshore, xCountry }),
    };
    onSave(flight, needsCategory ? { type: baseType, category: newCategory } : undefined);
  }

  const field = "w-full rounded-md border border-slate-300 px-3 py-2.5 text-base focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500";
  const label = "block text-xs font-medium uppercase tracking-wide text-slate-500 mb-1";

  return (
    <form onSubmit={submit} className="mx-auto max-w-3xl space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={label}>Date</label>
          <input
            type="text"
            inputMode="numeric"
            className={`${field} ${dateLocked ? "cursor-not-allowed bg-slate-100 text-slate-500" : ""}`}
            value={dateInput}
            onChange={(e) => setDateInput(maskDmy(e.target.value))}
            disabled={dateLocked}
            placeholder="dd/mm/yyyy"
            autoComplete="off"
            enterKeyHint="next"
          />
          {dateLocked && (
            <p className="mt-1 text-xs text-slate-500">
              Date locked — this entry is more than 7 days old and can’t be re-dated.
            </p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={label}>Aircraft Type</label>
            <input
              className={`${field} uppercase`}
              value={aircraftType}
              onChange={(e) => setType(e.target.value)}
              placeholder="AW139"
              autoCapitalize="characters"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="next"
            />
          </div>
          <div>
            <label className={label}>Rego</label>
            <input
              className={`${field} uppercase`}
              value={aircraftRego}
              onChange={(e) => setRego(e.target.value)}
              placeholder="NYZ"
              autoCapitalize="characters"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="next"
            />
          </div>
        </div>
        {needsCategory && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 sm:col-span-2">
            <p className="text-sm font-medium text-amber-800">
              New aircraft type “{aircraftType.trim().toUpperCase()}” — is it a helicopter or fixed
              wing?
            </p>
            <p className="mb-2 mt-0.5 text-xs text-amber-700">
              This decides which group it appears under on the CV Summary.
            </p>
            <div className="flex gap-3">
              {(["helicopter", "fixedwing"] as const).map((c) => (
                <label
                  key={c}
                  className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm ${
                    newCategory === c
                      ? "border-sky-500 bg-white font-medium text-sky-700"
                      : "border-slate-300 bg-white text-slate-600"
                  }`}
                >
                  <input
                    type="radio"
                    name="aircraftCategory"
                    className="text-sky-600 focus:ring-sky-500"
                    checked={newCategory === c}
                    onChange={() => setNewCategory(c)}
                  />
                  {c === "helicopter" ? "Helicopter" : "Fixed wing"}
                </label>
              ))}
            </div>
          </div>
        )}
        <div>
          <label className={label}>Pilot in Command</label>
          <input
            className={`${field} uppercase`}
            value={pilotInCommand}
            onChange={(e) => setPic(e.target.value)}
            placeholder="SELF"
            autoCapitalize="characters"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="next"
          />
        </div>
        <div>
          <label className={label}>Other Pilot or Crew</label>
          <input
            className={`${field} uppercase`}
            value={otherCrew}
            onChange={(e) => setOther(e.target.value)}
            autoCapitalize="characters"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="next"
          />
        </div>
        <div className="sm:col-span-2">
          <label className={label}>Route</label>
          <input
            className={`${field} uppercase`}
            value={route}
            onChange={(e) => setRoute(e.target.value)}
            placeholder="YSBK-YSCN-YSBK"
            autoCapitalize="characters"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="next"
          />
        </div>
        <div className="sm:col-span-2">
          <label className={label}>Details / Remarks</label>
          <input
            className={field}
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            placeholder="3 x circuits, 1 x RNAV"
            enterKeyHint="done"
          />
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-slate-700">Flying time (hours)</h3>

        <div className="grid gap-4 lg:grid-cols-2">
          <fieldset className="rounded-lg border border-slate-300 p-4">
            <legend className="px-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
              Single Engine
            </legend>
            <div className="grid grid-cols-2 gap-3">{SE_COLS.map(renderField)}</div>
          </fieldset>

          <fieldset className="rounded-lg border border-slate-300 p-4">
            <legend className="px-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
              Multi Engine
            </legend>
            <div className="grid grid-cols-2 gap-3">{ME_COLS.map(renderField)}</div>
          </fieldset>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
          {REST_COLS.map(renderField)}
        </div>
      </div>

      {!isSim && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex items-start gap-3 rounded-lg border border-slate-300 bg-slate-50 p-4">
            <input
              type="checkbox"
              className="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-400 text-sky-600 focus:ring-sky-500"
              checked={offshore}
              onChange={(e) => setOffshore(e.target.checked)}
            />
            <span className="text-sm text-slate-700">
              <span className="font-medium">Offshore</span>
              <span className="mt-0.5 block text-xs text-slate-500">
                Adds this flight’s hours to the CV “Offshore Hours” total.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-3 rounded-lg border border-slate-300 bg-slate-50 p-4">
            <input
              type="checkbox"
              className="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-400 text-sky-600 focus:ring-sky-500"
              checked={xCountry}
              onChange={(e) => setXCountry(e.target.checked)}
            />
            <span className="text-sm text-slate-700">
              <span className="font-medium">Cross-country</span>
              <span className="mt-0.5 block text-xs text-slate-500">
                Adds to the CV “X Country” total, plus command hours to “PIC X Country” and
                instrument hours to “X Country Instrument”.
              </span>
            </span>
          </label>
        </div>
      )}

      {isSim && (
        <label className="flex items-start gap-3 rounded-lg border border-slate-300 bg-slate-50 p-4">
          <input
            type="checkbox"
            className="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-400 text-sky-600 focus:ring-sky-500"
            checked={countsToTotals}
            onChange={(e) => setCountsToTotals(e.target.checked)}
          />
          <span className="text-sm text-slate-700">
            <span className="font-medium">Count these hours in Total Flying Hours</span>
            <span className="mt-0.5 block text-xs text-slate-500">
              When ticked, this session is added to the Totals / CV “sim” line for {aircraftType || "this type"}.
              Untick to keep it on the simulator page only (excluded from the grand totals).
            </span>
          </span>
        </label>
      )}

      <div className="sticky bottom-0 z-10 -mx-4 flex flex-col-reverse gap-3 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:mx-0 sm:flex-row sm:items-center sm:justify-between sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:backdrop-blur-none">
        <div className="flex justify-center sm:justify-start">
          {initial && onDelete && (
            <button
              type="button"
              onClick={() => onDelete(initial.id)}
              className="rounded-md px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50"
            >
              Delete flight
            </button>
          )}
        </div>
        <div className="flex flex-col-reverse gap-3 sm:flex-row">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-slate-300 px-4 py-3 text-base font-medium hover:bg-slate-50 sm:py-2 sm:text-sm"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded-md bg-sky-600 px-4 py-3 text-base font-semibold text-white hover:bg-sky-700 sm:py-2 sm:text-sm"
          >
            {initial ? "Save changes" : "Add flight"}
          </button>
        </div>
      </div>
    </form>
  );
}
