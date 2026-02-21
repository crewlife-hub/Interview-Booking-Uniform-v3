/**
 * OtpService.gs
 * OTP generation, storage, validation with attempts tracking.
 * Replaces Google Forms OTP flow.
 * CrewLife Interview Bookings Uniform Core
 */

/**
 * Get OTP expiry in minutes (default 10)
 * @returns {number} Minutes
 */
function getOtpExpiryMinutes_() {
  var props = PropertiesService.getScriptProperties();
  return Number(props.getProperty('OTP_EXPIRY_MINUTES') || 10);
}

/**
 * Generate a 6-digit OTP
 * @returns {string} 6-digit OTP
 */
function generateOtp_() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/**
 * Create and store an OTP for a candidate
 * @param {Object} params - OTP parameters
 * @param {string} params.email - Candidate email
 * @param {string} params.brand - Brand code
 * @param {string} params.textForEmail - Text For Email
 * @param {string} params.traceId - Trace ID
 * @returns {Object} Result with OTP
 */
function createOtp_(params) {
  var email = String(params.email || '').toLowerCase().trim();
  var brand = String(params.brand || '').toUpperCase().trim();
  var textForEmail = String(params.textForEmail || '').trim();
  var traceId = params.traceId || generateTraceId_();
  
  if (!email || !brand || !textForEmail) {
    return { ok: false, error: 'Missing required parameters' };
  }

  // BLOCK: Do not issue a new OTP/invite if an existing USED or LOCKED invite exists
  // for the same Brand + Email + Text For Email.
  try {
    var ssPre = getConfigSheet_();
    var shPre = ssPre.getSheetByName('TOKENS');
    if (shPre) {
      var block = findBlockingInviteInTokens_({
        sheet: shPre,
        brand: brand,
        email: email,
        textForEmail: textForEmail
      });
      if (block && block.blocked) {
        Logger.log('[INVITE_BLOCK] brand=%s email=%s textForEmail=%s matchedRow=%s status=%s locked=%s',
          brand, email, textForEmail, block.rowIndex, block.status || '', block.locked || '');
        return {
          ok: false,
          code: 'INVITE_BLOCKED',
          error: 'This invite has already been used. Please request a new OTP or contact support.'
        };
      }
    }
  } catch (e) {
    // Fail-open on guard errors to avoid blocking legitimate invites.
    Logger.log('[INVITE_BLOCK_GUARD_ERROR] %s', String(e));
  }
  
  // Rate limiting removed: allow immediate OTP creation (for testing/development)
  // If you need to re-enable rate limiting, set a script property 'ENABLE_OTP_RATE_LIMIT' = 'true'
  // and implement the check accordingly.
  
  // Expire any pending OTPs for this email/brand
  expirePendingOtps_(email, brand);
  
  // Generate new OTP
  var otp = generateOtp_();
  var expiryMinutes = getOtpExpiryMinutes_();
  var expiryTime = new Date(Date.now() + expiryMinutes * 60 * 1000);
  var token = Utilities.getUuid();
  
  // Store in TOKENS sheet
  var ss = getConfigSheet_();
  var sheet = ss.getSheetByName('TOKENS');
  if (!sheet) {
    ensureConfigSheetTabs_();
    sheet = ss.getSheetByName('TOKENS');
  }
  
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var tokenIdx = headers.indexOf('Token');
  var emailIdx = headers.indexOf('Email');
  var emailHashIdx = headers.indexOf('Email Hash');
  var otpIdx = headers.indexOf('OTP');
  var brandIdx = headers.indexOf('Brand');
  var textForEmailIdx = headers.indexOf('Text For Email');
  var positionLinkIdx = headers.indexOf('Position Link');
  var statusIdx = headers.indexOf('Status');
  var expiryIdx = headers.indexOf('Expiry');
  var createdIdx = headers.indexOf('Created At');
  var attemptsIdx = headers.indexOf('Attempts');
  var traceIdIdx = headers.indexOf('Trace ID');
  
  // Add OTP column if missing
  if (otpIdx === -1) {
    sheet.getRange(1, headers.length + 1).setValue('OTP');
    otpIdx = headers.length;
  }
  if (attemptsIdx === -1) {
    sheet.getRange(1, headers.length + 2).setValue('Attempts');
    attemptsIdx = headers.length + 1;
  }
  // Ensure Position Link column exists so we can store per-row links
  if (positionLinkIdx === -1) {
    sheet.getRange(1, headers.length + 3).setValue('Position Link');
    positionLinkIdx = headers.length + 2;
  }
  
  var newRow = [];
  var targetLen = Math.max(headers.length, attemptsIdx + 1, positionLinkIdx + 1);
  for (var i = 0; i < targetLen; i++) {
    if (i === tokenIdx) newRow.push(token);
    else if (i === emailIdx) newRow.push(email);
    else if (i === emailHashIdx) newRow.push(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, email).map(function(b){return ('0'+(b&0xFF).toString(16)).slice(-2);}).join(''));
    else if (i === otpIdx) newRow.push(otp);
    else if (i === brandIdx) newRow.push(brand);
    else if (i === textForEmailIdx) newRow.push(textForEmail);
    else if (i === statusIdx) newRow.push('PENDING');
    else if (i === expiryIdx) newRow.push(expiryTime);
    else if (i === createdIdx) newRow.push(new Date());
    else if (i === attemptsIdx) newRow.push(0);
    else if (i === traceIdIdx) newRow.push(traceId);
    else newRow.push('');
  }
  // If candidate provided, attempt to store Position Link from Smartsheet row
  var posLinkVal = '';
  if (params.candidate) {
    posLinkVal = params.candidate['Position Link'] || params.candidate['Link'] || params.candidate['PositionLink'] || '';
  }
  // Ensure array is long enough and set value
  if (newRow.length <= positionLinkIdx) {
    while (newRow.length <= positionLinkIdx) newRow.push('');
  }
  newRow[positionLinkIdx] = posLinkVal;

  sheet.appendRow(newRow);

  try {
    Logger.log('[INVITE_CREATE] brand=%s email=%s textForEmail=%s row=%s', brand, email, textForEmail, sheet.getLastRow());
  } catch (e) {}
  
  logEvent_(traceId, brand, email, 'OTP_CREATED', { expiryMinutes: expiryMinutes });
  
  return {
    ok: true,
    token: token,
    otp: otp,
    email: email,
    brand: brand,
    textForEmail: textForEmail,
    expiresAt: expiryTime.toISOString(),
    expiryMinutes: expiryMinutes
  };
}

