# The Small Business Prompt Pack — 120 Prompts That Actually Ship Work

A copy-paste prompt library for solo founders, freelancers, and small business owners who use AI
chat tools (ChatGPT, Claude, Gemini) but keep getting generic answers.

Every prompt in this pack has **variables you fill in** and a **format instruction**, which is the
difference between "write me a marketing email" and a paragraph you can send today.

## What's Included

| File | What it is |
|---|---|
| `prompts.csv` | The 120 prompts — 8 categories, ready to import into Google Sheets |
| `system-prompts.md` | 6 reusable personas to paste once and stop re-explaining your business |
| `batch_runner.py` | Optional Python script to run any category against an API and get drafts in bulk |
| `context.txt` | Fill this once and the runner substitutes your business into every prompt |
| `README.md` | This guide |

## Setup (2 minutes)

1. Open Google Sheets → File → Import → Upload → `prompts.csv`
2. That's it. You now have a searchable prompt database with filters on category and tone.

Prefer not to use Sheets? Open `prompts.csv` in any text editor and copy prompts straight out.

## How To Use A Prompt

Each row looks like this:

- **Prompt** — the instructions, with `[BRACKETS]` where your details go
- **Variables** — exactly what to replace
- **When to use** — the real trigger moment
- **Output format** — what you should get back (and what to ask for if you don't)

Replace every bracket. If you leave a bracket unfilled, the model will invent it — that's where the
"this sounds like a robot wrote it" feeling comes from.

## The 8 Categories

1. Sales & Outreach
2. Marketing & Content
3. Email
4. Customer Handling
5. Product & Operations
6. Pricing & Finance
7. Hiring & Team
8. Research & Strategy

## Three Rules That Make These Better

1. **Paste your real numbers.** "Grew from 4 to 30 clients in 8 months" beats "grew my business".
2. **Ask for variants.** Add "give me 10 versions, ranked, with the tradeoff of each" to any prompt.
3. **Follow up with a critique.** Add "now act as my sceptical customer and list 5 reasons this
   doesn't convince you" — then fix those 5 things.

## Notes On batch_runner.py

Optional, for people comfortable with the terminal. It reads `prompts.csv`, substitutes your
`context.txt` details into every prompt of a chosen category, and writes the AI responses to one
Markdown file so you can skim and edit.

```bash
# Costs nothing — prints the assembled prompts and lists any brackets you have not filled:
python3 batch_runner.py --category Email --context context.txt --dry-run

# Generate drafts (needs `pip install requests` and an API key in the environment):
export OPENAI_API_KEY=sk-...
python3 batch_runner.py --all --context context.txt --out drafts.md
```

`OPENAI_BASE_URL` works too, so any OpenAI-compatible endpoint is fine.

## Licence

Personal use licence. Use it in as many businesses as you own. Don't resell the pack itself.
