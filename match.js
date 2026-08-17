/* ============================================================
   SCA Opportunities — CV Readiness Checker
   Runs entirely in the browser. The CV is never uploaded,
   never stored, never transmitted. Closing the tab erases it.
   ============================================================ */

const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbw18zxmzIiicaePtqdlds9-rioJVjBRXB5c-4wISad6qo7hGRCAnYF7hf-qp1MIeDgg/exec";
const FALLBACK_JSON = "opportunities.json";

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const state = {
  all: [],
  cvText: "",
  cvSkills: [],
  profile: { country: "", level: "", years: "", languages: [] },
  results: [],
};

/* ---------- country registry (compact) ---------- */
const COUNTRIES = [
  ["Rwanda",["rwanda","rwandan","kigali","huye","musanze"]],
  ["Sierra Leone",["sierra leone","sierra leonean","freetown","kono","koidu","makeni","njala"]],
  ["Kenya",["kenya","kenyan","nairobi","mombasa","kisumu","kwale"]],
  ["Nigeria",["nigeria","nigerian","lagos","abuja"]],
  ["Ghana",["ghana","ghanaian","accra","kumasi","legon"]],
  ["South Africa",["south africa","south african","johannesburg","pretoria","cape town","durban"]],
  ["Uganda",["uganda","ugandan","kampala","makerere"]],
  ["Ethiopia",["ethiopia","ethiopian","addis ababa"]],
  ["Egypt",["egypt","egyptian","cairo"]],
  ["Morocco",["morocco","moroccan","rabat","casablanca"]],
  ["Senegal",["senegal","senegalese","dakar"]],
  ["Tanzania",["tanzania","tanzanian","dar es salaam","zanzibar"]],
  ["Cameroon",["cameroon","cameroonian","yaound","douala"]],
  ["Côte d'Ivoire",["ivoire","ivory coast","ivorian","abidjan"]],
  ["Liberia",["liberia","liberian","monrovia"]],
  ["Zambia",["zambia","zambian","lusaka"]],
  ["Zimbabwe",["zimbabwe","zimbabwean","harare"]],
  ["Botswana",["botswana","gaborone"]],
  ["Togo",["togo","togolese","lomé","lome"]],
  ["Mauritius",["mauritius","mauritian"]],
  ["Mozambique",["mozambique","mozambican","maputo"]],
  ["Malawi",["malawi","malawian","lilongwe"]],
  ["The Gambia",["gambia","gambian","banjul"]],
  ["Burkina Faso",["burkina","burkinab","ouagadougou","bobo-dioulasso"]],
  ["DR Congo",["democratic republic of the congo","dr congo","drc","kinshasa","goma","beni"]],
  ["Burundi",["burundi","burundian","bujumbura"]],
  ["Chad",["chad","chadian","n'djamena"]],
  ["Libya",["libya","libyan","tripoli"]],
  ["Sudan",["sudan","sudanese","khartoum","kassala"]],
  ["South Sudan",["south sudan","juba"]],
  ["Mauritania",["mauritania","nouakchott"]],
  ["Namibia",["namibia","windhoek"]],
  ["Benin",["benin","cotonou"]],
  ["Mali",["mali","malian","bamako"]],
  ["Tunisia",["tunisia","tunisian","tunis"]],
  ["Algeria",["algeria","algerian","algiers"]],
];

