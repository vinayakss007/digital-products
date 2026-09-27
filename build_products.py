#!/usr/bin/env python3
"""Build sellable ZIPs for every digital product in this repo.

Each product lives in its own folder and is listed below. The builder copies
the folder's contents into dist/<Product>.zip, so you can drag a finished file
straight into Gumroad / Payhip / Lemon Squeezy as the digital download.

    python3 build_products.py            # build everything
    python3 build_products.py --list     # show products and prices
    python3 build_products.py prompt-pack invoice-kit
    python3 build_products.py --check    # build, then verify every ZIP opens
"""

import argparse
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DIST = ROOT / "dist"

EXCLUDE_DIRS = {"__pycache__", ".git", "node_modules"}
EXCLUDE_SUFFIXES = {".pyc", ".tmp", ".DS_Store"}

# name -> (folder, download filename, files to include)
PRODUCTS = {
    "prompt-pack": {
        "title": "Small Business Prompt Pack",
        "folder": "prompt-pack",
        "zip_name": "Small-Business-Prompt-Pack.zip",
        "price": 199,
        "include": None,  # None = everything in the folder
    },
    "invoice-kit": {
        "title": "Invoice & Cash-Flow Kit",
        "folder": "invoice-kit",
        "zip_name": "Invoice-CashFlow-Kit.zip",
        "price": 299,
        "include": None,
    },
    "crm-template": {
        "title": "CRM & Sales Tracker Template",
        "folder": "crm-template",
        "zip_name": "CRM-Sales-Tracker-Template.zip",
        "price": 299,
        "include": ["README.md", "Sheet1_Leads.csv", "crm_script.gs", "QUICKSTART.txt"],
    },
    "proposals-kit": {
        "title": "Proposals & Quotes Kit",
        "folder": "proposals-kit",
        "zip_name": "Proposals-Quotes-Kit.zip",
        "price": 349,
        "include": None,
    },
    "retainer-kit": {
        "title": "Retainer & Recurring Revenue Kit",
        "folder": "retainer-kit",
        "zip_name": "Retainer-Recurring-Revenue-Kit.zip",
        "price": 399,
        "include": None,
    },
    "bundle": {
        "title": "Solo Business Starter Bundle",
        "folder": None,  # assembled from the other products
        "zip_name": "Solo-Business-Starter-Bundle.zip",
        "price": 999,
        "members": ["prompt-pack", "invoice-kit", "proposals-kit", "retainer-kit", "crm-template"],
    },
}

BUNDLE_README = """Solo Business Starter Bundle
===========================

Five tools that cover the whole loop of working for yourself: find the lead, price
the work, win it, bill it, and keep billing it every month.

1. CRM & Sales Tracker Template
   Leads, pipeline stages, follow-up reminders, revenue dashboard.
   Open crm-template/README.md

2. Small Business Prompt Pack
   120 prompts + 6 personas for the writing tasks around the work.
   Open prompt-pack/README.md

3. Proposals & Quotes Kit
   Scope in, priced PDF out, deposit calculated, accepted deal turned into an invoice.
   Open proposals-kit/README.md

4. Invoice & Cash-Flow Kit
   PDF invoices from Google Sheets, plus who-owes-me-what tracking.
   Open invoice-kit/README.md

5. Retainer & Recurring Revenue Kit
   Monthly retainers billed in one click, overage included, double-billing impossible.
   Open retainer-kit/README.md

Start with whichever one hurts most today. Each works alone.

IF YOU INSTALL MORE THAN ONE IN THE SAME SPREADSHEET
The four Apps Script files are written to share one project: no name collisions, one
menu each, a shared Settings tab that is seeded rather than overwritten, and separate
output tabs (Dashboard / Cash Flow / Proposal Dashboard / Retainer Dashboard). Two
bridges work once the Invoice Kit is installed: an accepted proposal becomes an invoice
draft, and a due retainer becomes an invoice draft you can PDF and chase.

Order that fits most people: CRM -> Proposals -> Invoice Kit -> Retainer Kit.

That coexistence is tested, not assumed: tests/test_bundle_scripts.js pastes all four
scripts into one Apps Script project and checks the menus, the shared Settings tab, the
four dashboards and both bridges.

Every file here is yours to modify. Do not resell the pack itself.
"""

