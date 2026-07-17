"""Audit the simulator records: date ranges per sim type, earliest sessions,
and whether the S-70 FF&MS sim predates the LOG BOOK start (2009)."""

import json
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).parent
data = json.loads((HERE.parent / "src" / "data" / "logbook-data.json").read_text(encoding="utf-8"))
sims = data["simFlights"]

FLY = [
    "seIcusDay", "seIcusNight", "seDualDay", "seDualNight", "seCommandDay",
    "seCommandNight", "meIcusDay", "meIcusNight", "meDualDay", "meDualNight",
    "meCommandDay", "meCommandNight", "meCopilotDay", "meCopilotNight",
]


def fly(t):
    return round(sum(t.get(k, 0) for k in FLY), 1)


by_type = defaultdict(list)
for s in sims:
    by_type[s["aircraftType"]].append(s)

for typ, rows in sorted(by_type.items()):
    rows.sort(key=lambda r: r["date"] or "")
    tot = round(sum(fly(r["time"]) for r in rows), 1)
    dates = [r["date"] for r in rows if r["date"]]
    print(f"\n=== {typ}: {len(rows)} sessions, {tot} h, {min(dates)} .. {max(dates)}")
    for r in rows[:6]:
        note = (r.get("otherCrew") or r.get("route") or r.get("remarks") or "")[:40]
        print(f"   {r['date']}  {fly(r['time']):5.1f}h  {note}")
    if len(rows) > 6:
        print(f"   ... ({len(rows) - 6} more)")

# How many sim sessions are before the logbook start (2009-01-01)?
pre2009 = [s for s in sims if (s["date"] or "9999") < "2009-01-01"]
print(f"\nSim sessions dated before 2009-01-01: {len(pre2009)}  ({round(sum(fly(s['time']) for s in pre2009),1)} h)")
for s in pre2009[:20]:
    print(f"   {s['date']} {s['aircraftType']} {fly(s['time'])}h")
