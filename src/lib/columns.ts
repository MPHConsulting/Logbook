import type { TimeKey } from "../types";

export interface TimeColumn {
  key: TimeKey;
  /** Top-level engine group heading. */
  group: "SINGLE-ENGINE" | "MULTI-ENGINE" | "INSTRUMENT" | "NVG";
  /** Function heading, e.g. I.C.U.S / DUAL / COMMAND / CO-PILOT. */
  func: string;
  /** Day, Night, or single label for instrument / NVG. */
  period: "Day" | "Night" | "FLT" | "SIM" | "NVG";
  /** Whether this column counts toward "Total Flying Hours" (cols 1-14). */
  flying: boolean;
}

// Order matches the official Airservices right-page layout (cols 1-14),
// then the Instrument columns.
export const TIME_COLUMNS: TimeColumn[] = [
  { key: "seIcusDay", group: "SINGLE-ENGINE", func: "I.C.U.S", period: "Day", flying: true },
  { key: "seIcusNight", group: "SINGLE-ENGINE", func: "I.C.U.S", period: "Night", flying: true },
  { key: "seDualDay", group: "SINGLE-ENGINE", func: "DUAL", period: "Day", flying: true },
  { key: "seDualNight", group: "SINGLE-ENGINE", func: "DUAL", period: "Night", flying: true },
  { key: "seCommandDay", group: "SINGLE-ENGINE", func: "COMMAND", period: "Day", flying: true },
  { key: "seCommandNight", group: "SINGLE-ENGINE", func: "COMMAND", period: "Night", flying: true },
  { key: "meIcusDay", group: "MULTI-ENGINE", func: "I.C.U.S", period: "Day", flying: true },
  { key: "meIcusNight", group: "MULTI-ENGINE", func: "I.C.U.S", period: "Night", flying: true },
  { key: "meDualDay", group: "MULTI-ENGINE", func: "DUAL", period: "Day", flying: true },
  { key: "meDualNight", group: "MULTI-ENGINE", func: "DUAL", period: "Night", flying: true },
  { key: "meCommandDay", group: "MULTI-ENGINE", func: "COMMAND", period: "Day", flying: true },
  { key: "meCommandNight", group: "MULTI-ENGINE", func: "COMMAND", period: "Night", flying: true },
  { key: "meCopilotDay", group: "MULTI-ENGINE", func: "CO-PILOT", period: "Day", flying: true },
  { key: "meCopilotNight", group: "MULTI-ENGINE", func: "CO-PILOT", period: "Night", flying: true },
  { key: "instInFlight", group: "INSTRUMENT", func: "INSTRUMENT", period: "FLT", flying: false },
  { key: "instSim", group: "INSTRUMENT", func: "INSTRUMENT", period: "SIM", flying: false },
  { key: "nvg", group: "NVG", func: "NVG", period: "NVG", flying: false },
];

export const CO_PILOT_KEYS: TimeKey[] = ["meCopilotDay", "meCopilotNight"];

export const ROWS_PER_PAGE = 21;
