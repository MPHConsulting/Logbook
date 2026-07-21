import { ROWS_PER_PAGE, TIME_COLUMNS } from "../lib/columns";
import { fmtDate, fmtHrs } from "../lib/format";
import { totalFlyingHours, type LogbookPage } from "../lib/totals";
import type { Flight, FlightTime } from "../types";

interface Segment {
  label: string;
  span: number;
}

// The table is fixed-layout and always exactly as wide as the page (never
// scrolls). These percentages size the left-hand columns and each time column;
// the Details column has no width so it absorbs whatever space is left over
// (and truncates when there isn't enough — open the picker to read it in full).
const LEFT_COL_PCT = [7, 4.8, 3.5, 6, 6]; // Date, Type, Rego, PIC, Other Crew
const TIME_COL_PCT = 3.1; // equal width for each of the 17 time columns

// Group columns (SINGLE-ENGINE / MULTI-ENGINE / INSTRUMENT).
const groupSegs: Segment[] = (() => {
  const segs: Segment[] = [];
  for (const c of TIME_COLUMNS) {
    const last = segs[segs.length - 1];
    if (last && last.label === c.group) last.span++;
    else segs.push({ label: c.group, span: 1 });
  }
  return segs;
})();

// Function columns within a group (I.C.U.S / DUAL / COMMAND / CO-PILOT).
const funcSegs: (Segment & { key: string })[] = (() => {
  const segs: (Segment & { key: string })[] = [];
  for (const c of TIME_COLUMNS) {
    const key = c.group + "|" + c.func;
    const last = segs[segs.length - 1];
    if (last && last.key === key) last.span++;
    else segs.push({ label: c.func, span: 1, key });
  }
  return segs;
})();

function TimeCells({
  time,
  bold,
  dark,
}: {
  time: FlightTime;
  bold?: boolean;
  dark?: boolean;
}) {
  return (
    <>
      {TIME_COLUMNS.map((c) => {
        const tinted = c.group === "INSTRUMENT" || c.group === "NVG";
        // Instrument/NVG columns are blue-tinted. On the dark "New totals" row
        // use a deep blue so the white text stays readable instead of washing
        // out to near-invisible on a pale tint.
        const instBg = tinted ? (dark ? "bg-sky-800" : "bg-sky-50") : "";
        return (
          <td key={c.key} className={`lb-cell ${bold ? "font-semibold" : ""} ${instBg}`}>
            {fmtHrs(time[c.key])}
          </td>
        );
      })}
    </>
  );
}

function FlightRow({
  f,
  onEdit,
  highlight,
}: {
  f: Flight;
  onEdit?: (f: Flight) => void;
  highlight?: boolean;
}) {
  return (
    <tr
      className={`${
        highlight
          ? "bg-sky-200 ring-2 ring-inset ring-sky-500"
          : f.needsReview
            ? "bg-amber-50"
            : "odd:bg-white even:bg-slate-50"
      } hover:bg-sky-100/60 cursor-pointer`}
      onClick={() => onEdit?.(f)}
    >
      <td className="lb-cell-l lb-freeze truncate bg-inherit">
        {fmtDate(f.date, f.year, f.month, f.day)}
      </td>
      <td className="lb-cell-l truncate">{f.aircraftType}</td>
      <td className="lb-cell-l truncate">{f.aircraftRego}</td>
      <td className="lb-cell-l truncate" title={f.pilotInCommand}>
        {f.pilotInCommand}
      </td>
      <td className="lb-cell-l truncate" title={f.otherCrew}>
        {f.otherCrew}
      </td>
      <td className="lb-cell-l lb-details truncate" title={`${f.route} ${f.remarks}`}>
        <span className="font-medium">{f.route}</span>
        {f.remarks && <span className="text-slate-500"> — {f.remarks}</span>}
      </td>
      <TimeCells time={f.time} />
    </tr>
  );
}

function EmptyRow() {
  return (
    <tr className="odd:bg-white even:bg-slate-50">
      <td className="lb-cell-l lb-freeze bg-inherit">&nbsp;</td>
      {Array.from({ length: 5 + TIME_COLUMNS.length }).map((_, i) => (
        <td key={i} className="lb-cell" />
      ))}
    </tr>
  );
}

