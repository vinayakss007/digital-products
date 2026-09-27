# Store Listings — copy-paste ready for Gumroad / Payhip / Lemon Squeezy

Three products plus a bundle. For each: paste the title into the product name, the short
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

## 3. Invoice & Cash-Flow Kit — `dist/Invoice-CashFlow-Kit.zip`

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

### What's in the download
`invoice_script.gs` · `clients_sample.csv` (5 clients) · `invoices_sample.csv` (8 invoices, one per status so you can see the whole dashboard working immediately) · `README.md` · `QUICKSTART.txt`

### Price
**₹299** one-time. Invoicing tools charge that monthly.

**Tags:** invoice template, Google Sheets invoice, freelancer invoicing, PDF invoice generator, small business invoicing, cash flow template, Apps Script

---

## 4. Solo Business Starter Bundle — `dist/Solo-Business-Starter-Bundle.zip`

**Title:** Solo Business Starter Bundle — CRM, Invoicing & Prompt Pack

**Short description**
Three tools that cover the whole loop of working for yourself: get the lead, do the work, send the invoice. ₹599 instead of ₹797.

**Full description**

Every solo business runs the same loop, and most people buy a tool for one stage and ignore the rest.

- **CRM & Sales Tracker Template** — so leads stop going quiet before they say yes
- **Invoice & Cash-Flow Kit** — so the work you finished actually gets paid for
- **Small Business Prompt Pack** — for all the writing around the work you keep postponing

Each arrives as its own download and works alone. Together they cost less than two months of one SaaS seat.

**₹599** one-time · all three products · 30-day refund

**Tags:** business bundle, freelancer toolkit, small business templates, CRM, invoicing, AI prompts, startup tools

---

## Pricing and launch order

| Product | Launch | Target | Why |
|---|---|---|---|
| Prompt Pack | ₹199 | ₹249 | Cheapest yes. Volume and reviews. |
| CRM Template | ₹299 | ₹399 | Your existing product, now tested. |
| Invoice Kit | ₹299 | ₹399 | Same buyer as the CRM, different pain. |
| Bundle | ₹599 | ₹699 | Anchors the singles; best margin per sale. |

Suggested sequence:
1. List the **Prompt Pack** first — lowest friction, fastest feedback and reviews.
2. List the **Invoice Kit** next. It is the most complete product here and has the clearest before/after story.
3. Keep the **CRM** live at ₹299 with the ₹399 strike-through.
4. Add the **bundle** only after all three are selling, so the "₹797 separately" anchor is true.

After 10 sales, raise the prompt pack to ₹249. Do not discount below ₹199 — it signals the product is worth less than the effort of buying it.

## Before you go live

1. `python3 build_products.py --check` — regenerates and verifies all four ZIPs
2. `./tests/run_tests.sh` — all 196 checks should pass
3. Set your real store URLs in `site/products.js` (`BUY_LINKS`) — buy buttons say "not added yet" until you do
4. Replace `hello@leadstack.dev` in `site/*.html` with an inbox you actually read
5. Push `site/` — the GitHub Action publishes it to Netlify from `main`