/**
 * Validate an OTP using Token as primary key (deterministic)
 * Falls back to email+brand scan if token not provided (legacy)
 * @param {Object} params - Validation parameters
 * @param {string} params.token - Token (unique row identifier) - PREFERRED
 * @param {string} params.email - Candidate email
 * @param {string} params.brand - Brand code
 * @param {string} params.otp - OTP to validate
 * @param {string} params.textForEmail - Text For Email
 * @param {string} params.traceId - Trace ID
 * @returns {Object} Validation result
 */
function validateOtp_(params) {
  var token = String(params.token || '').trim();
  var email = String(params.email || '').toLowerCase().trim();
  var brand = String(params.brand || '').toUpperCase().trim();
  var otp = String(params.otp || '').trim();
  var textForEmail = String(params.textForEmail || '').trim();
  var traceId = params.traceId || generateTraceId_();
  
  if (!otp) {
    Logger.log('[validateOtp_] Missing OTP');
    return { ok: false, error: 'Missing OTP' };
  }
  
  var ss = getConfigSheet_();
  var sheet = ss.getSheetByName('TOKENS');
  if (!sheet) {
    Logger.log('[validateOtp_] TOKENS sheet missing');
    return { ok: false, error: 'System not configured' };
  }
  
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  
  // Build header index map (never use hardcoded positions)
  var idx = {};
  for (var h = 0; h < headers.length; h++) {
    idx[headers[h]] = h;
  }
  
  // Validate required headers
  var requiredHeaders = ['Token', 'Email', 'OTP', 'Brand', 'Status', 'Expiry', 'Attempts'];
  for (var r = 0; r < requiredHeaders.length; r++) {
    if (idx[requiredHeaders[r]] === undefined) {
      Logger.log('[validateOtp_] Missing header: %s', requiredHeaders[r]);
      return { ok: false, error: 'System configuration error: missing header ' + requiredHeaders[r] };
    }
  }
  
  var targetRow = -1;
  var targetRowData = null;
  
  // PRIMARY: Look up by token (deterministic)
  if (token) {
    Logger.log('[validateOtp_] Looking up by token: %s...', token.substring(0, 8));
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][idx['Token']]) === token) {
        targetRow = i;
        targetRowData = data[i];
        Logger.log('[validateOtp_] Found token at row %s', i + 1);
        break;
      }
    }
    if (targetRow === -1) {
      Logger.log('[validateOtp_] Token not found');
      return { ok: false, error: 'Invalid or expired verification link. Please request a new OTP.' };
    }
  } else {
    // FALLBACK: Scan by email+brand (legacy)
    Logger.log('[validateOtp_] No token, falling back to email+brand scan for %s / %s', email, brand);
    if (!email || !brand) {
      return { ok: false, error: 'Missing required parameters' };
    }
    for (var j = data.length - 1; j >= 1; j--) {
      var row = data[j];
      if (String(row[idx['Email']]).toLowerCase() === email &&
          String(row[idx['Brand']]).toUpperCase() === brand &&
          row[idx['Status']] === 'PENDING') {
        targetRow = j;
        targetRowData = row;
        Logger.log('[validateOtp_] Found PENDING row at %s (fallback)', j + 1);
        break;
      }
    }
    if (targetRow === -1) {
      return { ok: false, error: 'No pending OTP found. Please request a new one.' };
    }
  }
  
  // Validate the target row
  var rowEmail = String(targetRowData[idx['Email']]).toLowerCase();
  var rowBrand = String(targetRowData[idx['Brand']]).toUpperCase();
  var rowOtp = String(targetRowData[idx['OTP']]);
  var rowStatus = String(targetRowData[idx['Status']]);
  var rowExpiry = new Date(targetRowData[idx['Expiry']]);
  var rowAttempts = Number(targetRowData[idx['Attempts']] || 0);
  var rowTextForEmail = targetRowData[idx['Text For Email']] || textForEmail;
  var sheetRow = targetRow + 1;
  
  Logger.log('[validateOtp_] Row %s: status=%s, expiry=%s, attempts=%s', sheetRow, rowStatus, rowExpiry, rowAttempts);
  
  // Check status
  if (rowStatus !== 'PENDING') {
    var statusMsg = {
      'VERIFIED': 'This OTP has already been used.',
      'EXPIRED': 'This OTP has expired. Please request a new one.',
      'LOCKED': 'This OTP is locked due to too many failed attempts.',
      'SUPERSEDED': 'This OTP has been replaced. Check your email for the latest code.'
    };
    return { ok: false, error: statusMsg[rowStatus] || 'Invalid OTP status.' };
  }
  
  // Check expiry
  if (new Date() > rowExpiry) {
    sheet.getRange(sheetRow, idx['Status'] + 1).setValue('EXPIRED');
    logEvent_(traceId, rowBrand, rowEmail, 'OTP_EXPIRED', {});
    return { ok: false, error: 'OTP has expired. Please request a new one.' };
  }
      
  // Check attempts
  if (rowAttempts >= 3) {
    sheet.getRange(sheetRow, idx['Status'] + 1).setValue('LOCKED');
    logEvent_(traceId, rowBrand, rowEmail, 'OTP_LOCKED', { attempts: rowAttempts });
    return { ok: false, error: 'Too many failed attempts. Please request a new OTP.' };
  }
  
  // Validate OTP value
  if (rowOtp === otp) {
    // SUCCESS - mark as VERIFIED (Used At will be set when secure access link is consumed)
    sheet.getRange(sheetRow, idx['Status'] + 1).setValue('VERIFIED');
    
    logEvent_(traceId, rowBrand, rowEmail, 'OTP_VERIFIED', { textForEmail: rowTextForEmail });
    
    // Resolve booking URL and prefer Position Link stored on the token row
    var clResolution = resolveCLCodeFromTextForEmail_(rowBrand, rowTextForEmail);
    var posIdx = idx['Position Link'];
    var storedPos = (posIdx !== undefined) ? (targetRowData[posIdx] || '') : '';
    if (storedPos) {
      clResolution = clResolution || {};
      clResolution.bookingUrl = storedPos;
    }

    return {
      ok: true,
      verified: true,
      email: rowEmail,
      brand: rowBrand,
      textForEmail: rowTextForEmail,
      clResolution: clResolution
    };
  } else {
    // WRONG OTP - increment attempts
    var newAttempts = rowAttempts + 1;
    sheet.getRange(sheetRow, idx['Attempts'] + 1).setValue(newAttempts);
    logEvent_(traceId, rowBrand, rowEmail, 'OTP_FAILED', { attempts: newAttempts });
    
    if (newAttempts >= 3) {
      sheet.getRange(sheetRow, idx['Status'] + 1).setValue('LOCKED');
      return { ok: false, error: 'Too many failed attempts. Please request a new OTP.' };
    }
    
    var remaining = 3 - newAttempts;
    return { ok: false, error: 'Invalid OTP. ' + remaining + ' attempt(s) remaining.' };
  }
}



