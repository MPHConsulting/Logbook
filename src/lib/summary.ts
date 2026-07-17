import type { CvRow, CvSummary, Flight, FlightTime, TotalsSheet } from "../types";
import { r1 } from "./totals";

/**
 * Collapse an aircraft-type label (from either the app or an Excel summary
 * sheet) to a canonical key so app-logged flights can be matched to the right
 * snapshot row regardless of naming ("S92" vs "S-92A", "CT4" vs "CT4-B").
 */
export function canonType(label: string): string {
  const s = (label || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (s.includes("AW139")) return s.includes("SIM") ? "AW139SIM" : "AW139";
  if (s.includes("S92")) return s.includes("SIM") ? "S92SIM" : "S92";
  if (s.includes("S70")) return s.includes("FFMS") ? "S70FFMS" : "S70";
  if (s.includes("B206")) return "B206";
  if (s.includes("CT4")) return "CT4";
  if (s.includes("R22")) return "R22";
  if (s.includes("DA40") || s.includes("DA20")) return "DA40";
  return s || "OTHER";
}

const NIGHT_KEYS: (keyof FlightTime)[] = [
  "seIcusNight",
  "seDualNight",
  "seCommandNight",
  "meIcusNight",
  "meDualNight",
  "meCommandNight",
  "meCopilotNight",
];
const CMD_ICUS_KEYS: (keyof FlightTime)[] = [
  "seCommandDay",
  "seCommandNight",
  "meCommandDay",
  "meCommandNight",
  "seIcusDay",
  "seIcusNight",
  "meIcusDay",
  "meIcusNight",
];
const DUAL_KEYS: (keyof FlightTime)[] = ["seDualDay", "seDualNight", "meDualDay", "meDualNight"];

function sum(t: FlightTime, keys: (keyof FlightTime)[]): number {
  return keys.reduce((s, k) => s + (t[k] || 0), 0);
}

/** Only flights logged in the app are added on top of the Excel snapshot; the
 * imported ("excel") flights are already counted in the snapshot totals. */
function appFlights(flights: Flight[]): Flight[] {
  return flights.filter((f) => f.origin === "app");
}

/** App-added simulator sessions whose hours should roll up into the Totals / CV
 * grand totals (checkbox ticked; defaults to true). Imported sim sessions are
 * already in the Excel snapshot, so only app-added ones are folded in here. */
function countingSimFlights(simFlights: Flight[]): Flight[] {
  return simFlights.filter((f) => f.origin === "app" && f.countsToTotals !== false);
}

/** Map a simulator session's aircraft type to its dedicated "sim" row key in
 * the Totals table (AW139 -> AW139 SIM, S92 -> S-92 SIM, S-70 -> S70 FF&MS). */
function simRowKey(type: string): string {
  const k = canonType(type);
  if (k === "S70" || k === "S70FFMS") return "S70FFMS";
  return `${k}SIM`;
}

/** A readable label for a freshly-created sim row (only used when no matching
 * snapshot row exists yet). */
function simRowLabel(type: string): string {
  const k = canonType(type);
  if (k === "S70" || k === "S70FFMS") return "S70 FF&MS";
  return `${(type || "OTHER").toUpperCase()} SIM`;
}

export function computeTotalsSheet(
  base: TotalsSheet,
  flights: Flight[],
  simFlights: Flight[] = [],
): TotalsSheet {
  const rows = base.rows.map((r) => ({ ...r, times: { ...r.times } }));
  const idx = new Map(rows.map((r, i) => [canonType(r.type), i]));

  function foldInto(rowKey: string, label: string, f: Flight) {
    let i = idx.get(rowKey);
    if (i === undefined) {
      i = rows.length;
      const times = Object.fromEntries(base.columns.map((c) => [c, 0]));
      rows.push({ type: label, times, total: 0 });
      idx.set(rowKey, i);
    }
    for (const c of base.columns) {
      rows[i].times[c] = r1(rows[i].times[c] + (f.time[c as keyof FlightTime] || 0));
    }
  }

  for (const f of appFlights(flights)) {
    foldInto(canonType(f.aircraftType), f.aircraftType || "OTHER", f);
  }
  // Simulator sessions land on the aircraft's dedicated "sim" row.
  const sims = countingSimFlights(simFlights);
  for (const f of sims) {
    foldInto(simRowKey(f.aircraftType), simRowLabel(f.aircraftType), f);
  }
  for (const r of rows) r.total = r1(base.columns.reduce((s, c) => s + r.times[c], 0));

  const totalsRow = {
    times: Object.fromEntries(
      base.columns.map((c) => [c, r1(rows.reduce((s, r) => s + r.times[c], 0))]),
    ),
    total: r1(rows.reduce((s, r) => s + r.total, 0)),
  };

  // Grand-total stats grow by the flying hours of app-added flights + counting
  // simulator sessions.
  const contributors = [...appFlights(flights), ...sims];
  const added = contributors.reduce(
    (s, f) => s + sum(f.time, base.columns as (keyof FlightTime)[]),
    0,
  );
  const stats = { ...base.stats };
  stats.grandTotalFlyingHours = r1(stats.grandTotalFlyingHours + added);
  stats.aeronauticalExperience = r1(
    stats.aeronauticalExperience +
      contributors.reduce(
        (s, f) =>
          s +
          sum(f.time, base.columns as (keyof FlightTime)[]) -
          (f.time.meCopilotDay + f.time.meCopilotNight) / 2,
        0,
      ),
  );

  return { ...base, rows, totalsRow, stats };
}

/**
 * Collapse any aircraft-type label to the CV's base-type key. Simulator rows
 * fold onto the aircraft itself (there is no separate sim row in the CV), so
 * "AW139 SIM" -> "AW139", "S92 SIM" -> "S92", "S70 FF&MS" -> "S70".
 */
function cvBaseType(label: string): string {
  return canonType(label).replace(/SIM$/, "").replace(/FFMS$/, "");
}

/**
 * The CV Summary is derived directly from the Totals sheet (single source of
 * truth): each CV row's flying columns (Captain, Co-Pilot, Dual, Night, Total)
 * come from summing the matching Totals rows — the aircraft's own line plus its
 * simulator line. Instrument and NVG are sub-counts that the Totals table does
 * not carry, so those stay from the CV snapshot and grow with app-added flights.
 */
export function computeCvSummary(
  base: CvSummary,
  totalsBase: TotalsSheet,
  flights: Flight[],
  simFlights: Flight[] = [],
): CvSummary {
  const totals = computeTotalsSheet(totalsBase, flights, simFlights);

  // Flying columns, aggregated from the Totals rows (actual + sim) per base type.
  type Fly = { captainIcus: number; otherCoPilot: number; dual: number; night: number; total: number };
  const flyByType = new Map<string, Fly>();
  for (const r of totals.rows) {
    const bt = cvBaseType(r.type);
    const a = flyByType.get(bt) ?? { captainIcus: 0, otherCoPilot: 0, dual: 0, night: 0, total: 0 };
    const t = r.times as unknown as FlightTime;
    a.captainIcus = r1(a.captainIcus + sum(t, CMD_ICUS_KEYS));
    a.otherCoPilot = r1(a.otherCoPilot + (t.meCopilotDay || 0) + (t.meCopilotNight || 0));
    a.dual = r1(a.dual + sum(t, DUAL_KEYS));
    a.night = r1(a.night + sum(t, NIGHT_KEYS));
    a.total = r1(a.total + r.total);
    flyByType.set(bt, a);
  }

  // Instrument & NVG aren't in the Totals table, so keep the CV snapshot values
  // and grow them with app-added flights + counting sim sessions.
  const instByType = new Map<string, { instrument: number; nvg: number }>();
  for (const g of base.groups) {
    for (const r of g.rows) {
      const bt = cvBaseType(r.type);
      const a = instByType.get(bt) ?? { instrument: 0, nvg: 0 };
      a.instrument = r1(a.instrument + r.instrument);
      a.nvg = r1(a.nvg + r.nvg);
      instByType.set(bt, a);
    }
  }
  const contributors = [...appFlights(flights), ...countingSimFlights(simFlights)];
  for (const f of contributors) {
    const bt = cvBaseType(f.aircraftType);
    const a = instByType.get(bt) ?? { instrument: 0, nvg: 0 };
    a.instrument = r1(a.instrument + f.time.instInFlight + f.time.instSim);
    a.nvg = r1(a.nvg + f.time.nvg);
    instByType.set(bt, a);
  }

  const HELI = new Set(["AW139", "S92", "S70", "B206", "R22"]);
  const emptyFly: Fly = { captainIcus: 0, otherCoPilot: 0, dual: 0, night: 0, total: 0 };
  const groups = base.groups.map((g) => ({ name: g.name, rows: [] as CvRow[], totals: { ...g.totals } }));
  const seen = new Set<string>();

  base.groups.forEach((g, gi) => {
    for (const r of g.rows) {
      const bt = cvBaseType(r.type);
      seen.add(bt);
      const fly = flyByType.get(bt) ?? emptyFly;
      const inst = instByType.get(bt) ?? { instrument: 0, nvg: 0 };
      groups[gi].rows.push({ type: r.type, ...fly, ...inst });
    }
  });
  // Aircraft types added in the app that aren't on the CV snapshot yet.
  for (const [bt, fly] of flyByType) {
    if (seen.has(bt)) continue;
    const inst = instByType.get(bt) ?? { instrument: 0, nvg: 0 };
    const gi = HELI.has(bt) ? 0 : Math.min(1, groups.length - 1);
    groups[gi].rows.push({ type: bt, ...fly, ...inst });
    seen.add(bt);
  }

  const fields: (keyof Omit<CvRow, "type">)[] = [
    "captainIcus",
    "otherCoPilot",
    "dual",
    "night",
    "instrument",
    "nvg",
    "total",
  ];
  for (const g of groups) {
    for (const fld of fields) g.totals[fld] = r1(g.rows.reduce((s, r) => s + r[fld], 0));
  }

  const grandTotals = { ...base.grandTotals };
  for (const fld of fields) grandTotals[fld] = r1(groups.reduce((s, g) => s + g.totals[fld], 0));

  // Offshore / cross-country stats grow with any app-added flights the pilot has
  // tagged. Cross-country flights also feed the PIC (command) and instrument
  // cross-country sub-totals.
  const extra = { ...base.extra };
  for (const f of appFlights(flights)) {
    const t = f.time;
    const flyTotal = sum(t, CMD_ICUS_KEYS) + t.meCopilotDay + t.meCopilotNight + sum(t, DUAL_KEYS);
    if (f.offshore) extra.offshoreHours = r1(extra.offshoreHours + flyTotal);
    if (f.xCountry) {
      extra.xCountry = r1(extra.xCountry + flyTotal);
      extra.picXCountry = r1(extra.picXCountry + sum(t, CMD_ICUS_KEYS));
      extra.xCountryInst = r1(extra.xCountryInst + t.instInFlight + t.instSim);
    }
  }

  return { ...base, groups, grandTotals, extra };
}
