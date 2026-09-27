# Proposals & Quotes Kit — User Guide

## What This Is
A Google Sheets proposal generator for freelancers and solo agencies. You write the
scope once, it prices the work, formats a PDF, emails it with the deposit spelled
out, and — when they say yes — turns the accepted scope into a draft invoice.

This is the missing middle between a CRM (leads) and an invoice (money owed). Most
people lose deals in this gap: no priced document, no expiry, no idea which proposals
are quietly dying.

## What's In This Folder
| File | What it's for |
|---|---|
| `proposal_script.gs` | The whole engine. Paste into Extensions → Apps Script. |
| `proposals_sample.csv` | 9 realistic proposals covering every stage. Paste into the Proposals tab to see a working dashboard immediately, or delete before adding your own. |
| `clients_sample.csv` | 5 sample clients with GSTINs. Delete any time. |
| `QUICKSTART.txt` | One-page setup, for when you don't want to read this. |

## Features
- ✅ **One-click PDF proposal** saved to its own Drive folder, formatted for a client's eyes, not a spreadsheet's
- ✅ **Deposit maths** — every proposal states the deposit up front, so nobody starts work on a handshake
- ✅ **Sequential numbering** (`PROP-001`, `PROP-002`…) that never skips or repeats
- ✅ **Validity dates that expire themselves** — a menu item marks lapsed proposals Expired, and a daily email lists what's about to die
- ✅ **Weighted pipeline** using win-chances you set per stage on the Proposal Stages tab
- ✅ **Win rate that excludes zombies** — expired proposals don't count as losses, so the number means something
- ✅ **Convert to invoice** — pushes the accepted scope (or just the deposit) into an invoice draft
- ✅ **Chase email** written to reopen a conversation without discounting first
- ✅ ₹ with Indian digit grouping (`₹2,23,020.00`), or switch to $ / € / £ in Settings

## Set Up (5 minutes)
1. Go to sheets.new, name the file something like "Proposals".
2. **Extensions → Apps Script**, delete the default code, paste all of `proposal_script.gs`, save.
3. Reload the sheet. A **📄 Proposals** menu appears.
4. **📄 Proposals → ⚙️ Run Setup (once)**. This creates the tabs: Proposals, Clients,
   Proposal Stages, Proposal Activities, Proposal Dashboard, Settings.
5. Fill in the Settings tab — business name, address, email, GSTIN, default tax rate,
   deposit %, how many days a price holds.
6. Add your clients (name, email, address, GSTIN). The client name on a proposal must
   match the Clients tab exactly, or the PDF has nowhere to send it.
7. **⏰ Install Daily Expiry Email** so the morning note starts arriving.

To see it working before you trust it with a real client: paste `proposals_sample.csv`
into the Proposals tab (starting at A1, replacing the headers) and hit
**📊 Refresh Dashboard**.

## The Daily Loop
1. **🆕 New Draft Proposal** — a numbered row appears with today's date and an expiry date from your Settings.
2. Type the client, then the scope, one line per item:
   ```
   Website build | 40 | 1500
   Two revision rounds | 2 | 12000
   ```
   Quantity and rate are optional; a line of just text prices at zero.
3. **🔄 Recalculate Totals For Selected** — subtotal, tax, total, deposit.
4. **📧 Email Proposal With PDF** — confirms the address, generates the PDF into your
   Drive folder, attaches the real PDF, and moves the row to Sent.
5. When they say yes: **➡️ Accepted**, then **🧾 Convert Accepted Proposal To Invoice**.
6. Everything else is logged automatically. Add your own notes with **📝 Log Activity**.

