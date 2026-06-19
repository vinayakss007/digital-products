/**
 * CRM/Sales Tracker — Google Apps Script
 * =======================================
 * Paste this entire file into Extensions → Apps Script in Google Sheets.
 * 
 * Features:
 * - Daily follow-up email reminders
 * - Dashboard metrics calculation
 * - Pipeline stage probabilities
 * - Lead stage progress tracking
 * - Settings management
 */

// ─── CONFIGURATION ──────────────────────────────────────────────────────────
const CONFIG = {
  settingsSheet: 'Settings',
  leadsSheet: 'Leads',
  activitiesSheet: 'Activities',
  pipelineSheet: 'Pipeline',
  dashboardSheet: 'Dashboard',
  leadColumns: {
    id: 0, company: 1, contact: 2, email: 3, phone: 4,
    source: 5, stage: 6, value: 7, probability: 8, expectedValue: 9,
    tags: 10, notes: 11, assigned: 12, created: 13,
    lastContacted: 14, nextFollowUp: 15, status: 16
  }
};

// ─── SETUP — Creates all sheets and headers ───────────────────────────────
function setupTemplate() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  const sheets = ['Leads', 'Activities', 'Pipeline', 'Dashboard', 'Settings'];
  sheets.forEach(name => {
    if (!ss.getSheetByName(name)) {
      ss.insertSheet(name);
    }
  });

  // Settings defaults
  const settings = ss.getSheetByName('Settings');
  settings.clear();
  settings.getRange('A1:B1').setValues([['Setting', 'Value']]);
  settings.getRange('A2:B8').setValues([
    ['Your Email', Session.getActiveUser().getEmail()],
    ['Default Follow-up Days', '3'],
    ['Sales Target (Monthly ₹)', '500000'],
    ['Currency', 'INR'],
    ['Company Name', 'Your Company'],
    ['Auto-Reminder Enabled', 'TRUE'],
    ['Reminder Time (24h)', '09:00']
  ]);
  settings.getRange('A1:B1').setFontWeight('bold');

  // Pipeline stage config
  const pipeline = ss.getSheetByName('Pipeline');
  pipeline.clear();
  pipeline.getRange('A1:D1').setValues([['Stage', 'Order', 'Weight (%)', 'Notes']]);
  pipeline.getRange('A2:D8').setValues([
    ['Cold', 1, 10, 'Initial contact, no response'],
    ['Contacted', 2, 20, 'Had a conversation'],
    ['Qualified', 3, 40, 'Has need + budget identified'],
    ['Proposal', 4, 60, 'Sent quote/proposal'],
    ['Negotiation', 5, 80, 'Negotiating terms'],
    ['Closed Won', 6, 100, 'Deal closed'],
    ['Closed Lost', 7, 0, 'Lost deal']
  ]);
  pipeline.getRange('A1:D1').setFontWeight('bold');
}

// ─── DAILY FOLLOW-UP CHECK ────────────────────────────────────────────────
function checkFollowUps() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const settings = ss.getSheetByName(CONFIG.settingsSheet);
  const enabled = settings.getRange('A7:B7').getValues()[0][1];
  if (enabled.toString().toUpperCase() !== 'TRUE') return;

  const userEmail = settings.getRange('A2:B2').getValues()[0][1];
  const sheet = ss.getSheetByName(CONFIG.leadsSheet);
  const data = sheet.getDataRange().getValues();
  
  if (data.length < 2) return; // Only headers
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  let dueLeads = [];
  
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const status = row[CONFIG.leadColumns.status]?.toString() || '';
    if (status !== 'Active') continue;
    
    const followUpStr = row[CONFIG.leadColumns.nextFollowUp];
    if (!followUpStr) continue;
    
    const followUp = new Date(followUpStr);
    followUp.setHours(0, 0, 0, 0);
    
    if (followUp <= today) {
      dueLeads.push({
        company: row[CONFIG.leadColumns.company],
        contact: row[CONFIG.leadColumns.contact],
        stage: row[CONFIG.leadColumns.stage],
        value: row[CONFIG.leadColumns.value],
        notes: row[CONFIG.leadColumns.notes],
        row: i + 1
      });
    }
  }
  
  if (dueLeads.length > 0) {
    sendFollowUpEmail(userEmail, dueLeads);
  }
}

