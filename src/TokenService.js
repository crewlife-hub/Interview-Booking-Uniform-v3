/**
 * TokenService.gs
 * Token CRUD: issue, verify, revoke, expire.
 * Implements token state machine: ISSUED → CONFIRMED → USED
 * CrewLife Interview Bookings Uniform Core
 */

var TOKEN_STATUS = {
  ISSUED: 'ISSUED',
  CONFIRMED: 'CONFIRMED',
  USED: 'USED',
  REVOKED: 'REVOKED',
  EXPIRED: 'EXPIRED'
};

/**
 * Generate a secure random token
 * @returns {string} Token string
 */
function generateSecureToken_() {
  var bytes = [];
  for (var i = 0; i < 32; i++) {
    bytes.push(Math.floor(Math.random() * 256));
  }
  return Utilities.base64EncodeWebSafe(bytes).replace(/[=]+$/, '');
}

/**
 * Hash an email for lookup
 * @param {string} email - Email to hash
 * @returns {string} Hash
 */
function hashEmail_(email) {
  var hash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(email).toLowerCase().trim());
  return Utilities.base64Encode(hash);
}

/**
 * Issue a new token for a candidate
 * @param {Object} params - Token parameters
 * @param {string} params.email - Candidate email
 * @param {string} params.textForEmail - Text For Email value
 * @param {string} params.brand - Brand code
 * @param {string} params.clCode - Resolved CL code
 * @param {string} params.issuedBy - Admin email who issued
 * @param {string} params.traceId - Trace ID
 * @returns {Object} Result with token
 */
function issueToken_(params) {
  var ss = getConfigSheet_();
  var sheet = ss.getSheetByName('TOKENS');
  if (!sheet) {
    ensureConfigSheetTabs_();
    sheet = ss.getSheetByName('TOKENS');
  }
  
  var cfg = getConfig_();
  var brandOverrides = getBrandConfigOverrides_(params.brand);
  var expiryHours = brandOverrides.tokenExpiryHours || cfg.TOKEN_EXPIRY_HOURS;
  
  var token = generateSecureToken_();
  var now = new Date();
  var expiry = new Date(now.getTime() + expiryHours * 60 * 60 * 1000);
  
  var row = [
    token,                              // Token
    maskEmail_(params.email),           // Email (masked)
    hashEmail_(params.email),           // Email Hash
    params.textForEmail || '',          // Text For Email
    params.brand || '',                 // Brand
    params.clCode || '',                // CL Code
    TOKEN_STATUS.ISSUED,                // Status
    expiry,                             // Expiry
    now,                                // Created At
    '',                                 // Used At
    params.issuedBy || '',              // Issued By
    params.traceId || ''                // Trace ID
  ];
  
  sheet.appendRow(row);
  
  logEvent_(params.traceId, params.brand, params.email, 'TOKEN_ISSUED', {
    token: token.substring(0, 8) + '...',
    expiry: expiry.toISOString(),
    clCode: params.clCode
  });
  
  return {
    ok: true,
    token: token,
    expiry: expiry,
    expiryHours: expiryHours
  };
}

/**
 * Validate a token (for GET - does NOT mark as used)
 * @param {string} token - Token to validate
 * @param {string} brand - Expected brand
 * @returns {Object} Validation result
 */
