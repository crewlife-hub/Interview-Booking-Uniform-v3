/**
 * AdminTools.gs
 * Small helpers to trigger Apps Script authorization and run quick admin checks.
 */

/**
 * Set the web app deployment URL in script properties.
 * Run this once after creating/updating a deployment.
 * @param {string} url - The /exec URL from Manage deployments
 */
function setWebAppUrl(url) {
  if (!url) {
    Logger.log('Usage: setWebAppUrl("https://script.google.com/macros/s/DEPLOY_ID/exec")');
    return { ok: false, error: 'URL required' };
  }
  var props = PropertiesService.getScriptProperties();
  props.setProperty('WEB_APP_EXEC_URL', url);
  Logger.log('WEB_APP_EXEC_URL set to: ' + url);
  return { ok: true, url: url };
}

/**
 * Get current web app URL from config
 */
function getWebAppUrlDebug() {
  var url = getWebAppUrl_();
  Logger.log('Current getWebAppUrl_() returns: ' + url);
  return url;
}

/**
 * ONE-CLICK SETUP: Run this function to complete all setup steps
 * 1. Authorizes the script
 * 2. Sets the web app URL
 * 3. Runs diagnostics
 */
function setupWebApp() {
  Logger.log('=== CREW BOOKING SETUP START ===');
  var results = {};
  
  // Step 1: Authorize
  Logger.log('Step 1: Authorizing script...');
  try {
    var authRes = ensureConfigSheetTabs_();
    results.authorized = true;
    Logger.log('✓ Script authorized');
  } catch (e) {
    results.authorized = false;
    Logger.log('✗ Authorization failed: ' + e);
  }
  
  // Step 2: Set the web app URL to the known deployment
  Logger.log('Step 2: Setting web app URL...');
  var webAppUrl = 'https://script.google.com/macros/s/AKfycbx-IEEieMEvXPf0cXC_R_y6KKtWOMkA2nXJkU1mu8XlIMY7MnCn5eamrzjzvre0frZm0Q/exec';
  try {
    var props = PropertiesService.getScriptProperties();
    props.setProperty('WEB_APP_EXEC_URL', webAppUrl);
    results.webAppUrl = webAppUrl;
    Logger.log('✓ Web app URL set: ' + webAppUrl);
  } catch (e) {
    Logger.log('✗ Failed to set URL: ' + e);
  }
  
  // Step 3: Run diagnostics
  Logger.log('Step 3: Running diagnostics...');
  try {
    var diag = debugDump_('ROYAL');
    results.diagnostics = diag;
    Logger.log('✓ Diagnostics passed');
  } catch (e) {
    Logger.log('✗ Diagnostics failed: ' + e);
  }
  
  Logger.log('=== SETUP COMPLETE ===');
  Logger.log('Setup results: ' + JSON.stringify(results, null, 2));
  Logger.log('');
  Logger.log('Next steps:');
  Logger.log('1. Open this URL in a fresh incognito window:');
  Logger.log('   ' + webAppUrl);
  Logger.log('2. You should see the "Book Your Interview" form');
  Logger.log('3. Fill in the form and click "Book Your Interview"');
  Logger.log('');
  
  return results;
}

/**
 * Test if POST requests can reach the server
 * Run this, then check logs to see if POST request was logged
 */
function testPostReachability() {
  Logger.log('=== POST REACHABILITY TEST ===');
  Logger.log('This test will try to POST to the web app');
  Logger.log('');
  Logger.log('URL to test: ' + getWebAppUrl_());
  Logger.log('');
  Logger.log('From the browser, open the developer console and run:');
  Logger.log('');
  Logger.log(`
fetch('${getWebAppUrl_()}', {
  method: 'POST',
  headers: {'Content-Type': 'application/x-www-form-urlencoded'},
  body: 'action=debugecho&test=1'
})
.then(r => r.text())
.then(t => {
  try {
    console.log('JSON Response:', JSON.parse(t));
  } catch(e) {
    console.log('HTML Response (BAD):', t.substring(0, 200));
  }
});
`);
  Logger.log('');
  Logger.log('If you see HTML (with <!doctype or oauth-dialog), the deployment "Execute as" is wrong.');
  Logger.log('If you see JSON (with "ok" field), POST is working correctly.');
  Logger.log('');
  
  return {
    webAppUrl: getWebAppUrl_(),
    timestamp: new Date().toISOString()
  };
}