// ─── SEND EMAIL REMINDER ──────────────────────────────────────────────────
function sendFollowUpEmail(email, leads) {
  let html = `
    <h2>📋 Follow-Up Reminder</h2>
    <p>You have <strong>${leads.length}</strong> lead(s) due for follow-up today:</p>
    <table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse; width:100%">
      <tr style="background:#f0f0f0;">
        <th>Company</th><th>Contact</th><th>Stage</th><th>Value (₹)</th><th>Notes</th>
      </tr>`;
  
  leads.forEach(l => {
    html += `<tr>
      <td>${l.company}</td>
      <td>${l.contact}</td>
      <td>${l.stage}</td>
      <td>${l.value?.toLocaleString() || '-'}</td>
      <td>${l.notes || '-'}</td>
    </tr>`;
  });
  
  html += `</table>
    <p><em>Open your CRM tracker to update these leads.</em></p>`;
  
  MailApp.sendEmail({
    to: email,
    subject: `CRM Reminder: ${leads.length} lead(s) need follow-up today`,
    htmlBody: html
  });
}

// ─── DASHBOARD — Calculates metrics ──────────────────────────────────────
function updateDashboard() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.leadsSheet);
  const data = sheet.getDataRange().getValues();
  
  if (data.length < 2) return;
  
  const leads = data.slice(1);
  const activeLeads = leads.filter(r => (r[CONFIG.leadColumns.status] || '').toString() === 'Active');
  const wonLeads = leads.filter(r => (r[CONFIG.leadColumns.stage] || '').toString() === 'Closed Won');
  const lostLeads = leads.filter(r => (r[CONFIG.leadColumns.stage] || '').toString() === 'Closed Lost');
  
  // Calculations
  const totalPipeline = activeLeads.reduce((sum, r) => sum + (Number(r[CONFIG.leadColumns.expectedValue]) || 0), 0);
  const totalWon = wonLeads.reduce((sum, r) => sum + (Number(r[CONFIG.leadColumns.value]) || 0), 0);
  const avgDealSize = activeLeads.length > 0 
    ? activeLeads.reduce((sum, r) => sum + (Number(r[CONFIG.leadColumns.value]) || 0), 0) / activeLeads.length
    : 0;
  const conversionRate = (wonLeads.length + lostLeads.length) > 0
    ? (wonLeads.length / (wonLeads.length + lostLeads.length)) * 100
    : 0;
  
  // Pipeline by stage
  const stages = ['Cold', 'Contacted', 'Qualified', 'Proposal', 'Negotiation', 'Closed Won', 'Closed Lost'];
  const stageData = stages.map(stage => {
    const stageLeads = leads.filter(r => (r[CONFIG.leadColumns.stage] || '').toString() === stage);
    return {
      stage,
      count: stageLeads.length,
      value: stageLeads.reduce((s, r) => s + (Number(r[CONFIG.leadColumns.value]) || 0), 0)
    };
  });
  
  // Write to Dashboard sheet
  const dash = ss.getSheetByName(CONFIG.dashboardSheet);
  dash.clear();
  
  let row = 1;
  dash.getRange(row, 1, 1, 2).setValues([['KPI', 'Value']]).setFontWeight('bold');
  row++;
  dash.getRange(row, 1, 1, 2).setValues([['Total Leads', leads.length]]); row++;
  dash.getRange(row, 1, 1, 2).setValues([['Active Leads', activeLeads.length]]); row++;
  dash.getRange(row, 1, 1, 2).setValues([['Pipeline Value (₹)', totalPipeline.toLocaleString()]]); row++;
  dash.getRange(row, 1, 1, 2).setValues([['Closed Won (₹)', totalWon.toLocaleString()]]); row++;
  dash.getRange(row, 1, 1, 2).setValues([['Avg Deal Size (₹)', Math.round(avgDealSize).toLocaleString()]]); row++;
  dash.getRange(row, 1, 1, 2).setValues([['Conversion Rate', conversionRate.toFixed(1) + '%']]); row++;
  dash.getRange(row, 1, 1, 2).setValues([['Lost Deals', lostLeads.length]]); row++;
  
  row += 2;
  dash.getRange(row, 1, 1, 3).setValues([['Pipeline by Stage', 'Count', 'Value (₹)']]).setFontWeight('bold');
  row++;
  stageData.forEach(sd => {
    dash.getRange(row, 1, 1, 3).setValues([[sd.stage, sd.count, sd.value.toLocaleString()]]);
    row++;
  });
}

