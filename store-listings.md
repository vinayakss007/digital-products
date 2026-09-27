# Store Listings — copy-paste ready for Gumroad / Payhip / Lemon Squeezy

Five products plus a bundle. For each: paste the title into the product name, the short
description into the summary, the full description into the body, then the tags. Attach the
matching ZIP from `dist/`.

Build the downloads first:

```bash
python3 build_products.py --check
```

Prices are launch prices. Raise them after your first 10 sales, not before.

---

## 1. CRM & Sales Tracker Template — `dist/CRM-Sales-Tracker-Template.zip`

**Title (pick one)**
- CRM & Sales Tracker Template — Google Sheets
- LeadStack: CRM Template for Solo Founders & Freelancers
- Pipeline Tracker for Google Sheets — CRM Without the Subscription

**Short description**
Turn a messy lead list into a working sales pipeline in 5 minutes. Automated follow-up reminders, weighted revenue forecasting and a pipeline dashboard — all inside Google Sheets. Nothing to install, no subscription.

**Full description**

### The problem
You are not losing deals to better competitors. You are losing them because nobody followed up. The lead from three weeks ago is still warm — you just forgot.

This template fixes the forgetting.

### What it does
✅ **Lead database** — 17 columns: company, contact, value, source, stage, tags, notes
✅ **Automatic follow-up reminders** — a morning email listing every lead that is overdue, and nothing that is not
✅ **Weighted pipeline** — a ₹2,00,000 proposal at 60% shows as ₹1,20,000 of expected revenue, which is the number worth planning on
✅ **Revenue dashboard** — pipeline value, average deal size, conversion rate, deals lost, rebuilt on one click
✅ **One-click stage moves** — a menu that updates the stage, stamps the date, reschedules the follow-up and logs the change
✅ **Activity log** — every call and email recorded with a timestamp and who logged it

### Why it is not a free template
Free templates are lists with colours. This one runs scripts: it decides which of your leads need attention and tells you before you forget. Every feature above is backed by an automated test, and the sample data shows real states — including a lead in *Negotiating*, which most CRM templates silently drop out of their pipeline totals.

### Setup — 5 minutes
1. Create a Google Sheet → Extensions → Apps Script → paste `crm_script.gs`
2. Run setup once; it builds your tabs
3. Add your email on the Settings tab
4. Add one daily trigger
5. Paste in your leads

### Who it is for
Solo founders · freelancers with more than five live conversations · consultants tracking proposals · small teams of 2–10 without a CRM budget.

**Not for** teams needing permissions, roles or an audit trail. Get a real CRM for that.

### What's in the download
`crm_script.gs` · `Sheet1_Leads.csv` (7 sample leads) · `README.md` full guide · `QUICKSTART.txt`

### Price
**₹299** one-time. Use it in every business you own. 30-day refund, no questions.

**Tags:** CRM template, Google Sheets CRM, sales tracker, lead management, pipeline tracker, freelancer CRM, small business CRM, sales pipeline template

---

## 2. Small Business Prompt Pack — `dist/Small-Business-Prompt-Pack.zip`

**Title (pick one)**
- The Small Business Prompt Pack — 120 Prompts
- 120 AI Prompts That Produce Work You Can Actually Send
- Prompt Pack for Freelancers & Solo Founders

**Short description**
120 prompts with variables to fill, the moment to use each one, and what a correct answer looks like. Plus 6 reusable personas so you stop re-explaining your business to the AI every time.

**Full description**

### The problem is your prompts
"Write me a marketing email" gets you a paragraph you cannot send. Not because the AI is weak — because you asked it a question with no audience, no constraint and no format.

Every prompt in this pack has brackets you fill in and an output shape you can check the answer against.

### What's inside
120 prompts across 8 categories, 15 each:
- **Sales & Outreach** — cold email, 4-touch follow-ups, call prep, objection handling, proposals, win-backs
- **Marketing & Content** — calendars, hooks, repurposing one article into six formats, landing page audits
- **Email** — the difficult ones: price rises, delays, apologies, saying no without burning the relationship
- **Customer Handling** — complaints, refund policy, public reviews, onboarding, churn check-ins
- **Product & Operations** — specs, backlog prioritisation, process mapping, user interviews, runbooks
- **Pricing & Finance** — tier design, the price-rise email, payback maths, discount policy, cash forecast
- **Hiring & Team** — job posts that filter, work tests, interview red flags, the performance conversation
- **Research & Strategy** — market briefs that mark unverified claims, stress tests, decision matrices

