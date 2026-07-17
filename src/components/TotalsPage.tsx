import { useMemo } from "react";
import { TIME_COLUMNS } from "../lib/columns";
import { fmtHrs } from "../lib/format";
import { computeTotalsSheet } from "../lib/summary";
import type { Flight, TotalsSheet } from "../types";

interface Seg {
  label: string;
  span: number;
}

// Compact, centred cells to match the CV Summary formatting.
const THG = "border border-slate-300 bg-slate-100 px-2 py-1 text-center text-[11px] font-semibold uppercase tracking-tight leading-tight";
const THP = "border border-slate-300 bg-slate-100 px-2 py-1 text-center text-[11px] font-medium leading-tight";
const TD = "border border-slate-200 px-2 py-1 text-center text-[11px] tabular-nums whitespace-nowrap";
const TD_TYPE = "border border-slate-200 px-2 py-1 text-center text-[11px] font-medium whitespace-nowrap";

export function TotalsPage({
  base,
  flights,
  simFlights = [],
}: {
  base: TotalsSheet;
  flights: Flight[];
  simFlights?: Flight[];
}) {
  const sheet = useMemo(
    () => computeTotalsSheet(base, flights, simFlights),
    [base, flights, simFlights],
  );

  const cols = useMemo(
    () => TIME_COLUMNS.filter((c) => sheet.columns.includes(c.key)),
    [sheet.columns],
  );

  const groupSegs = useMemo(() => {
    const segs: Seg[] = [];
    for (const c of cols) {
      const last = segs[segs.length - 1];
      if (last && last.label === c.group) last.span++;
      else segs.push({ label: c.group, span: 1 });
    }
    return segs;
  }, [cols]);

  const funcSegs = useMemo(() => {
    const segs: (Seg & { key: string })[] = [];
    for (const c of cols) {
      const key = c.group + "|" + c.func;
      const last = segs[segs.length - 1];
      if (last && last.key === key) last.span++;
      else segs.push({ label: c.func, span: 1, key });
    }
    return segs;
  }, [cols]);

  const s = sheet.stats;

  return (
    <div className="space-y-4 text-center">
      <h2 className="text-lg font-semibold text-slate-800">Flying Hours Totals</h2>

      <div className="mx-auto w-fit max-w-full overflow-x-auto rounded-lg border border-slate-300 bg-white shadow-sm">
        <table className="border-collapse">
          <thead>
            <tr>
              <th className={THG} rowSpan={3}>
                Aircraft Type
              </th>
              {groupSegs.map((g) => (
                <th key={g.label} className={THG} colSpan={g.span}>
                  {g.label}
                </th>
              ))}
              <th className={THG} rowSpan={3}>
                Total
              </th>
            </tr>
            <tr>
              {funcSegs.map((f, i) => (
                <th key={i} className={THG} colSpan={f.span}>
                  {f.label}
                </th>
              ))}
            </tr>
            <tr>
              {cols.map((c) => (
                <th key={c.key} className={THP}>
                  {c.period}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sheet.rows.map((r) => (
              <tr key={r.type} className="odd:bg-white even:bg-slate-50">
                <td className={TD_TYPE}>{r.type}</td>
                {cols.map((c) => (
                  <td key={c.key} className={TD}>
                    {fmtHrs(r.times[c.key])}
                  </td>
                ))}
                <td className={`${TD} font-semibold`}>{fmtHrs(r.total)}</td>
              </tr>
            ))}
            <tr className="bg-slate-800 font-semibold text-white">
              <td className={TD_TYPE}>TOTALS</td>
              {cols.map((c) => (
                <td key={c.key} className={TD}>
                  {fmtHrs(sheet.totalsRow.times[c.key])}
                </td>
              ))}
              <td className={TD}>{fmtHrs(sheet.totalsRow.total)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="mx-auto grid w-fit max-w-full grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="Grand Total Flying Hours" value={s.grandTotalFlyingHours} />
        <StatCard label="Co-Pilot Hours" value={s.coPilot} />
        <StatCard label="Captain Hours (Helicopter)" value={s.captainHelicopter} />
        <StatCard label="I.C.U.S Hours (Helicopter)" value={s.icusHelicopter} />
        <StatCard
          label="Captain + I.C.U.S (Helicopter)"
          value={Math.round((s.captainHelicopter + s.icusHelicopter) * 10) / 10}
        />
      </div>
      <p className="mx-auto max-w-3xl text-left text-xs text-slate-400">
        “Grand Total Flying Hours” is the sum of the per-type rows below (the table’s own TOTALS
        row), i.e. what you get by adding the Total column down this page. It includes actual and
        simulator hours. App-added flights fold into the matching type row. Note: the logbook’s
        running total (page-by-page) differs by a few hours of historical carry-forward drift, which
        is being reconciled separately.
      </p>
    </div>
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
