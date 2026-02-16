/**
 * OtpController.gs
 * Page routing and handlers for OTP request/verify flows.
 * CrewLife Interview Bookings Uniform Core
 */

/**
 * Serve OTP request page (candidate clicks link from Smartsheet email)
 * @param {Object} params - URL parameters
 * @param {string} traceId - Trace ID
 * @returns {HtmlOutput}
 */
function serveOtpRequestPage_(params, traceId) {
  var brand = String(params.brand || '').toUpperCase();
  var rowId = String(params.rowId || '').trim();

  if (!brand || !rowId) {
    return serveErrorPage_('Invalid Link', 'Missing required parameters.', traceId);
  }

  var rowResult = getSmartsheetRowById_(brand, rowId);
  if (!rowResult.ok) {
    logEvent_(traceId, brand, '', 'OTP_PAGE_ROW_FETCH_FAILED', { error: rowResult.error });
    return serveErrorPage_('System Error', 'Could not verify candidate. Please try again later.', traceId);
  }

  var rowMap = rowResult.map || {};
  var email = String(rowMap['Email'] || rowMap['E-mail'] || '').toLowerCase().trim();
  var textForEmail = String(rowMap['Text For Email'] || '').trim();

  var validation = validateSignedUrl_(params, { email: email, textForEmail: textForEmail });
  if (!validation.ok) {
    logEvent_(traceId, brand, email, 'OTP_PAGE_REJECTED', { error: validation.error, code: validation.code });
    return serveErrorPage_('Invalid Link', validation.error, traceId);
  }

  var clResolution = resolveCLCodeFromTextForEmail_(brand, textForEmail);
  var brandInfo = getBrand_(brand);

  var jobs = getJobsForBrand_(brand).filter(function(j) { return j.active; });
  var options = [];
  if (textForEmail) options.push(textForEmail);
  jobs.forEach(function(j) {
    var val = j.textForEmail || j.jobTitle;
    if (val && options.indexOf(val) === -1) options.push(val);
  });

  var template = HtmlService.createTemplateFromFile('OtpRequest');
  template.brand = brand;
  template.brandName = brandInfo ? brandInfo.name : brand;
  template.textForEmailOptions = options;
  template.preselectedTextForEmail = textForEmail;
  template.rowId = rowId;
  template.timestamp = params.ts;
  template.sig = params.sig;
  template.version = APP_VERSION;
  template.webAppUrl = getWebAppUrl_();

  logEvent_(traceId, brand, email, 'OTP_PAGE_VIEWED', { textForEmail: textForEmail });

  return template.evaluate()
    .setTitle('Request OTP – ' + (brandInfo ? brandInfo.name : brand))
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Handle OTP request form submission (POST)
 * @param {Object} params - Form parameters
 * @param {string} traceId - Trace ID
 * @returns {Object} Result object (for google.script.run)
 */
function handleOtpRequest_(params, traceId) {
  traceId = traceId || generateTraceId_();
  var brand = String(params.brand || '').toUpperCase();
  var email = String(params.email || '').toLowerCase().trim();
  var textForEmail = String(params.textForEmail || '').trim();
  var rowId = String(params.rowId || '').trim();

  if (!brand || !rowId || !email || !textForEmail) {
    return { ok: false, error: 'Missing required fields' };
  }

  var rowResult = getSmartsheetRowById_(brand, rowId);
  if (!rowResult.ok) {
    logEvent_(traceId, brand, email, 'OTP_REQUEST_ROW_FETCH_FAILED', { error: rowResult.error });
    return { ok: false, error: 'Could not verify candidate. Please try again later.' };
  }

  var rowMap = rowResult.map || {};
  var rowEmail = String(rowMap['Email'] || rowMap['E-mail'] || '').toLowerCase().trim();
  var rowText = String(rowMap['Text For Email'] || '').trim();

  var validation = validateSignedUrl_({
    brand: brand,
    rowId: rowId,
    ts: params.timestamp,
    sig: params.sig
  }, { email: rowEmail, textForEmail: rowText });

  if (!validation.ok) {
    logEvent_(traceId, brand, email, 'OTP_REQUEST_REJECTED', { error: validation.error });
    return { ok: false, error: validation.error };
  }

  if (email !== rowEmail || textForEmail !== rowText) {
    logEvent_(traceId, brand, email, 'OTP_REQUEST_MISMATCH', { result: 'ERROR', message: 'Email/Text mismatch' });
    return { ok: false, error: 'Your email and position could not be verified. Please contact your recruiter.' };
  }

  var otpResult = createOtp_({
    email: email,
    brand: brand,
    textForEmail: textForEmail,
    traceId: traceId,
    inviteSig: params.sig,
    rowId: rowId
  });
  
  if (!otpResult.ok) {
    return { ok: false, error: otpResult.error };
  }
  
  // Send OTP email
  var emailResult = sendOtpEmail_({
    email: email,
    otp: otpResult.otp,
    brand: brand,
    textForEmail: textForEmail,
    expiryMinutes: otpResult.expiryMinutes,
    traceId: traceId,
    rowId: rowId
  });
  
  if (!emailResult.ok) {
    return { ok: false, error: emailResult.error };
  }
  
  var verifyUrl = getWebAppUrl_() + '?page=otp_verify&brand=' + encodeURIComponent(brand) + '&rowId=' + encodeURIComponent(rowId);
  return {
    ok: true,
    message: 'OTP sent to your email',
    expiryMinutes: otpResult.expiryMinutes,
    verifyUrl: verifyUrl
  };
}

/**
 * Serve OTP verification page
 * @param {Object} params - URL parameters
 * @param {string} traceId - Trace ID
 * @returns {HtmlOutput}
 */
function serveOtpVerifyPage_(params, traceId) {
  var brand = String(params.brand || '').toUpperCase();
  var rowId = String(params.rowId || '').trim();

  if (!brand || !rowId) {
    return serveErrorPage_('Invalid Link', 'Missing required parameters', traceId);
  }

  if (!isValidBrand_(brand)) {
    return serveErrorPage_('Invalid Brand', 'Brand not recognized', traceId);
  }

  var rowResult = getSmartsheetRowById_(brand, rowId);
  if (!rowResult.ok) {
    return serveErrorPage_('System Error', 'Could not verify candidate. Please try again later.', traceId);
  }

  var rowMap = rowResult.map || {};
  var textForEmail = String(rowMap['Text For Email'] || '').trim();
  var brandInfo = getBrand_(brand);

  var template = HtmlService.createTemplateFromFile('OtpVerify');
  template.brand = brand;
  template.brandName = brandInfo ? brandInfo.name : brand;
  template.textForEmail = textForEmail;
  template.rowId = rowId;
  template.version = APP_VERSION;
  template.webAppUrl = getWebAppUrl_();

  logEvent_(traceId, brand, '', 'OTP_VERIFY_PAGE_VIEWED', {});

  return template.evaluate()
    .setTitle('Verify OTP – ' + (brandInfo ? brandInfo.name : brand))
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Handle OTP verification form submission (POST)
 * @param {Object} params - Form parameters
 * @param {string} traceId - Trace ID
 * @returns {Object} Result object (for google.script.run)
 */
function handleOtpVerify_(params, traceId) {
  traceId = traceId || generateTraceId_();
  var brand = String(params.brand || '').toUpperCase();
  var email = String(params.email || '').toLowerCase().trim();
  var otp = String(params.otp || '').trim();
  var textForEmail = String(params.textForEmail || '').trim();
  
  if (!brand || !email || !otp) {
    return { ok: false, error: 'Missing required fields' };
  }
  
  // Validate OTP
  var result = validateOtp_({
    email: email,
    brand: brand,
    otp: otp,
    textForEmail: textForEmail,
    traceId: traceId
  });
  
  if (!result.ok) {
    return { ok: false, error: result.error };
  }
  
  var bookingUrl = getWebAppUrl_() + '?page=booking_confirm&token=' + encodeURIComponent(result.token);
  return {
    ok: true,
    verified: true,
    bookingUrl: bookingUrl,
    token: result.token,
    textForEmail: result.textForEmail
  };
}

/**
 * Serve booking confirmation page (scanner-safe)
 * @param {Object} params - URL parameters
 * @param {string} traceId - Trace ID
 * @returns {HtmlOutput}
 */
function serveBookingConfirmPage_(params, traceId) {
  var token = String(params.token || '').trim();
  if (!token) {
    return serveErrorPage_('Invalid Request', 'Missing booking token', traceId);
  }

  var validation = validateToken_(token, '');
  if (!validation.ok) {
    logEvent_(traceId, '', '', 'TOKEN_VALIDATION_FAILED', { error: validation.error, code: validation.code });
    return serveErrorPage_('Invalid Link', validation.error, traceId);
  }

  var brand = validation.brand;
  var brandInfo = getBrand_(brand);
  var template = HtmlService.createTemplateFromFile('BookingConfirm');
  template.brand = brand;
  template.brandName = brandInfo ? brandInfo.name : brand;
  template.textForEmail = validation.textForEmail || '';
  template.token = token;
  template.version = APP_VERSION;

  logEvent_(traceId, brand, '', 'BOOKING_CONFIRM_PAGE_VIEWED', {});

  return template.evaluate()
    .setTitle('Confirm Booking – ' + (brandInfo ? brandInfo.name : brand))
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