function validateToken_(token, brand) {
  if (!token) {
    return { ok: false, error: 'Token is required', code: 'MISSING_TOKEN' };
  }
  
  var ss = getConfigSheet_();
  var sheet = ss.getSheetByName('TOKENS');
  if (!sheet) {
    return { ok: false, error: 'Token system not initialized', code: 'NO_TOKEN_SHEET' };
  }
  
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) {
    return { ok: false, error: 'Token not found', code: 'NOT_FOUND' };
  }
  
  var headers = data[0];
  var tokenIdx = headers.indexOf('Token');
  var emailHashIdx = headers.indexOf('Email Hash');
  var textForEmailIdx = headers.indexOf('Text For Email');
  var brandIdx = headers.indexOf('Brand');
  var clCodeIdx = headers.indexOf('CL Code');
  var statusIdx = headers.indexOf('Status');
  var expiryIdx = headers.indexOf('Expiry');
  
  for (var i = 1; i < data.length; i++) {
    if (data[i][tokenIdx] === token) {
      var row = data[i];
      var status = row[statusIdx];
      var expiry = new Date(row[expiryIdx]);
      var now = new Date();
      
      // Check expiry
      if (expiry < now) {
        // Update status to EXPIRED if not already
        if (status !== TOKEN_STATUS.EXPIRED) {
          sheet.getRange(i + 1, statusIdx + 1).setValue(TOKEN_STATUS.EXPIRED);
        }
        return { ok: false, error: 'This link has expired', code: 'EXPIRED' };
      }
      
      // Check status
      if (status === TOKEN_STATUS.USED) {
        return { ok: false, error: 'This link has already been used', code: 'ALREADY_USED' };
      }
      if (status === TOKEN_STATUS.REVOKED) {
        return { ok: false, error: 'This link has been revoked', code: 'REVOKED' };
      }
      if (status === TOKEN_STATUS.EXPIRED) {
        return { ok: false, error: 'This link has expired', code: 'EXPIRED' };
      }
      
      // Check brand match
      if (brand && String(row[brandIdx]).toUpperCase() !== String(brand).toUpperCase()) {
        return { ok: false, error: 'Brand mismatch', code: 'BRAND_MISMATCH' };
      }
      
      // Valid token - update to CONFIRMED if currently ISSUED
      if (status === TOKEN_STATUS.ISSUED) {
        sheet.getRange(i + 1, statusIdx + 1).setValue(TOKEN_STATUS.CONFIRMED);
      }
      
      // Get booking URL, prefer Position Link stored on the token row
      var clCode = row[clCodeIdx];
      var clDetails = getCLCodeDetails_(row[brandIdx], clCode);
      var positionLinkIdx = headers.indexOf('Position Link');
      var storedPosLink = (positionLinkIdx !== -1) ? (row[positionLinkIdx] || '') : '';
      var finalBookingUrl = storedPosLink || (clDetails ? clDetails.bookingUrl : null);

      return {
        ok: true,
        token: token,
        brand: row[brandIdx],
        clCode: clCode,
        textForEmail: row[textForEmailIdx],
        emailHash: row[emailHashIdx],
        status: TOKEN_STATUS.CONFIRMED,
        bookingUrl: finalBookingUrl,
        recruiterName: clDetails ? clDetails.recruiterName : null,
        rowIndex: i + 1
      };
    }
  }
  
  return { ok: false, error: 'Token not found or invalid', code: 'NOT_FOUND' };
}

/**
 * Confirm token and mark as USED (for POST - final confirmation)
 * @param {string} token - Token to confirm
 * @param {string} traceId - Trace ID
 * @returns {Object} Confirmation result with redirect URL
 */
function confirmTokenAndMarkUsed_(token, traceId) {
  var validation = validateToken_(token, '');
  if (!validation.ok) {
    return validation;
  }
  
  var ss = getConfigSheet_();
  var sheet = ss.getSheetByName('TOKENS');
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var statusIdx = headers.indexOf('Status');
  var usedAtIdx = headers.indexOf('Used At');
  
  // Mark as USED
  sheet.getRange(validation.rowIndex, statusIdx + 1).setValue(TOKEN_STATUS.USED);
  sheet.getRange(validation.rowIndex, usedAtIdx + 1).setValue(new Date());
  
  logEvent_(traceId, validation.brand, '', 'TOKEN_USED', {
    token: token.substring(0, 8) + '...',
    clCode: validation.clCode,
    redirectUrl: maskUrl_(validation.bookingUrl)
  });
  
  // Apply invite lock to all matching rows
  applyInviteLock_(validation.brand, validation.emailHash, validation.textForEmail);

  return {
    ok: true,
    redirectUrl: validation.bookingUrl,
    brand: validation.brand,
    clCode: validation.clCode,
    textForEmail: validation.textForEmail
  };
}

