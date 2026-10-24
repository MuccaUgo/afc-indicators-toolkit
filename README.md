# AFC Indicators Toolkit (prototype)

Interactive web version of the Excel toolkit used to prepare AFC Challenge 1 (Politecnico di Milano): type the financial statements, reclassify them, run the data checks, read the 24 course indicators and residual income, and export everything to Excel.

**Live page:** https://muccaugo.github.io/afc-indicators-toolkit/

## What it does
- Balance sheet and income statement entry with the same blocks and tags as the Excel toolkit (paste from Excel supported).
- Reclassification: fixed assets, net working capital, provisions, held for sale, net financial position, equity, invested capital, EBITDA, EBIT, net income.
- Data checks with a status that never reads "complete" on empty or partial data (`NO DATA YET`, `OK FOR 2 OF 3 YEARS`, `ALL CHECKS OK`, `CHECK THE DATA`).
- The 24 course indicators plus residual income, with a sensitivity table to the cost of capital k.
- Excel export (`Inputs`, `Reclass`, `Indicators`, `AI_Log`) with live formulas and cached values.
- A worked example (Campari Group, Annual Report 2025, with page references). Nothing else is preloaded.

## Privacy
Everything runs in the browser. Data is kept in local storage and never sent anywhere. The only external file is the ExcelJS library loaded from a CDN for the export.

## Status and limits
Prototype, not an official course tool. Common size, peer sheets and benchmark are not included: use the full Excel toolkit for those. Check every figure against the source report and declare any AI use in the AI disclosure annex.

## Tests run
- The calculation core reproduces all 186 indicator values of the Excel toolkit on two worked examples, with zero differences.
- The exported workbooks were recalculated with an independent engine: 285 formula cells per file match the cached values (status cell included).
- Not tested yet: opening the export in desktop Excel, Numbers and Google Sheets.

## Run locally
Open `index.html` in a browser (an internet connection is needed only for the Excel export library). Files: `index.html`, `ui.js` (interface), `core.js` (calculations and export), `data.js` (line specifications and the example).
