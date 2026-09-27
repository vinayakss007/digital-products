# CRM/Sales Tracker Template — User Guide

## What This Is
A ready-to-use Google Sheets CRM for solo founders, freelancers, and small sales teams. Track leads, manage pipeline, schedule follow-ups, and see dashboards — all inside Google Sheets, no software cost.

## Features
- ✅ One-click stage moves from the **📊 CRM Tools** menu (no typing statuses)
- ✅ Pipeline tracking (cold → contacted → qualified → proposal → negotiation → closed won/lost)
- ✅ Automatic follow-up reminders via email, with a menu item to install the daily trigger
- ✅ Revenue forecasting (weighted pipeline using the % in the Pipeline tab)
- ✅ Monthly/quarterly sales dashboard (auto-generated)
- ✅ Activity log for each lead, plus "Log Activity For Selected Lead"
- ✅ Tags, source tracking, deal value, overdue vs. upcoming breakdown
- ✅ ₹ formatting with Indian digit grouping (₹1,41,600)

## How to Set Up (5 minutes)

### Step 1: Create the Sheet
1. Go to sheets.new
2. Paste the CSV data from Sheet1_Leads.csv into the first tab (name it "Leads")
3. Or skip the manual tabs — Step 2's setup run creates them for you

### Step 2: Add the Script
1. In Google Sheets, go to Extensions → Apps Script
2. Delete any default code
3. Paste the contents of `crm_script.gs`
4. Save (call it "CRM Tracker") and reload the sheet
5. Click **📊 CRM Tools → ⚙️ Run Setup (once)** — this creates Leads/Activities/Pipeline/Dashboard/Settings, writes the Settings defaults, and fills in the stage weights
6. Accept the permissions prompt when it appears

### Step 3: Configure
1. Go to the Settings tab
2. Enter your email for follow-up reminders
3. Set your default follow-up interval (e.g., 3 days) and monthly target

### Step 4: Turn On Daily Reminders
Click **📊 CRM Tools → ⏰ Install Daily Reminder Trigger**. That's it — no clock icon hunting. Every morning at 9am you get one email listing overdue and upcoming follow-ups. **📧 Check Follow-ups Now** does the same thing on demand.

## Using The Menu
Select any cell in a lead's row, then:
- **🔄 Update Dashboard** — recompute pipeline value, win rate, monthly table
- **📝 Log Activity For Selected Lead** — pop a box, write what happened; it stamps Last Contacted and updates the dashboard
- **➡️ Move Selected Lead To Stage** — sets the status and reschedules the next follow-up in one click
- **📧 Check Follow-ups Now** / **⏰ Install Daily Reminder Trigger** / **⚙️ Run Setup (once)**

## What Counts As "Open"
Anything that isn't Closed Won, Closed Lost, Inactive, or Done is treated as an active lead and appears in reminders and the weighted pipeline. You don't have to keep the word "Active" in the status for a lead to be tracked.

---

## What Makes This Different
Built by someone who actually builds CRM software. Most Notion/Excel templates are just lists. This one has:
- **One-click stage moves** — the menu does the status change, follow-up reschedule, and dashboard refresh together
- **Auto-reminders** — no manual follow-up tracking, and overdue leads are separated from upcoming ones
- **Weighted pipeline** — see real revenue probability, not a hopeful total
- **Activity log** — know what you said to every lead
- **It's built to automate** — export + scripts, ready for escalation to a real CRM later
