/******************************************************
 * Crew OTP v2 — Google Sheet LOCKED Fix
 *
 * ✅ Goal:
 * When Status becomes "USED", write "LOCKED" into column AB (or "Locked" header).
 *
 * ✅ Works two ways:
 * 1) Auto-lock on edit (when someone/something edits Status to USED)
 * 2) You can also call markRowUsedAndLock_() from your OTP code path
 *
 * IMPORTANT:
 * - Set TOKENS_SHEET_NAME to your tab name (recommended).
 * - If you leave it blank "", it will use the first sheet tab.
 ******************************************************/

const TOKENS_SHEET_NAME = "TOKENS"; // e.g. "TOKENS" or "Tokens". Leave "" to use first tab.

// Headers (row 1)
const HDR_STATUS = "Status";
const HDR_LOCKED = "Locked";

// Values
const STATUS_USED = "USED";
const LOCKED_VALUE = "LOCKED";

// If you want to force AB always (AB=28), set true.
// If false, it will find the "Locked" header column by name (recommended).
const FORCE_AB_LOCKED = false;
const AB_COL_INDEX = 28; // AB

/******************** ENTRYPOINT 1: Auto-lock on edit ********************/
/**
 * Simple trigger: runs when a user edits the sheet.
 * If Status is edited to USED, it writes LOCKED.
 *
 * NOTE:
 * - Simple triggers run as the editor.
 * - If you need it to run for programmatic edits from another script,
 *   use the manual call approach in your OTP code (see ENTRYPOINT 2).
 */
function onEdit(e) {
  try {
    if (!e || !e.range) return;

    const sheet = e.range.getSheet();
    if (!isTokensSheet_(sheet)) return;

    const row = e.range.getRow();
    if (row === 1) return; // ignore header row

    // Only react when the edited cell is in the Status column
    const statusCol = findColByHeader_(sheet, HDR_STATUS);
    if (statusCol === -1) return;

    if (e.range.getColumn() !== statusCol) return;

    const newVal = norm_(e.value);
    if (newVal !== norm_(STATUS_USED)) return;

    lockRow_(sheet, row);
  } catch (err) {
    // Keep trigger safe: don't throw hard errors
    Logger.log("[LOCKED_FIX][onEdit] " + (err && err.stack ? err.stack : err));
  }
}

/******************** ENTRYPOINT 2: Call from OTP code ********************/
/**
 * Call this from the exact place you set Status = USED.
 *
 * Example usage inside your OTP flow:
 *   markRowUsedAndLock_({ email: userEmail, token: tokenValue });
 *
 * It finds the row (by token if provided; otherwise by email+latest USED),
 * sets Status=USED if not already, and writes LOCKED.
 */
function markRowUsedAndLock_(params) {
  const sheet = getTokensSheet_();
  const statusCol = mustFindCol_(sheet, HDR_STATUS);

  // Find row by token (best), fallback by email
  const row = findRowForLocking_(sheet, params || {});
  if (row < 2) throw new Error("Could not find a TOKENS row to mark USED + LOCKED.");

  // Ensure Status is USED
  const currentStatus = norm_(sheet.getRange(row, statusCol).getDisplayValue());
  if (currentStatus !== norm_(STATUS_USED)) {
    sheet.getRange(row, statusCol).setValue(STATUS_USED);
  }

  // LOCK it
  lockRow_(sheet, row);

  return { ok: true, row };
}

/******************** OPTIONAL: One-time backfill ********************/
/**
 * Run once to backfill: for any row where Status=USED and Locked is blank,
 * write LOCKED.
 */
function backfillLockedForUsedRows() {
  const sheet = getTokensSheet_();
  const statusCol = mustFindCol_(sheet, HDR_STATUS);
  const lockedCol = getLockedCol_(sheet);

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  const statusVals = sheet.getRange(2, statusCol, lastRow - 1, 1).getDisplayValues();
  const lockedVals = sheet.getRange(2, lockedCol, lastRow - 1, 1).getDisplayValues();

  let updates = 0;
  for (let i = 0; i < statusVals.length; i++) {
    const row = i + 2;
    const st = norm_(statusVals[i][0]);
    const lk = norm_(lockedVals[i][0]);
    if (st === norm_(STATUS_USED) && !lk) {
      sheet.getRange(row, lockedCol).setValue(LOCKED_VALUE);
      updates++;
    }
  }

  Logger.log(`[LOCKED_FIX] Backfill done. Updated ${updates} row(s).`);
}

