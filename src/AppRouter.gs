/**
 * AppRouter.gs
 * Main entry point and routing for web app
 * Interview Booking Uniform System v3
 */

/**
 * Main GET handler - routes to appropriate page
 */
function doGet(e) {
  try {
    const page = (e.parameter.page || 'otp_request').toLowerCase();
    
    switch (page) {
      case 'otp_request':
        return renderOtpRequestPage_(e.parameter);
      case 'otp_verify':
        return renderOtpVerifyPage_(e.parameter);
      case 'booking_confirm':
        return renderBookingConfirmPage_(e.parameter);
      case 'diag':
        return renderDiagPage_(e.parameter);
      default:
        return renderErrorPage_('Page Not Found', `The requested page "${page}" does not exist.`);
    }
  } catch (error) {
    console.error('doGet error:', error);
    LoggingService.error('', '', 'ROUTER_ERROR', error.message, '', { stack: error.stack });
    return renderErrorPage_('System Error', 'An unexpected error occurred. Please try again later.');
  }
}

/**
 * Main POST handler - processes form submissions
 */
function doPost(e) {
  try {
    const action = e.parameter.action || '';
    
    switch (action) {
      case 'request_otp':
        return handleOtpRequest_(e.parameter);
      case 'verify_otp':
        return handleOtpVerify_(e.parameter);
      case 'confirm_booking':
        return handleBookingConfirm_(e.parameter);
      case 'run_dispatcher':
        return handleRunDispatcher_(e.parameter);
      default:
        return jsonResponse_({ success: false, error: 'Unknown action' });
    }
  } catch (error) {
    console.error('doPost error:', error);
    LoggingService.error('', '', 'POST_ROUTER_ERROR', error.message, '', { stack: error.stack });
    return jsonResponse_({ success: false, error: 'An unexpected error occurred.' });
  }
}

// ============ PAGE RENDERERS ============

/**
 * Render OTP Request page
 */
