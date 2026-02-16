/**
 * TokenService.gs
 * Token CRUD: issue, verify, revoke, expire.
 * Implements token state machine: ISSUED → CONFIRMED → USED
 * CrewLife Interview Bookings Uniform Core
 */

var TOKEN_STATUS = {
  ISSUED: 'ISSUED',
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
  var expiryEpoch = Math.floor((now.getTime() + expiryHours * 60 * 60 * 1000) / 1000);

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var map = {};
  for (var h = 0; h < headers.length; h++) map[headers[h]] = h;

  var row = new Array(headers.length).fill('');
  row[map['Created At']] = now;
  row[map['Brand']] = params.brand || '';
  row[map['Email']] = (params.email || '').toLowerCase();
  row[map['Email Hash']] = computeEmailHash_(params.email || '');
  row[map['Text For Email']] = params.textForEmail || '';
  row[map['CL Code']] = params.clCode || '';
  row[map['OTP']] = '';
  row[map['OTP Expiry Epoch']] = '';
  row[map['OTP Attempts']] = '';
  row[map['OTP Status']] = '';
  row[map['Token']] = token;
  row[map['Token Expiry Epoch']] = expiryEpoch;
  row[map['Token Status']] = TOKEN_STATUS.ISSUED;
  row[map['Verified At']] = '';
  row[map['Used At']] = '';
  row[map['Invite Sig']] = '';
  row[map['Trace ID']] = params.traceId || '';
  row[map['Debug Notes']] = params.debugNotes || '';

  sheet.appendRow(row);
  
  logEvent_(params.traceId, params.brand, params.email, 'TOKEN_ISSUED', {
    token: token.substring(0, 8) + '...',
    expiry: expiry.toISOString(),
    clCode: params.clCode
  });
  
  return {
    ok: true,
    token: token,
    expiry: new Date(expiryEpoch * 1000),
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
  var map = {};
  for (var h = 0; h < headers.length; h++) map[headers[h]] = h;
  
  for (var i = 1; i < data.length; i++) {
    if (data[i][map['Token']] === token) {
      var row = data[i];
      var status = row[map['Token Status']];
      var expiryEpoch = Number(row[map['Token Expiry Epoch']] || 0);
      var nowEpoch = Math.floor(Date.now() / 1000);
      
      // Check expiry
      if (expiryEpoch && expiryEpoch < nowEpoch) {
        if (status !== TOKEN_STATUS.EXPIRED) {
          sheet.getRange(i + 1, map['Token Status'] + 1).setValue(TOKEN_STATUS.EXPIRED);
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
      if (brand && String(row[map['Brand']]).toUpperCase() !== String(brand).toUpperCase()) {
        return { ok: false, error: 'Brand mismatch', code: 'BRAND_MISMATCH' };
      }

      var clCode = row[map['CL Code']];
      var clDetails = getCLCodeDetails_(row[map['Brand']], clCode);
      
      return {
        ok: true,
        token: token,
        brand: row[map['Brand']],
        clCode: clCode,
        textForEmail: row[map['Text For Email']],
        emailHash: row[map['Email Hash']],
        status: status,
        bookingUrl: clDetails ? clDetails.bookingUrl : null,
        recruiterName: clDetails ? clDetails.recruiterName : null,
        rowIndex: i + 1
      };
    }
  }
  
  return { ok: false, error: 'Token not found or invalid', code: 'NOT_FOUND' };
}

/**
 * Get token row data by token
 * @param {string} token - Token
 * @returns {Object} Result with row data
 */
function getTokenRow_(token) {
  if (!token) return { ok: false, error: 'Token required' };
  var ss = getConfigSheet_();
  var sheet = ss.getSheetByName('TOKENS');
  if (!sheet) return { ok: false, error: 'Token system not initialized' };
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return { ok: false, error: 'Token not found' };
  var headers = data[0];
  var map = {};
  for (var h = 0; h < headers.length; h++) map[headers[h]] = h;

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][map['Token']]) === String(token)) {
      return {
        ok: true,
        rowIndex: i + 1,
        map: map,
        row: data[i]
      };
    }
  }
  return { ok: false, error: 'Token not found' };
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
  var statusIdx = headers.indexOf('Token Status');
  var usedAtIdx = headers.indexOf('Used At');
  
  // Mark as USED
  sheet.getRange(validation.rowIndex, statusIdx + 1).setValue(TOKEN_STATUS.USED);
  if (usedAtIdx >= 0) {
    sheet.getRange(validation.rowIndex, usedAtIdx + 1).setValue(new Date());
  }
  
  logEvent_(traceId, validation.brand, '', 'TOKEN_USED', {
    token: token.substring(0, 8) + '...',
    clCode: validation.clCode,
    redirectUrl: validation.bookingUrl
  });
  
  return {
    ok: true,
    redirectUrl: validation.bookingUrl,
    brand: validation.brand,
    clCode: validation.clCode,
    textForEmail: validation.textForEmail
  };
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
  var statusIdx = headers.indexOf('Token Status');
  
  var emailHash = computeEmailHash_(email);
  var revokedCount = 0;
  
  for (var i = 1; i < data.length; i++) {
    if (data[i][emailHashIdx] === emailHash &&
        String(data[i][brandIdx]).toUpperCase() === String(brand).toUpperCase()) {
      var status = data[i][statusIdx];
      if (status === TOKEN_STATUS.ISSUED) {
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
