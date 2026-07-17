import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Flight, FlightTime } from "../types";
import { seedData } from "../data/seed";
import { TIME_COLUMNS } from "./columns";

const DAY_KEYS = TIME_COLUMNS.filter((c) => c.period === "Day").map((c) => c.key);
const NIGHT_KEYS = TIME_COLUMNS.filter((c) => c.period === "Night").map((c) => c.key);

/** A flight is treated as a "night" flight (and sorts after same-day day
 * flights) when it has night hours and no day hours. */
function isNightFlight(f: Flight): boolean {
  const day = DAY_KEYS.reduce((s, k) => s + (f.time[k] || 0), 0);
  const night = NIGHT_KEYS.reduce((s, k) => s + (f.time[k] || 0), 0);
  return night > 0 && day === 0;
}

interface LogbookDB extends DBSchema {
  flights: { key: string; value: Flight; indexes: { bySourceRow: number } };
  sim: { key: string; value: Flight; indexes: { bySourceRow: number } };
  meta: { key: string; value: unknown };
}

const DB_NAME = "pilot-logbook";
const DB_VERSION = 2;
// Bump to re-seed from the bundled dataset after a data rebuild.
const SEED_VERSION = "2026-07-17-3";

let dbPromise: Promise<IDBPDatabase<LogbookDB>> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<LogbookDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("flights")) {
          const flights = db.createObjectStore("flights", { keyPath: "id" });
          flights.createIndex("bySourceRow", "sourceRow");
        }
        if (!db.objectStoreNames.contains("meta")) {
          db.createObjectStore("meta");
        }
        if (!db.objectStoreNames.contains("sim")) {
          const sim = db.createObjectStore("sim", { keyPath: "id" });
          sim.createIndex("bySourceRow", "sourceRow");
        }
      },
    });
  }
  return dbPromise;
}

export interface Balances {
  openingBalance: FlightTime;
  adjustments: FlightTime;
  excelGrandTotal: FlightTime;
}

export async function ensureSeeded(): Promise<void> {
  const db = await getDb();
  const seeded = await db.get("meta", "seedVersion");
  if (seeded === SEED_VERSION) return;

  const tx = db.transaction(["flights", "sim", "meta"], "readwrite");
  const store = tx.objectStore("flights");
  // Re-seed the imported ("excel") flights from the bundled dataset while
  // preserving any flights the user added in the app.
  for (const f of await store.getAll()) {
    if (f.origin === "excel") await store.delete(f.id);
  }
  for (const f of seedData.flights) await store.put(f);

  // Same for the simulator store: refresh imported sessions, keep added ones.
  const simStore = tx.objectStore("sim");
  for (const f of await simStore.getAll()) {
    if (f.origin === "excel") await simStore.delete(f.id);
  }
  for (const f of seedData.simFlights) await simStore.put(f);

  const meta = tx.objectStore("meta");
  await meta.put(seedData.openingBalance, "openingBalance");
  await meta.put(seedData.adjustments, "adjustments");
  await meta.put(seedData.excelGrandTotal, "excelGrandTotal");
  await meta.put(seedData.meta, "sourceMeta");
  await meta.put(SEED_VERSION, "seedVersion");
  await tx.done;
}

function dateMs(d: string | null): number {
  return d ? Date.parse(d + "T00:00:00") : NaN;
}

function isImported(f: Flight): boolean {
  return f.origin !== "app" && f.sourceRow != null;
}

/**
 * Order every flight chronologically. Imported ("excel") flights keep their
 * original source-row order (their canonical sequence). App-added flights are
 * slotted into the correct chronological position by date: a flight logged
 * with a past date lands between the imported flights that bracket that date,
 * so a missed flight can be inserted after the fact and still appear in order.
 */
export function orderFlights(all: Flight[]): Flight[] {
  const imported = all.filter(isImported).sort((a, b) => a.sourceRow! - b.sourceRow!);
  const apps = all.filter((f) => !isImported(f));

  // Timeline of imported rows that carry a date (their source rows increase
  // with date), used to find where an app flight's date belongs.
  const timeline = imported
    .filter((f) => f.date)
    .map((f) => ({ row: f.sourceRow as number, t: dateMs(f.date) }));
  const lastRow = imported.length ? imported[imported.length - 1].sourceRow! : 0;

  function baseRowFor(t: number): number {
    if (Number.isNaN(t)) return lastRow + 1; // undated app flights sort last
    let base = timeline.length ? timeline[0].row - 1 : 0; // before the first flight
    for (const e of timeline) {
      if (e.t <= t) base = e.row;
      else break;
    }
    return base;
  }

  // App flights sorted by date; within a date they keep the order they were
  // entered (createdAt), except night flights are pushed after day flights.
  const appsSorted = [...apps].sort((a, b) => {
    const ta = dateMs(a.date);
    const tb = dateMs(b.date);
    if (Number.isNaN(ta) && Number.isNaN(tb)) return (a.createdAt ?? 0) - (b.createdAt ?? 0);
    if (Number.isNaN(ta)) return 1;
    if (Number.isNaN(tb)) return -1;
    if (ta !== tb) return ta - tb;
    const na = isNightFlight(a) ? 1 : 0;
    const nb = isNightFlight(b) ? 1 : 0;
    if (na !== nb) return na - nb;
    const ca = a.createdAt ?? 0;
    const cb = b.createdAt ?? 0;
    if (ca !== cb) return ca - cb;
    return a.id < b.id ? -1 : 1;
  });

  // Assign each app flight a fractional key just after its bracketing imported
  // row; consecutive app flights sharing a slot get an increasing epsilon.
  const keyed = new Map<string, number>();
  let prevBase: number | null = null;
  let n = 0;
  for (const f of appsSorted) {
    const base = baseRowFor(dateMs(f.date));
    if (base === prevBase) n += 1;
    else {
      n = 0;
      prevBase = base;
    }
    keyed.set(f.id, base + 0.5 + n * 1e-4);
  }

  const keyOf = (f: Flight) =>
    isImported(f) ? f.sourceRow! : (keyed.get(f.id) ?? Number.MAX_SAFE_INTEGER);
  return [...all].sort((a, b) => keyOf(a) - keyOf(b));
}

