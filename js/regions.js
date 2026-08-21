/* =============================================================
   SCA Opportunities — East & West Africa scope
   Pilot region list for account signup. Job listings themselves
   (Google Sheet data) are not restricted by this list — only who
   can create an account is, for now.
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
};

if (typeof window !== "undefined") window.SCA_REGIONS = SCA_REGIONS;
