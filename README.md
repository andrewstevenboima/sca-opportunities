# SCA Opportunities

A curated job and opportunity platform for African undergraduate students.
A product of **Student Companion AI** (studentcompanionai.xyz).

**Stack:** Static site (HTML/CSS/JS) hosted on GitHub Pages + Google Sheets backend powered by Google Apps Script. No build step. No framework. No monthly cost.

---

## What you're getting

- **Public-facing site** with opportunities browsable by category, location, and year of study.
- **Google Sheet as your admin panel** — add a row, the site updates on next page load.
- **Email signup** that writes to a separate Subscribers tab in the same Sheet.
- **Fallback mode** — if the Apps Script URL isn't configured yet, the site loads sample data from `opportunities.json` so you can preview before full setup.

---

## File structure

```
sca-platform/
├── index.html                  # main page
├── styles.css                  # white/gold editorial design
├── script.js                   # frontend logic
├── opportunities.json          # fallback sample data (22 real programs)
├── Code.gs                     # Google Apps Script backend
├── assets/
│   └── logo.png                # Student Companion AI logo
└── README.md                   # this file
```

---

## Setup — 4 steps, ~20 minutes

### Step 1 — Create the Google Sheet

1. Go to [sheets.google.com](https://sheets.google.com) and create a new Sheet named **SCA Opportunities Database**.
2. Rename the first tab to exactly `Opportunities` (capital O, no space).
3. Add these column headers in row 1, in this exact order:

```
id | category | title | organization | location | remote | deadline | eligibility_year | eligibility_nationality | field | tags | description | apply_link | source | status | date_posted
```

4. Create a second tab named exactly `Subscribers` with these headers:

```
email | consent_timestamp | source_page
```

5. Copy your Sheet ID from the URL. Example:
   `https://docs.google.com/spreadsheets/d/`**`1aBcDeFgHiJkLmNoPqRsTuVwXyZ`**`/edit`
   → the bolded part is your Sheet ID.

6. Seed the Opportunities tab with a few rows. You can copy the entries from `opportunities.json` — each JSON object maps 1:1 to a row.

**Column notes:**
- `id` — any unique string (e.g. `mcf-scholars-2026`).
- `category` — one of: `Internships`, `Jobs`, `Fellowships`, `Scholarships`, `Competitions`.
- `remote` — `Yes`, `No`, or `Hybrid`.
- `deadline` — ISO date (`2026-06-15`), or a label like `Rolling`, `Annual (Sept)`, `Verify on source`.
- `eligibility_year` — comma-separated values from: `Year 1`, `Year 2`, `Year 3`, `Year 4`, `Final Year`, `Recent Grad`, `Any`.
- `status` — `live` (shown on site) or `hidden` (excluded). Rows without a status default to `live`.

---

### Step 2 — Deploy the Apps Script

1. Go to [script.google.com](https://script.google.com) → **New Project**.
2. Delete the default `myFunction()` boilerplate.
3. Open `Code.gs` from this repo, copy its entire contents, paste into the Apps Script editor.
4. Replace `SHEET_ID` at the top with your Sheet ID from Step 1.
5. Click **Save** (disk icon) — give the project a name like "SCA Opportunities Backend".
6. Click **Run** on the `authorizeOnce` function — this triggers the permission prompt. Grant access to your Google account. This only needs to happen once.
7. Click **Deploy → New deployment**.
   - Type: **Web app**
   - Description: "SCA Opportunities v1"
   - Execute as: **Me**
   - Who has access: **Anyone**
8. Click **Deploy**. Copy the **Web App URL** — this is what connects the site to your Sheet.

> ⚠️ Important: every time you edit `Code.gs`, you must create a **new deployment** (or update the existing one) for changes to take effect. The URL stays the same if you update; a new deployment gives a new URL.

---

### Step 3 — Wire the frontend to your backend

1. Open `script.js`.
2. Find this line near the top:
   ```js
   const APPS_SCRIPT_URL = "REPLACE_WITH_YOUR_DEPLOYED_APPS_SCRIPT_URL";
   ```
3. Replace with your Web App URL from Step 2.
4. Save.

---

### Step 4 — Publish to GitHub Pages

1. Create a new GitHub repo (e.g. `sca-opportunities`).
2. Upload all files from the `sca-platform/` folder to the root of the repo.
3. Go to **Repo → Settings → Pages**.
4. Source: **Deploy from a branch** → Branch: `main` → Folder: `/ (root)`.
5. Click **Save**. GitHub will give you a URL like `https://your-username.github.io/sca-opportunities/` — live in 1–2 minutes.

Optional: point a custom subdomain (e.g. `opportunities.studentcompanionai.xyz`) at the GitHub Pages site by adding a CNAME record.

---

## Daily workflow — how to post an opportunity

1. Open your Google Sheet.
2. Add a new row in the `Opportunities` tab with the details.
3. Set `status` to `live`.
4. Save (Google Sheets auto-saves). Done.

The site picks up the new row on the **next page load** (no cache — fetches fresh every time).

To hide an opportunity temporarily: change its `status` to `hidden`. To remove permanently: delete the row.

---

## Testing locally

Before publishing to GitHub, you can preview locally:

```bash
# From the sca-platform folder
python3 -m http.server 8000
```

Then open [http://localhost:8000](http://localhost:8000).

If you haven't set `APPS_SCRIPT_URL` yet, the site automatically falls back to `opportunities.json` for sample data. Once you wire the Apps Script URL, it switches to live mode.

---

## Important constraints

- **No localStorage / sessionStorage** used anywhere. Bookmarks are in-memory only and reset on refresh (by design — we show a chip "X saved this session" to make this clear).
- **No student login or account system.** The platform is fully public. The only optional data collection is the email signup, which requires explicit consent.
- **No personal data collected** beyond the optional email address.

---

## Privacy posture

This platform collects no personal data from visitors by default. The only optional capture is email addresses submitted via the signup form, with an explicit consent checkbox. Emails are stored in the Subscribers tab of the same Google Sheet.

If you deploy this publicly, you should add a simple privacy page (`privacy.html`) explaining:
- What you collect (email address + timestamp).
- What you use it for (weekly opportunity newsletter).
- How to unsubscribe (reply to any email, or email `studentcompanionai@gmail.com`).
- How users can request deletion.

Under Rwanda's Law N° 058/2021 and similar African data protection frameworks, this is the minimum viable compliance posture.

---

## Future upgrades

Already scaffolded in the code:

- **Auto-refresh hook** — marked `// TODO: auto-refresh hook` in `script.js`. Swap the static opportunities.json for a GitHub Action that regenerates it daily from source sites.
- **Personalized matching** — once you collect more signal (year of study, field), you can add a match-strength bar to each card.
- **Saved accounts** — if you eventually want persistent bookmarks, this is the point to add Firebase Auth or Supabase — not before.

---

## Credits

Built for Student Companion AI by Andrew Boima.
Opportunities data curated from: ALU, Mastercard Foundation, UN Careers, Chevening, DAAD, Commonwealth Scholarships, Erasmus+, and other reputable sources.

---

## License

All code © Student Companion AI. Opportunity data sourced from public-facing program announcements — always verify current deadlines with the original source.
