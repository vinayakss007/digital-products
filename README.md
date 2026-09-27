# Digital Products — LeadStack

A small catalog of sellable digital products, each one a working Google Sheets /
CSV / prompt tool rather than a pretty notion template. Everything here is
packaged for sale, tested before release, and served by a static storefront.

## The Catalog

| Product | Price | What the buyer gets |
|---|---|---|
| **CRM & Sales Tracker Template** | ₹299 | Google Apps Script CRM: one-click stage moves, daily follow-up emails, weighted pipeline, dashboard |
| **Proposals & Quotes Kit** | ₹349 | Apps Script quoting: numbered proposals, PDF with the deposit stated, expiry emails, win rate that ignores zombies, accepted quote becomes an invoice draft |
| **Invoice & Cash Flow Kit** | ₹299 | Apps Script invoicing: numbered invoices, one-click PDF in Drive, emailed PDFs, aging dashboard, 9am overdue email |
| **Small-Business Prompt Pack** | ₹199 | 120 prompts across 8 jobs, each with variables to fill, when to use it, expected output + 6 system prompts and a batch runner |
| **Solo Business Starter Bundle** | ₹749 | All four, ₹1,146 bought separately, with a "start here" guide that sequences them |

The three Apps Script products are written to be pasted into **one** spreadsheet
and coexist there: one composed `onOpen` menu per product, upserted (never wiped)
shared Settings rows, and a separate dashboard tab each. That is verified by
`tests/test_bundle_scripts.js`, not just claimed.

Store copy, pricing rationale, and the launch order live in
[`store-listings.md`](store-listings.md).

## Layout

```
crm-template/     Apps Script CRM + sample CSV + QUICKSTART.txt + README.md
proposals-kit/    Apps Script proposals/quotes + sample proposals & clients
invoice-kit/      Apps Script invoicing/cash-flow + sample clients & invoices
prompt-pack/      prompts.csv, system-prompts.md, context.txt, batch_runner.py
site/             storefront (index + one page per product), shared styles.css
tools/            sync_check_claims.py — keeps "N automated checks" honest
tests/            404 automated checks across nine suites
build_products.py builds and verifies the five ZIPs in dist/
store-listings.md copy-paste Gumroad/Payhip listings + go-live checklist
```

## Build The Products

```bash
python3 build_products.py            # all five ZIPs into dist/
python3 build_products.py --list     # show what would be built
python3 build_products.py --check    # build, then verify every ZIP opens cleanly
python3 build_products.py prompt-pack proposals-kit
```

`dist/` is gitignored — ZIPs are build artifacts, upload them to Gumroad/Payhip,
don't commit them.

## Test Before You Ship

```bash
./tests/run_tests.sh
```

Nine suites, 404 product checks. The Apps Script products run against a mock Apps
Script runtime (`tests/mock.js`) in Node's `vm`, so the real `.gs` files get
executed — menu wiring, aging buckets, PDF generation, email bodies, dashboard
output — without needing a Google account. The prompt pack is validated as data
(every prompt's declared variables match its actual `[BRACKETS]`, lengths,
category coverage). The storefront is validated for link/ID integrity and
escaping.

Keep the marketing honest, in two ways:
- The demo numbers on `site/*.html` are generated from actual script output
  against the sample CSVs, so if a test suite breaks, a selling claim is stale too.
- Every "N automated checks" figure on the site lives inside a
  `<span data-checks="…">` marker. `run_tests.sh` calls
  `tools/sync_check_claims.py`, which rewrites those numbers from the counts the
  suites just reported, and `storefront.test.js` then asserts the literal number in
  the file matches the measurement. Type "1,200 checks" into a page by hand and the
  build goes red instead of overselling.

## Storefront

Static, no build step. `site/products.js` is the single source of truth —
product copy, prices, and `BUY_LINKS`. Pages mount content via `data-*`
attributes and `site/store.js` renders it.

**To go live:** set your real Gumroad/Payhip URLs in `window.BUY_LINKS` in
`site/products.js`, replace `hello@leadstack.dev`, push `site/**` to `main`, and
the `Deploy Landing Page to Netlify` action publishes it.

## Legacy: WordPress Content Automator

`content_automator.py`, `setup.sh`, and `wp-content/` are an earlier, unrelated
experiment (scrape Hacker News → generate articles → publish to a local WordPress
with a TechRadar-style theme). It still works the same way:

```bash
./setup.sh          # installs WordPress + SQLite + theme locally
php -S 0.0.0.0:8000 # from ./wordpress
python3 content_automator.py
```

Nothing in the product catalog depends on it.
