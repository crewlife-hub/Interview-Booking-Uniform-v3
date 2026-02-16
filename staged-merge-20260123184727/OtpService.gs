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
  
  // Check rate limiting (max 3 OTPs per email per hour)
  var recentCount = countRecentOtps_(email, brand, 60);
  if (recentCount >= 3) {
    logEvent_(traceId, brand, email, 'OTP_RATE_LIMITED', { count: recentCount });
    return { ok: false, error: 'Too many OTP requests. Please wait before trying again.' };
  }
  
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
  
  var newRow = [];
  for (var i = 0; i < Math.max(headers.length, attemptsIdx + 1); i++) {
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
  
  sheet.appendRow(newRow);
  
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
 * Validate an OTP
 * @param {Object} params - Validation parameters
 * @param {string} params.email - Candidate email
 * @param {string} params.brand - Brand code
 * @param {string} params.otp - OTP to validate
 * @param {string} params.textForEmail - Text For Email
 * @param {string} params.traceId - Trace ID
 * @returns {Object} Validation result
 */
function validateOtp_(params) {
  var email = String(params.email || '').toLowerCase().trim();
  var brand = String(params.brand || '').toUpperCase().trim();
  var otp = String(params.otp || '').trim();
  var textForEmail = String(params.textForEmail || '').trim();
  var traceId = params.traceId || generateTraceId_();
  
  if (!email || !brand || !otp) {
    return { ok: false, error: 'Missing required parameters' };
  }
  
  var ss = getConfigSheet_();
  var sheet = ss.getSheetByName('TOKENS');
  if (!sheet) {
    return { ok: false, error: 'System not configured' };
  }
  
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var emailIdx = headers.indexOf('Email');
  var otpIdx = headers.indexOf('OTP');
  var brandIdx = headers.indexOf('Brand');
  var textForEmailIdx = headers.indexOf('Text For Email');
  var statusIdx = headers.indexOf('Status');
  var expiryIdx = headers.indexOf('Expiry');
  var usedAtIdx = headers.indexOf('Used At');
  var attemptsIdx = headers.indexOf('Attempts');
  
  // Find matching pending OTP
  for (var i = data.length - 1; i >= 1; i--) {
    var row = data[i];
    if (String(row[emailIdx]).toLowerCase() === email &&
        String(row[brandIdx]).toUpperCase() === brand &&
        row[statusIdx] === 'PENDING') {
      
      // Check expiry
      var expiry = new Date(row[expiryIdx]);
      if (new Date() > expiry) {
        sheet.getRange(i + 1, statusIdx + 1).setValue('EXPIRED');
        logEvent_(traceId, brand, email, 'OTP_EXPIRED', {});
        return { ok: false, error: 'OTP has expired. Please request a new one.' };
      }
      
      // Check attempts
      var attempts = Number(row[attemptsIdx] || 0);
      if (attempts >= 3) {
        sheet.getRange(i + 1, statusIdx + 1).setValue('LOCKED');
        logEvent_(traceId, brand, email, 'OTP_LOCKED', { attempts: attempts });
        return { ok: false, error: 'Too many failed attempts. Please request a new OTP.' };
      }
      
      // Validate OTP
      if (String(row[otpIdx]) === otp) {
        // Success - mark as VERIFIED
        sheet.getRange(i + 1, statusIdx + 1).setValue('VERIFIED');
        if (usedAtIdx >= 0) {
          sheet.getRange(i + 1, usedAtIdx + 1).setValue(new Date());
        }
        
        logEvent_(traceId, brand, email, 'OTP_VERIFIED', { textForEmail: row[textForEmailIdx] });
        
        // Resolve booking URL
        var clResolution = resolveCLCodeFromTextForEmail_(brand, row[textForEmailIdx] || textForEmail);
        
        return {
          ok: true,
          verified: true,
          email: email,
          brand: brand,
          textForEmail: row[textForEmailIdx],
          clResolution: clResolution
        };
      } else {
        // Wrong OTP - increment attempts
        sheet.getRange(i + 1, attemptsIdx + 1).setValue(attempts + 1);
        logEvent_(traceId, brand, email, 'OTP_FAILED', { attempts: attempts + 1 });
        
        var remaining = 3 - (attempts + 1);
        if (remaining <= 0) {
          sheet.getRange(i + 1, statusIdx + 1).setValue('LOCKED');
          return { ok: false, error: 'Too many failed attempts. Please request a new OTP.' };
        }
        return { ok: false, error: 'Invalid OTP. ' + remaining + ' attempt(s) remaining.' };
      }
    }
  }
  
  return { ok: false, error: 'No pending OTP found. Please request a new one.' };
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
  var expiryMinutes = params.expiryMinutes || 10;
  var traceId = params.traceId || generateTraceId_();
  
  var brandInfo = getBrand_(brand);
  var brandName = brandInfo ? brandInfo.name : brand;
  
  // Extract first name from textForEmail or use generic
  var firstName = 'Candidate';
  
  // Build verify URL (same signed params)
  var verifyUrl = getWebAppUrl_() + 
    '?page=verify' +
    '&brand=' + encodeURIComponent(brand) +
    '&e=' + encodeURIComponent(email) +
    '&t=' + encodeURIComponent(textForEmail);
  
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
