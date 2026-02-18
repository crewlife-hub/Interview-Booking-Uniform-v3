/**
 * CandidateController.gs
 * Candidate flow: token verification, confirmation page, redirect.
 * CrewLife Interview Bookings Uniform Core
 */

/**
 * Serve candidate confirmation page (GET with token)
 * Token is NOT burned on GET - only validated and set to CONFIRMED
 * @param {string} brand - Brand code
 * @param {string} token - Access token
 * @param {string} traceId - Trace ID
 * @returns {HtmlOutput}
 */
function serveCandidateConfirm_(brand, token, traceId) {
  // Validate token (does NOT mark as USED)
  var validation = validateToken_(token, brand);
  
  if (!validation.ok) {
    logEvent_(traceId, brand, '', 'TOKEN_VALIDATION_FAILED', {
      error: validation.error,
      code: validation.code
    });
    return serveTokenErrorPage_(validation.code, validation.error, traceId);
  }
  
  // Log confirmation page view
  logEvent_(traceId, validation.brand, '', 'CONFIRM_PAGE_VIEWED', {
    clCode: validation.clCode,
    textForEmail: validation.textForEmail
  });
  
  // Serve confirmation page
  var brandInfo = getBrand_(validation.brand);
  var template = HtmlService.createTemplateFromFile('CandidateConfirm');
  template.brand = validation.brand;
  template.brandName = brandInfo ? brandInfo.name : validation.brand;
  template.token = token;
  template.textForEmail = validation.textForEmail;
  template.clCode = validation.clCode;
  template.recruiterName = validation.recruiterName || '';
  template.traceId = traceId;
  
  return template.evaluate()
    .setTitle('Confirm Your Booking – ' + (brandInfo ? brandInfo.name : brand))
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Handle candidate confirmation POST (marks token as USED and redirects)
 * @param {Object} params - POST parameters
 * @param {string} traceId - Trace ID
 * @returns {HtmlOutput}
 */
function handleCandidateConfirmPost_(params, traceId) {
  var token = params.token || '';
  var brand = (params.brand || '').toUpperCase();
  
  if (!token) {
    return serveErrorPage_('Invalid Request', 'Token is required.', traceId);
  }
  
  // Confirm and mark token as USED
  var result = confirmTokenAndMarkUsed_(token, traceId);
  
  if (!result.ok) {
    logEvent_(traceId, brand, '', 'CONFIRM_FAILED', {
      error: result.error,
      code: result.code
    });
    return serveTokenErrorPage_(result.code, result.error, traceId);
  }
  
  // Check if we have a redirect URL
  if (!result.redirectUrl) {
    logEvent_(traceId, result.brand, '', 'NO_REDIRECT_URL', {
      clCode: result.clCode
    });
    return serveErrorPage_('Configuration Error', 
      'No booking URL configured for this position. Please contact the recruiter.', traceId);
  }
  
  // Log successful confirmation
  logEvent_(traceId, result.brand, '', 'REDIRECT_INITIATED', {
    clCode: result.clCode,
    redirectUrl: result.redirectUrl
  });
  
  // Return redirect page
  return serveRedirectPage_(result.redirectUrl, result.brand);
}

/**
 * Serve redirect page with client-side redirect
 * @param {string} url - Redirect URL
 * @param {string} brand - Brand code
 * @returns {HtmlOutput}
 */
function serveRedirectPage_(url, brand) {
  var brandInfo = getBrand_(brand);
  var brandName = brandInfo ? brandInfo.name : brand;
  
  var html = '<!DOCTYPE html>';
  html += '<html><head>';
  html += '<meta charset="utf-8">';
  html += '<meta name="viewport" content="width=device-width, initial-scale=1">';
  html += '<title>Redirecting to Booking – ' + escapeHtml_(brandName) + '</title>';
  html += '<style>';
  html += 'body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; ';
  html += 'display: flex; justify-content: center; align-items: center; min-height: 100vh; ';
  html += 'margin: 0; background: #f5f5f5; }';
  html += '.container { text-align: center; background: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }';
  html += '.spinner { width: 40px; height: 40px; border: 4px solid #f3f3f3; border-top: 4px solid #0066cc; ';
  html += 'border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 20px; }';
  html += '@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }';
  html += 'a { color: #0066cc; }';
  html += '</style>';
  html += '</head><body>';
  html += '<div class="container">';
  html += '<div class="spinner"></div>';
  html += '<h2>Redirecting to Booking Page...</h2>';
  html += '<p>You will be redirected automatically.</p>';
  html += '<p>If you are not redirected, <a href="' + escapeHtml_(url) + '">click here</a>.</p>';
  html += '</div>';
  html += '<script>setTimeout(function() { window.location.href = "' + url.replace(/"/g, '\\"') + '"; }, 500);</script>';
  html += '</body></html>';
  
  return HtmlService.createHtmlOutput(html)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Serve token-specific error page
 * @param {string} code - Error code
 * @param {string} message - Error message
 * @param {string} traceId - Trace ID
 * @returns {HtmlOutput}
 */
function serveTokenErrorPage_(code, message, traceId) {
  var title = 'Link Error';
  var icon = '❌';
  var suggestion = '';
  
  switch (code) {
    case 'EXPIRED':
      title = 'Link Expired';
      icon = '⏱️';
      suggestion = 'This booking link has expired. Please contact your recruiter for a new link.';
      break;
    case 'ALREADY_USED':
      title = 'Link Already Used';
      icon = '✅';
      suggestion = 'This booking link has already been used. If you need to rebook, please contact your recruiter.';
      break;
    case 'REVOKED':
      title = 'Link Revoked';
      icon = '🚫';
      suggestion = 'This booking link has been revoked. You should have received a new link by email.';
      break;
    case 'NOT_FOUND':
      title = 'Invalid Link';
      icon = '🔍';
      suggestion = 'This booking link is not valid. Please check you have the correct link or contact your recruiter.';
      break;
    case 'BRAND_MISMATCH':
      title = 'Invalid Link';
      icon = '⚠️';
      suggestion = 'This link does not match the expected brand. Please use the correct link.';
      break;
    default:
      suggestion = 'Please contact your recruiter for assistance.';
  }
  
  return serveErrorPage_(title, message + '<br><br>' + suggestion, traceId, icon);
}

/**
 * Serve generic error page
 * @param {string} title - Error title
 * @param {string} message - Error message
 * @param {string} traceId - Trace ID
 * @param {string} icon - Optional icon
 * @returns {HtmlOutput}
 */
function serveErrorPage_(title, message, traceId, icon) {
  var template = HtmlService.createTemplateFromFile('ErrorPage');
  template.title = title;
  template.message = message;
  template.traceId = traceId || '';
  template.icon = icon || '❌';
  
  return template.evaluate()
    .setTitle(title + ' – CrewLife Bookings')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
