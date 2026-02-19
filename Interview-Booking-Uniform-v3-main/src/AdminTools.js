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
  var webAppUrl = 'https://script.google.com/macros/s/AKfycbz5YyCDdmGnKZaMyv47Xu6MWVy6JhU7_R3yLtBePkYP131iIrIp1ptX0l5hJipUVtL4RA/exec';
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
    if (existing[i].getHandlerFunction() === 'processSidewaysInvites_') {
      ScriptApp.deleteTrigger(existing[i]);
      Logger.log('Removed existing trigger: ' + existing[i].getUniqueId());
    }
  }

  // Create new every-5-minute trigger
  var trigger = ScriptApp.newTrigger('processSidewaysInvites_')
    .timeBased()
    .everyMinutes(5)
    .create();

  Logger.log('✅ Trigger installed: processSidewaysInvites_ every 5 minutes (ID: ' + trigger.getUniqueId() + ')');
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
    if (existing[i].getHandlerFunction() === 'processSidewaysInvites_') {
      ScriptApp.deleteTrigger(existing[i]);
      removed++;
    }
  }
  Logger.log('Removed ' + removed + ' trigger(s) for processSidewaysInvites_');
  return { ok: true, removed: removed };
}

/**
 * MANUAL RUNNER: Process Sideways for a single brand (for testing)
 *
 * Defaults to dry-run mode (sends to testEmail) to avoid spamming candidates.
 *
 * @param {string} brand - e.g. ROYAL, COSTA, SEACHEFS
 * @param {Object=} opts
 * @param {boolean=} opts.dryRun - default true
 * @param {string=} opts.testEmail - default info@crewlifeatsea.com (when dryRun)
 * @param {number=} opts.limit - default 200
 * @returns {Object} worker result
 */
function runSidewaysForBrand(brand, opts) {
  opts = opts || {};

  var b = String(brand || '').toUpperCase().trim();
  if (!b) return { ok: false, error: 'brand is required (e.g. ROYAL)' };

  var dryRun = (opts.dryRun === undefined) ? true : !!opts.dryRun;
  var testEmail = opts.testEmail || null;
  var limit = (opts.limit === undefined) ? 200 : Number(opts.limit);

  if (dryRun && !testEmail) testEmail = 'info@crewlifeatsea.com';

  Logger.log('runSidewaysForBrand: brand=%s dryRun=%s testEmail=%s limit=%s', b, dryRun, testEmail || '(none)', limit);
  var res = processSidewaysInvites_({ brand: b, dryRun: dryRun, testEmail: testEmail, limit: limit });
  Logger.log('runSidewaysForBrand: result=%s', JSON.stringify(res));
  return res;
}

// Convenience helpers for quick testing from the Apps Script UI
function runSideways_ROYAL() {
  return runSidewaysForBrand('ROYAL', { dryRun: true, testEmail: 'info@crewlifeatsea.com' });
}

function runSideways_COSTA() {
  return runSidewaysForBrand('COSTA', { dryRun: true, testEmail: 'info@crewlifeatsea.com' });
}

function runSideways_SEACHEFS() {
  return runSidewaysForBrand('SEACHEFS', { dryRun: true, testEmail: 'info@crewlifeatsea.com' });
}
