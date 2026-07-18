/** Format an hours value: blank for zero, else 1 decimal place. */
export function fmtHrs(v: number): string {
  if (!v) return "";
  return v.toFixed(1);
}

/** Date as "dd/mm/yyyy" from ISO, or a best-effort from y/m/d. */
export function fmtDate(
  date: string | null,
  year?: number | null,
  month?: number | null,
  day?: number | null,
): string {
  if (date) {
    const d = new Date(date + "T00:00:00");
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return `${dd}/${mm}/${d.getFullYear()}`;
  }
  if (year && month) {
    const dd = day ? String(day).padStart(2, "0") : "--";
    const mm = String(month).padStart(2, "0");
    return `${dd}/${mm}/${year}`;
  }
  return "";
}
