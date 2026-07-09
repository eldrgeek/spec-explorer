# Spec Explorer

Query technical PDFs in plain language, and explore the Siemens breaker's diagrams as
clickable, navigable figures.

Built from two source documents:

- **Siemens 38 kV Vacuum Circuit Breaker (Type 38-3AF)** — instruction manual SG-3528
  (scanned; text recovered via OCR).
- **IEEE Std C57.119-2001** — Recommended Practice for Temperature Rise Tests on
  Oil-Immersed Power Transformers Beyond Nameplate Ratings.

## Two features

1. **Ask the documents** — natural-language questions answered by Claude, grounded only in
   the document text, with page-number citations.
2. **Diagram explorer** — interactive versions of:
   - **Figure 15** (p.12) *Stored Energy Operating Mechanism* — click any numbered callout to
     see the part name and what it does.
   - **Figure 17** (p.15) *Operator Sequential Operation Diagram* — click any step in the
     closing / anti-pump / tripping flowchart for a plain-English explanation (device codes
     like 52SRC, 52Y, 52T, LS21/22, 27, 88 decoded).

## Run locally

```bash
npm install
cp .env.example .env      # then set ANTHROPIC_API_KEY
npm start                 # http://localhost:4200
```

Optional: set `QUERY_PASSCODE` to require a shared code before any AI query runs
(protects API spend). If unset, queries are open.

## Deploy (Netlify)

- Static site is `public/`; the AI query runs as a Netlify Function (`netlify/functions/query.mjs`).
- Set env vars in Netlify: `ANTHROPIC_API_KEY` (required), `QUERY_PASSCODE` (recommended),
  `MODEL` (optional, default `claude-sonnet-5`).
- `netlify.toml` bundles the document corpus with the function and maps `/api/query`.

## How the assets were built

- Text: `pdftotext -layout` (IEEE) and per-page `tesseract` OCR (Siemens, scanned).
- Figure images: `pdftoppm` page render (Figure 15 full page; Figure 17 full page).
- Hotspot coordinates and part/step descriptions live in `public/data/figure15.json`
  and `public/data/figure17.json`, grounded in the manual's Interrupter/Operator Description.

---
Built by Mike Wolf with Claude (Opus 4.8), 2026-07-09.
