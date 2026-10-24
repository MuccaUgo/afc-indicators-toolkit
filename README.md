# AFC Indicators Toolkit (prototype)

Interactive web version of the Excel toolkit used to prepare AFC Challenge 1 (Politecnico di Milano): type the financial statements, reclassify them, run the data checks, read the 24 course indicators and residual income, and export everything to Excel.

**Live page:** https://muccaugo.github.io/afc-indicators-toolkit/

## What it does
- Balance sheet and income statement entry with the same blocks and tags as the Excel toolkit (paste from Excel supported).
- Reclassification: fixed assets, net working capital, provisions, held for sale, net financial position, equity, invested capital, EBITDA, EBIT, net income.
- Data checks and a status that never reads "complete" on partial data: `CHECK THE DATA`, `NO DATA YET`, `INCOMPLETE INPUTS IN n OF m YEARS`, `OK FOR n OF m YEARS (k NOT FILLED)`, `ALL CHECKS OK`. The years in scope are chosen in Setup, so a report with two years can be complete.
- A missing input is `n/a`, never zero; an explicit 0 is a valid number. Hover an `n/a` to see what is missing.
- The 24 course indicators plus residual income, with a sensitivity table to the cost of capital k.
- Number format setting (automatic, English or European). Malformed numbers such as `--2` or `12,34,56` are rejected; `0,078` is read as 0.078.
- Safe import and restore: a project is validated and migrated before it replaces the current one; an invalid file or saved copy never overwrites your work and a backup is kept. A failed save is shown.
- Excel export (`Inputs`, `Reclass`, `Indicators`, `AI_Log`) with live formulas and cached values, including the years in scope on `Inputs` row 11.
- A worked example (Campari Group, Annual Report 2025, with page references). Nothing else is preloaded.

## Privacy
Everything runs in the browser. Data is kept in local storage and never sent anywhere. The only external file is the ExcelJS library loaded from a CDN for the export.

## Status and limits
Prototype, not an official course tool. Common size, peer sheets and benchmark are not included: use the full Excel toolkit for those. `ALL CHECKS OK` means every year in scope reconciles and has all the required inputs; it does not prove that the numbers match the report. Check every figure against the source report and declare any AI use in the AI disclosure annex.

## Tests run (24 October 2026)
- External test suite on the previous version (46 software scenarios, 14 not met): all 46 pass on this version, with 84 of 84 company comparisons (Campari, ENI, TotalEnergies) and 285-cell export recalculation agreeing.
- The calculation core and the Excel toolkit agree on 1,023 indicator values and 11 statuses over 11 what-if scenarios, and on 186 values over two worked examples.
- Ten exported workbooks (3,030 formula cells) match an independent recalculation, with no differences.
- Checked in a real browser: invalid and malformed imports, restore of a damaged saved project (backup kept), custom lines, blocked storage, number formats.
- Not tested yet: opening the export in desktop Excel, Numbers and Google Sheets.

## Run locally
Open `index.html` in a browser (an internet connection is needed only for the Excel export library). Files: `index.html`, `ui.js` (interface), `core.js` (calculations, validation and export), `data.js` (line specifications and the example).
