/**
 * AdminController.gs
 * Admin page logic: candidate lookup, send invite, re-issue, CL management.
 * CrewLife Interview Bookings Uniform Core
 */

/**
 * Serve admin console page
 * @param {string} brand - Brand code
 * @param {Object} params - URL parameters
 * @param {string} traceId - Trace ID
 * @returns {HtmlOutput}
 */
function serveAdminConsole_(brand, params, traceId) {
  // Validate brand
  if (!isValidBrand_(brand)) {
    return serveErrorPage_('Invalid Brand', 'Brand not found: ' + brand, traceId);
  }
  
  // Check access
  var accessCheck = checkAdminAccess_(brand);
  if (!accessCheck.ok) {
    return serveErrorPage_('Access Denied', accessCheck.error, traceId);
  }
  
  // Ensure config tabs exist
  ensureConfigSheetTabs_();
  
  // Prepare template data
  var brandInfo = getBrand_(brand);
  var clCodes = getCLCodesForBrand_(brand);
  var jobs = getJobsForBrand_(brand);
  var recentLogs = getRecentLogs_(brand, 10);
  
  var template = HtmlService.createTemplateFromFile('AdminConsole');
  template.brand = brand;
  template.brandName = brandInfo.name;
  template.clCodes = JSON.stringify(clCodes);
  template.jobs = JSON.stringify(jobs);
  template.recentLogs = JSON.stringify(recentLogs);
  template.userEmail = accessCheck.userEmail;
  template.version = APP_VERSION;
  template.safeMode = getConfig_().SAFE_MODE;
  
  logEvent_(traceId, brand, accessCheck.userEmail, 'ADMIN_CONSOLE_VIEWED', {});
  
  return template.evaluate()
    .setTitle('Admin Console – ' + brandInfo.name)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Temporary: Return admin data as JSON for debugging client-side render issues.
 * @param {string} brand
 * @param {Object} params
 * @param {string} traceId
 */
function serveAdminData_(brand, params, traceId) {
  try {
    if (!isValidBrand_(brand)) {
      return jsonResponse_({ ok: false, error: 'Invalid Brand: ' + brand });
    }
    var accessCheck = checkAdminAccess_(brand);
    if (!accessCheck.ok) {
      return jsonResponse_({ ok: false, error: accessCheck.error });
    }

    ensureConfigSheetTabs_();
    var brandInfo = getBrand_(brand);
    var clCodes = getCLCodesForBrand_(brand);
    var jobs = getJobsForBrand_(brand);
    var recentLogs = getRecentLogs_(brand, 50);
    var cfg = getConfig_();

    return jsonResponse_({
      ok: true,
      brand: brand,
      brandName: brandInfo && brandInfo.name,
      clCodes: clCodes,
      jobs: jobs,
      recentLogs: recentLogs,
      userEmail: accessCheck.userEmail,
      version: APP_VERSION,
      safeMode: cfg.SAFE_MODE
    });
  } catch (e) {
    return jsonResponse_({ ok: false, error: String(e), stack: e.stack });
  }
}

/**
 * Check admin access for a brand
 * @param {string} brand - Brand code
 * @returns {Object} Access check result
 */
function checkAdminAccess_(brand) {
  try {
    var user = Session.getActiveUser();
    var email = user.getEmail();
    
    if (!email) {
      // User not logged in or script running anonymously
      return { ok: true, userEmail: 'anonymous', warning: 'User not authenticated' };
    }
    
    var cfg = getConfig_();
    
    // Check workspace domain
    if (cfg.WORKSPACE_DOMAIN) {
      var domain = email.split('@')[1];
      if (domain && domain.toLowerCase() === cfg.WORKSPACE_DOMAIN.toLowerCase()) {
        return { ok: true, userEmail: email };
      }
    }
    
    // Check global allowlist
    if (cfg.ADMIN_ALLOWLIST && cfg.ADMIN_ALLOWLIST.length > 0) {
      for (var i = 0; i < cfg.ADMIN_ALLOWLIST.length; i++) {
        if (cfg.ADMIN_ALLOWLIST[i].toLowerCase().trim() === email.toLowerCase()) {
          return { ok: true, userEmail: email };
        }
      }
    }
    
    // Check brand-specific admin list
    var brandConfig = getBrandConfigOverrides_(brand);
    if (brandConfig.adminEmails && brandConfig.adminEmails.length > 0) {
      for (var j = 0; j < brandConfig.adminEmails.length; j++) {
        if (brandConfig.adminEmails[j].toLowerCase() === email.toLowerCase()) {
          return { ok: true, userEmail: email };
        }
      }
    }
    
    // Default: allow if no restrictions configured
    if (!cfg.ADMIN_ALLOWLIST || cfg.ADMIN_ALLOWLIST.length === 0) {
      return { ok: true, userEmail: email, warning: 'No access restrictions configured' };
    }
    
    return { ok: false, error: 'Access denied for: ' + email };
    
  } catch (e) {
    Logger.log('checkAdminAccess_ error: ' + e);
    return { ok: true, userEmail: 'unknown', warning: 'Could not verify user' };
  }
}

/**
 * Handle admin POST actions
 * @param {Object} params - POST parameters
 * @param {string} traceId - Trace ID
 * @returns {HtmlOutput|TextOutput}
 */
function handleAdminPost_(params, traceId) {
  var action = (params.action || '').toLowerCase();
  var brand = (params.brand || '').toUpperCase();
  
  // Validate brand
  if (!isValidBrand_(brand)) {
    return jsonResponse_({ ok: false, error: 'Invalid brand' });
  }
  
  // Check access
  var accessCheck = checkAdminAccess_(brand);
  if (!accessCheck.ok) {
    return jsonResponse_({ ok: false, error: accessCheck.error });
  }
  
  switch (action) {
    case 'lookup':
      return handleLookup_(params, traceId, accessCheck.userEmail);
    case 'send':
      return handleSendInvite_(params, traceId, accessCheck.userEmail);
    case 'reissue':
      return handleReissue_(params, traceId, accessCheck.userEmail);
    case 'updateurl':
      return handleUpdateUrl_(params, traceId, accessCheck.userEmail);
    default:
      return jsonResponse_({ ok: false, error: 'Unknown action: ' + action });
  }
}

/**
 * Handle candidate lookup
 * @param {Object} params - Parameters
 * @param {string} traceId - Trace ID
 * @param {string} adminEmail - Admin email
 * @returns {TextOutput}
 */
function handleLookup_(params, traceId, adminEmail) {
  var brand = params.brand;
  var email = (params.email || '').trim();
  var textForEmail = (params.textForEmail || '').trim();
  
  if (!email) {
    return jsonResponse_({ ok: false, error: 'Email is required' });
  }
  
  logEvent_(traceId, brand, email, 'ADMIN_LOOKUP', { textForEmail: textForEmail, admin: adminEmail });
  
  // Search Smartsheet
  var result;
  if (textForEmail) {
    result = searchCandidateInSmartsheet_(brand, email, textForEmail);
  } else {
    result = getCandidateSuggestions_(brand, email);
  }
  
  if (!result.ok) {
    return jsonResponse_(result);
  }
  
  // If exact match found, resolve CL code
  if (result.found && result.exactMatch) {
    var candidate = result.candidate;
    var tf = candidate['Text For Email'] || textForEmail;
    var clResolution = resolveCLCodeFromTextForEmail_(brand, tf);
    
    return jsonResponse_({
      ok: true,
      found: true,
      exactMatch: true,
      candidate: candidate,
      clResolution: clResolution,
      tokenHistory: getTokenHistory_(email, brand)
    });
  }
  
  // Partial matches
  if (result.found && !result.exactMatch) {
    return jsonResponse_({
      ok: true,
      found: true,
      exactMatch: false,
      candidates: result.candidates,
      suggestions: result.suggestedTextForEmail
    });
  }
  
  // Not found
  return jsonResponse_({
    ok: true,
    found: false,
    message: 'No candidate found with email: ' + maskEmail_(email)
  });
}

/**
 * Handle send invite
 * @param {Object} params - Parameters
 * @param {string} traceId - Trace ID
 * @param {string} adminEmail - Admin email
 * @returns {TextOutput}
 */
function handleSendInvite_(params, traceId, adminEmail) {
  var brand = params.brand;
  var email = (params.email || '').trim();
  var textForEmail = (params.textForEmail || '').trim();
  
  if (!email) {
    return jsonResponse_({ ok: false, error: 'Email is required' });
  }
  if (!textForEmail) {
    return jsonResponse_({ ok: false, error: 'Text For Email is required' });
  }
  
  // Verify candidate exists in Smartsheet
  var searchResult = searchCandidateInSmartsheet_(brand, email, textForEmail);
  if (!searchResult.ok) {
    return jsonResponse_({ ok: false, error: searchResult.error });
  }
  if (!searchResult.found || !searchResult.exactMatch) {
    return jsonResponse_({ ok: false, error: 'No exact match found. Email and Text For Email must match exactly.' });
  }
  
  // Resolve CL code
  var clResolution = resolveCLCodeFromTextForEmail_(brand, textForEmail);
  if (!clResolution.ok) {
    return jsonResponse_({ ok: false, error: clResolution.error });
  }
  
  // Check for existing active token
  var history = getTokenHistory_(email, brand);
  var hasActiveToken = history.some(function(t) {
    return t.Status === 'ISSUED' || t.Status === 'CONFIRMED';
  });
  
  if (hasActiveToken) {
    return jsonResponse_({
      ok: false,
      error: 'Active token already exists. Use Re-issue to send a new link.',
      hasActiveToken: true
    });
  }
  
  // Issue token
  var tokenResult = issueToken_({
    email: email,
    textForEmail: textForEmail,
    brand: brand,
    clCode: clResolution.clCode,
    issuedBy: adminEmail,
    traceId: traceId
  });
  
  if (!tokenResult.ok) {
    return jsonResponse_({ ok: false, error: 'Failed to issue token' });
  }
  
  // Send email
  var emailResult = sendInviteEmail_({
    email: email,
    brand: brand,
    token: tokenResult.token,
    textForEmail: textForEmail,
    clCode: clResolution.clCode,
    recruiterName: clResolution.recruiterName,
    traceId: traceId,
    isReissue: false
  });
  
  if (!emailResult.ok) {
    return jsonResponse_({ ok: false, error: 'Token issued but email failed: ' + emailResult.error });
  }
  
  return jsonResponse_({
    ok: true,
    message: 'Invite sent successfully',
    tokenExpiry: tokenResult.expiry,
    clCode: clResolution.clCode,
    recruiter: clResolution.recruiterName
  });
}

/**
 * Handle re-issue invite
 * @param {Object} params - Parameters
 * @param {string} traceId - Trace ID
 * @param {string} adminEmail - Admin email
 * @returns {TextOutput}
 */
function handleReissue_(params, traceId, adminEmail) {
  var brand = params.brand;
  var email = (params.email || '').trim();
  var textForEmail = (params.textForEmail || '').trim();
  
  if (!email || !textForEmail) {
    return jsonResponse_({ ok: false, error: 'Email and Text For Email are required' });
  }
  
  // Verify candidate exists
  var searchResult = searchCandidateInSmartsheet_(brand, email, textForEmail);
  if (!searchResult.ok) {
    return jsonResponse_({ ok: false, error: searchResult.error });
  }
  if (!searchResult.found || !searchResult.exactMatch) {
    return jsonResponse_({ ok: false, error: 'No exact match found in Smartsheet' });
  }
  
  // Resolve CL code
  var clResolution = resolveCLCodeFromTextForEmail_(brand, textForEmail);
  if (!clResolution.ok) {
    return jsonResponse_({ ok: false, error: clResolution.error });
  }
  
  // Revoke existing active tokens
  var revokeResult = revokeActiveTokens_(email, brand, traceId, adminEmail);
  
  // Issue new token
  var tokenResult = issueToken_({
    email: email,
    textForEmail: textForEmail,
    brand: brand,
    clCode: clResolution.clCode,
    issuedBy: adminEmail,
    traceId: traceId
  });
  
  if (!tokenResult.ok) {
    return jsonResponse_({ ok: false, error: 'Failed to issue new token' });
  }
  
  // Send email
  var emailResult = sendInviteEmail_({
    email: email,
    brand: brand,
    token: tokenResult.token,
    textForEmail: textForEmail,
    clCode: clResolution.clCode,
    recruiterName: clResolution.recruiterName,
    traceId: traceId,
    isReissue: true
  });
  
  if (!emailResult.ok) {
    return jsonResponse_({ ok: false, error: 'Token issued but email failed: ' + emailResult.error });
  }
  
  return jsonResponse_({
    ok: true,
    message: 'New invite sent. ' + revokeResult.revokedCount + ' old token(s) revoked.',
    revokedCount: revokeResult.revokedCount,
    tokenExpiry: tokenResult.expiry
  });
}

/**
 * Handle CL code URL update
 * @param {Object} params - Parameters
 * @param {string} traceId - Trace ID
 * @param {string} adminEmail - Admin email
 * @returns {TextOutput}
 */
function handleUpdateUrl_(params, traceId, adminEmail) {
  var brand = params.brand;
  var clCode = params.clCode;
  var newUrl = params.newUrl;
  
  if (!clCode || !newUrl) {
    return jsonResponse_({ ok: false, error: 'CL Code and URL are required' });
  }
  
  var result = updateCLCodeBookingUrl_(brand, clCode, newUrl);
  
  if (result.ok) {
    logEvent_(traceId, brand, adminEmail, 'CL_CODE_URL_UPDATED', {
      clCode: clCode,
      newUrl: newUrl,
      admin: adminEmail
    });
  }
  
  return jsonResponse_(result);
}

/**
 * Get recent logs for a brand
 * @param {string} brand - Brand code
 * @param {number} limit - Max number of logs
 * @returns {Array} Recent log entries
 */
function getRecentLogs_(brand, limit) {
  try {
    var ss = getConfigSheet_();
    var sheet = ss.getSheetByName('LOGS');
    if (!sheet) return [];
    
    var data = sheet.getDataRange().getValues();
    if (data.length < 2) return [];
    
    var headers = data[0];
    var brandIdx = headers.indexOf('Brand');
    
    var logs = [];
    for (var i = data.length - 1; i >= 1 && logs.length < limit; i--) {
      if (!brand || String(data[i][brandIdx]).toUpperCase() === String(brand).toUpperCase()) {
        var entry = {};
        for (var j = 0; j < headers.length; j++) {
          entry[headers[j]] = data[i][j];
        }
        logs.push(entry);
      }
    }
    return logs;
  } catch (e) {
    Logger.log('getRecentLogs_ error: ' + e);
    return [];
  }
}
