import { useEffect, useRef, useState } from "react";
import type { Profile } from "../lib/db";
import type { LogbookPage } from "../lib/totals";
import type { Flight } from "../types";
import { LogbookTable } from "./LogbookTable";

/** "dd/mm/yyyy" from an ISO date, or "" if unset/unparseable. */
function fmtDob(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

/** Pilot identity line shown atop each logbook page (CASR 61.345(2)). */
function PilotBar({ pilot }: { pilot?: Profile | null }) {
  if (!pilot?.fullName && !pilot?.dob) return null;
  const dob = fmtDob(pilot?.dob ?? "");
  return (
    <div className="mb-2 flex flex-wrap gap-x-6 gap-y-0.5 text-sm text-slate-600">
      {pilot?.fullName && (
        <span>
          <span className="text-slate-400">Name: </span>
          <span className="font-semibold text-slate-800">{pilot.fullName}</span>
        </span>
      )}
      {dob && (
        <span>
          <span className="text-slate-400">DOB: </span>
          <span className="font-semibold text-slate-800">{dob}</span>
        </span>
      )}
    </div>
  );
}

/** Header label for a page: a single year, or a "start – end" range when a
 * continuous (non year-broken) page spans more than one calendar year. */
function pageYearLabel(page: LogbookPage): string {
  const years = page.flights
    .map((f) => f.year ?? (f.date ? new Date(f.date).getFullYear() : null))
    .filter((y): y is number => y != null);
  if (!years.length) return page.year != null ? String(page.year) : "—";
  const lo = Math.min(...years);
  const hi = Math.max(...years);
  return lo === hi ? String(lo) : `${lo} – ${hi}`;
}

/**
 * Paginated logbook display (year header + table + prev/next/latest pager).
 * Manages its own current-page index. Used for both the main logbook and the
 * Simulator logbook. Supports printing the current page or every page, each on
 * its own landscape A4 sheet.
 */
export function LogbookView({
  pages,
  onEdit,
  highlightId,
  focusMode = "latest",
  pilot,
  emptyLabel = "No entries yet.",
  groupByYear = true,
}: {
  pages: LogbookPage[];
  onEdit?: (f: Flight) => void;
  highlightId?: string | null;
  /** After a save: "latest" jumps to the last page (new flight), "locate" stays
   * on the page the highlighted (edited) flight lives on. */
  focusMode?: "latest" | "locate";
  /** Pilot identity shown atop each page and on printouts (CASR 61.345(2)). */
  pilot?: Profile | null;
  emptyLabel?: string;
  groupByYear?: boolean;
}) {
  const [pageIdx, setPageIdx] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [printAll, setPrintAll] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const initialised = useRef(false);
  const lastHighlight = useRef<string | null>(null);

  // Default to the last (latest) page when the logbook first loads.
  useEffect(() => {
    if (initialised.current || !pages.length) return;
    initialised.current = true;
    setPageIdx(pages.length - 1);
  }, [pages.length]);

  // Keep the index in range as the page count changes.
  useEffect(() => {
    if (pages.length) setPageIdx((i) => Math.min(i, pages.length - 1));
  }, [pages.length]);

  // After a save: adding a flight ("latest") jumps to the last page; editing
  // ("locate") stays on the page the updated flight lives on.
  useEffect(() => {
    if (!highlightId || !pages.length) return;
    if (lastHighlight.current === highlightId) return;
    lastHighlight.current = highlightId;
    if (focusMode === "locate") {
      const idx = pages.findIndex((p) => p.flights.some((f) => f.id === highlightId));
      setPageIdx(idx >= 0 ? idx : pages.length - 1);
    } else {
      setPageIdx(pages.length - 1);
    }
  }, [highlightId, pages.length, focusMode]);

  // Close the print menu on an outside click.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  // Print-all: render every page (print-only), fire the print dialog once the
  // extra DOM is committed, then tear it down after printing.
  useEffect(() => {
    if (!printAll) return;
    const done = () => setPrintAll(false);
    window.addEventListener("afterprint", done);
    const id = window.setTimeout(() => window.print(), 60);
    return () => {
      window.removeEventListener("afterprint", done);
      window.clearTimeout(id);
    };
  }, [printAll]);

  if (!pages.length) {
    return <div className="py-12 text-center text-slate-400">{emptyLabel}</div>;
  }

  const page = pages[pageIdx];
  const yearPages = groupByYear ? pages.filter((p) => p.year === page.year) : [];

  return (
    <div className={printAll ? "lb-printing-all" : undefined}>
      {/* Current page (screen + "print this page"). Hidden on paper during a
          print-all so only the all-pages block prints. */}
      <div className="lb-single">
        <PilotBar pilot={pilot} />
        <div className="mb-2 flex items-baseline gap-3">
          <h2 className="text-xl font-bold tabular-nums text-slate-800">{pageYearLabel(page)}</h2>
          {groupByYear && yearPages.length > 1 && (
            <span className="text-sm text-slate-500">
              page {yearPages.indexOf(page) + 1} of {yearPages.length}
            </span>
          )}
        </div>
        <LogbookTable page={page} highlightId={highlightId ?? null} onEdit={onEdit} />
      </div>

      <div className="no-print mt-4 flex flex-col items-center gap-2 text-sm">
        <span className="tabular-nums text-slate-600">
          Page {pageIdx + 1} of {pages.length}
        </span>
        <div className="flex items-center gap-2">
          <button
            disabled={pageIdx === 0}
            onClick={() => setPageIdx(0)}
            aria-label="First page"
            title="First page"
            className="min-w-[2.75rem] rounded-md border border-slate-300 bg-white px-3 py-2 text-base font-semibold disabled:opacity-40"
          >
            «
          </button>
          <button
            disabled={pageIdx === 0}
            onClick={() => setPageIdx((i) => Math.max(0, i - 1))}
            aria-label="Previous page"
            title="Previous page"
            className="min-w-[2.75rem] rounded-md border border-slate-300 bg-white px-3 py-2 text-base font-semibold disabled:opacity-40"
          >
            ←
          </button>
          <button
            disabled={pageIdx >= pages.length - 1}
            onClick={() => setPageIdx((i) => Math.min(pages.length - 1, i + 1))}
            aria-label="Next page"
            title="Next page"
            className="min-w-[2.75rem] rounded-md border border-slate-300 bg-white px-3 py-2 text-base font-semibold disabled:opacity-40"
          >
            →
          </button>
          <button
            disabled={pageIdx >= pages.length - 1}
            onClick={() => setPageIdx(pages.length - 1)}
            aria-label="Last page"
            title="Last page"
            className="min-w-[2.75rem] rounded-md border border-slate-300 bg-white px-3 py-2 text-base font-semibold disabled:opacity-40"
          >
            »
          </button>

          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((o) => !o)}
              className="rounded-md border border-sky-300 bg-sky-50 px-3 py-2 font-medium text-sky-700 hover:bg-sky-100"
            >
              Print ▾
            </button>
          {menuOpen && (
            <div className="absolute bottom-full right-0 z-20 mb-1 w-44 overflow-hidden rounded-md border border-slate-300 bg-white shadow-lg">
              <button
                onClick={() => {
                  setMenuOpen(false);
                  window.print();
                }}
                className="block w-full px-3 py-2 text-left hover:bg-slate-100"
              >
                Print this page
              </button>
              <button
                onClick={() => {
                  setMenuOpen(false);
                  setPrintAll(true);
                }}
                className="block w-full border-t border-slate-200 px-3 py-2 text-left hover:bg-slate-100"
              >
                Print all pages ({pages.length})
              </button>
            </div>
          )}
          </div>
        </div>
      </div>

      {/* All pages, one landscape A4 sheet each (rendered only while printing). */}
      {printAll && (
        <div className="lb-print-all">
          {pages.map((p, i) => (
            <div key={i} className="lb-print-page">
              <PilotBar pilot={pilot} />
              <h2 className="mb-1 text-sm font-bold text-slate-800">{pageYearLabel(p)}</h2>
              <LogbookTable page={p} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
