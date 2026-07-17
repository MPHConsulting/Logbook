import type { Flight, FlightTime, TimeKey } from "../types";
import { CO_PILOT_KEYS, ROWS_PER_PAGE, TIME_COLUMNS } from "./columns";

export const TIME_KEYS: TimeKey[] = TIME_COLUMNS.map((c) => c.key);
const FLYING_KEYS: TimeKey[] = TIME_COLUMNS.filter((c) => c.flying).map((c) => c.key);

export function emptyTime(): FlightTime {
  return Object.fromEntries(TIME_KEYS.map((k) => [k, 0])) as unknown as FlightTime;
}

/** Round to 1 decimal to avoid floating-point drift in accumulated hours. */
export function r1(x: number): number {
  return Math.round((x + Number.EPSILON) * 10) / 10;
}

export function addTime(a: FlightTime, b: FlightTime): FlightTime {
  const out = emptyTime();
  for (const k of TIME_KEYS) out[k] = r1(a[k] + b[k]);
  return out;
}

export function sumFlights(flights: Flight[]): FlightTime {
  const out = emptyTime();
  for (const f of flights) for (const k of TIME_KEYS) out[k] += f.time[k];
  for (const k of TIME_KEYS) out[k] = r1(out[k]);
  return out;
}

/** Total Flying Hours = sum of the 14 flying columns (excludes instrument). */
export function totalFlyingHours(t: FlightTime): number {
  return r1(FLYING_KEYS.reduce((s, k) => s + t[k], 0));
}

/** Total Aeronautical Experience = flying hours minus 50% of co-pilot time. */
export function aeronauticalExperience(t: FlightTime): number {
  const coPilot = CO_PILOT_KEYS.reduce((s, k) => s + t[k], 0);
  return r1(totalFlyingHours(t) - coPilot / 2);
}

export interface LogbookPage {
  pageNo: number; // 1-based
  year: number | null; // calendar year of the flights on this page
  flights: Flight[];
  broughtForward: FlightTime; // "Totals carried forward from last page"
  thisPage: FlightTime; // "Totals this page"
  newTotal: FlightTime; // "New totals" = broughtForward + thisPage
  isYearEnd: boolean; // true on the last page of a calendar year
  yearTotal: FlightTime; // sum of every flight in this page's year
}

function flightYear(f: Flight): number | null {
  if (f.year != null) return f.year;
  if (f.date) return new Date(f.date).getFullYear();
  return null;
}

/**
 * Paginate flights into pages of up to ROWS_PER_PAGE. A page never spans two
 * calendar years: each year fills pages of up to ROWS_PER_PAGE, and the first
 * flight on/after 1 Jan of a new year always starts a fresh page. The running
 * "to date" totals still chain continuously across the year break, so the
 * final page reproduces the recorded Excel grand total exactly. The first
 * page's brought-forward is the opening balance plus reconciliation adjustments.
 */
export function paginate(
  flights: Flight[],
  openingBalance: FlightTime,
  adjustments: FlightTime,
  options: { breakOnYear?: boolean } = {},
): LogbookPage[] {
  const breakOnYear = options.breakOnYear ?? true;
  const pages: LogbookPage[] = [];
  let running = addTime(openingBalance, adjustments);
  let current: Flight[] = [];
  let currentYear: number | null = null;

  const flush = () => {
    const thisPage = sumFlights(current);
    const broughtForward = running;
    const newTotal = addTime(broughtForward, thisPage);
    pages.push({
      pageNo: pages.length + 1,
      year: currentYear,
      flights: current,
      broughtForward,
      thisPage,
      newTotal,
      isYearEnd: false,
      yearTotal: emptyTime(),
    });
    running = newTotal;
    current = [];
  };

  for (const f of flights) {
    const y = flightYear(f);
    const yearBreak = breakOnYear && y !== currentYear;
    if (current.length > 0 && (yearBreak || current.length >= ROWS_PER_PAGE)) {
      flush();
    }
    if (current.length === 0) currentYear = y;
    current.push(f);
  }
  if (current.length > 0) flush();

  if (!breakOnYear) return pages;

  // Mark the last page of each year and stamp it with that year's flying total.
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    const isLast = i === pages.length - 1 || pages[i + 1].year !== p.year;
    if (!isLast) continue;
    let yearTotal = emptyTime();
    for (const q of pages) {
      if (q.year === p.year) yearTotal = addTime(yearTotal, q.thisPage);
    }
    p.isYearEnd = true;
    p.yearTotal = yearTotal;
  }

  return pages;
}

export function grandTotal(
  flights: Flight[],
  openingBalance: FlightTime,
  adjustments: FlightTime,
): FlightTime {
  return addTime(addTime(openingBalance, adjustments), sumFlights(flights));
}
