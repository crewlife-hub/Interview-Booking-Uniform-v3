/**
 * FIX_ALL_SHEET_HEADERS
 * Repairs header mismatches in the CONFIG Google Sheet used by the OTP system.
 * Creates alias headers expected by code (Status, Expiry, Created At, Used At, etc.)
 * by copying values from existing columns (TokenStatus, TokenExpiryEpoch, CreatedAt, UsedAt...).
 *
 * Run:
 *   FIX_ALL_SHEET_HEADERS(true)   // dry run
 *   FIX_ALL_SHEET_HEADERS(false)  // apply
 */
function FIX_ALL_SHEET_HEADERS(dryRun) {
  dryRun = !!dryRun;

  var cfg = getConfig_();
  var ss = SpreadsheetApp.openById(cfg.CONFIG_SHEET_ID);

  var report = [];
  function log(msg, obj) {
    report.push(msg + (obj ? ' ' + JSON.stringify(obj) : ''));
  }

  function norm_(s) {
    return String(s || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  }

  function getHeaderMap_(headers) {
    var m = {};
    headers.forEach(function(h, i) {
      var k = norm_(h);
      if (k && !m[k]) m[k] = i + 1; // 1-based col
    });
    return m;
  }

  function ensureCol_(sh, headers, headerMap, title) {
    var k = norm_(title);
    if (headerMap[k]) return headerMap[k];
    var newCol = sh.getLastColumn() + 1;
    log('ADD HEADER', { sheet: sh.getName(), title: title, col: newCol });
    if (!dryRun) sh.getRange(1, newCol).setValue(title);
    headers.push(title);
    headerMap[k] = newCol;
    return newCol;
  }

  // Copy values without clobbering any existing non-empty values.
  function copyColSafe_(sh, fromCol, toCol) {
    var lr = sh.getLastRow();
    if (fromCol < 1 || toCol < 1) return;
    if (lr < 2) return;

    var fromVals = sh.getRange(2, fromCol, lr - 1, 1).getValues();
    var toVals = sh.getRange(2, toCol, lr - 1, 1).getValues();

    var out = toVals.map(function(r, i) {
      var existing = r[0];
      if (existing !== '' && existing !== null && typeof existing !== 'undefined') return [existing];
      return [fromVals[i][0]];
    });

    if (!dryRun) sh.getRange(2, toCol, lr - 1, 1).setValues(out);
  }

  // Fill date column from epoch seconds/ms without clobbering existing non-empty values.
  function fillDateFromEpochSafe_(sh, epochCol, dateCol) {
    var lr = sh.getLastRow();
    if (lr < 2) return;

    var epochs = sh.getRange(2, epochCol, lr - 1, 1).getValues();
    var existingDates = sh.getRange(2, dateCol, lr - 1, 1).getValues();

    var out = existingDates.map(function(r, i) {
      var existing = r[0];
      if (existing !== '' && existing !== null && typeof existing !== 'undefined') return [existing];

      var v = epochs[i][0];
      if (v === '' || v === null || typeof v === 'undefined') return [''];
      var n = Number(v);
      if (!isFinite(n)) return [''];
      if (n < 1e12) n = n * 1000; // seconds -> ms
      return [new Date(n)];
    });

    if (!dryRun) sh.getRange(2, dateCol, lr - 1, 1).setValues(out);
  }

  // ---- Ensure required tabs exist (non-blocking) ----
  var requiredTabs = ['TOKENS', 'CL_CODES', 'LOGS', 'JOBS', 'BRAND_CONFIG'];
  requiredTabs.forEach(function(name) {
    if (!ss.getSheetByName(name)) {
      log('MISSING TAB', { tab: name });
      if (!dryRun) ss.insertSheet(name);
    }
  });

  // ==========================================================
  // TOKENS TAB: Create aliases expected by code
  // ==========================================================
  var tokens = ss.getSheetByName('TOKENS');
  if (!tokens) {
    log('FATAL', { reason: 'TOKENS tab missing' });
    Logger.log(report.join('\n'));
    return { ok: false, report: report };
  }

  var lastCol = Math.max(tokens.getLastColumn(), 1);
  var headers = tokens.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
  var hmap = getHeaderMap_(headers);

  // Map: expectedHeader -> existingHeader
  // We will ADD expectedHeader if missing and COPY values from existingHeader where possible
  var aliasCopies = [
    { expected: 'Status', source: 'TokenStatus' },
    { expected: 'Expiry', source: 'TokenExpiryEpoch', epochToDate: true },
    { expected: 'Created At', source: 'CreatedAt' },
    { expected: 'Used At', source: 'UsedAt' },
    { expected: 'Email Hash', source: 'EmailHash' },
    { expected: 'Text For Email', source: 'TextForEmail' },
    { expected: 'Trace ID', source: 'TraceId' },
    { expected: 'OTP', source: 'Otp' }
  ];

  // Always ensure these exist (even if no source)
  var ensureOnly = ['Token', 'Email', 'Brand', 'Position Link'];

  // 1) Ensure “ensureOnly” headers exist
  ensureOnly.forEach(function(name) {
    ensureCol_(tokens, headers, hmap, name);
  });

  // 2) Apply alias copies
  aliasCopies.forEach(function(rule) {
    var expCol = hmap[norm_(rule.expected)];
    var srcCol = hmap[norm_(rule.source)];

    if (!expCol) expCol = ensureCol_(tokens, headers, hmap, rule.expected);

    if (srcCol) {
      log('COPY COLUMN (safe)', { sheet: 'TOKENS', from: rule.source, to: rule.expected });
      if (!dryRun) {
        if (rule.epochToDate) {
          fillDateFromEpochSafe_(tokens, srcCol, expCol);
        } else {
          copyColSafe_(tokens, srcCol, expCol);
        }
      }
    } else {
      log('SOURCE MISSING (skip copy)', { sheet: 'TOKENS', expected: rule.expected, source: rule.source });
    }
  });

  // ==========================================================
  // CL_CODES TAB: ensure commonly expected headers exist
  // ==========================================================
  var cl = ss.getSheetByName('CL_CODES');
  if (cl) {
    var clHeaders = cl.getRange(1, 1, 1, Math.max(cl.getLastColumn(), 1)).getValues()[0].map(String);
    var clMap = getHeaderMap_(clHeaders);

    ['Brand', 'CL Code', 'BookingUrl', 'Active'].forEach(function(name) {
      if (!clMap[norm_(name)]) {
        log('CL_CODES: ADD HEADER', { title: name });
        if (!dryRun) cl.getRange(1, cl.getLastColumn() + 1).setValue(name);
      }
    });
  }

  Logger.log(report.join('\n'));
  return { ok: true, dryRun: dryRun, report: report };
}
