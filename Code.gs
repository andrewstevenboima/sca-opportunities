/**
 * =============================================================
 * SCA Opportunities — Google Apps Script Backend
 * =============================================================
 *
 * This script exposes two endpoints for the frontend:
 *   GET  ?action=opportunities  → returns live opportunities as JSON
 *   POST action=subscribe       → appends email to Subscribers tab
 *
 * SETUP (one-time):
 *   1. Create a Google Sheet with two tabs named exactly:
 *        - "Opportunities"
 *        - "Subscribers"
 *      Use the column headers listed in README.md.
 *
 *   2. Open script.google.com → New Project.
 *   3. Paste this entire file into Code.gs.
 *   4. Update SHEET_ID below (copy from your Sheet URL:
 *      https://docs.google.com/spreadsheets/d/SHEET_ID/edit)
 *   5. Deploy → New deployment → type: Web App
 *        - Execute as: Me
 *        - Who has access: Anyone
 *   6. Copy the Web App URL.
 *   7. Paste it into script.js as APPS_SCRIPT_URL.
 *
 * That's it. To update the site, just edit the Sheet — changes
 * appear on the site on next page load.
 * =============================================================
 */

// CONFIG
const SHEET_ID = "REPLACE_WITH_YOUR_SHEET_ID";
const OPPORTUNITIES_TAB = "Opportunities";
const SUBSCRIBERS_TAB = "Subscribers";

/**
 * Handle GET requests → return opportunities as JSON.
 */
function doGet(e) {
  try {
    const action = (e && e.parameter && e.parameter.action) || "opportunities";

    if (action === "opportunities") {
      return jsonResponse(getOpportunities());
    }

    return jsonResponse({ status: "error", message: "Unknown action" }, 400);
  } catch (err) {
    return jsonResponse({ status: "error", message: String(err) }, 500);
  }
}

/**
 * Handle POST requests → subscribe endpoint.
 * Uses FormData (application/x-www-form-urlencoded).
 */
function doPost(e) {
  try {
    const params = (e && e.parameter) || {};
    const action = params.action || "subscribe";

    if (action === "subscribe") {
      return jsonResponse(subscribeEmail(params));
    }

    return jsonResponse({ status: "error", message: "Unknown action" }, 400);
  } catch (err) {
    return jsonResponse({ status: "error", message: String(err) }, 500);
  }
}

/**
 * Read Opportunities tab and return live rows as JSON.
 */
function getOpportunities() {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(OPPORTUNITIES_TAB);
  if (!sheet) throw new Error("Opportunities tab not found");

  const values = sheet.getDataRange().getValues();
  if (values.length < 2) {
    return { opportunities: [], updated: new Date().toISOString() };
  }

  const headers = values[0].map((h) => String(h).trim());
  const rows = values.slice(1);

  const opportunities = rows
    .map((row) => {
      const obj = {};
      headers.forEach((h, i) => {
        let val = row[i];
        // Convert Date objects to ISO strings for the frontend
        if (val instanceof Date) {
          val = Utilities.formatDate(val, "UTC", "yyyy-MM-dd");
        }
        obj[h] = val;
      });
      return obj;
    })
    // Only return rows with a title and live status
    .filter((o) => o.title && String(o.status || "live").toLowerCase() === "live");

  return {
    opportunities: opportunities,
    updated: new Date().toISOString(),
  };
}

/**
 * Append a new subscriber row.
 */
function subscribeEmail(params) {
  const email = String(params.email || "").trim();
  const sourcePage = String(params.source_page || "").trim();

  if (!email || !isValidEmail(email)) {
    return { status: "error", message: "Invalid email address" };
  }

  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SUBSCRIBERS_TAB);
  if (!sheet) throw new Error("Subscribers tab not found");

  // Check for existing subscriber (simple dedupe)
  const existing = sheet.getDataRange().getValues();
  for (let i = 1; i < existing.length; i++) {
    if (String(existing[i][0]).trim().toLowerCase() === email.toLowerCase()) {
      return { status: "success", message: "Already subscribed" };
    }
  }

  sheet.appendRow([
    email,
    new Date().toISOString(),
    sourcePage,
  ]);

  return { status: "success", message: "Subscribed" };
}

/**
 * Helpers
 */
function jsonResponse(obj, statusCode) {
  // Apps Script doesn't support setting HTTP status codes directly on ContentService,
  // but we include a "status" field in the payload for the frontend to inspect.
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * OPTIONAL: Run this once manually from the Apps Script editor
 * to grant the script permission to access your Sheet.
 * After running once, you can delete this function.
 */
function authorizeOnce() {
  const sheet = SpreadsheetApp.openById(SHEET_ID);
  Logger.log("Sheet name: " + sheet.getName());
  Logger.log("Tabs: " + sheet.getSheets().map((s) => s.getName()).join(", "));
}