Plus **6 personas** you paste once per chat: The Operator, The Copywriter, The Skeptic, The Analyst, The Systems Builder, The Teacher.

### What makes these different
Each prompt carries a format instruction and a length limit, bans the phrases that give AI writing away, and tells the model to mark invented facts instead of smuggling them in. That is the difference between output you delete and output you edit.

### Also included
`prompts.csv` — import into Google Sheets and filter by category
`context.txt` — describe your business once
`batch_runner.py` — optional script that fills your context into a whole category at once. Runs free in `--dry-run` mode with no API key, printing the assembled prompts.

### Works with
ChatGPT, Claude, Gemini, or any chat tool. No account, plugin or subscription needed.

**Tags:** AI prompts, ChatGPT prompts for business, prompt pack, freelancer tools, small business marketing, copywriting prompts, AI for business

---

## 3. Proposals & Quotes Kit — `dist/Proposals-Quotes-Kit.zip`

**Title (pick one)**
- Proposals & Quotes Kit for Google Sheets
- Send a Priced Proposal in 5 Minutes — No SaaS, No eSign Subscription
- Freelancer Quoting Template with Expiry and Deposit Tracking (Apps Script)

**Short description**
Write the scope once. Get a numbered PDF that states the deposit and the day the price expires, a morning email listing the proposals that are quietly dying, and a win rate that doesn't count ghosts as losses. An accepted quote becomes a draft invoice in one click.

**Full description**

### The gap this fills
A CRM tracks leads. An invoice tracks money owed. Almost nobody has a tool for the
stage in between — where the actual money is decided. You quoted three weeks ago, they
haven't replied, the price was never written down properly, and you can't tell a dead
proposal from a slow one.

### What it does
1. **New Draft Proposal** — next `PROP-` number, today's date, expiry date from your Settings
2. **Type the scope plainly** — `Website build | 40 | 1500`, one line per item
3. **Recalculate Totals** — subtotal, tax, total, and the deposit, stated in the document
4. **Create PDF in Drive** — clean client-facing layout: scope table, validity date, deposit terms, your GSTIN
5. **Email Proposal With PDF** — the real PDF attached, confirms the address first, moves the row to Sent
6. **Stage moves from a menu** — Sent → Follow-up → Negotiating → Accepted / Won / Lost, each stamped and logged
7. **Convert Accepted Proposal To Invoice** — the deposit (or the whole scope) becomes a numbered invoice draft
8. **Refresh Dashboard** — open value, weighted pipeline, win rate, what's expiring, what's lapsed

**The daily expiry email** lists proposals about to die within three days and the ones
already past their date while still marked open. On the shipped sample data it finds
`PROP-003`, `PROP-001` expiring and `PROP-007` — sent 56 days ago, still "Sent" — lapsed.
Won and Lost rows never appear. Neither does anything already expired; no nagging.

**Win rate that ignores zombies.** Expired proposals are excluded from the denominator,
because silence is not a "no" — and counting it as one makes your number look like a
sales problem when it's a follow-up problem. On the sample data: 66.7%.

### Details that matter when you're asking for money
- **The deposit is in the document**, in words and figures, before you start work
- **Deposit invoices are billed at 0% tax** — tax was already accounted for on the proposal total; taxing the deposit again would be wrong
- **Numbering can't collide** — proposal numbers continue from your highest, invoice numbers are allocated by reading existing ones
- **₹ with Indian digit grouping** (`₹2,23,020.00`), or $ / € / £ in Settings
- **Client names and scope text are HTML-escaped**, so a client called "R&D <Pvt> Ltd" cannot corrupt your PDF
- **195 automated checks** on totals, deposit maths, expiry rules, stage moves, escaping, and the shipped sample data run end to end

### Installing it next to the other LeadStack products
Paste both scripts into one Apps Script project and both menus appear. Settings rows are
seeded rather than overwritten, each product writes its own dashboard tab, and the convert
step feeds the Invoice Kit a real draft. All four spreadsheet products coexist under test,
not by hope.

### Honest limits
- **No digital signature or contract execution.** "Accepted" is a status you set because they said yes. For a legally signed scope document you need an e-sign tool or a lawyer.
- **No payment collection.** It calculates and invoices a deposit; UPI/Razorpay/Stripe happens in your payment app.
- **No compliance claims.** GSTIN and tax % are printed because Indian clients ask for them — that is not the same as a compliant GST invoice.
- **No CRM.** It starts at "I know who I'm pitching."
- PDF generation relies on Google's built-in HTML→PDF conversion inside Apps Script. If Google changes it, this is the piece that breaks first.