export async function getAllFlights(): Promise<Flight[]> {
  const db = await getDb();
  const all = await db.getAll("flights");
  return orderFlights(all);
}

export async function getBalances(): Promise<Balances> {
  const db = await getDb();
  const [openingBalance, adjustments, excelGrandTotal] = await Promise.all([
    db.get("meta", "openingBalance") as Promise<FlightTime>,
    db.get("meta", "adjustments") as Promise<FlightTime>,
    db.get("meta", "excelGrandTotal") as Promise<FlightTime>,
  ]);
  return { openingBalance, adjustments, excelGrandTotal };
}

export async function putFlight(f: Flight): Promise<void> {
  const db = await getDb();
  await db.put("flights", f);
}

export async function deleteFlight(id: string): Promise<void> {
  const db = await getDb();
  await db.delete("flights", id);
}

/** Simulator log — same ordering rules as the main logbook (imported sessions
 * keep their date-ordered sequence, added sessions slot in by date). */
export async function getAllSimFlights(): Promise<Flight[]> {
  const db = await getDb();
  return orderFlights(await db.getAll("sim"));
}

export async function putSimFlight(f: Flight): Promise<void> {
  const db = await getDb();
  await db.put("sim", f);
}

export async function deleteSimFlight(id: string): Promise<void> {
  const db = await getDb();
  await db.delete("sim", id);
}

/** A full snapshot of everything stored on this device: every flight and
 * simulator session plus the balances/meta. Used for backup / restore. */
export interface BackupBundle {
  app: "pilot-logbook";
  version: number;
  exportedAt: string;
  flights: Flight[];
  sim: Flight[];
  meta: {
    openingBalance?: FlightTime;
    adjustments?: FlightTime;
    excelGrandTotal?: FlightTime;
    sourceMeta?: unknown;
    seedVersion?: unknown;
  };
}

/** Export the entire on-device database to a single JSON bundle. */
export async function exportData(): Promise<BackupBundle> {
  const db = await getDb();
  const [flights, sim, openingBalance, adjustments, excelGrandTotal, sourceMeta, seedVersion] =
    await Promise.all([
      db.getAll("flights"),
      db.getAll("sim"),
      db.get("meta", "openingBalance") as Promise<FlightTime>,
      db.get("meta", "adjustments") as Promise<FlightTime>,
      db.get("meta", "excelGrandTotal") as Promise<FlightTime>,
      db.get("meta", "sourceMeta"),
      db.get("meta", "seedVersion"),
    ]);
  return {
    app: "pilot-logbook",
    version: 1,
    exportedAt: new Date().toISOString(),
    flights,
    sim,
    meta: { openingBalance, adjustments, excelGrandTotal, sourceMeta, seedVersion },
  };
}

/** Restore a backup bundle, replacing all data currently on this device. */
export async function importData(bundle: BackupBundle): Promise<void> {
  if (!bundle || bundle.app !== "pilot-logbook" || !Array.isArray(bundle.flights)) {
    throw new Error("This file is not a valid Pilot Logbook backup.");
  }
  const db = await getDb();
  const tx = db.transaction(["flights", "sim", "meta"], "readwrite");
  const flights = tx.objectStore("flights");
  await flights.clear();
  for (const f of bundle.flights) await flights.put(f);

  const sim = tx.objectStore("sim");
  await sim.clear();
  for (const f of bundle.sim ?? []) await sim.put(f);

  const meta = tx.objectStore("meta");
  if (bundle.meta?.openingBalance) await meta.put(bundle.meta.openingBalance, "openingBalance");
  if (bundle.meta?.adjustments) await meta.put(bundle.meta.adjustments, "adjustments");
  if (bundle.meta?.excelGrandTotal) await meta.put(bundle.meta.excelGrandTotal, "excelGrandTotal");
  if (bundle.meta?.sourceMeta !== undefined) await meta.put(bundle.meta.sourceMeta, "sourceMeta");
  if (bundle.meta?.seedVersion !== undefined) await meta.put(bundle.meta.seedVersion, "seedVersion");
  await tx.done;
}