// ─── LOG ACTIVITY ─────────────────────────────────────────────────────────
function logActivity(leadId, action, notes) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.activitiesSheet);
  
  // Create headers if empty
  if (sheet.getLastRow() === 0) {
    sheet.getRange('A1:E1').setValues([['Lead ID', 'Date', 'Action', 'Notes', 'Logged By']]);
    sheet.getRange('A1:E1').setFontWeight('bold');
  }
  
  const lastRow = sheet.getLastRow() + 1;
  sheet.getRange(lastRow, 1, 1, 5).setValues([[
    leadId,
    new Date(),
    action,
    notes || '',
    Session.getActiveUser().getEmail()
  ]]);
}

// ─── STAGE UPDATER — Move lead and log it ────────────────────────────────
function moveToStage(leadRow, newStage) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.leadsSheet);
  const stageCol = CONFIG.leadColumns.stage + 1; // 1-indexed
  const leadId = sheet.getRange(leadRow, CONFIG.leadColumns.id + 1).getValue();
  
  sheet.getRange(leadRow, stageCol).setValue(newStage);
  sheet.getRange(leadRow, CONFIG.leadColumns.lastContacted + 1).setValue(new Date());
  
  logActivity(leadId, `Moved to ${newStage}`, '');
  
  // Auto-update status
  const now = new Date();
  const settings = ss.getSheetByName(CONFIG.settingsSheet);
  const defaultDays = Number(settings.getRange('A3:B3').getValues()[0][1] || 3);
  const nextFollowUp = new Date(now);
  nextFollowUp.setDate(nextFollowUp.getDate() + defaultDays);
  
  if (['Closed Won', 'Closed Lost'].includes(newStage)) {
    sheet.getRange(leadRow, CONFIG.leadColumns.status + 1).setValue(
      newStage === 'Closed Won' ? 'Won' : 'Lost'
    );
    sheet.getRange(leadRow, CONFIG.leadColumns.nextFollowUp + 1).setValue('N/A');
  } else {
    sheet.getRange(leadRow, CONFIG.leadColumns.nextFollowUp + 1).setValue(nextFollowUp);
    sheet.getRange(leadRow, CONFIG.leadColumns.status + 1).setValue('Active');
  }
  
  updateDashboard();
}

// ─── MENU — Adds custom menu on open ──────────────────────────────────────
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  const menu = ui.createMenu('📊 CRM Tools');
  menu.addItem('🔄 Update Dashboard', 'updateDashboard');
  menu.addItem('⚙️ Run Setup', 'setupTemplate');
  menu.addSeparator();
  menu.addItem('📧 Check Follow-ups Now', 'checkFollowUps');
  menu.addToUi();
}

// ─── INSTALL — Run once to set up trigger ─────────────────────────────────
function installTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  const hasTrigger = triggers.some(t => t.getHandlerFunction() === 'checkFollowUps');
  
  if (!hasTrigger) {
    ScriptApp.newTrigger('checkFollowUps')
      .timeBased()
      .everyDays(1)
      .atHour(9)
      .create();
  }
}

// ─── HELPER: Format currency ──────────────────────────────────────────────
function formatINR(amount) {
  if (!amount) return '₹0';
  const num = Number(amount);
  return '₹' + num.toLocaleString('en-IN');
}
