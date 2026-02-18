/**
 * Router.gs
 * HTTP entry points (doGet/doPost), page routing, global error handling.
 * CrewLife Interview Bookings Uniform Core
 */

/**
 * Handle GET requests
 * @param {Object} e - Event object with parameters
 * @returns {HtmlOutput|TextOutput} Response
 */
function doGet(e) {
  var traceId = generateTraceId_();
  try {
    var params = e && e.parameter ? e.parameter : {};
    var page = (params.page || '').toLowerCase();
    var brand = (params.brand || '').toUpperCase();
    var token = params.token || '';

    // Route: No brand & no page → Candidate landing (starts booking flow)
    if (!brand && !page) {
      return serveLandingPage_();
    }

    // Route: Diagnostics (self-test)
    if (page === 'diag') {
      return serveDiagPage_(brand, traceId);
    }

    // Route: Authorization helper
    if (page === 'auth') {
      return serveAuthPage_(traceId);
    }

    // Route: Admin console
    if (page === 'admin') {
      return serveAdminConsole_(brand, params, traceId);
    }

    // Route: Admin data debug (returns JSON used to render admin UI)
    if (page === 'admindata') {
      return serveAdminData_(brand, params, traceId);
    }

    // Route: OTP request page (from Smartsheet email signed link)
    if (page === 'otp') {
      return serveOtpRequestPage_(params, traceId);
    }

    // Route: OTP verification page
    if (page === 'verify') {
      return serveOtpVerifyPage_(params, traceId);
    }

    // Route: Booking confirmation page (scanner-safe)
    if (page === 'booking') {
      return serveBookingConfirmPage_(params, traceId);
    }

    // Route: Token verification (legacy candidate flow)
    if (token) {
      return serveCandidateConfirm_(brand, token, traceId);
    }

    // Route: Brand landing (serve admin console)
    if (brand && isValidBrand_(brand)) {
      return serveAdminConsole_(brand, params, traceId);
    }

    // Route: Landing data (debug) - return CL codes and job titles for frontend
    if (page === 'landingdata') {
      try {
        var brandsList = getAllBrandCodes_();
        var dataCl = {};
        var dataJobs = {};
        for (var bi = 0; bi < brandsList.length; bi++) {
          var b = brandsList[bi];
          dataCl[b] = getAllCLCodesForBrand_(b);
          dataJobs[b] = getAllJobTitlesForBrand_(b);
        }
        return jsonResponse_({ ok: true, brandClCodes: dataCl, brandJobTitles: dataJobs });
      } catch (e) {
        return jsonResponse_({ ok: false, error: String(e) });
      }
    }

    // Fallback: Brand selector
    return serveBrandSelector_();

  } catch (err) {
    logEvent_(traceId, '', '', 'ROUTER_ERROR', { error: String(err), stack: err.stack });
    return serveErrorPage_('System Error', 'An unexpected error occurred. Please try again.', traceId);
  }
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
    
    // DEBUG: Log all POST requests
    logEvent_(traceId, params.brand || '', params.email || '', 'POST_REQUEST_RECEIVED', { action: action, page: page });

    // Route: Admin actions
    if (page === 'admin') {
      return handleAdminPost_(params, traceId);
    }

    // Route: OTP request submission
    if (action === 'requestotp') {
      return handleOtpRequest_(params, traceId);
    }

    // Route: Debug echo - useful to validate webapp POST reaches server (returns params as JSON)
    if (action === 'debugecho') {
      return jsonResponse_({ ok: true, params: params });
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
    if (action === 'processsideways') {
      var dry = params.dryRun === 'true' || params.dryRun === true;
      var testEmail = params.testEmail || null;
      var brand = params.brand || null;
      var limit = params.limit ? Number(params.limit) : undefined;
      var res = processSidewaysInvites_({ dryRun: dry, testEmail: testEmail, brand: brand, limit: limit });
      return jsonResponse_(res);
    }

    // Route: Fetch trace logs (POST) - returns LOGS entries for given traceId
    if (action === 'gettracelog') {
      var t = params.traceId || '';
      if (!t) return jsonResponse_({ ok: false, error: 'traceId required' });
      var logsRes = getLogsForTraceId_(t);
      return jsonResponse_(logsRes);
    }

    // Route: Booking redirect (scanner-safe POST)
    if (action === 'redirect') {
      var bookingUrl = params.url;
      if (bookingUrl) {
        logEvent_(traceId, params.brand || '', params.email || '', 'BOOKING_REDIRECT', { url: maskUrl_(bookingUrl) });
        return HtmlService.createHtmlOutput(
          '<html><head><meta http-equiv="refresh" content="0;url=' + bookingUrl + '"></head>' +
          '<body>Redirecting to booking page...</body></html>'
        );
      }
      return serveErrorPage_('Invalid Request', 'Missing booking URL', traceId);
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
 * Serve candidate landing page (root webapp)
 * Presents a simple 'Book Your Interview' flow that generates a signed URL
 */
function serveLandingPage_() {
  var template = HtmlService.createTemplateFromFile('Landing');
  template.version = APP_VERSION;
  template.webAppUrl = getWebAppUrl_();
  
  // Build data for dropdown population (map brand → [CL codes] and brand → [job titles])
  var brands = getAllBrandCodes_();
  var brandClCodes = {};
  var brandJobTitles = {};
  
  for (var i = 0; i < brands.length; i++) {
    var brand = brands[i];
    brandClCodes[brand] = getAllCLCodesForBrand_(brand);
    brandJobTitles[brand] = getAllJobTitlesForBrand_(brand);
  }
  
  template.brandClCodes_ = brandClCodes;
  template.brandJobTitles_ = brandJobTitles;
  
  return template.evaluate()
    .setTitle('Schedule Your Interview')
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
  
  // 1. Config sheet accessible
  try {
    var ss = getConfigSheet_();
    results.push({ test: 'Config Sheet', ok: true, detail: 'ID=' + ss.getId() });
  } catch (e) {
    results.push({ test: 'Config Sheet', ok: false, detail: String(e) });
    ok = false;
  }
  
  // 2. TOKENS sheet and headers
  try {
    var ss = getConfigSheet_();
    var sheet = ss.getSheetByName('TOKENS');
    if (!sheet) throw new Error('TOKENS sheet missing');
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
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
  } catch (e) {
    results.push({ test: 'TOKENS Headers', ok: false, detail: String(e) });
    ok = false;
  }
  
  // 3. Web app URL check
  try {
    var url = getWebAppUrl_();
    var isExec = url.indexOf('/exec') !== -1;
    results.push({ test: 'Web App URL', ok: isExec, detail: url.substring(0, 80) + (isExec ? '' : ' WARNING: not /exec') });
    if (!isExec) ok = false;
  } catch (e) {
    results.push({ test: 'Web App URL', ok: false, detail: String(e) });
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
  var html = '<html><head><meta charset="utf-8"><title>Diagnostics</title><style>body{font-family:sans-serif;padding:20px;}table{border-collapse:collapse;width:100%;}th,td{border:1px solid #ccc;padding:8px;text-align:left;}.ok{color:green;}.fail{color:red;font-weight:bold;}</style></head><body>';
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
 * Serve authorization helper page
 * Triggers OAuth consent and provides guidance
 * @param {string} traceId - Trace ID
 * @returns {HtmlOutput}
 */
function serveAuthPage_(traceId) {
  var canonicalUrl = '';
  try {
    canonicalUrl = getWebAppUrl_();
  } catch (e) {
    canonicalUrl = '';
  }
  var results = null;
  var error = null;
  try {
    results = requestAuthorization();
  } catch (e) {
    error = String(e);
  }

  var html = '';
  html += '<html><head><meta charset="utf-8"><title>Authorization</title>';
  html += '<style>body{font-family:sans-serif;padding:20px;max-width:720px;margin:0 auto;}';
  html += '.ok{color:green;}.fail{color:red;font-weight:bold;}';
  html += 'pre{background:#f6f7f9;padding:12px;border-radius:8px;overflow:auto;}';
  html += 'a.btn{display:inline-block;padding:10px 14px;border-radius:8px;background:#0b57d0;color:#fff;text-decoration:none;font-weight:700;}';
  html += '</style></head><body>';
  html += '<h1>Authorization Required</h1>';
  html += '<p>Trace ID: <code>' + traceId + '</code></p>';
  if (canonicalUrl) {
    html += '<p>Canonical web app URL: <a href="' + canonicalUrl + '">' + canonicalUrl + '</a></p>';
  }
  html += '<p>If you were prompted by Google to authorize this app, please complete the consent flow and return to the app.</p>';
  if (error) {
    html += '<p class="fail">Authorization call failed: ' + error + '</p>';
  } else if (results) {
    html += '<p class="ok">Authorization check completed.</p>';
    html += '<pre>' + JSON.stringify(results, null, 2) + '</pre>';
  } else {
    html += '<p class="fail">Authorization did not return results.</p>';
  }
  html += '<p><a class="btn" href="' + getWebAppUrl_() + '">Back to app</a></p>';
  html += '<p><a href="' + getWebAppUrl_() + '?page=diag">Run diagnostics</a></p>';
  html += '</body></html>';

  return HtmlService.createHtmlOutput(html)
    .setTitle('Authorization')
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
