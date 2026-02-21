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
  // Validate signed URL
  var validation = validateSignedUrl_(params);
  if (!validation.ok) {
    logEvent_(traceId, params.brand || '', params.e || '', 'OTP_PAGE_REJECTED', { error: validation.error, code: validation.code });
    return serveErrorPage_('Invalid Link', validation.error, traceId);
  }
  
  var brand = validation.brand;
  var email = validation.email;
  var textForEmail = validation.textForEmail;
  
  // Validate against Smartsheet
  var candidate = searchCandidateInSmartsheet_(brand, email, textForEmail);
  if (!candidate.ok) {
    logEvent_(traceId, brand, email, 'OTP_PAGE_SMARTSHEET_ERROR', { error: candidate.error });
    return serveErrorPage_('System Error', 'Could not verify candidate. Please try again later.', traceId);
  }
  if (!candidate.found || !candidate.exactMatch) {
    logEvent_(traceId, brand, email, 'OTP_PAGE_NOT_FOUND', { textForEmail: textForEmail });
    return serveErrorPage_('Candidate Not Found', 'Your email and position could not be verified. Please contact your recruiter.', traceId);
  }
  
  // Resolve CL code for display
  var clResolution = resolveCLCodeFromTextForEmail_(brand, textForEmail);
  
  // Extract first name if available
  var firstName = candidate.candidate && candidate.candidate['Name'] ? 
    String(candidate.candidate['Name']).split(' ')[0] : 'Candidate';
  
  var brandInfo = getBrand_(brand);
  
  var template = HtmlService.createTemplateFromFile('OtpRequest');
  template.brand = brand;
  template.brandName = brandInfo ? brandInfo.name : brand;
  template.email = email;
  template.textForEmail = textForEmail;
  template.firstName = firstName;
  template.clCode = clResolution.ok ? clResolution.clCode : '';
  template.recruiterName = clResolution.ok ? clResolution.recruiterName : '';
  template.webAppUrl = getWebAppUrl_();
  template.timestamp = params.ts;
  template.sig = params.sig;
  template.version = APP_VERSION;
  
  logEvent_(traceId, brand, email, 'OTP_PAGE_VIEWED', { textForEmail: textForEmail });
  
  return template.evaluate()
    .setTitle('Request OTP – ' + (brandInfo ? brandInfo.name : brand))
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getInviteBlockedMessage_() {
  return 'This invite link has already been used. Please request a new invite.';
}

/**
 * Issuance guard for OTP sends only (UI "Send OTP" flows).
 * Searches TOKENS for matching Brand + Text For Email + (Email OR Email Hash)
 * and blocks issuance if Status in {USED, LOCKED} OR Locked == LOCKED.
 * Header-based lookup is mandatory; AB fallback is handled inside InviteGuard.
 */