/**
 * Check if an invitation is locked (booking already completed).
 * Reads the TOKENS sheet live on every call (no caching).
 * Admin can type "UNLOCK" in the Locked column to allow reuse.
 * @param {string} brand - Brand code
 * @param {string|string[]} emailHash - Email hash (or array of hashes) to match
 * @param {string} textForEmail - Text For Email
 * @returns {boolean} True if locked
 */
function isInviteLocked_(brand, emailHash, textForEmail) {
  var hashes = Array.isArray(emailHash) ? emailHash : [emailHash];
  var ss = getConfigSheet_();
  var sheet = ss.getSheetByName('TOKENS');
  if (!sheet) return false;

  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return false;

  var headers = data[0];
  var emailHashIdx = headers.indexOf('Email Hash');
  var textForEmailIdx = headers.indexOf('Text For Email');
  var brandIdx = headers.indexOf('Brand');
  var lockedIdx = headers.indexOf('Locked');

  if (lockedIdx === -1) return false;

  for (var i = 1; i < data.length; i++) {
    var rowHash = String(data[i][emailHashIdx]);
    var hashMatch = false;
    for (var h = 0; h < hashes.length; h++) {
      if (rowHash === String(hashes[h])) { hashMatch = true; break; }
    }
    if (hashMatch &&
        String(data[i][textForEmailIdx]).trim() === String(textForEmail).trim() &&
        String(data[i][brandIdx]).toUpperCase() === String(brand).toUpperCase() &&
        String(data[i][lockedIdx]).toUpperCase() === 'LOCKED') {
      return true;
    }
  }
  return false;
}

/**
 * Apply invite lock to all matching rows after a token reaches USED.
 * Writes "LOCKED" to the Locked column for every row matching
 * the given emailHash + textForEmail + brand.
 * @param {string} brand - Brand code
 * @param {string} emailHash - Email hash to match
 * @param {string} textForEmail - Text For Email
 */
function applyInviteLock_(brand, emailHash, textForEmail) {
  var ss = getConfigSheet_();
  var sheet = ss.getSheetByName('TOKENS');
  if (!sheet) return;

  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return;

  var headers = data[0];
  var emailHashIdx = headers.indexOf('Email Hash');
  var textForEmailIdx = headers.indexOf('Text For Email');
  var brandIdx = headers.indexOf('Brand');
  var lockedIdx = headers.indexOf('Locked');

  if (lockedIdx === -1) return;

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][emailHashIdx]) === String(emailHash) &&
        String(data[i][textForEmailIdx]).trim() === String(textForEmail).trim() &&
        String(data[i][brandIdx]).toUpperCase() === String(brand).toUpperCase()) {
      sheet.getRange(i + 1, lockedIdx + 1).setValue('LOCKED');
    }
  }
}

/**
 * Revoke all active tokens for an email/brand combination
 * @param {string} email - Candidate email
 * @param {string} brand - Brand code
 * @param {string} traceId - Trace ID
 * @param {string} revokedBy - Admin email who revoked
 * @returns {Object} Revocation result
 */
function revokeActiveTokens_(email, brand, traceId, revokedBy) {
  var ss = getConfigSheet_();
  var sheet = ss.getSheetByName('TOKENS');
  if (!sheet) return { ok: true, revokedCount: 0 };
  
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return { ok: true, revokedCount: 0 };
  
  var headers = data[0];
  var emailHashIdx = headers.indexOf('Email Hash');
  var brandIdx = headers.indexOf('Brand');
  var statusIdx = headers.indexOf('Status');
  
  var emailHash = hashEmail_(email);
  var revokedCount = 0;
  
  for (var i = 1; i < data.length; i++) {
    if (data[i][emailHashIdx] === emailHash &&
        String(data[i][brandIdx]).toUpperCase() === String(brand).toUpperCase()) {
      var status = data[i][statusIdx];
      if (status === TOKEN_STATUS.ISSUED || status === TOKEN_STATUS.CONFIRMED) {
        sheet.getRange(i + 1, statusIdx + 1).setValue(TOKEN_STATUS.REVOKED);
        revokedCount++;
      }
    }
  }
  
  if (revokedCount > 0) {
    logEvent_(traceId, brand, email, 'TOKENS_REVOKED', {
      revokedCount: revokedCount,
      revokedBy: revokedBy
    });
  }
  
  return { ok: true, revokedCount: revokedCount };
}

