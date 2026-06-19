#!/usr/bin/env python3
"""Package the CRM template for distribution."""
import zipfile, os, json

BASE = "/tmp/digital-products/crm-template"
OUT = "/tmp/digital-products/CRM-Sales-Tracker-Template.zip"

files = [
    "README.md",
    "Sheet1_Leads.csv",
    "crm_script.gs",
]

with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED) as zf:
    for f in files:
        zf.write(os.path.join(BASE, f), arcname=f)
    # Also create a Setup Guide PDF placeholder
    guide = """CRM & Sales Tracker Template — Quick Start
===========================================
1. Go to sheets.google.com → Create
2. Create 5 tabs: Leads, Activities, Pipeline, Dashboard, Settings
3. Copy Sample_Data.csv into Leads tab
4. Extensions → Apps Script → paste crm_script.gs → Save → Run
5. Set up daily trigger for auto-follow-up reminders
6. Fill in your Settings tab

Your CRM is live!
"""

    zf.writestr("QUICKSTART.txt", guide)

print(f"Package created: {OUT}")
print(f"Size: {os.path.getsize(OUT)} bytes")
