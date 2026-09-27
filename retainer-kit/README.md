# Retainer & Recurring Revenue Kit — User Guide

## What This Is
A Google Sheets retainer tracker for freelancers and solo agencies who have moved
past one-off projects. It keeps each monthly retainer on file with its fee, included
hours, overage rate and billing day; bills every due retainer as a draft invoice in one
click; and tells you which clients have quietly stopped generating work.

This is the stage after the invoice. Getting paid once is a form; getting paid *every
month* is a system, and the two things that break it are forgetting to bill and not
noticing a client has gone quiet until they cancel.

## What's In This Folder
| File | What it's for |
|---|---|
| `retainer_script.gs` | The whole engine. Paste into Extensions → Apps Script. |
| `retainers_sample.csv` | 9 retainers covering every state, including two that exist to be excluded. Paste into the Retainers tab to see the dashboard working immediately. |
| `hours_sample.csv` | 22 time entries, one of them deliberately mistyped so you can watch the reconciliation catch it. |
| `clients_sample.csv` | 5 sample clients with GSTINs. Same file the Invoice Kit and Proposals Kit ship. |
| `QUICKSTART.txt` | One-page setup, for when you don't want to read this. |

## Features
- ✅ **One-click monthly billing** — every due retainer becomes a numbered draft invoice on the Invoices tab, overage included
- ✅ **Cannot double-bill a month** — the period is stamped on the retainer row the moment it is billed, and a second run refuses
- ✅ **Overage from a plain hours log** — promised 20h, logged 22h → the extra 2h are billed at your overage rate, itemised on the invoice in words
- ✅ **Utilisation per client** — who is using their cover and who is costing you 40 reserved hours for 22
- ✅ **The quiet churn signal** — a client with no hours logged for three weeks is leaving; this is the only tool that tells you before they say so
- ✅ **Renewal tracking** — what ends within 30 days and how much monthly revenue dies with it
- ✅ **Stale-status detection** — a retainer whose end date passed but still says Active is separated out instead of inflating your MRR
- ✅ **Daily email** — due and unbilled, coming due, ending soon, gone quiet
- ✅ ₹ with Indian digit grouping (`₹1,10,920.00`), or switch to $ / € / £ in Settings

## Set Up (5 minutes)
1. Go to sheets.new, name the file something like "Retainers".
2. **Extensions → Apps Script**, delete the default code, paste all of `retainer_script.gs`, save.
3. Reload the sheet. A **📅 Retainers** menu appears.
4. **📅 Retainers → ⚙️ Run Setup (once)**. Creates: Retainers, Retainer Hours, Retainer
   Activities, Retainer Dashboard, Clients, Settings.
5. Fill in the Settings tab — business name, email, currency, tax rate, payment terms,
   how many days of silence counts as a warning, and how long a renewal runs.
6. Add each retainer on the Retainers tab, or use **🆕 New Retainer**. The client name must
   match the Clients tab exactly.
7. **⏰ Install Daily Billing Email**.

To see it working before you trust it: paste `retainers_sample.csv` into the Retainers tab
(replacing the headers) and `hours_sample.csv` into Retainer Hours, then hit
**📊 Refresh Dashboard**.

## The Columns That Matter
| Column | What it controls |
|---|---|
| Monthly Fee | What you bill before tax, each month. |
| Included Hours | The hours the fee covers. Log more and the excess is billable. |
| Overage Rate / hr | What an extra hour costs. Leave 0 to never bill overage. |
| Tax % | GST-style tax on this retainer. Same rounding rule as the Invoice Kit. |
| Billing Day | The day of the month it becomes due. Clamped to 1–28 so a month with 28 days can't skip you. |
| Status | Active / Paused / Cancelled. Only Active is ever billed. |
| Last Billed Period | Written by the billing run as `2026-09`. This is the double-billing guard — don't edit it by hand unless you mean to. |
| End (optional) | Leave blank for an open-ended retainer. Set it and the renewal warning starts 30 days out. |

## The Daily Loop
1. Log hours as you work on the **Retainer Hours** tab: date, client, retainer #, hours.
2. **🔎 Reconcile Hours Log** — finds entries against a retainer number that doesn't exist,
   hours that can't be real, dates that won't parse, and rows with neither a `Retainer #`
   nor a client name at all. Anything unreconciled is money you quietly worked and never
   billed. A row with no number but a client name is fine — it matches on the client.
3. On the 1st (or whatever billing day you set): **🧾 Bill Due Retainers**.
4. Each new draft lands on the Invoices tab — review it, then use the Invoice Kit's
   **Create PDF in Drive** and **Email PDF to Client** as normal.

## How The Money Is Calculated
Per retainer, for the current month:

```
logged        = Σ hours dated this month against this retainer #
overage hours = max(0, logged − included hours)
overage value = overage hours × overage rate
subtotal      = monthly fee + overage value
tax           = subtotal × tax % ÷ 100        (rounded to the paisa)
total         = subtotal + tax
```

Tax is computed the same way as the Invoice Kit and Proposals Kit, so a draft this kit
writes recalculates to the identical number over there. Nothing is rounded twice.

