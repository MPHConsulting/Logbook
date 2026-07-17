import type { LogbookData } from "../types";
import raw from "./logbook-data.json";

export const seedData = raw as unknown as LogbookData;