### What's in the download
`proposal_script.gs` · `proposals_sample.csv` (9 proposals covering every stage, including a lapsed zombie and an already-expired row) · `clients_sample.csv` (5 clients with GSTINs) · `README.md` · `QUICKSTART.txt`

### Price
**₹349** one-time. One e-sign or proposal SaaS seat costs more per month.

**Tags:** proposal template, google sheets proposal, freelance quotes, sales proposal, Apps Script, deposit invoice, proposal tracker

---

## 4. Invoice & Cash-Flow Kit — `dist/Invoice-CashFlow-Kit.zip`

**Title (pick one)**
- Invoice & Cash-Flow Kit for Google Sheets
- Send PDF Invoices from a Spreadsheet — Freelancer Invoicing Kit
- Invoicing + Overdue Tracking Template (Apps Script)

**Short description**
Type the work, click once, a clean PDF invoice exists and lands in your client's inbox. Then see exactly who owes you money and how many days late they are. No invoicing subscription.

**Full description**

### The problem
You did the work. The invoice lives in a half-finished Word file, the payment is three weeks late, and you cannot remember which client.

### The flow
1. **New Draft Invoice** — takes the next number, sets the due date from your payment terms
2. **Type line items plainly** — `Website design | 1 | 45000`, one per line
3. **Recalculate Totals** — subtotal, tax, total
4. **Create PDF in Drive** — your address, their GSTIN, itemised table, totals
5. **Email PDF to Client** — attached, with amount and due date, marks the row Sent
6. **Mark Row as Paid** — stamps the date and writes to your Payments log
7. **Refresh Cash-Flow Summary** — collected, outstanding, and overdue split into 1–30, 31–60, 60+ days

A daily 9am email can list what is overdue and what falls due within three days, so nothing depends on you remembering to check.

### Details that matter when money is involved
- **Indian number formatting** — ₹1,41,600, not ₹141,600
- **Sequential numbering** that continues from your highest existing invoice
- **Drafts never counted as receivables** — only what you actually sent counts as owed
- **Confirmation dialogs** before anything is emailed
- **Currency per invoice** — INR, USD, EUR, GBP or your own code
- **Client names are escaped**, so a client called "R&D <Pvt> Ltd" cannot corrupt your invoice PDF
- **92 automated checks** on totals, tax rounding, the overdue age bands, blank sheets and bad input

### Honest limits
It does not take card payments. There is no payment gateway — you collect by UPI, NEFT or your bank link and mark it paid. It is not a substitute for accounting software or GST filing.

### Installs next to the others
Paste `invoice_script.gs` and `proposal_script.gs` into the same Apps Script project and
you get both menus. They share the Clients and Invoices tabs deliberately, each keeps its
own Settings rows and its own dashboard tab (this one writes **Cash Flow**, the CRM writes
**Dashboard**, Proposals writes **Proposal Dashboard**, Retainer Kit writes **Retainer
Dashboard**), and an accepted proposal lands here as a numbered draft. Add the Retainer Kit
and a due retainer lands here as a numbered draft too — which is the point of the Invoices
tab being shared.

### What's in the download
`invoice_script.gs` · `clients_sample.csv` (5 clients) · `invoices_sample.csv` (8 invoices, one per status so you can see the whole dashboard working immediately) · `README.md` · `QUICKSTART.txt`

### Price
**₹299** one-time. Invoicing tools charge that monthly.

**Tags:** invoice template, Google Sheets invoice, freelancer invoicing, PDF invoice generator, small business invoicing, cash flow template, Apps Script

---

## 5. Retainer & Recurring Revenue Kit — `dist/Retainer-Recurring-Revenue-Kit.zip`

**Title (pick one)**
- Retainer & Recurring Revenue Kit for Google Sheets
- Bill Every Retainer In One Click — No Double Billing, Overage Included
- Monthly Retainer Tracker Template for Freelancers & Agencies (Apps Script)

**Short description**
One click turns every due retainer into a correctly-priced draft invoice, overage hours included. It cannot bill the same month twice, it shows MRR that counts only work actually running, and it flags the client who hasn't logged an hour in 34 days. No billing-software subscription.

**Full description**