**A retainer is billed only when all of these hold:** it has a number, its status is Active,
it has not already been billed for this month, the fee is more than zero, its start date has
arrived, its end date has not passed, and today is on or after its billing day.

The same rule drives the dashboard, the daily email and the billing run — one function
decides it, so a report can never nag you about something the billing run would skip.

### Why MRR is not just "sum of active fees"
**Monthly Recurring** counts retainers that are *in force*: Active, started, and not yet
ended. A retainer that finished on the 31st is not recurring revenue, and a
client who went quiet because the engagement *ended* is not a churn risk. Both are
separated out rather than inflating the number you plan your month on. The dashboard lists
them under **Past End Date But Still Active** so you fix the status instead of the total.

## Converting To An Invoice
This kit writes straight into the **Invoices** tab:
- One row per due retainer, numbered by continuing the highest existing `INV-` number, so it
  won't collide with invoices you raised by hand or from a proposal.
- Status `Draft` — nothing is sent or emailed until you review it.
- Line items in plain words, e.g.
  ```
  Monthly retainer — 2026-09 | 1 | 85000
  Overage: 2h beyond 20h | 2 | 4500
  ```
- Due date from **Payment Terms (days)** in Settings.

Works with or without the Invoice Kit installed — if the Invoices tab doesn't exist, this
creates it with the right headers. With the Invoice Kit you get the PDF, the email and the
overdue tracking on top.

## Installing Alongside The Other LeadStack Products
All four Apps Script files are built to be pasted into **one** Apps Script project:
- Every internal helper here is prefixed `rr_`, so nothing collides.
- Apps Script allows only a single `onOpen`, so each file ships an identical composing
  `onOpen`. Whichever loads last builds every menu whose builder exists. Tested.
- **Settings** is a shared key/value tab. Each kit only *seeds* its own rows: a key that
  already holds a value is left alone, and an empty one is filled. Running all four setups
  leaves every setting present, and your GSTIN and address survive the second kit's setup
  instead of being reset to a placeholder.
- Each product writes its own dashboard: **Dashboard** (CRM), **Cash Flow** (Invoice Kit),
  **Proposal Dashboard** (Proposals), **Retainer Dashboard** (this). No two products clear
  the same tab.
- **Clients** and **Invoices** are genuinely shared, deliberately — same columns, so you
  don't maintain the customer list twice.
- A retainer invoice and a proposal deposit invoice allocate numbers from the same tab, in
  the same way, and can't hand out the same number twice.

## What This Does *Not* Do
Being straight about this saves you a support email:
- **It does not collect money.** It writes drafts. Payment happens by UPI, NEFT, Stripe or
  Razorpay, and you mark the invoice paid in the Invoice Kit.
- **No automatic invoice sending.** The billing run creates drafts on purpose. Sending money
  requests to a client without reading them first is how you lose a retainer.
- **No payment plan or subscription engine.** No retry logic, no failed-payment recovery, no
  dunning. That is what a payment processor is for.
- **Not a timesheet.** It measures hours against a retainer to compute overage. For billing
  by the minute, project costing or payroll, use time-tracking software.
- **No GST compliance claim.** A tax rate is applied and printed; that is not the same as a
  compliant GST invoice. Check your own obligations.
- **Monthly periods only.** Weekly, quarterly or annual retainers need the billing day and
  period edited in `rrPeriod_` — about five lines, and it is documented there.
- **No currency conversion.** A currency is a label; amounts are never re-rated.
- Hours are matched to a retainer by `Retainer #` when present. If you leave that column
  blank on a client with two retainers, the entry splits across them by client name and
  can bill the wrong one. Fill in the number.
- Google Sheets caps at 10 million cells. A decade of hourly logging will not reach it.

## Troubleshooting
**Menu doesn't appear** — after pasting, reload the sheet, then run any menu item once and
approve the permissions prompt.
**Billing run says "Nothing billed"** — the alert lists every retainer and the specific
reason it was skipped. It is nearly always `already billed for <this month>` (correct) or
`not due until day N` (your billing day hasn't arrived).
**An invoice total doesn't match the retainer fee** — overage was added. Open
**🔄 Recalculate Selected Retainer** to see the hours logged and the overage amount.
**Overage is zero but I know we went over** — the hours aren't matching: check the entry is
dated in the current month and carries the right `Retainer #`. **🔎 Reconcile Hours Log**
names the rows it can't match.
**MRR looks too low** — look at **Past End Date But Still Active**. A retainer with a passed
end date is excluded from MRR until you renew it or mark it Expired (⏱ Mark Ended Retainers
Expired does this in one go).
**A client keeps showing as gone quiet** — that's the point. Either they've stopped using
the cover (a renewal conversation), or they're on a project break (pause the retainer so you
stop being nagged and stop counting the fee as revenue).
**Hours entered but nothing changed** — the dashboard and email read the current calendar
month. Entries from last month stay in the log for history and never bill again.
**Emails aren't arriving in the morning** — the trigger installs on demand: ⏰ Install Daily
Billing Email. Apps Script free accounts have a daily quota; a huge list may hit it.
