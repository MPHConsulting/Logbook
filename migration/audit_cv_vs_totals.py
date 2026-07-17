"""Verify the CV Summary per-type rows equal the Totals (actual + sim) rows.

For each CV aircraft-type row, sum the matching Totals rows (the aircraft's
actual row plus its 'sim' row) and map the 14 flying columns into the CV
categories, then compare to the CV snapshot row.
"""

import json
from pathlib import Path

d = json.loads((Path(__file__).parent.parent / "src" / "data" / "logbook-data.json").read_text(encoding="utf-8"))
tot = d["totalsSheet"]
cv = d["cvSummary"]

CMD_ICUS = ["seCommandDay", "seCommandNight", "meCommandDay", "meCommandNight",
            "seIcusDay", "seIcusNight", "meIcusDay", "meIcusNight"]
COPILOT = ["meCopilotDay", "meCopilotNight"]
DUAL = ["seDualDay", "seDualNight", "meDualDay", "meDualNight"]
NIGHT = ["seIcusNight", "seDualNight", "seCommandNight", "meIcusNight",
         "meDualNight", "meCommandNight", "meCopilotNight"]


def base_type(label):
    s = label.upper().replace("-", "").replace(" ", "").replace("/", "").replace("&", "")
    if "AW139" in s:
        return "AW139"
    if "S92" in s:
        return "S92"
    if "S70" in s:
        return "S70"
    if "B206" in s:
        return "B206"
    if "CT4" in s:
        return "CT4"
    if "R22" in s:
        return "R22"
    if "DA40" in s or "DA20" in s:
        return "DA40"
    return s


# Sum Totals rows (actual + sim) per base aircraft type.
agg = {}
for r in tot["rows"]:
    bt = base_type(r["type"])
    a = agg.setdefault(bt, {"captainIcus": 0.0, "otherCoPilot": 0.0, "dual": 0.0, "night": 0.0, "total": 0.0})
    t = r["times"]
    a["captainIcus"] += sum(t.get(k, 0) for k in CMD_ICUS)
    a["otherCoPilot"] += sum(t.get(k, 0) for k in COPILOT)
    a["dual"] += sum(t.get(k, 0) for k in DUAL)
    a["night"] += sum(t.get(k, 0) for k in NIGHT)
    a["total"] += r["total"]

print(f"{'type':8} {'field':13} {'CV':>9} {'Totals-derived':>15} {'match':>7}")
print("-" * 56)
ok = True
for g in cv["groups"]:
    for row in g["rows"]:
        bt = base_type(row["type"])
        derived = agg.get(bt)
        if not derived:
            print(f"{bt:8} (no matching Totals rows!)")
            ok = False
            continue
        for fld in ("captainIcus", "otherCoPilot", "dual", "night", "total"):
            cvv = round(row[fld], 1)
            dv = round(derived[fld], 1)
            m = abs(cvv - dv) < 0.05
            ok = ok and m
            flag = "OK" if m else "  <<< DIFF"
            print(f"{bt:8} {fld:13} {cvv:9.1f} {dv:15.1f} {flag:>7}")
        print()

print("ALL MATCH" if ok else "MISMATCHES FOUND")