/******************** CORE: lock row ********************/
function lockRow_(sheet, row) {
  const lockedCol = getLockedCol_(sheet);

  const current = norm_(sheet.getRange(row, lockedCol).getDisplayValue());
  if (current === norm_(LOCKED_VALUE)) {
    Logger.log(`[LOCKED_FIX] Row ${row} already LOCKED.`);
    return;
  }

  sheet.getRange(row, lockedCol).setValue(LOCKED_VALUE);
  Logger.log(`[LOCKED_FIX] Applied LOCKED at row=${row} col=${lockedCol}.`);
}

/******************** HELPERS ********************/
function getTokensSheet_() {
  const ssId = "1qM3ZEdBsvbEofDH8DayRWcRa4bUcrKQIv8kzKSYZ1AM"; // your Google Sheet ID
  const ss = SpreadsheetApp.openById(ssId);

  if (!TOKENS_SHEET_NAME) return ss.getSheets()[0];

  const sh = ss.getSheetByName(TOKENS_SHEET_NAME);
  if (!sh) throw new Error(`TOKENS sheet tab not found: "${TOKENS_SHEET_NAME}"`);
  return sh;
}

function isTokensSheet_(sheet) {
  if (!TOKENS_SHEET_NAME) return true; // if not specified, assume active first tab is correct
  return sheet.getName() === TOKENS_SHEET_NAME;
}

function getLockedCol_(sheet) {
  if (FORCE_AB_LOCKED) return AB_COL_INDEX;

  const lockedCol = findColByHeader_(sheet, HDR_LOCKED);
  if (lockedCol === -1) {
    // fallback to AB if header missing
    return AB_COL_INDEX;
  }
  return lockedCol;
}

function mustFindCol_(sheet, header) {
  const col = findColByHeader_(sheet, header);
  if (col === -1) throw new Error(`Header not found in row 1: "${header}"`);
  return col;
}

function findColByHeader_(sheet, headerName) {
  const lastCol = sheet.getLastColumn();
  if (lastCol < 1) return -1;

  const headers = sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
  const target = norm_(headerName);

  for (let i = 0; i < headers.length; i++) {
    if (norm_(headers[i]) === target) return i + 1; // 1-based
  }
  return -1;
}

function findRowForLocking_(sheet, params) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;

  // Try token-based match if your sheet has a "Token" header
  const token = (params.token || "").trim();
  const email = (params.email || "").trim();

  const tokenCol = findColByHeader_(sheet, "Token");
  const emailCol = findColByHeader_(sheet, "Email");
  const createdCol = findColByHeader_(sheet, "Created At"); // for newest match preference

  // 1) Match by token (fast, accurate)
  if (token && tokenCol !== -1) {
    const tokenVals = sheet.getRange(2, tokenCol, lastRow - 1, 1).getDisplayValues();
    for (let i = 0; i < tokenVals.length; i++) {
      if (String(tokenVals[i][0]).trim() === token) return i + 2;
    }
  }

  // 2) Match by email: choose the newest row for that email (if Created At exists)
  if (email && emailCol !== -1) {
    const emailVals = sheet.getRange(2, emailCol, lastRow - 1, 1).getDisplayValues();

    if (createdCol !== -1) {
      const createdVals = sheet.getRange(2, createdCol, lastRow - 1, 1).getDisplayValues();
      let bestRow = -1;
      let bestTime = -1;

      for (let i = 0; i < emailVals.length; i++) {
        if (String(emailVals[i][0]).trim().toLowerCase() !== email.toLowerCase()) continue;

        const dt = Date.parse(String(createdVals[i][0]).trim());
        const t = isNaN(dt) ? 0 : dt;
        if (t >= bestTime) {
          bestTime = t;
          bestRow = i + 2;
        }
      }
      if (bestRow !== -1) return bestRow;
    } else {
      // no Created At: just take last matching row
      for (let i = emailVals.length - 1; i >= 0; i--) {
        if (String(emailVals[i][0]).trim().toLowerCase() === email.toLowerCase()) return i + 2;
      }
    }
  }

  return -1;
}

function norm_(v) {
  return String(v == null ? "" : v).trim().toLowerCase();
}