/**
 * Count recent OTPs for rate limiting
 * @param {string} email - Email
 * @param {string} brand - Brand
 * @param {number} minutes - Time window in minutes
 * @returns {number} Count
 */
function countRecentOtps_(email, brand, minutes) {
  var ss = getConfigSheet_();
  var sheet = ss.getSheetByName('TOKENS');
  if (!sheet) return 0;
  
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var emailIdx = headers.indexOf('Email');
  var brandIdx = headers.indexOf('Brand');
  var createdIdx = headers.indexOf('Created At');
  
  var cutoff = new Date(Date.now() - minutes * 60 * 1000);
  var count = 0;
  
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][emailIdx]).toLowerCase() === email.toLowerCase() &&
        String(data[i][brandIdx]).toUpperCase() === brand.toUpperCase() &&
        new Date(data[i][createdIdx]) > cutoff) {
      count++;
    }
  }
  
  return count;
}

/**
 * Expire pending OTPs for an email/brand
 * @param {string} email - Email
 * @param {string} brand - Brand
 */
function expirePendingOtps_(email, brand) {
  var ss = getConfigSheet_();
  var sheet = ss.getSheetByName('TOKENS');
  if (!sheet) return;
  
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var emailIdx = headers.indexOf('Email');
  var brandIdx = headers.indexOf('Brand');
  var statusIdx = headers.indexOf('Status');
  
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][emailIdx]).toLowerCase() === email.toLowerCase() &&
        String(data[i][brandIdx]).toUpperCase() === brand.toUpperCase() &&
        data[i][statusIdx] === 'PENDING') {
      sheet.getRange(i + 1, statusIdx + 1).setValue('SUPERSEDED');
    }
  }
}

