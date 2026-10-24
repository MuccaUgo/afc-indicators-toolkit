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
- Classification review: every line whose block or tag differs from the standard one, every spare or custom line in use, with its amount and share of total assets or sales, to be confirmed one by one (Reclass tab). The reconciliations cannot see a line moved to a wrong tag when both sides stay in balance; this list can. It is never part of the status.
- Rounding advice: when the balance check fails, the gap is compared with the largest rounding error that the typed figures can produce (figures x rounding unit / 2). Inside the limit the page suggests a tolerance and offers a button; above it, it says to check the figures.
- Add line / remove line on both statements for items the standard list does not have; the standard list has 2 spare lines per balance sheet block and 5 spare operating lines.
- Income statement by function (cost of sales, SG&A): one switch in Setup. Cost of sales goes on RAW, the other functional lines on GA, depreciation is typed once on the DA line (negative) and is added back inside G&A automatically, so EBIT does not change.
- Warnings outside the status: shares below 100,000 (probably typed in millions), earnings per share above 10,000, and depreciation typed positive.
- A worked example (Campari Group, Annual Report 2025, with page references). Nothing else is preloaded.

## Privacy
Everything runs in the browser. Data is kept in local storage and never sent anywhere. The only external file is the ExcelJS library loaded from a CDN for the export.

## Status and limits
Prototype, not an official course tool. Common size, peer sheets and benchmark are not included: use the full Excel toolkit for those. `ALL CHECKS OK` means every year in scope reconciles and has all the required inputs; it does not prove that the numbers match the report. Check every figure against the source report and declare any AI use in the AI disclosure annex.

## Tests run (25 October 2026, version 3)
- Course test folder, scripts unchanged, run on this version: core 26 of 26 scenarios, interface 14 of 14, export 6 of 6, company comparison 42 of 42 (ENI, TotalEnergies), Campari 16 of 16.
- Three real companies typed from their annual reports, each indicator compared with an independent calculation made from the published subtotals: Novartis, Becle and Moncler, 60 of 60 values each. Moncler reconciles exactly with the published subtotals.
- 23 deliberate input mistakes (sign flips, units, forgotten lines, wrong tags and blocks, shares in millions, depreciation sign): 11 turn the status to `CHECK THE DATA`, 2 raise a warning (shares typed in millions, depreciation typed positive), and 10 wrong tags or blocks keep `ALL CHECKS OK` but appear in the classification review for a person to confirm.
- The calculation core, the Excel toolkit and the page's Excel export give the same figures on 26 scenarios: 306 values per scenario template against site (0 differences) and 468 formula cells per scenario recalculated against the cached values (0 differences).
- Feature tests: 38 on the review list, rounding advice, custom lines, by-function switch and warnings; 33 on the interface (Node, minimal DOM); 27 earlier checks on validation and migration.
- Checked in a real browser: import of a project, rounding advice and its button, add line, review panel, unit warnings, export.
- Not tested yet: opening the export in desktop Excel, Numbers and Google Sheets.

## Run locally
Open `index.html` in a browser (an internet connection is needed only for the Excel export library). Files: `index.html`, `ui.js` (interface), `core.js` (calculations, validation and export), `data.js` (line specifications and the example).
