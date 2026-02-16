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
  template.timestamp = params.ts;
  template.sig = params.sig;
  template.version = APP_VERSION;
  
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
  
  // Create OTP
  var otpResult = createOtp_({
    email: email,
    brand: brand,
    textForEmail: textForEmail,
    traceId: traceId
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
    traceId: traceId
  });
  
  if (!emailResult.ok) {
    return { ok: false, error: emailResult.error };
  }
  
  return {
    ok: true,
    message: 'OTP sent to your email',
    expiryMinutes: otpResult.expiryMinutes
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
  template.version = APP_VERSION;
  
  logEvent_(traceId, brand, email, 'OTP_VERIFY_PAGE_VIEWED', {});
  
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
  
  // OTP verified - return booking info
  if (result.clResolution && result.clResolution.ok) {
    // Send booking link email
    sendBookingLinkEmail_({
      email: email,
      brand: brand,
      bookingUrl: result.clResolution.bookingUrl,
      textForEmail: result.textForEmail,
      recruiterName: result.clResolution.recruiterName,
      clCode: result.clResolution.clCode,
      traceId: traceId
    });
    
    return {
      ok: true,
      verified: true,
      bookingUrl: result.clResolution.bookingUrl,
      recruiterName: result.clResolution.recruiterName,
      clCode: result.clResolution.clCode,
      textForEmail: result.textForEmail
    };
  } else {
    // CL resolution failed but OTP was valid
    return {
      ok: true,
      verified: true,
      error: result.clResolution ? result.clResolution.error : 'Could not resolve booking URL',
      textForEmail: result.textForEmail
    };
  }
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
  var bookingUrl = params.url || '';
  
  if (!brand || !bookingUrl) {
    return serveErrorPage_('Invalid Request', 'Missing booking information', traceId);
  }
  
  var brandInfo = getBrand_(brand);
  var clResolution = resolveCLCodeFromTextForEmail_(brand, textForEmail);
  
  var template = HtmlService.createTemplateFromFile('BookingConfirm');
  template.brand = brand;
  template.brandName = brandInfo ? brandInfo.name : brand;
  template.email = email;
  template.textForEmail = textForEmail;
  template.bookingUrl = bookingUrl;
  template.recruiterName = clResolution.ok ? clResolution.recruiterName : '';
  template.clCode = clResolution.ok ? clResolution.clCode : '';
  template.version = APP_VERSION;
  
  logEvent_(traceId, brand, email, 'BOOKING_CONFIRM_PAGE_VIEWED', {});
  
  return template.evaluate()
    .setTitle('Confirm Booking – ' + (brandInfo ? brandInfo.name : brand))
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