### The problem is not invoicing. It's remembering to invoice.
You have four monthly retainers. One is billed on the 1st, one on the 28th, one you
always bill "when the work feels like enough", and one quietly finished in August while
still on your active list. The overage on the biggest one — 22 hours against a 20-hour
agreement — goes unbilled because working out what to add is a half hour of arithmetic
you never do.

That is not a discipline problem, it's a missing tool. Recurring revenue dies in the
gaps between "we agreed" and "I sent the invoice".

### What one click actually does
`🧾 Bill Due Retainers` looks at every retainer, decides what is billable, and writes a
**Draft** invoice per due retainer onto the Invoices tab:

```
Monthly retainer — 2026-09 | 1 | 85000
Overage: 2h beyond 20h | 2 | 4500
Subtotal ₹94,000 · Tax (18%) ₹16,920 · Total ₹1,10,920
```

Then it stamps the retainer row with `2026-09`. Run it again tomorrow and it bills
nothing — and shows you, per row, exactly why:

```
Nothing billed
RET-002 — not due until day 28
RET-005 — paused, not billable
RET-006 — already billed for 2026-09
RET-008 — ended 2026-08
RET-009 — starts 2026-10, not this month
```

That skip list is the product. A silent "nothing happened" would be useless; you'd never
know whether you were up to date or had lost a client.

### MRR that isn't padded
Eight rows say "Active" on the shipped sample. Six are actually live: one ended on 31 Aug
and nobody changed its status, another doesn't start until October. So MRR is **₹4,20,000**,
not ₹5,00,000 — and the ₹80,000 gap is shown to you as its own section, **Past End Date But
Still Active**, with one click to fix them all.

An inflated MRR is the most expensive lie a solo business tells itself, because it is the
number you decide your own pay rise on.

### The rest of the dashboard (real numbers from the shipped sample)
- **Unbilled & Due Now ₹3,79,960** — what a single click would invoice right now
- **Overage Billable ₹17,000** from 4 hours beyond included cover
- **Average Utilisation 70.4%**, per client, so you can see the ₹1,20,000 retainer using
  22 of 40 hours before the client does
- **Revenue At Risk ₹1,00,000** — a client who is both ending and gone quiet is counted
  once, not twice

### The 9am email
`Retainers: 4 unbilled, 2 at risk` — due and unbilled, what comes due within 3 days, what
ends within 30, and **days since the last logged hour** per client. That last one is the
earliest honest churn signal a solo business has: a client who stops emailing you isn't
happy, they're finished. On the sample it catches Meridian Clinic at 34 days silent on a
₹60,000/month retainer.

### Details that matter when it's your money
- **The double-billing guard lives in the data**, not in your memory: the period is stamped on the row
- **Billing day is per retainer**, clamped to 1–28 so a 31st never silently bills on the 1st
- **One source of truth for "is it billable"** — the dashboard, the email and the billing run all read the same function, so a report can never nag about something the run would skip
- **Overage only bills when there's an agreed threshold.** No included hours means a flat fee, so it never invents a surprise line the client didn't agree to
- **Invoice maths matches the Invoice Kit and Proposals Kit exactly** (`tax = round(subtotal × rate) / 100`), so a draft this kit writes recalculates there without drifting a rupee
- **Hours are matched by `Retainer #` first** — a client with two retainers would otherwise be billed the same hours twice
- **🔎 Reconcile Hours Log** names the typo, the 90-hour day, the undated entry — anything that quietly bills nothing
- **Drafts, always.** It never emails a client or marks anything sent

### Installing it next to the others
Paste all four `.gs` files into one Apps Script project and you get four menus. This kit
shares the Clients tab, writes to the same Invoices tab the Invoice Kit PDFs and chases,
keeps its own dashboard and its own Settings rows, and does not overwrite what the other
kits seeded. Verified by `tests/test_bundle_scripts.js`, which runs all four together.

### Honest limits
- **It does not collect money.** No UPI, no Razorpay, no payment links — it produces an invoice draft.
- **It does not chase.** Overdue follow-up is the Invoice Kit's job; it is deliberately not this kit's.
- **Not a timesheet.** Five columns exist to price a retainer. If you need per-task billing or client-visible logs, you need a time tool.
- **Not GST advice.** Tax % is applied because you asked for it; a composite-supply or reverse-charge case needs an accountant.
- **Monthly periods only.** Quarterly or annual retainers need a code change (`rrPeriod_`), which is one function and clearly marked.
- **No multi-currency conversion.** It prints the currency you set; it does not exchange.
- **Hours rows without a retainer number fall back to client name**, which double-counts for a client holding two retainers. Put the number in.