function authorizeScript() {
  try {
    // ensureConfigSheetTabs_ touches SpreadsheetApp and will prompt for required scopes
    var res = ensureConfigSheetTabs_();
    Logger.log('authorizeScript: result=%s', JSON.stringify(res));
    return res;
  } catch (e) {
    Logger.log('authorizeScript: error=%s', String(e));
    return { ok: false, error: String(e) };
  }
}

function runDiagOnce() {
  try {
    var html = serveDiagPage_();
    Logger.log('runDiagOnce: served diag page');
    return { ok: true };
  } catch (e) {
    Logger.log('runDiagOnce: error=%s', String(e));
    return { ok: false, error: String(e) };
  }
}

/**
 * INSTALL TIME-BASED TRIGGER for processSidewaysInvites_
 * ---------------------------------------------------------------------------
 * Run this function ONCE from the Apps Script editor to create the trigger.
 * It will fire every 5 minutes, scan all brand Smartsheets for rows where
 * "SEND Interview Invite" = "Sideways", send the token-gated booking email,
 * and mark the row "🔔Sent".
 *
 * Safe to run multiple times — removes any duplicate triggers first.
 */
function installProcessSidewaysTrigger() {
  // Remove any existing triggers for this function to avoid duplicates
  var existing = ScriptApp.getProjectTriggers();
  for (var i = 0; i < existing.length; i++) {
    var handler = existing[i].getHandlerFunction();
    if (handler === 'processSidewaysInvitesScheduled_' || handler === 'processSidewaysInvites_') {
      ScriptApp.deleteTrigger(existing[i]);
      Logger.log('Removed existing trigger: ' + existing[i].getUniqueId());
    }
  }

  // Create new every-5-minute trigger
  var trigger = ScriptApp.newTrigger('processSidewaysInvitesScheduled_')
    .timeBased()
    .everyMinutes(5)
    .create();

  Logger.log('✅ Trigger installed: processSidewaysInvitesScheduled_ every 5 minutes (ID: ' + trigger.getUniqueId() + ')');
  Logger.log('Go to Triggers page in Apps Script to confirm.');
  return { ok: true, triggerId: trigger.getUniqueId(), interval: '5 minutes' };
}

/**
 * REMOVE the time-based trigger for processSidewaysInvites_
 * Run this if you want to pause the automated sending.
 */
function removeProcessSidewaysTrigger() {
  var existing = ScriptApp.getProjectTriggers();
  var removed = 0;
  for (var i = 0; i < existing.length; i++) {
    var handler = existing[i].getHandlerFunction();
    if (handler === 'processSidewaysInvitesScheduled_' || handler === 'processSidewaysInvites_') {
      ScriptApp.deleteTrigger(existing[i]);
      removed++;
    }
  }
  Logger.log('Removed ' + removed + ' trigger(s) for processSidewaysInvites_');
  return { ok: true, removed: removed };
}

/**
 * MANUAL RUNNER: Process Sideways for a single brand.
 *
 * Flags:
 *   limit   (optional)      — max rows to process
 *
 * NO testEmail — emails always go to the real candidate address.
 *
 * @param {string} brand - e.g. ROYAL, COSTA, SEACHEFS
 * @param {Object=} opts
 * @param {number=} opts.limit - default 200
 * @returns {Object} worker result
 */
