# SCA Opportunities

A curated job and opportunity platform for African undergraduate students.
A product of **Student Companion AI** (studentcompanionai.xyz).

**Stack:** Static site (HTML/CSS/JS) hosted on GitHub Pages + Google Sheets backend powered by Google Apps Script. No build step. No framework. No monthly cost.

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

## Privacy posture

This platform collects no personal data from visitors by default. The only optional capture is email addresses submitted via the signup form, with an explicit consent checkbox. Emails are stored in the Subscribers tab of the same Google Sheet.

If you deploy this publicly, you should add a simple privacy page (`privacy.html`) explaining:
- What you collect (email address + timestamp).
- What you use it for (weekly opportunity newsletter).
- How to unsubscribe (reply to any email, or email `studentcompanionai@gmail.com`).
- How users can request deletion.

Under Rwanda's Law N° 058/2021 and similar African data protection frameworks, this is the minimum viable compliance posture.


## Credits

Built for Student Companion AI by Andrew Steven Boima.
Opportunities data curated from: ALU, Mastercard Foundation, UN Careers, Chevening, DAAD, Commonwealth Scholarships, Erasmus+, and other reputable sources.

---

## License

All code © Student Companion AI. Opportunity data sourced from public-facing program announcements — always verify current deadlines with the original source.
