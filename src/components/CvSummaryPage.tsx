import { useMemo, useState } from "react";
import { computeCvSummary } from "../lib/summary";
import type { AircraftCategories } from "../lib/db";
import type { CvRow, CvSummary, Flight, TotalsSheet } from "../types";

const COLS: { key: keyof Omit<CvRow, "type">; label: string }[] = [
  { key: "captainIcus", label: "Captain" },
  { key: "otherCoPilot", label: "Other / Co-Pilot" },
  { key: "dual", label: "Dual" },
  { key: "night", label: "Night" },
  { key: "instrument", label: "Instrument" },
  { key: "nvg", label: "NVG" },
  { key: "total", label: "Total" },
];

function f1(v: number): string {
  return v ? v.toFixed(1) : "0.0";
}

// Compact, centred cells so the whole table fits a portrait A4 screenshot.
const TH = "border border-slate-300 bg-slate-100 px-2 py-1 text-center text-[11px] font-semibold leading-tight";
const TD = "border border-slate-200 px-2 py-1 text-center text-[11px] tabular-nums whitespace-nowrap";
const TD_TYPE = "border border-slate-200 px-2 py-1 text-center text-[11px] font-medium whitespace-nowrap";

export function CvSummaryPage({
  base,
  totalsBase,
  flights,
  simFlights = [],
  categories = {},
}: {
  base: CvSummary;
  totalsBase: TotalsSheet;
  flights: Flight[];
  simFlights?: Flight[];
  categories?: AircraftCategories;
}) {
  const cv = useMemo(
    () => computeCvSummary(base, totalsBase, flights, simFlights, categories),
    [base, totalsBase, flights, simFlights, categories],
  );
  const [copied, setCopied] = useState(false);

  const tsv = useMemo(() => {
    const lines: string[] = [];
    lines.push(["ACFT TYPE", ...COLS.map((c) => c.label)].join("\t"));
    for (const g of cv.groups) {
      for (const r of g.rows) {
        lines.push([r.type, ...COLS.map((c) => f1(r[c.key]))].join("\t"));
      }
      lines.push([`TOTALS ${g.name.toUpperCase()}`, ...COLS.map((c) => f1(g.totals[c.key]))].join("\t"));
    }
    lines.push(["TOTALS", ...COLS.map((c) => f1(cv.grandTotals[c.key]))].join("\t"));
    lines.push("");
    lines.push(`Offshore Hours\t${f1(cv.extra.offshoreHours)}`);
    lines.push(`X Country\t${f1(cv.extra.xCountry)}`);
    lines.push(`PIC X Country\t${f1(cv.extra.picXCountry)}`);
    lines.push(`X Country Instrument\t${f1(cv.extra.xCountryInst)}`);
    return lines.join("\n");
  }, [cv]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(tsv);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <div className="space-y-4 text-center">
      <div className="mx-auto flex max-w-3xl items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-800">CV Flying Hours Summary</h2>
        <button
          onClick={copy}
          className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-700"
        >
          {copied ? "Copied ✓" : "Copy for CV"}
        </button>
      </div>

      <div className="mx-auto w-fit max-w-full overflow-x-auto rounded-lg border border-slate-300 bg-white shadow-sm">
        <table className="border-collapse">
          <thead>
            <tr className="bg-slate-100">
              <th className={TH}>ACFT TYPE</th>
              {COLS.map((c) => (
                <th key={c.key} className={TH}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cv.groups.map((g) => (
              <GroupBlock key={g.name} name={g.name} rows={g.rows} totals={g.totals} />
            ))}
            <tr className="bg-slate-800 font-bold text-white">
              <td className={TD}>TOTALS</td>
              {COLS.map((c) => (
                <td key={c.key} className={TD}>
                  {f1(cv.grandTotals[c.key])}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <div className="mx-auto grid w-fit max-w-full grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Offshore Hours" value={cv.extra.offshoreHours} />
        <StatCard label="X Country" value={cv.extra.xCountry} />
        <StatCard label="PIC X Country" value={cv.extra.picXCountry} />
        <StatCard label="X Country Instrument" value={cv.extra.xCountryInst} />
      </div>
      <p className="mx-auto max-w-3xl text-left text-xs text-slate-400">
        The grand “TOTALS” row is the sum of the per-type rows above (actual + simulator hours),
        matching the Grand Total Flying Hours on the Totals page. App-added flights fold into the
        matching type row. The logbook’s page-by-page running total differs by a few hours of
        historical carry-forward drift, which is being reconciled separately. “Copy for CV” copies
        the table as tab-separated text.
      </p>
    </div>
  );
}

function GroupBlock({
  name,
  rows,
  totals,
}: {
  name: string;
  rows: CvRow[];
  totals: Omit<CvRow, "type">;
}) {
  return (
    <>
      {rows.map((r) => (
        <tr key={r.type} className="odd:bg-white even:bg-slate-50">
          <td className={TD_TYPE}>{r.type}</td>
          {COLS.map((c) => (
            <td key={c.key} className={`${TD} ${c.key === "total" ? "font-semibold" : ""}`}>
              {f1(r[c.key])}
            </td>
          ))}
        </tr>
      ))}
      <tr className="bg-sky-50 font-semibold">
        <td className={TD_TYPE}>TOTALS {name.toUpperCase()}</td>
        {COLS.map((c) => (
          <td key={c.key} className={TD}>
            {f1(totals[c.key])}
          </td>
        ))}
      </tr>
    </>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-center shadow-sm">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums text-slate-800">{value.toFixed(1)}</div>
    </div>
  );
}