### What's in the download
`retainer_script.gs` · `retainers_sample.csv` (9 retainers — each one exists to demonstrate or exclude a rule, including the row that tests the double-billing guard) · `hours_sample.csv` (22 entries with one deliberate typo) · `clients_sample.csv` (5 clients with GSTINs) · `README.md` · `QUICKSTART.txt`

### Price
**₹399** one-time. One retainer you forgot to bill pays for it eleven times over.

**Tags:** retainer tracker, recurring billing, google sheets invoicing, freelancer retainer, subscription tracking, MRR template, apps script, overage billing

---

## 6. Solo Business Starter Bundle — `dist/Solo-Business-Starter-Bundle.zip`

**Title:** Solo Business Starter Bundle — CRM, Proposals, Invoicing, Retainers & Prompt Pack

**Short description**
Five tools that cover the whole loop of working for yourself: get the lead, price the work, win it, bill it, and keep billing it every month. ₹999 instead of ₹1,545.

**Full description**

Every solo business runs the same loop, and most people buy a tool for one stage and ignore the rest.

- **CRM & Sales Tracker Template** — so leads stop going quiet before they say yes
- **Proposals & Quotes Kit** — so the quote is priced, written down, dated, and turns into an invoice when they say yes
- **Invoice & Cash-Flow Kit** — so the work you finished actually gets paid for
- **Retainer & Recurring Revenue Kit** — so the monthly money arrives without you remembering to ask for it
- **Small Business Prompt Pack** — for all the writing around the work you keep postponing

Each arrives as its own download and works alone. The four spreadsheet tools are also
built to live in **one** Google Sheet: paste all four scripts into the same Apps Script
project and you get four menus, one shared client list, four dashboards that don't
overwrite each other, and one Invoices tab that both an accepted proposal and a due
retainer write into. A lead goes CRM → proposal → invoice → monthly retainer without
retyping a name. That coexistence is tested, not assumed — all four scripts are loaded
into one simulated Apps Script project in the test suite.

Bought one at a time they total ₹1,545. All five together: **₹999** — under two months of
one SaaS seat, paid once.

**₹999** one-time · all five products · 30-day refund

**Tags:** business bundle, freelancer toolkit, small business templates, CRM, invoicing, proposals, retainer tracking, AI prompts, startup tools

---

## Pricing and launch order

| Product | Launch | Target | Why |
|---|---|---|---|
| Prompt Pack | ₹199 | ₹249 | Cheapest yes. Volume and reviews. |
| CRM Template | ₹299 | ₹399 | Your existing product, now tested. |
| Invoice Kit | ₹299 | ₹399 | Same buyer as the CRM, different pain. |
| Proposals & Quotes Kit | ₹349 | ₹449 | Priced above the singles because it spans two stages and converts into the Invoice Kit. |
| Retainer & Recurring Revenue Kit | ₹399 | ₹499 | Highest single price: it protects recurring revenue, and the buyer already trusts the invoicing maths. |
| Bundle | ₹999 | ₹1,199 | Anchored on ₹1,545 of singles at the same ~65% ratio the four-product bundle used. |

Suggested sequence:
1. List the **Prompt Pack** first — lowest friction, fastest feedback and reviews.
2. List the **Invoice Kit** next. It is the most complete product here and has the clearest before/after story.
3. Keep the **CRM** live at ₹299 with the ₹399 strike-through.
4. List **Proposals** once the Invoice Kit has a review or two — its pitch ends inside the Invoice Kit, so buyers of one are the audience for the other.
5. Add the **Retainer Kit** once the Invoice Kit is selling — its pitch ends on the Invoices tab, so it inherits that product's buyers.
6. Add the **bundle** only after all five are selling, so the "₹1,545 separately" anchor is true.

After 10 sales, raise the prompt pack to ₹249. Do not discount below ₹199 — it signals the product is worth less than the effort of buying it.

## Before you go live

1. `./tests/run_tests.sh` — eleven suites, all 795 product checks should pass; this also rewrites the "N automated checks" claims on the site from what the suites actually measured
2. `python3 build_products.py --check` — regenerates and verifies all six ZIPs
3. Set your real store URLs in `site/products.js` (`BUY_LINKS`) — buy buttons say "not added yet" until you do
4. Replace `hello@leadstack.dev` in `site/*.html` with an inbox you actually read
5. Push `site/` — the GitHub Action publishes it to Netlify from `main`