/**
 * Send OTP email to candidate
 * @param {Object} params - Email parameters
 * @returns {Object} Result
 */
function sendOtpEmail_(params) {
  var email = params.email;
  var otp = params.otp;
  var brand = params.brand;
  var textForEmail = params.textForEmail;
  var token = params.token || '';  // Token for deterministic verification
  var expiryMinutes = params.expiryMinutes || 10;
  var traceId = params.traceId || generateTraceId_();
  
  var brandInfo = getBrand_(brand);
  var brandName = brandInfo ? brandInfo.name : brand;
  
  // Extract first name from textForEmail or use generic
  var firstName = 'Candidate';
  
  // Build verify URL with token for deterministic lookup
  var verifyUrl = getWebAppUrl_() + 
    '?page=verify' +
    '&brand=' + encodeURIComponent(brand) +
    '&e=' + encodeURIComponent(email) +
    '&t=' + encodeURIComponent(textForEmail) +
    '&token=' + encodeURIComponent(token);
  
  var subject = 'Your Interview Booking Passcode – ' + brandName;
  
  var htmlBody = HtmlService.createTemplateFromFile('OtpEmail');
  htmlBody.otp = otp;
  htmlBody.firstName = firstName;
  htmlBody.brandName = brandName;
  htmlBody.expiryMinutes = expiryMinutes;
  htmlBody.verifyUrl = verifyUrl;
  
  try {
    MailApp.sendEmail({
      to: email,
      subject: subject,
      htmlBody: htmlBody.evaluate().getContent(),
      name: 'Crew Life at Sea'
    });
    
    logEvent_(traceId, brand, email, 'OTP_EMAIL_SENT', {});
    return { ok: true };
  } catch (e) {
    logEvent_(traceId, brand, email, 'OTP_EMAIL_FAILED', { error: String(e) });
    return { ok: false, error: 'Failed to send email: ' + String(e) };
  }
}