/* ---------- skill / domain vocabulary ---------- */
const SKILL_VOCAB = {
  "Data analysis": ["data analysis","data analyst","excel","spss","stata"," r ","python","power bi","tableau","dashboards","statistics","quantitative"],
  "Monitoring & Evaluation": ["monitoring and evaluation","m&e","mel","impact evaluation","indicators","logframe","theory of change","data quality"],
  "Research": ["research","enumerator","survey","interviews","qualitative","literature review","field research","kii"],
  "Software engineering": ["software","developer","javascript","typescript","react","node","next.js","java","c++","git","github","api","backend","frontend","full-stack"],
  "Design": ["graphic design","figma","photoshop","illustrator","canva","adobe","ui","ux","visual"],
  "Communications": ["communications","content","copywriting","social media","press release","newsletter","storytelling","public relations"],
  "Marketing": ["marketing","seo","campaign","growth","branding","digital marketing","audience"],
  "Project management": ["project management","programme","program management","workplan","coordination","stakeholder","deliverables","timeline"],
  "Operations": ["operations","logistics","procurement","inventory","administration","scheduling","office management"],
  "Finance": ["finance","accounting","budget","reconciliation","audit","bookkeeping","financial reporting","payroll"],
  "Education": ["education","teaching","curriculum","training","facilitation","lms","canvas","tutoring","pedagogy"],
  "Public health": ["public health","health","clinical","epidemiology","nutrition","maternal","tb ","hiv","nursing"],
  "Human resources": ["human resources","recruitment","talent","onboarding","hr "],
  "Policy": ["policy","governance","public administration","advocacy","human rights","diplomacy"],
  "Entrepreneurship": ["entrepreneur","startup","venture","business model","pitch","founder"],
  "Agriculture": ["agriculture","agribusiness","farming","food security","supply chain"],
  "Engineering": ["engineering","mechanical","civil","electrical","hardware","iot"],
  "Environment": ["environment","climate","conservation","sustainability","renewable","wildlife"],
};

const LANGUAGES = ["English","French","Portuguese","Arabic","Swahili","Kinyarwanda"];

const LEVELS = [
  { key: "Year 1", label: "Year 1 student" },
  { key: "Year 2", label: "Year 2 student" },
  { key: "Year 3", label: "Year 3 student" },
  { key: "Year 4", label: "Year 4 student" },
  { key: "Final Year", label: "Final year student" },
  { key: "Recent Grad", label: "Recent graduate" },
];

/* ============================================================
   1. LOAD DATA
   ============================================================ */
async function loadOpportunities() {
  let data = null;
  try {
    if (APPS_SCRIPT_URL && !APPS_SCRIPT_URL.startsWith("REPLACE_")) {
      try {
        const r = await fetch(`${APPS_SCRIPT_URL}?action=opportunities`);
        if (!r.ok) throw new Error(r.status);
        data = await r.json();
      } catch {
        const r = await fetch(FALLBACK_JSON);
        data = await r.json();
      }
    } else {
      const r = await fetch(FALLBACK_JSON);
      data = await r.json();
    }
  } catch (e) {
    console.error("[SCA] data load failed", e);
    return;
  }
  const list = Array.isArray(data) ? data : data.opportunities || [];
  state.all = list.filter((o) => String(o.status || "live").toLowerCase() === "live");
  populateCountrySelect();
}

function populateCountrySelect() {
  const sel = $("#p-country");
  if (!sel) return;
  COUNTRIES.map((c) => c[0]).sort().forEach((name) => {
    const o = document.createElement("option");
    o.value = name;
    o.textContent = name;
    sel.appendChild(o);
  });
}

/* ============================================================
   2. CV PARSING  (in-browser only)
   ============================================================ */
async function readFile(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith(".txt")) return await file.text();

  if (name.endsWith(".pdf")) {
    if (!window.pdfjsLib) throw new Error("PDF reader unavailable — please paste your CV text instead.");
    const buf = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
    let out = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const tc = await page.getTextContent();
      out += tc.items.map((t) => t.str).join(" ") + "\n";
    }
    return out;
  }

  if (name.endsWith(".docx")) {
    if (!window.mammoth) throw new Error("Word reader unavailable — please paste your CV text instead.");
    const buf = await file.arrayBuffer();
    const res = await window.mammoth.extractRawText({ arrayBuffer: buf });
    return res.value;
  }

  throw new Error("Unsupported file. Use PDF, DOCX or TXT — or paste your CV text.");
}

function extractSkills(text) {
  const hay = " " + text.toLowerCase().replace(/\s+/g, " ") + " ";
  const found = [];
  Object.entries(SKILL_VOCAB).forEach(([domain, terms]) => {
    const hits = terms.filter((t) => hay.includes(t));
    if (hits.length) found.push({ domain, hits: hits.length, evidence: hits.slice(0, 3) });
  });
  return found.sort((a, b) => b.hits - a.hits);
}

/* ============================================================
   3. REQUIREMENT EXTRACTION  (from opportunity fields)
   ============================================================ */
