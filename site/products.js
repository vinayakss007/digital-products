// Single place to point every buy button at your real store URLs.
// Replace the nulls with your Gumroad / Payhip / Lemon Squeezy links and the
// whole storefront goes live — no HTML editing needed.
window.BUY_LINKS = {
  crm:     null, // "https://vinayakss007.gumroad.com/l/leadstack-crm"
  prompts: null, // "https://vinayakss007.gumroad.com/l/prompt-pack"
  invoice: null, // "https://vinayakss007.gumroad.com/l/invoice-kit"
  bundle:  null  // "https://vinayakss007.gumroad.com/l/starter-bundle"
};

// Prices live here so a launch discount is a one-line change.
window.PRODUCTS = [
  {
    id: "crm",
    name: "CRM & Sales Tracker Template",
    tagline: "Turn a messy lead list into a real pipeline in 5 minutes.",
    price: 299, was: 399,
    format: "Google Sheets + Apps Script",
    bullets: ["Auto follow-up reminders", "Weighted revenue dashboard", "Activity log per lead", "No subscription"],
    page: "crm.html"
  },
  {
    id: "prompts",
    name: "Small Business Prompt Pack",
    tagline: "120 prompts that produce work you can actually send.",
    price: 199, was: null,
    format: "CSV + Markdown + optional Python",
    bullets: ["8 categories, 15 prompts each", "6 reusable personas", "Batch runner script", "Works in any AI chat"],
    page: "prompt-pack.html"
  },
  {
    id: "invoice",
    name: "Invoice & Cash-Flow Kit",
    tagline: "PDF invoices from a Google Sheet, and a clear view of who owes you.",
    price: 299, was: null,
    format: "Google Sheets + Apps Script",
    bullets: ["One-click PDF invoice", "Emails it with the PDF attached", "Overdue tracking by age", "Monthly cash-flow dashboard"],
    page: "invoice-kit.html"
  }
];

window.BUNDLE = {
  id: "bundle",
  name: "Solo Business Starter Bundle",
  tagline: "Get the lead, do the work, send the invoice.",
  price: 599, was: 797,
  includes: ["crm", "prompts", "invoice"]
};