def collect_files(spec: dict) -> list[tuple[Path, str]]:
    """Return (absolute path, path-inside-zip) pairs for one product."""
    folder = ROOT / spec["folder"]
    if not folder.is_dir():
        sys.exit(f"error: missing folder {folder}")

    wanted = spec.get("include")
    found: list[tuple[Path, str]] = []
    for path in sorted(folder.rglob("*")):
        if path.is_dir():
            continue
        if any(part in EXCLUDE_DIRS for part in path.parts):
            continue
        if path.suffix in EXCLUDE_SUFFIXES or path.name in EXCLUDE_SUFFIXES:
            continue
        rel = path.relative_to(folder).as_posix()
        if wanted and rel not in wanted:
            continue
        if not wanted and rel == "listing.md":
            continue  # internal sales copy, not part of the download
        found.append((path, rel))

    if wanted:
        have = {rel for _, rel in found}
        missing = [w for w in wanted if w not in have]
        if missing:
            print(f"  note: skipped (not present): {', '.join(missing)}")
    return found


def write_zip(target: Path, entries: list[tuple[Path, str]], extra: dict[str, str] | None = None) -> int:
    target.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as zf:
        for path, rel in entries:
            zf.write(path, arcname=rel)
        for name, text in (extra or {}).items():
            zf.writestr(name, text)
    return target.stat().st_size


def build(name: str, spec: dict) -> Path | None:
    print(f"\n{name} — {spec['title']} (₹{spec['price']})")

    if spec.get("folder") is None:  # bundle
        entries: list[tuple[Path, str]] = []
        for member in spec["members"]:
            sub = PRODUCTS[member]
            folder = ROOT / sub["folder"]
            if not folder.is_dir():
                print(f"  warning: {member} folder missing, bundle skips it")
                continue
            for path, rel in collect_files(sub):
                if rel == "listing.md":
                    continue
                entries.append((path, f"{sub['folder']}/{rel}"))
        target = DIST / spec["zip_name"]
        size = write_zip(target, entries, {"BUNDLE-README.txt": BUNDLE_README})
        print(f"  {len(entries)} files -> {target.relative_to(ROOT)}  ({size:,} bytes)")
        return target

    entries = collect_files(spec)
    if not entries:
        print("  nothing to package, skipped")
        return None
    target = DIST / spec["zip_name"]
    size = write_zip(target, entries)
    for path, rel in entries:
        print(f"  + {rel} ({path.stat().st_size:,} b)")
    print(f"  -> {target.relative_to(ROOT)}  ({size:,} bytes)")
    return target


def verify(built: list[Path]) -> int:
    """Open every ZIP and confirm it reads back with no corruption."""
    bad = 0
    print("\n=== integrity check ===")
    for target in built:
        try:
            with zipfile.ZipFile(target) as zf:
                corrupt = zf.testzip()
                names = zf.namelist()
                if corrupt:
                    print(f"  CORRUPT member in {target.name}: {corrupt}")
                    bad += 1
                elif not names:
                    print(f"  EMPTY {target.name}")
                    bad += 1
                else:
                    print(f"  ok  {target.name} ({len(names)} files)")
        except zipfile.BadZipFile as exc:
            print(f"  BAD ZIP {target.name}: {exc}")
            bad += 1
    return bad


def main() -> None:
    ap = argparse.ArgumentParser(description="Package digital products for sale.")
    ap.add_argument("names", nargs="*", help="product keys to build (default: all)")
    ap.add_argument("--list", action="store_true", help="list products and exit")
    ap.add_argument("--check", action="store_true", help="verify ZIPs after building")
    args = ap.parse_args()

    if args.list:
        for key, spec in PRODUCTS.items():
            print(f"{key:14s} ₹{spec['price']:<4} {spec['zip_name']}")
        return

    selected = args.names or list(PRODUCTS)
    unknown = [n for n in selected if n not in PRODUCTS]
    if unknown:
        sys.exit(f"error: unknown product(s) {', '.join(unknown)}\ntry: {', '.join(PRODUCTS)}")

    # Non-bundles first so the bundle picks up freshly built folders.
    ordered = [k for k in selected if PRODUCTS[k].get("folder")] + [k for k in selected if not PRODUCTS[k].get("folder")]
    built = [p for p in (build(k, PRODUCTS[k]) for k in ordered) if p]

    print(f"\n{len(built)} package(s) in {DIST}")
    if args.check and verify(built):
        sys.exit("integrity check failed")


if __name__ == "__main__":
    main()
