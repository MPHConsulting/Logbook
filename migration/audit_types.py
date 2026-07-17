"""Ad-hoc audit: how the per-type sheets differ from the LOG BOOK.

Sums every extracted LOG BOOK flight by (canonical) aircraft type and compares,
column by column, against each type sheet's total in the Totals summary.
Also lists the flights the type-detector left untyped ("OTHER").
"""

import json
from collections import Counter
from pathlib import Path

HERE = Path(__file__).parent
enr = json.loads((HERE / "enriched_flights.json").read_text(encoding="utf-8"))
data = json.loads((HERE.parent / "src" / "data" / "logbook-data.json").read_text(encoding="utf-8"))

COLS = [
    "se_icus_day", "se_icus_night", "se_dual_day", "se_dual_night",
    "se_command_day", "se_command_night", "me_icus_day", "me_icus_night",
    "me_dual_day", "me_dual_night", "me_command_day", "me_command_night",
    "me_copilot_day", "me_copilot_night",
]
CAMEL = {
    "se_icus_day": "seIcusDay", "se_icus_night": "seIcusNight",
    "se_dual_day": "seDualDay", "se_dual_night": "seDualNight",
    "se_command_day": "seCommandDay", "se_command_night": "seCommandNight",
    "me_icus_day": "meIcusDay", "me_icus_night": "meIcusNight",
    "me_dual_day": "meDualDay", "me_dual_night": "meDualNight",
    "me_command_day": "meCommandDay", "me_command_night": "meCommandNight",
    "me_copilot_day": "meCopilotDay", "me_copilot_night": "meCopilotNight",
}


def canon(s: str) -> str:
    s = (s or "").upper().replace("-", "").replace(" ", "").replace("/", "").replace("&", "")
    if "AW139" in s:
        return "AW139SIM" if "SIM" in s else "AW139"
    if "S92" in s:
        return "S92SIM" if "SIM" in s else "S92"
    if "S70" in s:
        return "S70FFMS" if "FFMS" in s else "S70"
    if "B206" in s:
        return "B206"
    if "CT4" in s:
        return "CT4"
    if "R22" in s:
        return "R22"
    if "DA40" in s or "DA20" in s or "FWSINGLE" in s:
        return "DA40"
    return s or "OTHER"


def flying(times: dict) -> float:
    return round(sum(v for k, v in times.items() if k in COLS), 1)


others = [f for f in enr if canon(f.get("aircraftType")) == "OTHER"]
print(f"OTHER (untyped) flights: {len(others)}   total flying {flying({c: sum(f['times'].get(c,0) for f in others) for c in COLS}):.1f} h")
print("raw aircraftType values:", dict(Counter(f.get("aircraftType") for f in others)))
print("typeSource:", dict(Counter(f.get("typeSource") for f in others)))
print("by year:", dict(sorted(Counter(f.get("year") for f in others).items())))
print()
print("--- all OTHER flights ---")
for f in others:
    print(
        f"{f.get('date')} row{f['source_row']:>4} "
        f"rego='{f.get('aircraftRego') or ''}' t={flying(f['times']):>5.1f} | "
        f"crew='{f.get('crew') or ''}' | route='{f.get('route') or ''}'"
    )
