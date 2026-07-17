import { useEffect, useMemo, useState } from "react";
import { AddFlightForm } from "./components/AddFlightForm";
import { BackupPage } from "./components/BackupPage";
import { CvSummaryPage } from "./components/CvSummaryPage";
import { LogbookView } from "./components/LogbookView";
import { TotalsPage } from "./components/TotalsPage";
import { seedData } from "./data/seed";
import {
  deleteFlight,
  deleteSimFlight,
  ensureSeeded,
  getAllFlights,
  getAllSimFlights,
  getBalances,
  putFlight,
  putSimFlight,
  type Balances,
} from "./lib/db";
import {
  emptyTime,
  grandTotal,
  paginate,
  totalFlyingHours,
} from "./lib/totals";
import { scheduleAutoBackup, syncOnOpen } from "./lib/gistBackup";
import type { Flight } from "./types";

type View = "logbook" | "simulator" | "form" | "totals" | "cv" | "backup";
type FormMode = "flight" | "sim";

export default function App() {
  const [flights, setFlights] = useState<Flight[]>([]);
  const [simFlights, setSimFlights] = useState<Flight[]>([]);
  const [balances, setBalances] = useState<Balances | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("logbook");
  const [editing, setEditing] = useState<Flight | null>(null);
  const [formMode, setFormMode] = useState<FormMode>("flight");
  const [focusId, setFocusId] = useState<string | null>(null);
  // "latest" → after adding a flight, jump to the last page. "locate" → after
  // editing, stay on the page the (updated) flight lives on.
  const [focusMode, setFocusMode] = useState<"latest" | "locate">("latest");

  async function reload() {
    const [f, s, b] = await Promise.all([
      getAllFlights(),
      getAllSimFlights(),
      getBalances(),
    ]);
    setFlights(f);
    setSimFlights(s);
    setBalances(b);
  }

  useEffect(() => {
    (async () => {
      await ensureSeeded();
      await reload();
      setLoading(false);
      // Pull the latest from the cloud on open (no-op unless cloud sync is on).
      try {
        const r = await syncOnOpen();
        if (r.changed) await reload();
      } catch (e) {
        console.warn("Cloud sync on open failed:", e);
      }
    })();
  }, []);

  // Re-sync whenever the app is brought back to the foreground, so switching
  // between phone and computer picks up the other device's latest changes.
  useEffect(() => {
    const onVisible = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const r = await syncOnOpen();
        if (r.changed) await reload();
      } catch (e) {
        console.warn("Cloud sync on focus failed:", e);
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  const pages = useMemo(() => {
    if (!balances) return [];
    return paginate(flights, balances.openingBalance, balances.adjustments);
  }, [flights, balances]);

  // Simulator logbook: sessions from the three Excel sim sheets plus any added
  // in the app, paginated continuously (no year breaks) with a zero balance.
  const simPages = useMemo(
    () => paginate(simFlights, emptyTime(), emptyTime(), { breakOnYear: false }),
    [simFlights],
  );

  // After adding/editing a flight, LogbookView jumps to the page it lives on and
  // highlights the row; clear the highlight after a short delay.
  useEffect(() => {
    if (!focusId) return;
    const t = setTimeout(() => setFocusId(null), 2500);
    return () => clearTimeout(t);
  }, [focusId]);

  const gt = useMemo(() => {
    if (!balances) return null;
    return grandTotal(flights, balances.openingBalance, balances.adjustments);
  }, [flights, balances]);

  function openForm(mode: FormMode, flight: Flight | null) {
    setFormMode(mode);
    setEditing(flight);
    setView("form");
  }

  async function handleSave(f: Flight) {
    const toSim = formMode === "sim";
    const wasEdit = editing != null;
    await (toSim ? putSimFlight(f) : putFlight(f));
    await reload();
    setView(toSim ? "simulator" : "logbook");
    setEditing(null);
    setFocusMode(wasEdit ? "locate" : "latest");
    setFocusId(f.id);
    scheduleAutoBackup();
  }

  async function handleDelete(id: string) {
    const toSim = formMode === "sim";
    await (toSim ? deleteSimFlight(id) : deleteFlight(id));
    await reload();
    setView(toSim ? "simulator" : "logbook");
    setEditing(null);
    scheduleAutoBackup();
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-slate-500">
        Loading logbook…
      </div>
    );
  }

  return (
    <div className="min-h-full">
      <header className="no-print sticky top-0 z-10 border-b border-slate-800 bg-slate-900 text-white">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-4 px-4 py-3">
          <h1 className="text-lg font-semibold tracking-tight">Pilot Logbook</h1>
          {gt && (
            <div className="flex gap-6 text-sm">
              <span>
                <span className="text-slate-400">Flying hrs: </span>
                <span className="font-semibold tabular-nums">{totalFlyingHours(gt).toFixed(1)}</span>
              </span>
              <span className="hidden sm:inline">
                <span className="text-slate-400">Flights: </span>
                <span className="font-semibold tabular-nums">{flights.length}</span>
              </span>
            </div>
          )}
          <nav className="ml-auto flex items-center gap-1 rounded-md bg-slate-800 p-1 text-sm">
            {([
              ["logbook", "Logbook"],
              ["simulator", "Simulator"],
              ["totals", "Totals"],
              ["cv", "CV Summary"],
              ["backup", "Backup"],
            ] as const).map(([v, label]) => (
              <button
                key={v}
                onClick={() => {
                  setEditing(null);
                  setView(v);
                }}
                className={`rounded px-3 py-1 font-medium ${
                  view === v ? "bg-sky-600 text-white" : "text-slate-300 hover:text-white"
                }`}
              >
                {label}
              </button>
            ))}
          </nav>
          <button
            onClick={() => {
              if (view === "form") {
                setEditing(null);
                setView(formMode === "sim" ? "simulator" : "logbook");
              } else if (view === "simulator") {
                openForm("sim", null);
              } else {
                openForm("flight", null);
              }
            }}
            className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-semibold hover:bg-sky-700"
          >
            {view === "form"
              ? "Back"
              : view === "simulator"
                ? "+ Add sim session"
                : "+ Add flight"}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-4 py-4">
        {view === "form" ? (
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
            <h2 className="mb-4 text-base font-semibold">
              {editing
                ? formMode === "sim"
                  ? "Edit sim session"
                  : "Edit flight"
                : formMode === "sim"
                  ? "Add a sim session"
                  : "Add a flight"}
            </h2>
            <AddFlightForm
              initial={editing}
              isSim={formMode === "sim"}
              onSave={handleSave}
              onCancel={() => {
                setView(formMode === "sim" ? "simulator" : "logbook");
                setEditing(null);
              }}
              onDelete={editing ? handleDelete : undefined}
            />
          </div>
        ) : view === "totals" ? (
          <TotalsPage base={seedData.totalsSheet} flights={flights} simFlights={simFlights} />
        ) : view === "cv" ? (
          <CvSummaryPage
            base={seedData.cvSummary}
            totalsBase={seedData.totalsSheet}
            flights={flights}
            simFlights={simFlights}
          />
        ) : view === "backup" ? (
          <BackupPage onRestored={reload} />
        ) : view === "simulator" ? (
          <>
            <div className="no-print mb-3 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-800">
              Simulator training log — S‑70, S‑92 and AW139 sessions, merged in date order.
            </div>
            <LogbookView
              pages={simPages}
              groupByYear={false}
              highlightId={focusId}
              focusMode={focusMode}
              emptyLabel="No simulator sessions."
              onEdit={(f) => openForm("sim", f)}
            />
          </>
        ) : (
          <LogbookView
            pages={pages}
            highlightId={focusId}
            focusMode={focusMode}
            onEdit={(f) => openForm("flight", f)}
          />
        )}
      </main>
    </div>
  );
}
