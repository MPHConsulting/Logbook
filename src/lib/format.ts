/** Format an hours value: blank for zero, else 1 decimal place. */
export function fmtHrs(v: number): string {
  if (!v) return "";
  return v.toFixed(1);
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Short date like "08 Jan 09" from ISO, or a best-effort from y/m/d. */
export function fmtDate(
  date: string | null,
  year?: number | null,
  month?: number | null,
  day?: number | null,
): string {
  if (date) {
    const d = new Date(date + "T00:00:00");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${dd} ${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`;
  }
  if (year && month) {
    const dd = day ? String(day).padStart(2, "0") : "--";
    return `${dd} ${MONTHS[month - 1]} ${String(year).slice(2)}`;
  }
  return "";
}