function requiredYears(o) {
  const t = `${o.description || ""} ${o.eligibility_year || ""}`;
  const m = t.match(/(?:minimum|at least|min\.?|requires?)\s*(?:of\s*)?(\d+)\s*(?:\+|-|to)?\s*\d*\s*years?/i)
        || t.match(/(\d+)\s*(?:\+|-|–|to)\s*\d*\s*years?['’]?\s*(?:of\s*)?(?:relevant\s*|formal\s*|work\s*|professional\s*)?experience/i);
  return m ? parseInt(m[1], 10) : null;
}

function requiredLanguage(o) {
  const t = `${o.description || ""} ${o.eligibility_nationality || ""} ${o.tags || ""}`.toLowerCase();
  const out = [];
  if (/french (?:fluency |proficiency )?(?:is )?required|french required|maîtrise du français|francophone|fluent in french/.test(t)) out.push("French");
  if (/portuguese (?:is )?(?:required|likely needed|proficiency)/.test(t)) out.push("Portuguese");
  if (/arabic (?:is )?required/.test(t)) out.push("Arabic");
  if (/kinyarwanda (?:is )?required/.test(t)) out.push("Kinyarwanda");
  if (/native in chinese|chinese.*fluent in english/.test(t)) out.push("Chinese");
  return out;
}

// Countries a listing is restricted to, if it is restricted at all.
function restrictedTo(o) {
  const raw = o.eligibility_nationality || "";
  if (!/only|nationals|citizens|residents|restricted/i.test(raw)) return null;
  if (/open to all|worldwide|any nationality/i.test(raw)) return null;
  const hay = raw.toLowerCase();
  const list = COUNTRIES.filter(([, al]) => al.some((a) => hay.includes(a))).map(([n]) => n);
  return list.length ? list : null;
}

function deadlinePassed(o) {
  const d = String(o.deadline || "").trim();
  if (!d || /rolling|until filled|ongoing|verify|open/i.test(d)) return false;
  const parsed = new Date(d);
  if (isNaN(parsed)) return false;
  return parsed < new Date(new Date().toDateString());
}

function levelMatches(o, level) {
  const e = (o.eligibility_year || "").toLowerCase();
  if (!e || !level) return true;
  const l = level.toLowerCase();
  if (e.includes(l)) return true;
  // graduates also qualify for "early career" / "young professional"
  if (l === "recent grad" && /recent grad|early career|young professional|graduate/.test(e)) return true;
  if (l === "final year" && /final year|current student|year 4/.test(e)) return true;
  if (/current student/.test(e) && /^year \d/.test(l)) return true;
  return false;
}

function domainOverlap(o, skills) {
  if (!skills.length) return { score: 0, shared: [] };
  const hay = `${o.field || ""} ${o.tags || ""} ${o.title || ""} ${o.category || ""}`.toLowerCase();
  const shared = skills.filter((s) => {
    const words = s.domain.toLowerCase().split(/[\s&]+/).filter((w) => w.length > 3);
    return words.some((w) => hay.includes(w)) ||
           SKILL_VOCAB[s.domain].some((t) => hay.includes(t.trim()));
  });
  return { score: shared.length, shared: shared.map((s) => s.domain) };
}

/* ============================================================
   4. SCORING
   ============================================================ */
function assess(o) {
  const p = state.profile;
  const blockers = [];
  const met = [];
  const gaps = [];

  // deadline
  if (deadlinePassed(o)) blockers.push({ t: "Deadline has passed", d: `Closed ${o.deadline}` });
  else met.push("Deadline is still open");

  // nationality
  const restricted = restrictedTo(o);
  if (restricted) {
    if (p.country && restricted.includes(p.country)) {
      met.push(`Open to ${p.country} nationals`);
    } else if (p.country) {
      blockers.push({
        t: "Restricted nationality",
        d: `Open only to: ${restricted.join(", ")}. You selected ${p.country}.`,
      });
    }
  } else if (p.country) {
    met.push("No nationality restriction");
  }

  // language
  const langs = requiredLanguage(o);
  langs.forEach((L) => {
    if (p.languages.includes(L)) met.push(`${L} required — you speak it`);
    else blockers.push({ t: `${L} required`, d: `This role needs ${L}. Add it to your profile if you speak it.` });
  });

  // experience
  const yrs = requiredYears(o);
  const mine = p.years === "" ? null : parseInt(p.years, 10);
  if (yrs !== null && mine !== null) {
    if (mine >= yrs) met.push(`${yrs}+ years experience — you have ${mine}`);
    else gaps.push({ t: `${yrs} years experience required`, d: `You have ${mine}. Gap of ${yrs - mine} year${yrs - mine > 1 ? "s" : ""}.` });
  }

  // study level
  if (p.level) {
    if (levelMatches(o, p.level)) met.push(`Open to ${p.level}`);
    else gaps.push({ t: "Study level mismatch", d: `Listed for: ${o.eligibility_year || "unspecified"}` });
  }

  // domain fit
  const dom = domainOverlap(o, state.cvSkills);
  if (dom.score) met.push(`Field match: ${dom.shared.slice(0, 3).join(", ")}`);
  else if (state.cvSkills.length) gaps.push({ t: "Different field", d: "No clear overlap with your CV." });

  // country of opportunity
  if (p.country) {
    const loc = `${o.location || ""}`.toLowerCase();
    const entry = COUNTRIES.find(([n]) => n === p.country);
    if (entry && entry[1].some((a) => loc.includes(a))) met.push(`Located in ${p.country}`);
    else if (/remote|home-based|online|worldwide/i.test(loc)) met.push("Remote — location is not a barrier");
  }

  let status;
  if (blockers.length) status = "blocked";
  else if (gaps.length >= 2) status = "stretch";
  else status = "ready";

  const score = met.length * 2 - gaps.length - blockers.length * 5 + dom.score * 2;
  return { o, status, met, gaps, blockers, score };
}

function runAssessment() {
  state.results = state.all.map(assess).sort((a, b) => {
    const rank = { ready: 0, stretch: 1, blocked: 2 };
    if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
    return b.score - a.score;
  });
  render();
}

/* ============================================================
   5. RENDER
   ============================================================ */
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

const STATUS_META = {
  ready:   { label: "Open to you",   cls: "st-ready" },
  stretch: { label: "Stretch",        cls: "st-stretch" },
  blocked: { label: "Not yet",        cls: "st-blocked" },
};

function render() {
  const counts = { ready: 0, stretch: 0, blocked: 0 };
  state.results.forEach((r) => counts[r.status]++);

  $("#summary").hidden = false;
  $("#sum-ready").textContent = counts.ready;
  $("#sum-stretch").textContent = counts.stretch;
  $("#sum-blocked").textContent = counts.blocked;

  const filter = $("#result-filter").value;
  const shown = filter === "all" ? state.results : state.results.filter((r) => r.status === filter);

  $("#results").innerHTML = shown.map(cardHTML).join("") ||
    '<p class="rc-none">Nothing in this group.</p>';

  $$(".rc-toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      const card = btn.closest(".rc-card");
      card.classList.toggle("is-open");
      btn.textContent = card.classList.contains("is-open") ? "Hide detail ▲" : "Why? ▼";
    });
  });
}

