# Invoice & Cash-Flow Kit — User Guide

Send a professional PDF invoice and know exactly who owes you money, without paying for invoicing
software. Everything runs inside one Google Sheet.

Built for freelancers, consultants, agencies, and solo service providers who bill clients by hand
and chase payments over WhatsApp.

## What You Get

- `invoice_script.gs` — the automation, pasted into Google Apps Script
- `clients_sample.csv` — sample client rows so you can see the format
- `invoices_sample.csv` — 6 sample invoices covering paid, sent, overdue, and draft states
- `README.md` — this guide
- `QUICKSTART.txt` — one-page setup

## Setup (about 6 minutes)

### Step 1 — Create the sheet
1. Go to sheets.new and name it something like "Invoices 2026".
2. Do not create tabs by hand. The script makes them.

### Step 2 — Add the script
1. Extensions → Apps Script.
2. Delete the default code, paste all of `invoice_script.gs`, save.
3. Reload the sheet. A **🧾 Invoice Kit** menu appears.

### Step 3 — Run setup
1. Menu → **1. Run Setup (once)**. This creates the Clients, Invoices, Payments and Settings tabs
   and writes the column headers.
2. Fill in the **Settings** tab: your business name, address, email, tax ID, default tax rate, and
   payment terms in days.

### Step 4 — Add your clients
On the **Clients** tab, one row each: name, email, address, phone, GSTIN/tax ID.
The client name must match exactly what you type on the invoice — that is how the script finds the
email and address.

### Step 5 — Send your first invoice
1. Menu → **2. New Draft Invoice**. It picks the next number (INV-0001) and sets the due date from
   your payment terms.
2. Type the client name, then your line items in one cell, one per line:
   ```
   Website design | 1 | 45000
   Maintenance retainer | 3 | 5000
   ```
3. Menu → **3. Recalculate Totals** — writes subtotal, tax and total.
4. Menu → **4. Create PDF in Drive** — makes a clean invoice PDF in an "Invoices" Drive folder.
5. Menu → **5. Email PDF to Client** — sends it with the PDF attached and marks the row Sent.

### Step 6 — Get paid
When money lands, select the row and run **6. Mark Row as Paid**. It stamps the date, sets the
status, and appends to the Payments tab.

### Step 7 — Watch cash flow
**Refresh Cash-Flow Summary** rebuilds the Cash Flow tab: collected, outstanding, not-yet-due, and
overdue split into 1–30 / 31–60 / 60+ days, plus a month-by-month invoiced-vs-collected table.
**Chase Overdue Payments** drafts a reminder for everything late.

To get an email every morning at 9am listing overdue and soon-due invoices, use the menu
item **Install Daily Overdue Email**. If you prefer to do it by hand instead: Apps Script →
Triggers → Add Trigger → `dailyOverdueCheck` → Time-driven → Day timer.

## Changing Things

- **Different currency** — put USD, EUR or GBP in the Currency column per invoice, or change
  Default Currency in Settings. Symbols come from the `money_` helper.
- **No tax** — leave Tax % as 0 on that invoice.
- **Different numbering** — change Invoice Number Prefix in Settings (for example `2026/` or `ACME-`).
  It continues from the highest existing number.
- **Extra columns** — `CFG.col` at the top of the script maps every column index. Reorder your sheet,
  then update that block.

## Good To Know

- Line items are parsed as `Description | qty | rate`. Qty defaults to 1 if omitted.
- The PDF is generated from HTML, so if you want your logo on it, edit `buildInvoiceHtml_` — it is
  plain HTML and CSS.
- Deleting a draft invoice row can free its number for reuse. That is normal for drafts; once an
  invoice is sent, mark it Paid or edit the total rather than deleting the row.
- Client names are matched case-insensitively but must otherwise be identical.

## Licence

Single-buyer licence. Use it for all your own businesses. Do not resell or redistribute it.
