# CRM/Sales Tracker Template — User Guide

## What This Is
A ready-to-use Google Sheets CRM for solo founders, freelancers, and small sales teams. Track leads, manage pipeline, schedule follow-ups, and see dashboards — all inside Google Sheets, no software cost.

## Features
- ✅ Lead intake form (Google Forms linked)
- ✅ Pipeline tracking (cold → contacted → qualified → proposal → negotiation → closed won/lost)
- ✅ Automatic follow-up reminders via email
- ✅ Revenue forecasting
- ✅ Monthly/quarterly sales dashboard (auto-generated charts)
- ✅ Activity log for each lead
- ✅ Tags, source tracking, deal value

## How to Set Up (5 minutes)

### Step 1: Create the Sheet
1. Go to sheets.new
2. Paste the CSV data from Sheet1_Leads.csv into the first tab (name it "Leads")
3. Create tabs: "Pipeline", "Activities", "Dashboard", "Settings"

### Step 2: Add the Script
1. In Google Sheets, go to Extensions → Apps Script
2. Delete any default code
3. Paste the contents of `crm_script.gs`
4. Save (call it "CRM Tracker")
5. Click Run → accept permissions
6. Set up a trigger: click clock icon → Add Trigger → function `checkFollowUps` → Time-driven → Every day

### Step 3: Configure
1. Go to the Settings tab
2. Enter your email for follow-up reminders
3. Set your default follow-up interval (e.g., 3 days)

---

## What Makes This Different
Built by someone who actually builds CRM software. Most Notion/Excel templates are just lists. This one has:
- **Auto-reminders** — no manual follow-up tracking
- **Weighted pipeline** — see real revenue probability
- **Activity log** — know what you said to every lead
- **It's built to automate** — export + scripts, ready for escalation to a real CRM later
