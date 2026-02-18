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

    // Route: No brand → Brand selector
    if (!brand && !page) {
      return serveBrandSelector_();
    }

    // Route: Diagnostics
    if (page === 'diag') {
      return jsonResponse_(debugDump_(brand));
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

    // Route: Brand landing (shouldn't happen normally, redirect to admin)
    if (brand && isValidBrand_(brand)) {
      return serveAdminConsole_(brand, params, traceId);
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

    // Route: Booking redirect (scanner-safe POST)
    if (action === 'redirect') {
      var bookingUrl = params.url;
      if (bookingUrl) {
        logEvent_(traceId, params.brand || '', params.email || '', 'BOOKING_REDIRECT', { url: bookingUrl });
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
 * Include CSS/HTML partials
 * @param {string} filename - File to include
 * @returns {string} File content
 */
function include_(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