function TotalRow({
  label,
  time,
  tone,
}: {
  label: string;
  time: FlightTime;
  tone: "fwd" | "page" | "date" | "year";
}) {
  const bg =
    tone === "date"
      ? "bg-slate-800 text-white"
      : tone === "year"
        ? "bg-sky-700 text-white"
        : tone === "page"
          ? "bg-slate-100"
          : "bg-white";
  const dark = tone === "date" || tone === "year";
  return (
    <tr className={`${bg} font-semibold`}>
      <td className={`lb-cell-l lb-freeze ${bg}`}>&nbsp;</td>
      <td className={`lb-cell-l whitespace-normal ${bg}`} colSpan={5}>
        {label}
      </td>
      <TimeCells time={time} bold dark={dark} />
    </tr>
  );
}

const LEFT_HEADERS: { label: string; className?: string }[] = [
  { label: "Date" },
  { label: "Type" },
  { label: "Rego" },
  { label: "Pilot in Command", className: "whitespace-normal" },
  { label: "Other Crew", className: "whitespace-normal" },
  { label: "Details" },
];

export function LogbookTable({
  page,
  onEdit,
  highlightId,
}: {
  page: LogbookPage;
  onEdit?: (f: Flight) => void;
  highlightId?: string | null;
}) {
  const padCount = Math.max(0, ROWS_PER_PAGE - page.flights.length);

  return (
    <div className="lb-print-wrap rounded-lg border border-slate-300 bg-white shadow-sm">
      <table className="lb-table w-full table-fixed border-collapse text-[12px] leading-tight">
        <colgroup>
          {LEFT_COL_PCT.map((w, i) => (
            <col key={i} style={{ width: `${w}%` }} />
          ))}
          {/* Details — no width, so it takes the remaining space. */}
          <col />
          {TIME_COLUMNS.map((c) => (
            <col key={c.key} style={{ width: `${TIME_COL_PCT}%` }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {LEFT_HEADERS.map((h, i) => (
              <th
                key={h.label}
                className={`lb-head ${i === 0 ? "lb-freeze lb-freeze-head" : ""} ${h.className ?? ""}`}
                rowSpan={3}
              >
                {h.label}
              </th>
            ))}
            {groupSegs.map((s) =>
              s.label === "NVG" ? (
                // Single column: show "NVG" once, spanning all three header rows.
                <th key={s.label} className="lb-head" colSpan={s.span} rowSpan={3}>
                  {s.label}
                </th>
              ) : (
                <th key={s.label} className="lb-head" colSpan={s.span}>
                  {s.label}
                </th>
              ),
            )}
          </tr>
          <tr>
            {funcSegs
              .filter((s) => s.key !== "NVG|NVG")
              .map((s, i) => (
                <th key={i} className="lb-head" colSpan={s.span}>
                  {s.label}
                </th>
              ))}
          </tr>
          <tr>
            {TIME_COLUMNS.filter((c) => c.group !== "NVG").map((c) => (
              <th key={c.key} className="lb-head font-medium normal-case">
                {c.period === "Night" ? "NGT" : c.period}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {page.flights.map((f) => (
            <FlightRow key={f.id} f={f} onEdit={onEdit} highlight={f.id === highlightId} />
          ))}
          {Array.from({ length: padCount }).map((_, i) => (
            <EmptyRow key={`pad-${i}`} />
          ))}
          <TotalRow label="Totals this page" time={page.thisPage} tone="page" />
          <TotalRow label="Totals carried forward from last page" time={page.broughtForward} tone="fwd" />
          <TotalRow label="New totals (to date)" time={page.newTotal} tone="date" />
          {page.isYearEnd && (
            <TotalRow
              label={`Totals for ${page.year ?? ""} (year) — ${totalFlyingHours(page.yearTotal).toFixed(1)} hrs flown`}
              time={page.yearTotal}
              tone="year"
            />
          )}
        </tbody>
      </table>

      <div className="flex flex-wrap gap-x-8 gap-y-1 border-t border-slate-300 bg-slate-50 px-4 py-2 text-sm">
        <span>
          <span className="text-slate-500">Total Flying Hours (to date): </span>
          <span className="font-semibold tabular-nums">{totalFlyingHours(page.newTotal).toFixed(1)}</span>
        </span>
      </div>
    </div>
  );
}
