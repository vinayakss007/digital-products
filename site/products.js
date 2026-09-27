// Single place to point every buy button at your real store URLs.
// Replace the nulls with your Gumroad / Payhip / Lemon Squeezy links and the
// whole storefront goes live — no HTML editing needed.
window.BUY_LINKS = {
  crm:     null, // "https://vinayakss007.gumroad.com/l/leadstack-crm"
  prompts: null, // "https://vinayakss007.gumroad.com/l/prompt-pack"
  invoice: null, // "https://vinayakss007.gumroad.com/l/invoice-kit"
  proposals: null, // "https://vinayakss007.gumroad.com/l/proposals-kit"
  bundle:  null  // "https://vinayakss007.gumroad.com/l/starter-bundle"
};

// The "N automated checks" claims on these pages. Tests are grouped by product:
// a unit suite plus an end-to-end run of the sample files that ship with it.
// storefront.test.js asserts every number here against tests/check-count.json,
// which run_tests.sh rewrites from scratch each run — so the copy cannot quietly
// outlive the build it describes.
window.CHECK_SUITES = {
  crm: ["test_crm", "e2e_crm"],
  prompts: ["test_prompt_pack"],
  proposals: ["test_proposals", "e2e_proposals"],
  invoice: ["test_invoice", "e2e_invoice"]
};
// Everything the catalogue-wide claim covers, including the shared-project test.
window.CHECK_ALL = ["test_crm", "e2e_crm", "test_invoice", "e2e_invoice", "test_proposals",
  "e2e_proposals", "test_prompt_pack", "test_bundle_scripts"];

// Prices live here so a launch discount is a one-line change.
window.PRODUCTS = [
  {
    id: "crm",
    icon: "📊",
    name: "CRM & Sales Tracker Template",
    tagline: "Turn a messy lead list into a real pipeline in 5 minutes.",
    price: 299, was: 399,
    format: "Google Sheets + Apps Script",
    bullets: ["Auto follow-up reminders", "Weighted revenue dashboard", "Activity log per lead", "No subscription"],
    page: "crm.html"
  },
  {
    id: "prompts",
    icon: "🧠",
    name: "Small Business Prompt Pack",
    tagline: "120 prompts that produce work you can actually send.",
    price: 199, was: null,
    format: "CSV + Markdown + optional Python",
    bullets: ["8 categories, 15 prompts each", "6 reusable personas", "Batch runner script", "Works in any AI chat"],
    page: "prompt-pack.html"
  },
  {
    id: "proposals",
    icon: "📄",
    name: "Proposals & Quotes Kit",
    tagline: "Price the work, send a PDF they can say yes to, turn the yes into an invoice.",
    price: 349, was: null,
    format: "Google Sheets + Apps Script",
    bullets: ["One-click proposal PDF", "Deposit calculated for you", "Win rate that ignores zombies", "Accepted quote becomes an invoice"],
    page: "proposals.html"
  },
  {
    id: "invoice",
    icon: "🧾",
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
  price: 749, was: 1146,
  includes: ["crm", "prompts", "proposals", "invoice"]
};
