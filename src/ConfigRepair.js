/**
 * Repair / audit the Config Google Sheet schema used by the OTP system.
 * Fixes missing required headers (esp. TOKENS.Status) by creating alias columns safely.
 *
 * Run: FIX_ConfigSheetSchema()
 * Optional: FIX_ConfigSheetSchema(true)  // dry run (no writes), logs what it would do
 */
function FIX_ConfigSheetSchema(dryRun) {
  dryRun = !!dryRun;
  var cfg = getConfig_();
  var ss = SpreadsheetApp.openById(cfg.CONFIG_SHEET_ID);

  var report = [];
  function log(line, obj) {
    report.push(line + (obj ? ' ' + JSON.stringify(obj) : ''));
  }

  // Ensure tabs exist
  var requiredTabs = ['TOKENS', 'CL_CODES', 'LOGS', 'JOBS', 'BRAND_CONFIG'];
  requiredTabs.forEach(function(name) {
    var sh = ss.getSheetByName(name);
    if (!sh) {
      log('MISSING TAB -> ' + name);
      if (!dryRun) ss.insertSheet(name);
    }
  });

  // --- TOKENS fixes ---
  var tokens = ss.getSheetByName('TOKENS');
  if (!tokens) {
    log('FATAL: TOKENS tab not found even after ensure.');
    Logger.log(report.join('\n'));
    return { ok: false, report: report };
  }

  // Read header row
  var lastCol = Math.max(tokens.getLastColumn(), 1);
  var headers = tokens.getRange(1, 1, 1, lastCol).getValues()[0].map(function(h){ return String(h || ''); });

  function normHeader_(h) {
    return String(h || '').trim().toLowerCase().replace(/\s+/g, ' ');
  }

  // Build header index map (normalized -> index)
  var idx = {};
  headers.forEach(function(h, i){
    var n = normHeader_(h);
    if (n && !idx[n]) idx[n] = i + 1; // 1-based
  });

  function ensureHeader_(title) {
    var n = normHeader_(title);
    if (idx[n]) return idx[n];
    log('TOKENS: ADD HEADER -> ' + title);
    if (dryRun) return null;
    var insertAt = Math.max(tokens.getLastColumn(), 1) + 1;
    tokens.getRange(1, insertAt).setValue(title);
    idx[n] = insertAt;
    return insertAt;
  }

  // We MUST have Status for validateOtp_()
  // If TokenStatus exists, create Status and copy values so we don't break existing flows.
  var statusCol = idx['status'];
  var tokenStatusCol = idx['tokenstatus'];

  if (!statusCol) {
    if (tokenStatusCol) {
      log('TOKENS: Status missing, TokenStatus exists -> creating Status + copying values');
      if (!dryRun) {
        statusCol = ensureHeader_('Status');
        var lr = tokens.getLastRow();
        if (lr >= 2 && statusCol) {
          var vals = tokens.getRange(2, tokenStatusCol, lr - 1, 1).getValues();
          tokens.getRange(2, statusCol, lr - 1, 1).setValues(vals);
        }
      }
    } else {
      log('TOKENS: Status missing AND TokenStatus missing -> creating empty Status');
      if (!dryRun) {
        statusCol = ensureHeader_('Status');
      }
    }
  } else {
    log('TOKENS: Status OK', { col: statusCol });
  }

  // Ensure Position Link exists (needed for Interview Link redirect storing)
  var posLinkCol = idx['position link'];
  if (!posLinkCol) {
    log('TOKENS: Position Link missing -> adding header');
    if (!dryRun) ensureHeader_('Position Link');
  } else {
    log('TOKENS: Position Link OK', { col: posLinkCol });
  }

  // Optional: sanity check key columns used by current Uniform v3 OTP system
  var expected = [
    'Token', 'Email', 'Email Hash', 'Text For Email', 'Brand',
    'Status', 'Expiry', 'Created At', 'Used At', 'Trace ID', 'OTP', 'Attempts', 'Position Link'
  ];

  var missing = [];
  expected.forEach(function(h){
    if (!idx[normHeader_(h)]) missing.push(h);
  });

  if (missing.length) {
    log('TOKENS: WARNING missing expected headers (may be OK depending on your code)', { missing: missing });
  } else {
    log('TOKENS: Expected headers look OK');
  }

  Logger.log(report.join('\n'));
  return { ok: true, dryRun: dryRun, report: report };
}

/**
 * Convenience runner for dry-run mode from Apps Script editor Run menu.
 */
function RUN_FIX_ConfigSheetSchema_DryRun() {
  var result = FIX_ConfigSheetSchema(true);
  Logger.log('DRY RUN RESULT: ' + JSON.stringify(result));
  return result;
}

/**
 * Convenience runner for apply mode from Apps Script editor Run menu.
 */
function RUN_FIX_ConfigSheetSchema_Apply() {
  var result = FIX_ConfigSheetSchema(false);
  Logger.log('APPLY RESULT: ' + JSON.stringify(result));
  return result;
}