function renderOtpRequestPage_(params) {
  const validation = CandidateVerifyService.validateOtpRequestParams(params);
  
  if (!validation.valid) {
    if (validation.expired) {
      return renderErrorPage_('Link Expired', 'This invitation link has expired. Please contact the recruiter for a new invitation.');
    }
    return renderErrorPage_('Invalid Link', validation.error);
  }
  
  // Get jobs for dropdown
  const jobs = ConfigService.getJobsForBrand(params.brand);
  
  const template = HtmlService.createTemplateFromFile('OtpRequest');
  template.brand = params.brand;
  template.rowId = params.rowId;
  template.ts = params.ts;
  template.sig = params.sig;
  template.jobs = jobs;
  template.brandConfig = validation.brandConfig;
  
  return template.evaluate()
    .setTitle(`Interview Verification - ${params.brand}`)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * Render OTP Verify page
 */
function renderOtpVerifyPage_(params) {
  const { email, brand } = params;
  
  if (!email) {
    return renderErrorPage_('Missing Information', 'Email address is required for verification.');
  }
  
  const template = HtmlService.createTemplateFromFile('OtpVerify');
  template.email = email;
  template.brand = brand || '';
  
  return template.evaluate()
    .setTitle(`Enter Verification Code - ${brand || 'Interview'}`)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * Render Booking Confirm page
 */
function renderBookingConfirmPage_(params) {
  const { token } = params;
  
  if (!token) {
    return renderErrorPage_('Invalid Link', 'Missing booking token. Please complete verification first.');
  }
  
  const validation = CandidateVerifyService.validateBookingToken(token);
  
  if (!validation.valid) {
    if (validation.alreadyUsed) {
      return renderErrorPage_('Link Already Used', 'This booking link has already been used. Each link can only be used once.');
    }
    if (validation.expired) {
      return renderErrorPage_('Link Expired', 'This booking link has expired. Please complete verification again.');
    }
    return renderErrorPage_('Invalid Link', validation.error);
  }
  
  const template = HtmlService.createTemplateFromFile('BookingConfirm');
  template.token = token;
  template.brand = validation.brand;
  template.textForEmail = validation.textForEmail;
  
  return template.evaluate()
    .setTitle(`Book Your Interview - ${validation.brand}`)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * Render Diagnostics page
 */
function renderDiagPage_(params) {
  // Get diagnostic data
  const brandConfigs = ConfigService.getAllBrandConfigs();
  const recentLogs = ConfigService.getRecentLogs(50);
  const schemaStatus = ConfigService.enforceSchema();
  
  const template = HtmlService.createTemplateFromFile('Diag');
  template.brandConfigs = brandConfigs;
  template.recentLogs = recentLogs;
  template.schemaStatus = schemaStatus;
  
  return template.evaluate()
    .setTitle('System Diagnostics')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * Render error page
 */
function renderErrorPage_(title, message) {
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Error - Interview Booking</title>
  <?!= HtmlService.createHtmlOutputFromFile('SharedStyles').getContent() ?>
</head>
<body>
  <div class="container">
    <div class="card error-card">
      <div class="icon-circle error">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
      </div>
      <h1>${title}</h1>
      <p class="message">${message}</p>
      <p class="help-text">If you believe this is an error, please contact the recruiter who sent you the invitation.</p>
    </div>
  </div>
</body>
</html>`;
  
  return HtmlService.createHtmlOutput(html)
    .setTitle('Error - Interview Booking')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// ============ POST HANDLERS ============

/**
 * Handle OTP request form submission
 */
function handleOtpRequest_(params) {
  const result = CandidateVerifyService.processOtpRequest(params);
  
  if (result.success) {
    // Return redirect URL for client-side navigation
    const verifyUrl = ScriptApp.getService().getUrl() + 
      `?page=otp_verify&email=${encodeURIComponent(result.email)}&brand=${encodeURIComponent(result.brand)}`;
    result.redirectUrl = verifyUrl;
  }
  
  return jsonResponse_(result);
}

/**
 * Handle OTP verification form submission
 */
function handleOtpVerify_(params) {
  const result = CandidateVerifyService.processOtpVerification(params);
  
  if (result.success) {
    // Return redirect URL for booking confirm page
    const confirmUrl = ScriptApp.getService().getUrl() + 
      `?page=booking_confirm&token=${encodeURIComponent(result.token)}`;
    result.redirectUrl = confirmUrl;
  }
  
  return jsonResponse_(result);
}

/**
 * Handle booking confirmation (token burn)
 */
function handleBookingConfirm_(params) {
  const result = CandidateVerifyService.processBookingConfirm(params);
  return jsonResponse_(result);
}

/**
 * Handle dispatcher run request
 */
function handleRunDispatcher_(params) {
  const dryRun = params.dryRun === 'true' || params.dryRun === true;
  
  // Note: In production, add admin authentication here
  const result = InviteDispatcher.runInviteDispatcher(dryRun);
  return jsonResponse_(result);
}

// ============ HELPERS ============

/**
 * Create JSON response
 */
function jsonResponse_(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Include HTML file content (for templates)
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ============ INITIALIZATION ============

/**
 * Initialize the system - create config sheet tabs
 */
function initializeSystem() {
  const results = ConfigService.enforceSchema();
  console.log('Schema enforcement results:', JSON.stringify(results, null, 2));
  return results;
}

/**
 * Create menu for spreadsheet
 */
function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu('Interview Booking')
      .addItem('Run Dispatcher (Dry Run)', 'runDispatcherDryRun')
      .addItem('Run Dispatcher (Live)', 'runDispatcherLive')
      .addSeparator()
      .addItem('Initialize System', 'initializeSystem')
      .addItem('Run All Tests', 'runAllTests')
      .addToUi();
  } catch (e) {
    // Menu creation may fail if not in spreadsheet context
    console.log('Menu creation skipped:', e.message);
  }
}
