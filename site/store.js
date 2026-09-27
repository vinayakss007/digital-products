// Renders buy buttons from BUY_LINKS so nothing is hardcoded per page.
(function () {
  var inr = function (n) { return "₹" + Number(n).toLocaleString("en-IN"); };

  // Product names and copy come from products.js and are dropped into innerHTML,
  // so "&" and "<" must be encoded or "CRM & Sales" breaks the markup.
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // A button that is not wired up yet should say so rather than dead-end the visitor.
  function hrefFor(id) {
    var link = window.BUY_LINKS && window.BUY_LINKS[id];
    return link && /^https?:\/\//.test(link) ? link : null;
  }

  function buyButton(id, label, extraClass) {
    var url = hrefFor(id);
    var cls = "cta brand" + (extraClass ? " " + extraClass : "");
    var text = esc(label || "Buy Now — Instant Download");
    if (url) {
      return '<a href="' + esc(url) + '" class="' + cls + '" target="_blank" rel="noopener">' +
        text + " →</a>";
    }
    return '<a href="#checkout" class="' + cls + '" data-unwired="1">' + text + " →</a>" +
      '<div class="note">Checkout link not added yet — set <code>BUY_LINKS.' + esc(id) +
      "</code> in products.js.</div>";
  }

  function priceRow(p) {
    var html = '<div class="price-row"><span class="price">' + inr(p.price) + "</span>";
    if (p.was && p.was > p.price) {
      html += '<span class="was">' + inr(p.was) + "</span>" +
        '<span class="save">Save ' + inr(p.was - p.price) + "</span>";
    }
    return html + "</div>";
  }

  function card(p) {
    var url = p.page || (p.id + ".html");
    return '<div class="card">' +
      '<div class="icon">' + esc(p.icon || "📦") + "</div>" +
      "<h3>" + esc(p.name) + "</h3>" +
      '<div class="tag">' + esc(p.tagline) + "</div>" +
      '<div class="fmt">' + esc(p.format || "Digital download") + "</div>" +
      "<ul>" + (p.bullets || []).map(function (b) { return "<li>" + esc(b) + "</li>"; }).join("") + "</ul>" +
      priceRow(p) +
      '<div class="cta-row" style="justify-content:flex-start">' +
      '<a href="' + esc(url) + '" class="cta ghost">Details</a>' +
      buyButton(p.id, "Buy", "sm") +
      "</div></div>";
  }

  function bundleCard() {
    var b = window.BUNDLE;
    if (!b) return "";
    var items = (b.includes || []).map(function (id) {
      var p = (window.PRODUCTS || []).find(function (x) { return x.id === id; });
      return p ? "<li>" + esc(p.name) + "</li>" : "";
    }).join("");
    return '<div class="card" style="border-color:#3f3f46">' +
      '<div class="icon">🧰</div><h3>' + esc(b.name) + "</h3>" +
      '<div class="tag">' + esc(b.tagline) + "</div>" +
      '<div class="fmt">All three products, separate downloads</div>' +
      "<ul>" + items + "</ul>" + priceRow(b) +
      '<div class="cta-row" style="justify-content:flex-start">' +
      buyButton(b.id, "Buy the bundle") + "</div></div>";
  }

  function mount() {
    // The catalogue grid lists products only; the bundle has its own section
    // (or its own card slot when a page opts in with data-bundle).
    var grid = document.querySelector("[data-products]");
    if (grid) grid.innerHTML = (window.PRODUCTS || []).map(card).join("");

    var slot = document.querySelector("[data-bundle]");
    if (slot) slot.innerHTML = bundleCard();

    document.querySelectorAll("[data-buy]").forEach(function (el) {
      el.innerHTML = buyButton(el.getAttribute("data-buy"), el.getAttribute("data-label"));
    });
    document.querySelectorAll("[data-price]").forEach(function (el) {
      var id = el.getAttribute("data-price");
      var p = (window.PRODUCTS || []).find(function (x) { return x.id === id; }) ||
        (window.BUNDLE && window.BUNDLE.id === id ? window.BUNDLE : null);
      if (p) el.innerHTML = priceRow(p);
    });
    document.querySelectorAll("[data-unwired]").forEach(function (el) {
      el.addEventListener("click", function (e) {
        e.preventDefault();
        alert("Checkout is not wired up yet. Add your store URL to BUY_LINKS in site/products.js.");
      });
    });
    var yr = document.querySelector("[data-year]");
    if (yr) yr.textContent = new Date().getFullYear();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