/**
 * Issue a VERIFIED one-time access token row that points to a booking URL.
 * Used when a caller still provides bookingUrl and needs secure access-gate CTA.
 * @param {Object} params
 * @returns {{ok:boolean, token?:string, error?:string}}
 */
function issueVerifiedAccessTokenForBooking_(params) {
  var email = String(params.email || '').toLowerCase().trim();
  var brand = String(params.brand || '').toUpperCase().trim();
  var textForEmail = String(params.textForEmail || '').trim();
  var bookingUrl = String(params.bookingUrl || '').trim();
  var traceId = params.traceId || generateTraceId_();

  if (!email || !brand || !textForEmail || !bookingUrl) {
    return { ok: false, error: 'Missing required parameters for access token' };
  }

  var created = createOtp_({
    email: email,
    brand: brand,
    textForEmail: textForEmail,
    traceId: traceId,
    candidate: { 'Position Link': bookingUrl }
  });
  if (!created.ok || !created.token) {
    return { ok: false, error: created.error || 'Failed to create access token' };
  }

  var ss = getConfigSheet_();
  var sheet = ss.getSheetByName('TOKENS');
  if (!sheet) return { ok: false, error: 'TOKENS sheet not found' };

  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return { ok: false, error: 'TOKENS sheet is empty' };

  var headers = data[0];
  var idx = {};
  for (var h = 0; h < headers.length; h++) idx[headers[h]] = h;

  var tokenRow = -1;
  for (var r = 1; r < data.length; r++) {
    if (String(data[r][idx['Token']]) === created.token) {
      tokenRow = r + 1;
      break;
    }
  }
  if (tokenRow === -1) return { ok: false, error: 'Created token row not found' };

  if (idx['Status'] !== undefined) sheet.getRange(tokenRow, idx['Status'] + 1).setValue('VERIFIED');
  if (idx['Attempts'] !== undefined) sheet.getRange(tokenRow, idx['Attempts'] + 1).setValue(0);

  logEvent_(traceId, brand, email, 'ACCESS_TOKEN_ISSUED', {
    token: created.token.substring(0, 8) + '...',
    bookingUrl: maskUrl_(bookingUrl)
  });

  return { ok: true, token: created.token };
}

