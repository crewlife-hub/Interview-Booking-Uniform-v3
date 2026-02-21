/**
 * Router.gs
 * HTTP entry points (doGet/doPost), page routing, global error handling.
 * CrewLife Interview Bookings Uniform Core
 */

/**
 * Handle GET requests - BULLETPROOF: NEVER returns blank page.
 * @param {Object} e - Event object with parameters
 * @returns {HtmlOutput|TextOutput} Response
 */
function doGet(e) {
  var traceId = '';
  var step = 'INIT';
  var stepLog = [];
  
  function logStep(s, data) {
    step = s;
    stepLog.push({ step: s, ts: new Date().toISOString(), data: data || {} });
  }
  
  try {
    logStep('GENERATE_TRACE_ID');
    traceId = generateTraceId_();
    
    logStep('PARSE_PARAMS');
    var params = e && e.parameter ? e.parameter : {};
    var page = (params.page || '').toLowerCase();
    var brand = (params.brand || '').toUpperCase();
    var token = params.token || '';
    logStep('PARAMS_PARSED', { page: page, brand: brand, hasToken: !!token });

    // Route: Diagnostics via ?diag=1 (shortcut)
    if (params.diag === '1') {
      logStep('ROUTE_DIAG_SHORTCUT');
      return serveDiagPage_(brand, traceId);
    }

    // Route: No brand → Brand selector
    if (!brand && !page) {
      logStep('ROUTE_BRAND_SELECTOR');
      return serveBrandSelector_();
    }

    // Route: Diagnostics (self-test)
    if (page === 'diag') {
      logStep('ROUTE_DIAG_PAGE');
      return serveDiagPage_(brand, traceId);
    }

    // Route: Admin console (disabled) — redirect to start page
    if (page === 'admin') {
      logStep('ROUTE_ADMIN_DISABLED');
      return serveBrandSelector_();
    }

    // Route: Admin data debug (returns JSON used to render admin UI)
    if (page === 'admindata') {
      logStep('ROUTE_ADMIN_DATA');
      return serveAdminData_(brand, params, traceId);
    }

    // Route: OTP request page (from Smartsheet email signed link)
    if (page === 'otp') {
      logStep('ROUTE_OTP_REQUEST');
      return serveOtpRequestPage_(params, traceId);
    }

    // Route: OTP verification page
    if (page === 'verify') {
      logStep('ROUTE_OTP_VERIFY');
      return serveOtpVerifyPage_(params, traceId);
    }

    // Route: Secure booking access (confirm gate + one-time redirect)
    if (page === 'access') {
      logStep('ROUTE_ACCESS', { confirm: params.confirm });
      if (String(params.confirm || '') === '1') {
        return handleSecureAccessConfirm_(params, traceId);
      }
      return serveSecureAccess_(params, traceId);
    }

    // Route: Token-only CTA (no page param) — treat as secure access
    if (token && !page) {
      logStep('ROUTE_TOKEN_ACCESS', { tokenPrefix: token.substring(0, 8) });
      if (String(params.confirm || '') === '1') {
        return handleSecureAccessConfirm_(params, traceId);
      }
      return serveSecureAccess_(params, traceId);
    }

    // Route: Booking confirmation page (legacy — neutered, use secure access flow)
    if (page === 'booking') {
      logStep('ROUTE_BOOKING_DEPRECATED');
      return serveErrorPage_('Deprecated', 'This page is no longer available. Please use the secure access link from your email.', traceId);
    }

    // Route: Token verification (legacy candidate flow)
    if (token) {
      logStep('ROUTE_CANDIDATE_CONFIRM');
      return serveCandidateConfirm_(brand, token, traceId);
    }

    // Route: Brand landing (shouldn't happen normally, redirect to admin)
    if (brand && isValidBrand_(brand)) {
      logStep('ROUTE_ADMIN_CONSOLE');
      return serveAdminConsole_(brand, params, traceId);
    }

    // Fallback: Brand selector
    logStep('ROUTE_FALLBACK');
    return serveBrandSelector_();

  } catch (err) {
    // BULLETPROOF: Log error, email admin, and ALWAYS return styled error page
    var errMsg = String(err);
    var errStack = err.stack || '';
    
    try {
      logEvent_(traceId || 'NO_TRACE', '', '', 'ROUTER_FATAL_ERROR', {
        error: errMsg,
        stack: errStack,
        step: step,
        stepLog: JSON.stringify(stepLog)
      });
    } catch (logErr) { /* ignore logging error */ }
    
    // Attempt to email admin about the crash
    try {
      var adminEmail = Session.getEffectiveUser().getEmail();
      if (adminEmail) {
        MailApp.sendEmail({
          to: adminEmail,
          subject: '[CrewLife] doGet CRASH at step ' + step,
          body: 'TraceId: ' + (traceId || 'none') + '\n' +
                'Step: ' + step + '\n' +
                'Error: ' + errMsg + '\n' +
                'Stack: ' + errStack + '\n' +
                'StepLog: ' + JSON.stringify(stepLog, null, 2)
        });
      }
    } catch (mailErr) { /* ignore mail error */ }
    
    // ALWAYS return a styled error page - NEVER blank
    return createHardcodedErrorPage_(
      'System Error',
      'An unexpected error occurred at step: ' + step + '. Please try again or contact support.',
      traceId || 'unknown',
      errMsg
    );
  }
}

