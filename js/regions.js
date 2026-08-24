/* =============================================================
   SCA Opportunities — Africa-wide region/country list
   Powers the region → country cascade on signup (login.html) and
   profile editing (account.html). Regions follow the standard UN
   geoscheme for Africa; job listings themselves (Google Sheet data)
   are not restricted by this list — only what a student can select
   for their own profile is.
   ============================================================= */
const SCA_REGIONS = {
  "East Africa": [
    "Rwanda",
    "Kenya",
    "Uganda",
    "Tanzania",
    "Burundi",
    "Ethiopia",
    "South Sudan",
    "Somalia",
    "Djibouti",
    "Comoros",
    "Eritrea",
    "Madagascar",
    "Malawi",
    "Mauritius",
    "Mozambique",
    "Seychelles",
    "Zambia",
    "Zimbabwe",
  ],
  "West Africa": [
    "Nigeria",
    "Ghana",
    "Senegal",
    "Côte d'Ivoire",
    "Sierra Leone",
    "Liberia",
    "Guinea",
    "Mali",
    "Burkina Faso",
    "Benin",
    "Togo",
    "Niger",
    "The Gambia",
    "Guinea-Bissau",
    "Cabo Verde",
    "Mauritania",
  ],
  "North Africa": [
    "Algeria",
    "Egypt",
    "Libya",
    "Morocco",
    "Sudan",
    "Tunisia",
  ],
  "Central Africa": [
    "Angola",
    "Cameroon",
    "Central African Republic",
    "Chad",
    "Republic of the Congo",
    "Democratic Republic of the Congo",
    "Equatorial Guinea",
    "Gabon",
    "São Tomé and Príncipe",
  ],
  "Southern Africa": [
    "Botswana",
    "Eswatini",
    "Lesotho",
    "Namibia",
    "South Africa",
  ],
};

if (typeof window !== "undefined") window.SCA_REGIONS = SCA_REGIONS;