function cardHTML(r) {
  const m = STATUS_META[r.status];
  const o = r.o;
  return `
  <article class="rc-card ${m.cls}">
    <div class="rc-head">
      <span class="rc-status">${m.label}</span>
      <span class="rc-cat">${esc(o.category || "")}</span>
    </div>
    <h3 class="rc-title">${esc(o.title)}</h3>
    <p class="rc-org">${esc(o.organization || "")}${o.location ? " · " + esc(o.location) : ""}</p>

    <div class="rc-bar">
      <span class="rc-pill rc-met">${r.met.length} met</span>
      ${r.gaps.length ? `<span class="rc-pill rc-gap">${r.gaps.length} gap${r.gaps.length > 1 ? "s" : ""}</span>` : ""}
      ${r.blockers.length ? `<span class="rc-pill rc-block">${r.blockers.length} blocker${r.blockers.length > 1 ? "s" : ""}</span>` : ""}
    </div>

    <div class="rc-detail">
      ${r.blockers.length ? `<div class="rc-group">
        <h4>Why you can't apply yet</h4>
        ${r.blockers.map((b) => `<p class="rc-item rc-i-block"><strong>${esc(b.t)}</strong><span>${esc(b.d)}</span></p>`).join("")}
      </div>` : ""}
      ${r.gaps.length ? `<div class="rc-group">
        <h4>Gaps to close</h4>
        ${r.gaps.map((g) => `<p class="rc-item rc-i-gap"><strong>${esc(g.t)}</strong><span>${esc(g.d)}</span></p>`).join("")}
      </div>` : ""}
      ${r.met.length ? `<div class="rc-group">
        <h4>You already meet</h4>
        ${r.met.map((x) => `<p class="rc-item rc-i-met">${esc(x)}</p>`).join("")}
      </div>` : ""}
      <a class="rc-apply" href="${esc(o.apply_link || "#")}" target="_blank" rel="noopener">View listing →</a>
    </div>

    <button type="button" class="rc-toggle">Why? ▼</button>
  </article>`;
}