function runSidewaysForBrand(brand, opts) {
  opts = opts || {};

  var b = String(brand || '').toUpperCase().trim();
  if (!b) {
    Logger.log('ERROR: brand is required. Use runSideways_ROYAL(), runSideways_COSTA(), or runSideways_SEACHEFS() instead.');
    return { ok: false, error: 'brand is required (e.g. ROYAL)' };
  }

  var limit = (opts.limit === undefined || opts.limit === null || opts.limit === '')
    ? Number.MAX_SAFE_INTEGER
    : Number(opts.limit);
  if (!isFinite(limit) || limit <= 0) limit = Number.MAX_SAFE_INTEGER;

  var cfg = getConfig_();
  var apiToken = cfg.SMARTSHEET_API_TOKEN;
  if (!apiToken) {
    Logger.log('ERROR: SMARTSHEET API token not configured');
    return { ok: false, error: 'SMARTSHEET API token not configured' };
  }

  var traceId = generateTraceId_();
  var sheetIds = getSmartsheetIdsForBrand_(b) || [];
  if (!sheetIds.length) {
    Logger.log('runSidewaysForBrand: no sheets found for brand=%s', b);
    return { ok: true, summary: { brand: b, totalRows: 0, sidewaysFound: 0, emailsSent: 0, updatesWritten: 0, failures: 0 } };
  }

  var summary = {
    brand: b,
    totalRows: 0,
    sidewaysFound: 0,
    emailsSent: 0,
    updatesWritten: 0,
    failures: 0,
    processed: 0,
    skipped: 0,
    errors: []
  };

  Logger.log('runSidewaysForBrand: brand=%s sheets=%s limit=%s', b, sheetIds.length, limit === Number.MAX_SAFE_INTEGER ? '(none)' : limit);

  for (var i = 0; i < sheetIds.length; i++) {
    if (summary.processed >= limit) break;
    var remaining = limit - summary.processed;
    var res = processSidewaysForSheet_(sheetIds[i], b, {
      apiToken: apiToken,
      traceId: traceId,
      limit: remaining
    });

    if (!res.ok) {
      summary.failures += 1;
      summary.errors.push({ sheetId: sheetIds[i], error: res.error || 'Sheet processing failed' });
      continue;
    }

    summary.totalRows += (res.totalRows || 0);
    summary.sidewaysFound += (res.sidewaysFound || 0);
    summary.emailsSent += (res.emailsSent || 0);
    summary.updatesWritten += (res.updatesWritten || 0);
    summary.failures += (res.failures || 0);
    summary.processed += (res.processed || 0);
    summary.skipped += (res.skipped || 0);
    if (res.errors && res.errors.length) {
      for (var e = 0; e < res.errors.length; e++) summary.errors.push(res.errors[e]);
    }
  }

  Logger.log('runSidewaysForBrand: result=%s', JSON.stringify(summary));
  return { ok: true, summary: summary };
}

// Convenience helpers (always LIVE)
function runSideways_ROYAL() {
  return runSidewaysForBrand('ROYAL');
}

function runSidewaysLive_ROYAL() {
  return runSidewaysForBrand('ROYAL');
}

/**
 * DIAGNOSTIC: Dump all column IDs and titles for a brand's Smartsheet.
 * Run this from the editor to find the exact column IDs you need.
 * Usage: dumpSheetColumns_ROYAL()  or  dumpSheetColumns('ROYAL')
 */
function dumpSheetColumns(brand) {
  var b = getBrand_(String(brand || '').toUpperCase());
  if (!b) { Logger.log('Unknown brand: ' + brand); return; }
  var cfg = getConfig_();
  var apiToken = cfg.SMARTSHEET_API_TOKEN;
  if (!apiToken) { Logger.log('No SMARTSHEET_API_TOKEN'); return; }
  var sheetId = b.smartsheetId;
  Logger.log('=== Columns for ' + brand + ' sheet ' + sheetId + ' ===');
  var sheetData = fetchSmartsheet_(sheetId, apiToken);
  if (!sheetData.ok) { Logger.log('Fetch failed: ' + sheetData.error); return; }
  var cols = sheetData.columns || [];
  for (var i = 0; i < cols.length; i++) {
    var c = cols[i];
    var info = 'COL[' + i + ']  id: ' + c.id + '  title: "' + c.title + '"';
    if (c.formula) info += '  [HAS FORMULA]';
    if (c.type) info += '  type: ' + c.type;
    Logger.log(info);
  }
  Logger.log('=== Total: ' + cols.length + ' columns ===');
  return cols.length;
}

function dumpSheetColumns_ROYAL() { return dumpSheetColumns('ROYAL'); }
function dumpSheetColumns_COSTA() { return dumpSheetColumns('COSTA'); }
function dumpSheetColumns_SEACHEFS() { return dumpSheetColumns('SEACHEFS'); }

function runSideways_COSTA() {
  return runSidewaysForBrand('COSTA');
}
function runSidewaysLive_COSTA() {
  return runSidewaysForBrand('COSTA');
}

function runSideways_SEACHEFS() {
  return runSidewaysForBrand('SEACHEFS');
}
function runSidewaysLive_SEACHEFS() {
  return runSidewaysForBrand('SEACHEFS');
}
