# Pilot Logbook (PWA)

An offline-first Progressive Web App reproducing the **Airservices Australia**
pilot logbook layout (21 entries per page + carried-forward / this-page /
new-totals rows). Works on phone and desktop, installs to the home screen, and
needs **no backend** — data lives in the browser (IndexedDB) and is designed to
sync to a GitHub repo (free storage + version history).

## Stack

- **Vite + React + TypeScript**
- **Tailwind CSS** for styling
- **IndexedDB** (via `idb`) for offline storage
- **vite-plugin-pwa** for installability + offline caching

## Getting started

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build to dist/
npm run preview    # preview the production build
```

## Data pipeline

The historical logbook was migrated from the master Excel workbook with 100%
numeric fidelity. Scripts live in `migration/`:

| Script | Purpose |
| --- | --- |
| `migrate.py` | Extract every flight from the Excel `LOG BOOK` sheet, split each note (cell comment) into crew / route / remarks, and reconcile totals against the pilot's own page totals. |
| `enrich.py` | Strip the aircraft rego out of the note and assign the aircraft type using the per-type sheets. Flags anything uncertain to `rego_review.csv`. |
| `build_seed.py` | Produce `src/data/logbook-data.json` (opening balance + reconciliation adjustments + all flights) used to seed the app. |

Regenerate the seed after editing the migration:

```bash
npm run seed
```

### Accuracy

Every flight value is copied verbatim from the source cells. On 84 of 87 pages
the extracted entries reconcile exactly with the pilot's own page totals; the
remaining differences are pre-existing inconsistencies in the source
spreadsheet, preserved and documented in `migration/reconciliation_report.json`.
The seed includes a per-column `adjustments` value so the app's grand total
reproduces the recorded Excel "totals to date" exactly.

## Roadmap

- [ ] Voice entry (dictate a flight, parse into fields)
- [ ] GitHub sync (commit the logbook JSON to a repo via the GitHub API)
- [ ] Work through the 22 `needsReview` flights
- [ ] Deploy to GitHub Pages
