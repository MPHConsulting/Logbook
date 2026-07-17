export interface FlightTime {
  seIcusDay: number;
  seIcusNight: number;
  seDualDay: number;
  seDualNight: number;
  seCommandDay: number;
  seCommandNight: number;
  meIcusDay: number;
  meIcusNight: number;
  meDualDay: number;
  meDualNight: number;
  meCommandDay: number;
  meCommandNight: number;
  meCopilotDay: number;
  meCopilotNight: number;
  instInFlight: number;
  instSim: number;
  nvg: number;
}

export type TimeKey = keyof FlightTime;

export interface Flight {
  id: string;
  sourceRow: number | null;
  date: string | null; // ISO YYYY-MM-DD
  year: number | null;
  month: number | null;
  day: number | null;
  aircraftType: string;
  aircraftRego: string;
  pilotInCommand: string;
  otherCrew: string;
  route: string;
  remarks: string;
  noteRaw: string;
  time: FlightTime;
  needsReview?: boolean;
  origin: "excel" | "app";
  /** Creation timestamp (ms) for app-added flights, used to keep same-day
   * flights in the order they were entered. */
  createdAt?: number;
  /** Last-modified timestamp (ms), bumped on every save. Used to pick the
   * winning record when merging data from another device during cloud sync. */
  updatedAt?: number;
  /** For simulator sessions: whether the hours roll up into the Totals / CV
   * "sim" line for that aircraft type. Defaults to true. When false the session
   * only lives on the simulator page and is excluded from the grand totals. */
  countsToTotals?: boolean;
  /** Marks the flight as offshore; its flying hours add to the CV "Offshore
   * Hours" stat. */
  offshore?: boolean;
  /** Marks the flight as cross-country; its flying hours add to the CV "X
   * Country" stat, its command hours to "PIC X Country", and its instrument
   * hours to "X Country Instrument". */
  xCountry?: boolean;
}

export interface LogbookMeta {
  generated: string;
  source: string;
  numFlights: number;
  numPages: number;
  note: string;
}

export interface TotalsSheetRow {
  type: string;
  times: Record<string, number>;
  total: number;
}

export interface TotalsSheet {
  columns: string[];
  rows: TotalsSheetRow[];
  totalsRow: { times: Record<string, number>; total: number };
  stats: {
    grandTotalFlyingHours: number;
    sheetGrandTotalFlyingHours: number;
    coPilot: number;
    aeronauticalExperience: number;
    captainHelicopter: number;
    icusHelicopter: number;
  };
}

export interface CvRow {
  type: string;
  captainIcus: number;
  otherCoPilot: number;
  dual: number;
  night: number;
  instrument: number;
  nvg: number;
  total: number;
}

export interface CvGroup {
  name: string;
  rows: CvRow[];
  totals: Omit<CvRow, "type">;
}

export interface CvSummary {
  columns: string[];
  groups: CvGroup[];
  grandTotals: Omit<CvRow, "type">;
  extra: {
    offshoreHours: number;
    xCountry: number;
    picXCountry: number;
    xCountryInst: number;
  };
}

export interface LogbookData {
  meta: LogbookMeta;
  openingBalance: FlightTime;
  adjustments: FlightTime;
  excelGrandTotal: FlightTime;
  totalsSheet: TotalsSheet;
  cvSummary: CvSummary;
  flights: Flight[];
  /** Individual simulator sessions (S70 FF&MS + S92 SIM + AW139 SIM), merged in
   * date order for the read-only Simulator logbook. Not counted in the main
   * flight totals. */
  simFlights: Flight[];
}