/**
 * Create a hardcoded error page that doesn't depend on any templates.
 * Used as ultimate fallback to NEVER show a blank page.
 * @param {string} title - Error title
 * @param {string} message - Error message
 * @param {string} traceId - Trace ID
 * @param {string=} detail - Optional technical detail
 * @returns {HtmlOutput}
 */
function createHardcodedErrorPage_(title, message, traceId, detail) {
  var html = '<!DOCTYPE html><html><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>Error - ' + title + '</title>' +
    '<style>body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#f5f5f5;margin:0;padding:40px 20px;text-align:center;}' +
    '.card{background:#fff;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,0.1);max-width:480px;margin:0 auto;padding:40px;}' +
    '.icon{font-size:64px;margin-bottom:20px;}' +
    'h1{color:#d32f2f;margin:0 0 16px;}' +
    'p{color:#666;line-height:1.6;margin:0 0 20px;}' +
    '.trace{font-size:12px;color:#999;margin-top:30px;padding-top:20px;border-top:1px solid #eee;}' +
    '.detail{font-size:11px;color:#999;word-break:break-all;margin-top:10px;}' +
    'a{color:#1976d2;}</style></head><body>' +
    '<div class="card"><div class="icon">⚠️</div>' +
    '<h1>' + title + '</h1>' +
    '<p>' + message + '</p>' +
    '<p><a href="' + (typeof CANONICAL_EXEC_URL !== 'undefined' ? CANONICAL_EXEC_URL : '') + '">Return to Start</a></p>' +
    '<div class="trace">Trace ID: ' + traceId + '</div>' +
    (detail ? '<div class="detail">' + detail.substring(0, 200) + '</div>' : '') +
    '</div></body></html>';
  
  return HtmlService.createHtmlOutput(html)
    .setTitle('Error - ' + title)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Handle POST requests
 * @param {Object} e - Event object with parameters
 * @returns {HtmlOutput|TextOutput} Response
 */
function doPost(e) {
  var traceId = generateTraceId_();
  try {
    var params = e && e.parameter ? e.parameter : {};
    var page = (params.page || '').toLowerCase();
    var action = (params.action || '').toLowerCase();

    // Route: Admin actions
    if (page === 'admin') {
      return handleAdminPost_(params, traceId);
    }

    // Route: OTP request submission
    if (action === 'requestotp') {
      return handleOtpRequest_(params, traceId);
    }

    // Route: OTP verification submission
    if (action === 'verifyotp') {
      return handleOtpVerify_(params, traceId);
    }

    // Route: Generate signed URL (for Smartsheet webhook)
    if (action === 'generatesignedurl') {
      return handleGenerateSignedUrl_(params, traceId);
    }

    // Route: Run Sideways invites worker (POST)
    // This processes Smartsheet rows with SEND Interview Invite = "Sideways"
    if (action === 'processsideways') {
      var brand = params.brand || null;
      var limit = params.limit ? Number(params.limit) : undefined;
      var res = processSidewaysInvites_({ brand: brand, limit: limit });
      return jsonResponse_(res);
    }

    // Route: Secure booking access confirmation (POST from confirm gate)
    if (page === 'access') {
      return handleSecureAccessConfirm_(params, traceId);
    }

    // Route: Booking redirect — DISABLED (use secure access flow)
    if (action === 'redirect') {
      return serveErrorPage_('Deprecated', 'Direct redirects are no longer available. Please use the secure access link.', traceId);
    }

    // Route: Token confirmation (candidate confirms booking)
    if (page === 'confirm' || action === 'confirm') {
      return handleCandidateConfirmPost_(params, traceId);
    }

    // Route: Legacy verify (backwards compatibility)
    if (page === 'verify') {
      return handleAdminPost_(params, traceId);
    }

    return jsonResponse_({ ok: false, error: 'Unknown POST action' });

  } catch (err) {
    logEvent_(traceId, '', '', 'ROUTER_ERROR', { error: String(err), stack: err.stack });
    return serveErrorPage_('System Error', 'An unexpected error occurred. Please try again.', traceId);
  }
}

/**
 * Serve brand selector page
 * @returns {HtmlOutput}
 */
function serveBrandSelector_() {
  ensureConfigSheetTabs_();
  var template = HtmlService.createTemplateFromFile('BrandSelector');
  template.brands = getAllBrandCodes_();
  template.version = APP_VERSION;
  return template.evaluate()
    .setTitle('CrewLife Interview Bookings')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Serve diagnostics / self-test page
 * Confirms: config sheet, TOKENS headers, sends test email to admin
 * @param {string} brand - Brand code (optional)
 * @param {string} traceId - Trace ID
 * @returns {HtmlOutput}
 */
function serveDiagPage_(brand, traceId) {
  var results = [];
  var ok = true;
  
  // 0. Build info and canonical URL
  try {
    var buildId = typeof BUILD_ID !== 'undefined' ? BUILD_ID : 'unknown';
    var canonicalUrl = typeof CANONICAL_EXEC_URL !== 'undefined' ? CANONICAL_EXEC_URL : 'not set';
    results.push({ test: 'Build ID', ok: true, detail: buildId });
    results.push({ test: 'CANONICAL_EXEC_URL', ok: canonicalUrl.indexOf('/exec') !== -1, detail: canonicalUrl });
  } catch (e) {
    results.push({ test: 'Build Info', ok: false, detail: String(e) });
  }
  
  // 0b. Script Property WEB_APP_EXEC_URL
  try {
    var props = PropertiesService.getScriptProperties();
    var propUrl = props.getProperty('WEB_APP_EXEC_URL') || '(not set)';
    results.push({ test: 'WEB_APP_EXEC_URL (prop)', ok: propUrl !== '(not set)', detail: propUrl });
  } catch (e) {
    results.push({ test: 'WEB_APP_EXEC_URL (prop)', ok: false, detail: String(e) });
  }
  
  // 1. Config sheet accessible
  try {
    var ss = getConfigSheet_();
    results.push({ test: 'Config Sheet', ok: true, detail: 'ID=' + ss.getId() });
  } catch (e) {
    results.push({ test: 'Config Sheet', ok: false, detail: String(e) });
    ok = false;
  }
  
  // 2. TOKENS sheet and headers (with detected header list)
  var detectedHeaders = [];
  try {
    var ss = getConfigSheet_();
    var sheet = ss.getSheetByName('TOKENS');
    if (!sheet) throw new Error('TOKENS sheet missing');
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    detectedHeaders = headers.filter(function(h) { return h !== ''; });
    var expected = ['Token', 'Email', 'Email Hash', 'Text For Email', 'Brand', 'CL Code', 'Status', 'Expiry', 'Created At', 'Used At', 'Issued By', 'Trace ID', 'OTP', 'Attempts'];
    var missing = [];
    for (var i = 0; i < expected.length; i++) {
      if (headers.indexOf(expected[i]) === -1) missing.push(expected[i]);
    }
    if (missing.length > 0) {
      results.push({ test: 'TOKENS Headers', ok: false, detail: 'Missing: ' + missing.join(', ') });
      ok = false;
    } else {
      results.push({ test: 'TOKENS Headers', ok: true, detail: 'All ' + expected.length + ' headers present' });
    }
    results.push({ test: 'Detected Headers', ok: true, detail: detectedHeaders.join(', ') });
  } catch (e) {
    results.push({ test: 'TOKENS Headers', ok: false, detail: String(e) });
    ok = false;
  }
  
  // 3. Web app URL check (resolved)
  try {
    var url = getWebAppUrl_();
    var isExec = url.indexOf('/exec') !== -1;
    results.push({ test: 'getWebAppUrl_()', ok: isExec, detail: url + (isExec ? '' : ' WARNING: not /exec') });
    if (!isExec) ok = false;
  } catch (e) {
    results.push({ test: 'getWebAppUrl_()', ok: false, detail: String(e) });
    ok = false;
  }
  
  // 4. Email quota
  try {
    var quota = MailApp.getRemainingDailyQuota();
    results.push({ test: 'Email Quota', ok: quota > 0, detail: quota + ' remaining' });
    if (quota <= 0) ok = false;
  } catch (e) {
    results.push({ test: 'Email Quota', ok: false, detail: String(e) });
    ok = false;
  }
  
  // 5. BookingEmail template exists
  try {
    HtmlService.createTemplateFromFile('BookingEmail');
    results.push({ test: 'BookingEmail Template', ok: true, detail: 'Found' });
  } catch (e) {
    results.push({ test: 'BookingEmail Template', ok: false, detail: 'Not found: ' + String(e) });
    ok = false;
  }
  
  // 6. Active user (execution context)
  try {
    var user = Session.getActiveUser().getEmail() || 'anonymous';
    var effective = Session.getEffectiveUser().getEmail() || 'unknown';
    results.push({ test: 'Execution Context', ok: true, detail: 'Active=' + user + ', Effective=' + effective });
  } catch (e) {
    results.push({ test: 'Execution Context', ok: false, detail: String(e) });
  }
  
  // Build HTML output
  var html = '<html><head><meta charset="utf-8"><title>Diagnostics</title><style>body{font-family:sans-serif;padding:20px;}table{border-collapse:collapse;width:100%;}th,td{border:1px solid #ccc;padding:8px;text-align:left;word-break:break-all;}.ok{color:green;}.fail{color:red;font-weight:bold;}</style></head><body>';
  html += '<h1>System Diagnostics</h1>';
  html += '<p>Trace ID: <code>' + traceId + '</code></p>';
  html += '<table><tr><th>Test</th><th>Status</th><th>Detail</th></tr>';
  for (var r = 0; r < results.length; r++) {
    var row = results[r];
    html += '<tr><td>' + row.test + '</td><td class="' + (row.ok ? 'ok' : 'fail') + '">' + (row.ok ? 'PASS' : 'FAIL') + '</td><td>' + row.detail + '</td></tr>';
  }
  html += '</table>';
  html += '<h2>Overall: <span class="' + (ok ? 'ok' : 'fail') + '">' + (ok ? 'ALL PASS' : 'SOME FAILED') + '</span></h2>';
  html += '<p style="margin-top:20px;"><a href="' + getWebAppUrl_() + '">Back to app</a></p>';
  html += '</body></html>';
  
  return HtmlService.createHtmlOutput(html)
    .setTitle('Diagnostics')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Serve the confirm gate page for secure booking access (GET).
 * Shows a "Continue" button inside a POST form — scanners cannot submit it.
 * Does NOT consume the token.
 * @param {Object} params - URL parameters
 * @param {string} traceId - Trace ID
 * @returns {HtmlOutput}
 */
function serveSecureAccess_(params, traceId) {
  var token = String(params.token || '').trim();
  if (!token) {
    return serveErrorPage_('Invalid Link', 'Missing access token. Please use the link from your email.', traceId);
  }

  // Read-only check — do NOT modify the token
  var peek = peekToken_(token);
  if (!peek.ok) {
    logEvent_(traceId, '', '', 'ACCESS_GATE_REJECTED', { code: peek.code, token: token.substring(0, 8) + '...' });
    var icon = peek.code === 'ALREADY_USED' ? '🔒' : (peek.code === 'EXPIRED' ? '⏰' : '❌');
    var title = peek.code === 'ALREADY_USED' ? 'Link Already Used' :
                peek.code === 'EXPIRED' ? 'Link Expired' : 'Invalid Link';
    return serveErrorPage_(title, peek.error, traceId, icon);
  }

  // Show confirm gate
  var brandInfo = getBrand_(peek.brand);
  var template = HtmlService.createTemplateFromFile('ConfirmGate');
  template.token = token;
  template.brand = peek.brand;
  template.brandName = brandInfo ? brandInfo.name : peek.brand;
  template.textForEmail = peek.textForEmail;
  template.webAppUrl = getWebAppUrl_();
  template.version = APP_VERSION;

  logEvent_(traceId, peek.brand, '', 'ACCESS_GATE_SHOWN', { token: token.substring(0, 8) + '...' });

  return template.evaluate()
    .setTitle('Confirm Booking Access')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Handle the confirm gate POST — consume token and redirect (one-time).
 * @param {Object} params - Form parameters (page, token, confirm)
 * @param {string} traceId - Trace ID
 * @returns {HtmlOutput}
 */
function handleSecureAccessConfirm_(params, traceId) {
  var token = String(params.token || '').trim();
  if (!token || params.confirm !== '1') {
    return serveErrorPage_('Invalid Request', 'Missing confirmation. Please use the button on the confirmation page.', traceId);
  }

  // Consume token atomically — marks USED before returning booking URL
  var result = consumeTokenForRedirect_(token, traceId);
  if (!result.ok) {
    var icon = result.code === 'ALREADY_USED' ? '🔒' :
               result.code === 'EXPIRED' ? '⏰' :
               result.code === 'BAD_BOOKING_URL' ? '⚠️' : '❌';
    var title = result.code === 'ALREADY_USED' ? 'Link Already Used' :
                result.code === 'EXPIRED' ? 'Link Expired' :
                result.code === 'BAD_BOOKING_URL' ? 'Configuration Error' : 'Access Denied';
    return serveErrorPage_(title, result.error, traceId, icon);
  }

  // Serve the secure redirect page (booking URL only in JS, never visible)
  var template = HtmlService.createTemplateFromFile('SecureRedirect');
  template.deptUrl = result.bookingUrl;
  template.brand = result.brand;
  template.textForEmail = result.textForEmail;
  template.version = APP_VERSION;

  logEvent_(traceId, result.brand, '', 'SECURE_REDIRECT', {
    token: token.substring(0, 8) + '...',
    url: maskUrl_(result.bookingUrl)
  });

  return template.evaluate()
    .setTitle('Redirecting…')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Include CSS/HTML partials
 * @param {string} filename - File to include
 * @returns {string} File content
 */
function include_(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