/**
 * Send booking confirmation email with calendar link after OTP verified
 * HARDENED: validates inputs, checks template exists, logs masked email
 * @param {Object} params - Email parameters
 * @returns {Object} Result object
 */
function sendBookingConfirmEmail_(params) {
  var email = String(params.email || '').toLowerCase().trim();
  var brand = String(params.brand || '').toUpperCase();
  var textForEmail = String(params.textForEmail || '').trim();
  var accessUrl = String(params.accessUrl || '').trim();
  var ctaUrl = String(params.ctaUrl || '').trim();
  var token = String(params.token || '').trim();
  var bookingUrl = String(params.bookingUrl || '').trim();
  var candidateName = String(params.candidateName || '').trim() || 'Candidate';
  var position = String(params.position || params.textForEmail || '').trim();
  var traceId = params.traceId || generateTraceId_();

  Logger.log('[sendBookingConfirmEmail_] brand=%s email=%s token=%s bookingUrl=%s',
    brand, email ? email.substring(0, 3) + '***' : 'NONE',
    token ? token.substring(0, 8) + '...' : 'NONE',
    bookingUrl ? bookingUrl.substring(0, 60) : 'NONE');

  // Input validation FIRST (do not create OTP/token or send if invalid email)
  if (!isValidEmail_(email)) {
    Logger.log('[sendBookingConfirmEmail_] Invalid email');
    return { ok: false, error: 'Invalid email address' };
  }

  // Hard safety-rails: never send to forbidden or placeholder addresses
  if (isForbiddenRecipientEmail_(email)) {
    Logger.log('[sendBookingConfirmEmail_] Forbidden recipient blocked: %s', email);
    return { ok: false, error: 'Forbidden recipient email address' };
  }
  if (isPlaceholderEmail_(email)) {
    Logger.log('[sendBookingConfirmEmail_] Placeholder recipient blocked: %s', email);
    return { ok: false, error: 'Placeholder recipient email address' };
  }

  // Resolve dynamic CTA base from Script Properties
  var ctaBase = getEmailCtaBaseUrl_();
  Logger.log('[sendBookingConfirmEmail_] resolved ctaBase=%s', ctaBase);

  // If caller passes accessUrl/ctaUrl only, extract token so we can rebuild canonical CTA URL.
  if (!token && accessUrl) {
    try {
      var tokenMatch = accessUrl.match(/[?&]token=([^&]+)/i);
      if (tokenMatch && tokenMatch[1]) {
        token = decodeURIComponent(tokenMatch[1]);
        Logger.log('[sendBookingConfirmEmail_] Extracted token from accessUrl');
      }
    } catch (e) {}
  }

  if (!token && ctaUrl) {
    try {
      var tokenMatch2 = ctaUrl.match(/[?&]token=([^&]+)/i);
      if (tokenMatch2 && tokenMatch2[1]) {
        token = decodeURIComponent(tokenMatch2[1]);
        Logger.log('[sendBookingConfirmEmail_] Extracted token from ctaUrl');
      }
    } catch (e) {}
  }

  // If no token but we have bookingUrl (calendar URL), issue a new token
  if (!token && bookingUrl) {
    Logger.log('[sendBookingConfirmEmail_] Issuing new token for bookingUrl');
    var issued = issueVerifiedAccessTokenForBooking_({
      email: email,
      brand: brand,
      textForEmail: textForEmail,
      bookingUrl: bookingUrl,
      traceId: traceId
    });
    if (!issued.ok) {
      Logger.log('[sendBookingConfirmEmail_] Token issue failed: %s', issued.error || 'unknown');
      return { ok: false, error: issued.error || 'Failed to create secure access link' };
    }
    token = issued.token;
    Logger.log('[sendBookingConfirmEmail_] Issued token ok');
  }

  // BUILD CTA URL from dynamic base + token (required)
  var finalCtaUrl = '';
  if (token) {
    finalCtaUrl = ctaBase + '?token=' + encodeURIComponent(token);
  } else {
    // Last-resort fallback for legacy callers that pass accessUrl without token
    finalCtaUrl = ctaUrl || accessUrl;
  }

  Logger.log('[sendBookingConfirmEmail_] built finalCtaUrl=%s', finalCtaUrl);

  // ═══════════════════════════════════════════════════════════════════════════
  // VALIDATION - BLOCK ANY EMAIL WITH CALENDAR URL - THIS MUST NEVER PASS
  // ═══════════════════════════════════════════════════════════════════════════
  var isCalendar = finalCtaUrl.indexOf('calendar.google.com') !== -1;
  
  if (isCalendar) {
    Logger.log('[sendBookingConfirmEmail_] BLOCKED - Calendar URL detected in CTA');
    return { ok: false, error: 'BLOCKED: Calendar URL in CTA - contact admin' };
  }

  // Warn (but do NOT block) if CTA base doesn't prefix — the URL is always
  // built from ctaBase when a token exists, so a mismatch indicates a subtle
  // trailing-slash or encoding difference, not a security issue.
  if (ctaBase && finalCtaUrl && finalCtaUrl.indexOf(ctaBase) !== 0) {
    Logger.log('[sendBookingConfirmEmail_] WARNING: CTA prefix mismatch (ctaBase=%s, cta=%s) — sending anyway', ctaBase, finalCtaUrl.substring(0, 80));
  }

  logEvent_(traceId, brand, email, 'BOOKING_EMAIL_CTA_BUILT', {
    ctaBase: ctaBase,
    isCalendar: isCalendar,
    hasToken: !!token
  });

  if (!finalCtaUrl) {
    Logger.log('[sendBookingConfirmEmail_] Missing access URL');
    return { ok: false, error: 'Missing access URL - cannot send email without link' };
  }
  
  var brandInfo = getBrand_(brand);
  var brandName = brandInfo ? brandInfo.name : brand;
  
  var subject = 'Schedule Your Interview – ' + textForEmail;
  
  // Check template exists
  var htmlBody;
  try {
    htmlBody = HtmlService.createTemplateFromFile('BookingEmail');
  } catch (e) {
    Logger.log('[sendBookingConfirmEmail_] BookingEmail template not found: %s', e);
    return { ok: false, error: 'Email template "BookingEmail" not found' };
  }
  
  htmlBody.brandName = brandName;
  htmlBody.textForEmail = textForEmail;
  htmlBody.candidateName = candidateName;
  htmlBody.position = position;
  htmlBody.ctaUrl = finalCtaUrl;
  htmlBody.gateUrl = finalCtaUrl;
  htmlBody.accessUrl = finalCtaUrl;
  
  var maskedEmail = email.substring(0, 3) + '***@' + email.split('@')[1];
  Logger.log('[sendBookingConfirmEmail_] Sending to %s (masked: %s), accessUrl=%s', email, maskedEmail, maskUrl_(finalCtaUrl));
  
  try {
    MailApp.sendEmail({
      to: email,
      subject: subject,
      htmlBody: htmlBody.evaluate().getContent(),
      name: 'Crew Life at Sea'
    });
    
    logEvent_(traceId, brand, maskedEmail, 'BOOKING_EMAIL_SENT', { accessUrl: maskUrl_(finalCtaUrl) });
    Logger.log('[sendBookingConfirmEmail_] SUCCESS - email sent to %s', maskedEmail);
    Logger.log('[sendBookingConfirmEmail_] OUTCOME ok=true error=null');
    return { ok: true };
  } catch (e) {
    logEvent_(traceId, brand, maskedEmail, 'BOOKING_EMAIL_FAILED', { error: String(e) });
    Logger.log('[sendBookingConfirmEmail_] FAILED: %s', e);
    Logger.log('[sendBookingConfirmEmail_] OUTCOME ok=false error=%s', String(e));
    return { ok: false, error: 'Failed to send booking email: ' + String(e) };
  }
}