function checkInviteReuseGuard_(brand, email, textForEmail, traceId) {
  var emailHash = '';
  try {
    if (typeof computeEmailHashHex_ === 'function') {
      emailHash = computeEmailHashHex_(email);
    }
  } catch (e) {}

  Logger.log('[GUARD_KEY] traceId=%s brand=%s emailHash=%s textForEmail=%s', traceId, brand, emailHash, textForEmail);
  var key = String(brand || '').toUpperCase().trim() + '|' + (emailHash || String(email || '').toLowerCase().trim()) + '|' + String(textForEmail || '').trim();

  var decision;
  try {
    decision = (typeof findBlockingInviteInTokens_ === 'function')
      ? findBlockingInviteInTokens_({ brand: brand, email: email, textForEmail: textForEmail })
      : null;
  } catch (guardErr) {
    Logger.log('[INVITE_BLOCK][GUARD_ERROR] traceId=%s error=%s', traceId, String(guardErr));
    return { blocked: false, key: key, emailHash: emailHash };
  }

  if (decision && decision.found) {
    Logger.log('[GUARD_MATCH] traceId=%s matchedRow=%s status=%s locked=%s', traceId, decision.rowIndex || '?', decision.status || '', decision.locked || '');
  }

  if (decision && decision.overrideUnlock) {
    Logger.log('[INVITE_OVERRIDE_UNLOCKED] key=%s latestRow=%s latestStatus=%s latestLocked=%s', key, decision.rowIndex || '?', decision.status || '', decision.locked || '');
    try {
      logEvent_(traceId, brand, email, 'INVITE_OVERRIDE_UNLOCKED', {
        key: key,
        latestRow: decision.rowIndex || null,
        latestStatus: decision.status || null,
        latestLocked: decision.locked || null
      });
    } catch (e) {}
    return { blocked: false, key: key, emailHash: emailHash, match: decision };
  }

  if (decision && decision.blocked) {
    Logger.log('[INVITE_BLOCK] traceId=%s matchedRow=%s status=%s locked=%s key=%s', traceId, decision.rowIndex || '?', decision.status || '', decision.locked || '', key);
    try {
      logEvent_(traceId, brand, email, 'INVITE_BLOCKED', {
        key: key,
        matchedRow: decision.rowIndex || null,
        status: decision.status || null,
        locked: decision.locked || null,
        tokenPrefix: decision.tokenPrefix || null,
        reason: decision.reason || 'BLOCKED'
      });
    } catch (e) {}
    return { blocked: true, key: key, emailHash: emailHash, match: decision };
  }

  return { blocked: false, key: key, emailHash: emailHash, match: decision || null };
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
  
  // Validate signed URL params
  var validation = validateSignedUrl_({
    brand: brand,
    e: email,
    t: textForEmail,
    ts: params.timestamp,
    sig: params.sig
  });
  
  if (!validation.ok) {
    logEvent_(traceId, brand, email, 'OTP_REQUEST_REJECTED', { error: validation.error });
    return { ok: false, error: validation.error };
  }
  
  // Validate against Smartsheet
  var candidate = searchCandidateInSmartsheet_(brand, email, textForEmail);
  if (!candidate.ok || !candidate.found || !candidate.exactMatch) {
    logEvent_(traceId, brand, email, 'OTP_REQUEST_NOT_FOUND', {});
    return { ok: false, error: 'Candidate not found in system' };
  }

  // Issuance guard: block if a USED/LOCKED invite already exists for this key.
  var guard = checkInviteReuseGuard_(brand, email, textForEmail, traceId);
  if (guard.blocked) {
    return { ok: false, code: 'INVITE_BLOCKED', error: getInviteBlockedMessage_() };
  }
  
  // Create OTP
  var otpResult = createOtp_({
    email: email,
    brand: brand,
    textForEmail: textForEmail,
    traceId: traceId,
    candidate: candidate.candidate
  });
  
  if (!otpResult.ok) {
    return { ok: false, error: otpResult.error };
  }
  
  // Send OTP email with token for deterministic verification
  var emailResult = sendOtpEmail_({
    email: email,
    otp: otpResult.otp,
    brand: brand,
    textForEmail: textForEmail,
    token: otpResult.token,  // Include token in verify URL
    expiryMinutes: otpResult.expiryMinutes,
    traceId: traceId
  });
  
  if (!emailResult.ok) {
    return { ok: false, error: emailResult.error };
  }

  var verifyUrl = getWebAppUrl_() +
    '?page=verify&brand=' + encodeURIComponent(brand) +
    '&e=' + encodeURIComponent(email) +
    '&t=' + encodeURIComponent(textForEmail) +
    '&token=' + encodeURIComponent(otpResult.token);

  return {
    ok: true,
    message: 'OTP sent to your email',
    expiryMinutes: otpResult.expiryMinutes,
    token: otpResult.token,
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
  var email = String(params.e || '').toLowerCase().trim();
  var textForEmail = String(params.t || '').trim();
  var token = String(params.token || '').trim();  // Token for deterministic lookup
  
  if (!brand || !email) {
    return serveErrorPage_('Invalid Link', 'Missing required parameters', traceId);
  }
  
  if (!isValidBrand_(brand)) {
    return serveErrorPage_('Invalid Brand', 'Brand not recognized', traceId);
  }
  
  var brandInfo = getBrand_(brand);
  
  var template = HtmlService.createTemplateFromFile('OtpVerify');
  template.brand = brand;
  template.brandName = brandInfo ? brandInfo.name : brand;
  template.email = email;
  template.textForEmail = textForEmail;
  template.token = token;  // Pass token to template for deterministic verification
  template.webAppUrl = getWebAppUrl_();
  template.version = APP_VERSION;
  
  logEvent_(traceId, brand, email, 'OTP_VERIFY_PAGE_VIEWED', {});
  
  return template.evaluate()
    .setTitle('Verify OTP – ' + (brandInfo ? brandInfo.name : brand))
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Start OTP flow given `brand`, `clCode`, and `email` from the public start page.
 * This bypasses signed URLs and validates CL code exists for the brand.
 * Returns same shape as `handleOtpRequest_` (verifyUrl and token) on success.
 */
function startOtpByBrandCl_(params, traceId) {
  traceId = traceId || generateTraceId_();
  var brand = String(params.brand || '').toUpperCase();
  var clCode = String(params.clCode || '').toUpperCase().trim();
  var email = String(params.email || '').toLowerCase().trim();

  if (!brand || !clCode || !email) {
    return { ok: false, error: 'Missing brand, CL code or email' };
  }

  if (!isValidBrand_(brand)) {
    return { ok: false, error: 'Unknown brand' };
  }

  // Ensure CL code exists and has a booking URL
  var clDetails = getCLCodeDetails_(brand, clCode);
  if (!clDetails) {
    return { ok: false, error: 'CL code not found for brand' };
  }
  if (!clDetails.active) {
    return { ok: false, error: 'CL code is inactive' };
  }
  if (!clDetails.bookingUrl) {
    return { ok: false, error: 'No booking URL configured for this CL code' };
  }

  // Try to find job title for this CL code to use as textForEmail
  var textForEmail = clCode;
  var jobs = getJobsForBrand_(brand);
  for (var j = 0; j < jobs.length; j++) {
    if (String(jobs[j].defaultCLCode).toUpperCase() === clCode) {
      textForEmail = jobs[j].jobTitle + ' - ' + clCode;
      break;
    }
  }
  // If no job found, use recruiter info
  if (textForEmail === clCode && clDetails.recruiterName) {
    textForEmail = clCode + ' (' + clDetails.recruiterName + ')';
  }

  // Optionally attempt to verify candidate exists in Smartsheet by email + CL title
  // If searchCandidateInSmartsheet_ is available and desired, uncomment the check below.
  // var candidate = searchCandidateInSmartsheet_(brand, email, textForEmail);
  // if (!candidate.ok || !candidate.found) return { ok: false, error: 'Candidate not found' };

  // Create OTP
  var guard = checkInviteReuseGuard_(brand, email, textForEmail, traceId);
  if (guard.blocked) {
    return { ok: false, code: 'INVITE_BLOCKED', error: getInviteBlockedMessage_() };
  }

  var otpResult = createOtp_({ email: email, brand: brand, textForEmail: textForEmail, traceId: traceId });
  if (!otpResult.ok) {
    return { ok: false, error: otpResult.error };
  }

  // Send OTP email with token
  var emailResult = sendOtpEmail_({ email: email, otp: otpResult.otp, brand: brand, textForEmail: textForEmail, token: otpResult.token, expiryMinutes: otpResult.expiryMinutes, traceId: traceId });
  if (!emailResult.ok) return { ok: false, error: emailResult.error };

  var verifyUrl = getWebAppUrl_() +
    '?page=verify&brand=' + encodeURIComponent(brand) +
    '&e=' + encodeURIComponent(email) +
    '&t=' + encodeURIComponent(textForEmail) +
    '&token=' + encodeURIComponent(otpResult.token);

  return { ok: true, token: otpResult.token, verifyUrl: verifyUrl, expiryMinutes: otpResult.expiryMinutes };
}

/**
 * Public entry point from BrandSelector.html via google.script.run.
 * Validates candidate against Smartsheet (brand-locked), creates OTP, sends email.
 * Does NOT call TokenService.issueToken_ — uses OtpService.createOtp_ only.
 * BULLETPROOF: Wrapped in try/catch to NEVER cause blank screen.
 * @param {Object} params  { brand, email, textForEmail }
 * @param {string} traceId
 * @returns {{ ok:boolean, verifyUrl?:string, expiryMinutes?:number, error?:string }}
 */
function startOtpByTextForEmail(params, traceId) {
  try {
    traceId          = traceId || generateTraceId_();
    var brand        = String(params.brand        || '').toUpperCase().trim();
    var email        = String(params.email        || '').toLowerCase().trim();
    var textForEmail = String(params.textForEmail || '').trim();

    if (!brand || !email || !textForEmail) {
      return { ok: false, error: 'Missing required fields (brand, email, textForEmail).' };
    }
    if (!isValidBrand_(brand)) {
      return { ok: false, error: 'Unknown brand: ' + brand };
    }

    // 0. Pre-check: Verify TOKENS sheet is accessible
    try {
      var ss = getConfigSheet_();
      var tokenSheet = ss.getSheetByName('TOKENS');
      if (!tokenSheet) {
        Logger.log('[startOtpByTextForEmail] TOKENS sheet not found');
        return { ok: false, error: 'System configuration error. Please contact support.' };
      }
    } catch (sheetErr) {
      Logger.log('[startOtpByTextForEmail] Cannot access TOKENS sheet: ' + sheetErr);
      return { ok: false, error: 'System temporarily unavailable. Please try again later.' };
    }

    // 1. Validate candidate against Smartsheet (brand-locked, ANY-sheet match)
    var searchResult = searchCandidateInSmartsheet_(brand, email, textForEmail);
    if (!searchResult.ok) {
      return { ok: false, error: 'Could not verify candidate. Please try again later.' };
    }
    if (!searchResult.found || !searchResult.exactMatch) {
      return { ok: false, error: 'Your email and selected position do not match our records.' };
    }

    // 2. Attach Interview Link to candidate so createOtp_ stores it as Position Link
    var candidate = searchResult.candidate || {};
    candidate['Position Link'] = searchResult.interviewLink || '';

    // 2.5 Issuance guard: block if a USED/LOCKED invite already exists for this key.
    var guard = checkInviteReuseGuard_(brand, email, textForEmail, traceId);
    if (guard.blocked) {
      return { ok: false, code: 'INVITE_BLOCKED', error: getInviteBlockedMessage_() };
    }

    // 3. Create OTP (single call — writes token row with Position Link)
    var otpResult = createOtp_({
      email:        email,
      brand:        brand,
      textForEmail: textForEmail,
      traceId:      traceId,
      candidate:    candidate
    });
    if (!otpResult.ok) {
      return { ok: false, error: otpResult.error || 'OTP generation failed.' };
    }

    // 4. Send OTP email (exactly once)
    var emailResult = sendOtpEmail_({
      email:         email,
      otp:           otpResult.otp,
      brand:         brand,
      textForEmail:  textForEmail,
      token:         otpResult.token,
      expiryMinutes: otpResult.expiryMinutes,
      traceId:       traceId
    });
    if (!emailResult.ok) {
      return { ok: false, error: emailResult.error || 'Failed to send OTP email.' };
    }

    logEvent_(traceId, brand, email, 'OTP_START_SUCCESS', {
      matchedSheetId:   searchResult.matchedSheetId || '',
      hasInterviewLink: !!(searchResult.interviewLink)
    });

    var verifyUrl = getWebAppUrl_() +
      '?page=verify&brand=' + encodeURIComponent(brand) +
      '&e='     + encodeURIComponent(email) +
      '&t='     + encodeURIComponent(textForEmail) +
      '&token=' + encodeURIComponent(otpResult.token);

    return { ok: true, token: otpResult.token, verifyUrl: verifyUrl, expiryMinutes: otpResult.expiryMinutes };
  
  } catch (err) {
    // BULLETPROOF: Log and return structured error - NEVER throw
    var errMsg = String(err);
    Logger.log('[startOtpByTextForEmail] FATAL ERROR: ' + errMsg + '\nStack: ' + (err.stack || 'none'));
    try {
      logEvent_(traceId || 'NO_TRACE', params.brand || '', params.email || '', 'OTP_START_FATAL_ERROR', {
        error: errMsg,
        stack: err.stack || ''
      });
    } catch (logErr) { /* ignore */ }
    return { ok: false, error: 'An unexpected error occurred. Please try again or contact support.' };
  }
}

/**
 * Handle OTP verification form submission (POST)
 * HARDCORE DIAGNOSTICS: logs every step, returns full trace in response
 * @param {Object} params - Form parameters
 * @param {string} traceId - Trace ID
 * @returns {Object} Result object (for google.script.run)
 */
function handleOtpVerify_(params, traceId) {
  traceId = traceId || generateTraceId_();
  var diag = { traceId: traceId, steps: [] };
  
  function logStep(step, data) {
    var entry = { step: step, ts: new Date().toISOString(), data: data };
    diag.steps.push(entry);
    Logger.log('[handleOtpVerify_][%s] %s: %s', traceId, step, JSON.stringify(data));
  }
  
  var brand = String(params.brand || '').toUpperCase();
  var email = String(params.email || '').toLowerCase().trim();
  var otp = String(params.otp || '').trim();
  var textForEmail = String(params.textForEmail || '').trim();
  var token = String(params.token || '').trim();
  
  logStep('START', { token: token ? token.substring(0,8)+'...' : 'none', email: email, brand: brand, otp: otp ? '***' : 'missing' });
  
  if (!otp) {
    logStep('ERROR', { reason: 'Missing OTP' });
    return { ok: false, error: 'Missing OTP', diag: diag };
  }
  
  // Validate OTP
  var result;
  try {
    result = validateOtp_({
      token: token,
      email: email,
      brand: brand,
      otp: otp,
      textForEmail: textForEmail,
      traceId: traceId
    });
    logStep('VALIDATE_OTP_RESULT', { ok: result.ok, error: result.error || null, verified: result.verified || false, clResolutionOk: result.clResolution ? result.clResolution.ok : null });
  } catch (e) {
    logStep('VALIDATE_OTP_EXCEPTION', { error: String(e), stack: e.stack });
    return { ok: false, error: 'Validation exception: ' + String(e), diag: diag };
  }
  
  if (!result.ok) {
    logStep('VALIDATE_FAILED', { error: result.error });
    return { ok: false, error: result.error, diag: diag };
  }
  
  // Build secure access URL — never expose the actual booking URL to the client
  var bookingUrl = (result.clResolution && result.clResolution.bookingUrl)
    ? result.clResolution.bookingUrl
    : null;

  if (!bookingUrl) {
    logStep('REDIRECT_FAIL', { reason: 'No booking URL in clResolution or Position Link' });
    logEvent_(traceId, brand, email, 'REDIRECT_FAIL', { token: token ? token.substring(0,8)+'...' : '' });
    return { ok: true, verified: true, error: 'Could not resolve booking URL. Please contact your recruiter.', textForEmail: result.textForEmail, diag: diag };
  }

  // The access URL points to the confirm gate — use CANONICAL URL, never a calendar link
  var accessUrl = getEmailCtaBaseUrl_() + '?page=access&token=' + encodeURIComponent(token);

  logStep('ACCESS_URL_GENERATED', { accessUrl: maskUrl_(accessUrl) });
  logEvent_(traceId, brand, email, 'ACCESS_URL_GENERATED', {
    token: token ? token.substring(0,8)+'...' : ''
  });

  // Send booking confirmation email with secure access link (NOT the booking URL)
  var emailResult;
  try {
    emailResult = sendBookingConfirmEmail_({
      candidateName: (candidate && candidate.candidate && candidate.candidate['Name']) ? candidate.candidate['Name'].split(' ')[0] : '',
      email:        email,
      brand:        brand,
      textForEmail: result.textForEmail || textForEmail,
      accessUrl:    accessUrl,
      traceId:      traceId
    });
    logStep('SEND_BOOKING_EMAIL_RESULT', { ok: emailResult.ok, error: emailResult.error || null });
  } catch (e) {
    logStep('SEND_BOOKING_EMAIL_EXCEPTION', { error: String(e) });
    emailResult = { ok: false, error: 'Email exception: ' + String(e) };
  }

  logStep('COMPLETE', { emailSent: emailResult.ok });

  return {
    ok:           true,
    verified:     true,
    emailSent:    emailResult.ok,
    emailError:   emailResult.error || null,
    accessUrl:    accessUrl,
    textForEmail: result.textForEmail,
    diag:         diag
  };
}

/**
 * Public google.script.run entrypoint (no trailing underscore).
 * Some environments intermittently fail to expose underscored names.
 * @param {Object} params
 * @param {string} traceId
 * @returns {Object}
 */
function otpVerifyApi(params, traceId) {
  return handleOtpVerify_(params, traceId);
}

/**
 * Serve booking confirmation page (scanner-safe)
 * @param {Object} params - URL parameters
 * @param {string} traceId - Trace ID
 * @returns {HtmlOutput}
 */
function serveBookingConfirmPage_(params, traceId) {
  var brand = String(params.brand || '').toUpperCase();
  var email = String(params.e || '').toLowerCase().trim();
  var textForEmail = String(params.t || '').trim();
  var token = String(params.token || '').trim();
  
  if (!brand || !token) {
    return serveErrorPage_('Invalid Request', 'Missing booking information', traceId);
  }
  
  var brandInfo = getBrand_(brand);
  var clResolution = resolveCLCodeFromTextForEmail_(brand, textForEmail);
  
  var template = HtmlService.createTemplateFromFile('BookingConfirm');
  template.brand = brand;
  template.brandName = brandInfo ? brandInfo.name : brand;
  template.webAppUrl = getWebAppUrl_();
  template.accessUrl = getWebAppUrl_() + '?page=access&token=' + encodeURIComponent(token);
  template.email = email;
  template.textForEmail = textForEmail;
  template.token = token;
  template.recruiterName = clResolution.ok ? clResolution.recruiterName : '';
  template.clCode = clResolution.ok ? clResolution.clCode : '';
  template.version = APP_VERSION;
  
  logEvent_(traceId, brand, email, 'BOOKING_CONFIRM_PAGE_VIEWED', {});
  
  return template.evaluate()
    .setTitle('Confirm Booking – ' + (brandInfo ? brandInfo.name : brand))
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