/* ============================================================
   6. WIRING
   ============================================================ */
document.addEventListener("DOMContentLoaded", () => {
  const y = $("#year"); if (y) y.textContent = new Date().getFullYear();

  const toggle = $("#nav-toggle"), nav = $("#site-nav");
  if (toggle && nav) toggle.addEventListener("click", () => {
    const e = toggle.getAttribute("aria-expanded") === "true";
    toggle.setAttribute("aria-expanded", !e);
    nav.classList.toggle("is-open");
  });

  // language checkboxes
  const wrap = $("#p-languages");
  LANGUAGES.forEach((L) => {
    const id = "lang-" + L.toLowerCase();
    wrap.insertAdjacentHTML("beforeend",
      `<label class="rc-check"><input type="checkbox" id="${id}" value="${L}"${L === "English" ? " checked" : ""}><span>${L}</span></label>`);
  });

  // level select
  const lv = $("#p-level");
  LEVELS.forEach((l) => {
    const o = document.createElement("option");
    o.value = l.key; o.textContent = l.label;
    lv.appendChild(o);
  });

  loadOpportunities();

  // file upload
  $("#cv-file").addEventListener("change", async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const status = $("#cv-status");
    status.textContent = "Reading on your device…";
    status.className = "cv-status is-working";
    try {
      const text = await readFile(f);
      if (text.trim().length < 80) throw new Error("Couldn't read much text from that file. Try pasting your CV instead.");
      setCV(text, f.name);
    } catch (err) {
      status.textContent = err.message;
      status.className = "cv-status is-error";
    }
  });

  $("#cv-paste-btn").addEventListener("click", () => {
    const t = $("#cv-paste").value;
    if (t.trim().length < 80) {
      const s = $("#cv-status");
      s.textContent = "Please paste a bit more of your CV.";
      s.className = "cv-status is-error";
      return;
    }
    setCV(t, "pasted text");
  });

  $("#run-btn").addEventListener("click", () => {
    state.profile = {
      country: $("#p-country").value,
      level: $("#p-level").value,
      years: $("#p-years").value,
      languages: $$("#p-languages input:checked").map((i) => i.value),
    };
    if (!state.all.length) {
      alert("Opportunities are still loading. Give it a moment and try again.");
      return;
    }
    runAssessment();
    $("#results-section").hidden = false;
    $("#results-section").scrollIntoView({ behavior: "smooth", block: "start" });
  });

  $("#result-filter").addEventListener("change", render);

  $("#clear-btn").addEventListener("click", () => {
    state.cvText = ""; state.cvSkills = [];
    $("#cv-file").value = ""; $("#cv-paste").value = "";
    $("#cv-status").textContent = "Nothing loaded.";
    $("#cv-status").className = "cv-status";
    $("#skills-found").hidden = true;
    $("#results-section").hidden = true;
    $("#summary").hidden = true;
  });
});

function setCV(text, label) {
  state.cvText = text;
  state.cvSkills = extractSkills(text);
  const s = $("#cv-status");
  s.textContent = `Read ${label} — ${state.cvSkills.length} skill areas detected. Nothing was uploaded.`;
  s.className = "cv-status is-ok";

  const box = $("#skills-found");
  if (state.cvSkills.length) {
    box.hidden = false;
    $("#skills-list").innerHTML = state.cvSkills.slice(0, 10)
      .map((s) => `<span class="rc-skill">${esc(s.domain)}</span>`).join("");
  } else {
    box.hidden = true;
  }
}