## How The Money Is Calculated
- **Subtotal** = Σ (quantity × rate) over the scope lines.
- **Tax** = subtotal × tax % ÷ 100, rounded to the paisa.
- **Total** = subtotal + tax.
- **Deposit** = total × deposit % ÷ 100.
- **Weighted pipeline** = Σ (open proposal total × that stage's win chance). Only open
  proposals count — Won, Lost and Expired are out.
- **Win rate** = (Accepted + Won) ÷ (Accepted + Won + Lost). Expired is deliberately
  excluded: a proposal nobody answered is not the same as a "no", and counting it as
  one buries the number you actually care about.

Change any stage's win chance on the **Proposal Stages** tab. The defaults (Sent 15%,
Follow-up 35%, Negotiating 60%, Accepted 90%) are a reasonable starting point, not truth.

## Converting To An Invoice
**🧾 Convert Accepted Proposal To Invoice** creates a draft row on the Invoices tab:
- If a deposit is set, it bills **the deposit only**, at 0% tax. Tax was already
  accounted for on the proposal total; taxing the deposit again would be wrong. The
  line item says so in words: `Deposit against PROP-004 (40% of ₹4,01,200.00)`.
- If there's no deposit, it copies the whole scope across at the proposal's tax rate.
- Invoice numbers are allocated by looking at the highest existing `INV-` number, so it
  won't collide with invoices you raised by hand.

Works with or without the Invoice Kit installed — if the Invoices tab doesn't exist,
this creates it with the right headers.

## Installing Alongside The Other LeadStack Products
The four spreadsheet scripts are built to be pasted into **one** Apps Script project:
- Every internal helper here is prefixed `pr_`, so nothing collides.
- Apps Script only allows a single `onOpen`, so each file ships an identical composing
  `onOpen`. Whichever loads last builds every menu whose builder exists. No product's menu
  can steal the name, and it is tested.
- **Settings** is a shared key/value tab. Each kit only *seeds* its own rows: a key that
  already holds a value is left alone. Running all four setups leaves every setting present
  and keeps the GSTIN and address you typed for the Invoice Kit.
- Each product writes its own dashboard: **Dashboard** (CRM), **Cash Flow** (Invoice
  Kit), **Proposal Dashboard** (this), **Retainer Dashboard** (Retainer Kit). No two
  products clear the same tab.
- **Clients** and **Invoices** are genuinely shared with the Invoice Kit, deliberately —
  same columns, so you don't maintain the customer list twice.

## What This Does *Not* Do
Being straight about this saves you a support email:
- **No digital signatures or contract execution.** "Accepted" is a status you set because
  they said yes. If you need a legally signed scope document, you need a proposal-to-contract
  tool or a lawyer, not a spreadsheet.
- **No payment collection.** It calculates a deposit and invoices it. UPI/Stripe/Razorpay
  collection happens in your payment app.
- **No e-invoicing or country-specific compliance.** GSTIN and tax % are printed because
  Indian clients ask for them; that isn't the same as generating a compliant GST invoice.
  Check your own obligations.
- **No CRM.** It starts at "I know who I'm pitching." Lead tracking is the CRM template.
- **No multi-currency conversion.** A currency is a label; it never re-rates amounts.
- PDF generation needs Google's built-in HTML→PDF conversion inside Apps Script. If Google
  changes that, this is the piece that breaks first.
- Google Sheets caps at 10 million cells. You will not reach it with proposals.

## Troubleshooting
**Menu doesn't appear** — after pasting, reload the sheet, then run any menu item once and
approve the permissions prompt.
**"No client email"** — the proposal's client name doesn't match the Clients tab exactly,
or that client has no email. The PDF is still saved to Drive so you can attach it manually.
**Totals look wrong** — check the scope lines use `|` (pipe), not a comma, and that the
tax cell is `18`, not `0.18`.
**PDF shows ₹0.00** — that proposal row has no priced scope lines; run Recalculate Totals first.
**A proposal keeps showing in the expiry email** — the email covers rows that are genuinely
still in play (Sent, Follow-up, Negotiating). Accepted, Won, Lost, Expired and Draft rows are
silent. "Sent, but they actually said no three weeks ago" still reads as open — close it.
**Emails aren't arriving in the morning** — the trigger installs on demand: ⏰ Install Daily
Expiry Email. Apps Script free accounts have a daily quota; a huge proposal list may hit it.