/**
 * Get token history for an email
 * @param {string} email - Candidate email
 * @param {string} brand - Brand code
 * @returns {Array} Array of token records
 */
function getTokenHistory_(email, brand) {
  var ss = getConfigSheet_();
  var sheet = ss.getSheetByName('TOKENS');
  if (!sheet) return [];
  
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  
  var headers = data[0];
  var emailHash = hashEmail_(email);
  var emailHashIdx = headers.indexOf('Email Hash');
  var brandIdx = headers.indexOf('Brand');
  
  var results = [];
  for (var i = 1; i < data.length; i++) {
    if (data[i][emailHashIdx] === emailHash &&
        String(data[i][brandIdx]).toUpperCase() === String(brand).toUpperCase()) {
      var record = {};
      for (var j = 0; j < headers.length; j++) {
        if (headers[j] !== 'Token' && headers[j] !== 'Email Hash') { // Don't expose sensitive data
          record[headers[j]] = data[i][j];
        }
      }
      record.tokenPrefix = String(data[i][headers.indexOf('Token')]).substring(0, 8) + '...';
      results.push(record);
    }
  }
  return results;
}

/**
 * Peek at a token's current status without modifying anything.
 * Used by the confirm gate page to verify the token is still valid before showing UI.
 * @param {string} token - Token string
 * @returns {Object} { ok, status, brand, textForEmail, error, code }
 */
function peekToken_(token) {
  if (!token) {
    return { ok: false, error: 'Missing token', code: 'MISSING_TOKEN' };
  }

  var ss = getConfigSheet_();
  var sheet = ss.getSheetByName('TOKENS');
  if (!sheet) {
    return { ok: false, error: 'System not initialized', code: 'NO_TOKEN_SHEET' };
  }

  var data = sheet.getDataRange().getValues();
  if (data.length < 2) {
    return { ok: false, error: 'Token not found', code: 'NOT_FOUND' };
  }

  var headers = data[0];
  var idx = {};
  for (var h = 0; h < headers.length; h++) {
    idx[headers[h]] = h;
  }

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][idx['Token']]) === token) {
      var row = data[i];
      var status = String(row[idx['Status']] || '');
      var expiry = new Date(row[idx['Expiry']]);

      if (status === 'USED') {
        return { ok: false, error: 'This link has already been used. Please request a new OTP.', code: 'ALREADY_USED' };
      }
      if (new Date() > expiry) {
        return { ok: false, error: 'This link has expired. Please request a new OTP.', code: 'EXPIRED' };
      }
      if (status !== 'VERIFIED') {
        return { ok: false, error: 'This link is not ready. Please verify your OTP first.', code: 'NOT_VERIFIED' };
      }

      return {
        ok: true,
        status: status,
        brand: String(row[idx['Brand']] || ''),
        textForEmail: String(row[idx['Text For Email']] || '')
      };
    }
  }

  return { ok: false, error: 'Token not found or invalid', code: 'NOT_FOUND' };
}

/**
 * Consume a VERIFIED token for one-time redirect.
 * Uses LockService for atomicity — marks USED + sets Used At BEFORE returning the booking URL.
 * After this call, any subsequent access with the same token will get ALREADY_USED.
 * @param {string} token - Token string
 * @param {string} traceId - Trace ID
 * @returns {Object} { ok, bookingUrl, brand, textForEmail, error, code }
 */
function consumeTokenForRedirect_(token, traceId) {
  if (!token) {
    return { ok: false, error: 'Missing token', code: 'MISSING_TOKEN' };
  }

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    return { ok: false, error: 'System busy. Please try again.', code: 'LOCK_TIMEOUT' };
  }

  try {
    var ss = getConfigSheet_();
    var sheet = ss.getSheetByName('TOKENS');
    if (!sheet) {
      return { ok: false, error: 'System not initialized', code: 'NO_TOKEN_SHEET' };
    }

    var data = sheet.getDataRange().getValues();
    if (data.length < 2) {
      return { ok: false, error: 'Token not found', code: 'NOT_FOUND' };
    }

    var headers = data[0];
    var idx = {};
    for (var h = 0; h < headers.length; h++) {
      idx[headers[h]] = h;
    }

    // Find token row
    var targetRow = -1;
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][idx['Token']]) === token) {
        targetRow = i;
        break;
      }
    }

    if (targetRow === -1) {
      return { ok: false, error: 'Token not found or invalid', code: 'NOT_FOUND' };
    }

    var row = data[targetRow];
    var status = String(row[idx['Status']] || '');
    var expiry = new Date(row[idx['Expiry']]);
    var sheetRow = targetRow + 1;

    // Already used — hard block
    if (status === 'USED') {
      return { ok: false, error: 'This link has already been used. Please request a new OTP.', code: 'ALREADY_USED' };
    }

    // Expired
    if (new Date() > expiry) {
      if (status !== 'EXPIRED') {
        sheet.getRange(sheetRow, idx['Status'] + 1).setValue('EXPIRED');
      }
      return { ok: false, error: 'This link has expired. Please request a new OTP.', code: 'EXPIRED' };
    }

    // Must be VERIFIED (OTP was verified)
    if (status !== 'VERIFIED') {
      return { ok: false, error: 'This link is not ready. Please verify your OTP first.', code: 'NOT_VERIFIED' };
    }

    // Extract metadata for logging
    var brand = String(row[idx['Brand']] || '');
    var textForEmail = String(row[idx['Text For Email']] || '');
    var clCodeMatch = textForEmail.match(/CL\d+/i);
    var clCode = clCodeMatch ? clCodeMatch[0].toUpperCase() : 'UNKNOWN';

    // Get booking URL: prefer Position Link (per-candidate), fall back to CL_CODES sheet
    var posLinkIdx = idx['Position Link'];
    var rawBookingUrl = (posLinkIdx !== undefined) ? String(row[posLinkIdx] || '') : '';
    var urlSource = 'Position Link';

    // Fallback: if Position Link empty, try CL_CODES sheet Booking Schedule URL
    if (!rawBookingUrl && clCode !== 'UNKNOWN') {
      try {
        var clDetails = getCLCodeDetails_(brand, clCode);
        if (clDetails && clDetails.bookingUrl) {
          rawBookingUrl = String(clDetails.bookingUrl);
          urlSource = 'CL_CODES';
          Logger.log('[REDIRECT_DEBUG] Position Link empty — fell back to CL_CODES for %s', clCode);
        }
      } catch (clErr) {
        Logger.log('[REDIRECT_DEBUG] CL_CODES fallback error: %s', String(clErr));
      }
    }
    
    // --- NORMALIZE URL: Remove /u/{n}/ to get public booking link ---
    // This prevents "Verify it's you" when redirecting candidates
    var bookingUrl = normalizeAppointmentScheduleUrl_(rawBookingUrl);

    // --- DETAILED LOGGING ---
    Logger.log('[REDIRECT_DEBUG] traceId=%s clCode=%s brand=%s', traceId, clCode, brand);
    Logger.log('[REDIRECT_DEBUG] URL source: %s', urlSource);
    Logger.log('[REDIRECT_DEBUG] RAW URL: %s', rawBookingUrl || '(empty)');
    Logger.log('[REDIRECT_DEBUG] NORMALIZED URL: %s', bookingUrl || '(empty)');
    if (rawBookingUrl !== bookingUrl) {
      Logger.log('[REDIRECT_DEBUG] URL was normalized (removed /u/{n}/ segment)');
    }

    // Validate booking URL — must not be empty
    if (!bookingUrl) {
      logEvent_(traceId, brand, '', 'REDIRECT_BLOCKED', { reason: 'Booking URL empty (Position Link + CL_CODES)', clCode: clCode });
      return { ok: false, error: 'Booking link not configured. Please contact your recruiter.', code: 'NO_BOOKING_URL' };
    }

    // Block suspicious / misconfigured URLs
    if (bookingUrl.indexOf('script.google.com') !== -1 || bookingUrl.indexOf('docs.google.com/forms') !== -1) {
      logEvent_(traceId, brand, '', 'REDIRECT_BLOCKED', {
        reason: 'Suspicious URL',
        url: maskUrl_(bookingUrl),
        clCode: clCode
      });
      return { ok: false, error: 'Booking link misconfigured. Contact support.', code: 'BAD_BOOKING_URL' };
    }

    // --- VALIDATE APPOINTMENT SCHEDULE URL ---
    var urlValidation = isValidAppointmentScheduleUrl_(bookingUrl);
    Logger.log('[REDIRECT_DEBUG] URL validation result: valid=%s reason=%s', urlValidation.valid, urlValidation.reason || 'OK');
    
    if (!urlValidation.valid) {
      // Log the failure
      logEvent_(traceId, brand, '', 'REDIRECT_BLOCKED_INVALID_SCHEDULE_URL', {
        clCode: clCode,
        reason: urlValidation.reason,
        rawUrl: rawBookingUrl,
        normalizedUrl: bookingUrl
      });
      
      // Send admin notification email
      try {
        var adminEmail = Session.getEffectiveUser().getEmail();
        MailApp.sendEmail({
          to: adminEmail,
          subject: '[URGENT] Invalid Booking URL Detected - ' + clCode,
          body: 'A candidate attempted to access a booking link that is NOT a valid Appointment Schedule URL.\n\n' +
                'Details:\n' +
                '  Trace ID: ' + traceId + '\n' +
                '  Brand: ' + brand + '\n' +
                '  CL Code: ' + clCode + '\n' +
                '  Text For Email: ' + textForEmail + '\n\n' +
                'Raw URL (from Smartsheet/Sheet):\n  ' + rawBookingUrl + '\n\n' +
                'Normalized URL:\n  ' + bookingUrl + '\n\n' +
                'Validation Error:\n  ' + urlValidation.reason + '\n\n' +
                'ACTION REQUIRED:\n' +
                'Update the Position Link / Interview Link in Smartsheet (or CL_CODES sheet) to a valid PUBLIC Appointment Schedule URL:\n' +
                '  https://calendar.google.com/calendar/appointments/schedules/{scheduleId}\n\n' +
                'NOTE: Do NOT use /u/0/ in the URL - use the public format above.\n\n' +
                'How to get the correct URL:\n' +
                '1. Open Google Calendar as the schedule owner\n' +
                '2. Click the Appointment Schedule\n' +
                '3. Click Share > Copy booking page link\n' +
                '4. Ensure "Anyone with the link" is selected in schedule settings\n' +
                '5. Update the Smartsheet/CL_CODES with this URL'
        });
        Logger.log('[REDIRECT_DEBUG] Admin notification email sent to %s', adminEmail);
      } catch (mailErr) {
        Logger.log('[REDIRECT_DEBUG] Failed to send admin email: %s', String(mailErr));
      }
      
      return { ok: false, error: 'Booking link is not a valid calendar schedule. Admin has been notified.', code: 'BAD_APPOINTMENT_URL' };
    }

    // --- FINAL REDIRECT URL LOG ---
    var isPublicFormat = /\/calendar\/appointments\/schedules\//i.test(bookingUrl) && !/\/u\/\d+\//i.test(bookingUrl);
    Logger.log('[REDIRECT_DEBUG] Final redirect URL: %s', bookingUrl);
    Logger.log('[REDIRECT_DEBUG] URL is public format (no /u/{n}/): %s', isPublicFormat);
    if (!isPublicFormat) {
      Logger.log('[REDIRECT_WARN] URL may still trigger Google login - check calendar settings');
    }

    // === ATOMIC: Mark USED + set Used At BEFORE returning booking URL ===
    sheet.getRange(sheetRow, idx['Status'] + 1).setValue('USED');
    if (idx['Used At'] !== undefined) {
      sheet.getRange(sheetRow, idx['Used At'] + 1).setValue(new Date());
    }

    logEvent_(traceId, brand, '', 'TOKEN_CONSUMED', {
      token: token.substring(0, 8) + '...',
      clCode: clCode,
      bookingUrl: maskUrl_(bookingUrl)
    });

    return {
      ok: true,
      bookingUrl: bookingUrl,
      brand: brand,
      textForEmail: textForEmail
    };

  } finally {
    lock.releaseLock();
  }
}
