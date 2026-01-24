/**
 * TokenService.gs
 * One-time token generation and validation
 * Interview Booking Uniform System v3
 */

const TokenService = (() => {
  const TOKEN_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes

  /**
   * Generate a secure random token
   */
  function generateToken_() {
    const bytes = [];
    for (let i = 0; i < 32; i++) {
      bytes.push(Math.floor(Math.random() * 256));
    }
    const base64 = Utilities.base64Encode(bytes);
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  /**
   * Issue a new token after OTP verification
   * @param {Object} params - Token parameters
   * @param {string} params.email - Candidate email
   * @param {string} params.traceId - Trace ID for logging
   * @param {number} params.rowIdx - Row index in TOKENS sheet (from OTP verification)
   * @returns {Object} Token creation result
   */
  function issueToken(params) {
    const { email, traceId, rowIdx } = params;
    const emailHash = ConfigService.hashEmail(email);

    try {
      const sheet = ConfigService.getTokensSheet();
      const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      
      const tokenColIdx = headers.indexOf('Token');
      const tokenExpiryColIdx = headers.indexOf('TokenExpiryEpoch');
      const tokenStatusColIdx = headers.indexOf('TokenStatus');

      const token = generateToken_();
      const expiryEpoch = Date.now() + TOKEN_EXPIRY_MS;

      // Update the existing row
      sheet.getRange(rowIdx, tokenColIdx + 1).setValue(token);
      sheet.getRange(rowIdx, tokenExpiryColIdx + 1).setValue(expiryEpoch);
      sheet.getRange(rowIdx, tokenStatusColIdx + 1).setValue(ConfigService.TOKEN_STATUS.ISSUED);

      LoggingService.success(traceId, '', 'TOKEN_ISSUED', 'Token issued', emailHash, { expiryEpoch });

      return {
        success: true,
        token,
        expiryEpoch
      };
    } catch (e) {
      LoggingService.error(traceId, '', 'TOKEN_ISSUE_ERROR', e.message, emailHash);
      return {
        success: false,
        error: e.message
      };
    }
  }

  /**
   * Validate and consume a token
   * @param {string} token - Token to validate
   * @param {string} traceId - Trace ID for logging
   * @returns {Object} Validation result with booking data
   */
  function validateAndConsumeToken(token, traceId) {
    const sheet = ConfigService.getTokensSheet();
    const data = sheet.getDataRange().getValues();
    const headers = data[0];

    // Find column indices
    const tokenColIdx = headers.indexOf('Token');
    const tokenStatusColIdx = headers.indexOf('TokenStatus');
    const tokenExpiryColIdx = headers.indexOf('TokenExpiryEpoch');
    const usedAtColIdx = headers.indexOf('UsedAt');
    const brandColIdx = headers.indexOf('Brand');
    const emailColIdx = headers.indexOf('Email');
    const textForEmailColIdx = headers.indexOf('TextForEmail');
    const emailHashColIdx = headers.indexOf('EmailHash');

    // Find the token row
    let rowIdx = -1;
    let rowData = null;

    for (let i = 1; i < data.length; i++) {
      if (data[i][tokenColIdx] === token) {
        rowIdx = i + 1; // 1-indexed for sheet
        rowData = data[i];
        break;
      }
    }

    if (!rowData) {
      LoggingService.failure(traceId, '', 'TOKEN_VALIDATE', 'Token not found', '');
      return {
        success: false,
        error: 'Invalid booking link. Please complete verification again.',
        notFound: true
      };
    }

    const brand = rowData[brandColIdx];
    const emailHash = rowData[emailHashColIdx];
    const logger = LoggingService.createScopedLogger(traceId, brand);

    // Check token status
    const tokenStatus = rowData[tokenStatusColIdx];
    
    if (tokenStatus === ConfigService.TOKEN_STATUS.USED) {
      logger.failure('TOKEN_VALIDATE', 'Token already used', emailHash);
      return {
        success: false,
        error: 'This booking link has already been used.',
        alreadyUsed: true
      };
    }

    if (tokenStatus === ConfigService.TOKEN_STATUS.REVOKED) {
      logger.failure('TOKEN_VALIDATE', 'Token revoked', emailHash);
      return {
        success: false,
        error: 'This booking link has been revoked.',
        revoked: true
      };
    }

    if (tokenStatus === ConfigService.TOKEN_STATUS.EXPIRED) {
      logger.failure('TOKEN_VALIDATE', 'Token expired', emailHash);
      return {
        success: false,
        error: 'This booking link has expired. Please complete verification again.',
        expired: true
      };
    }

    if (tokenStatus !== ConfigService.TOKEN_STATUS.ISSUED) {
      logger.failure('TOKEN_VALIDATE', `Invalid token status: ${tokenStatus}`, emailHash);
      return {
        success: false,
        error: 'Invalid booking link status.',
        invalidStatus: true
      };
    }

    // Check expiry
    const expiryEpoch = rowData[tokenExpiryColIdx];
    if (Date.now() > expiryEpoch) {
      sheet.getRange(rowIdx, tokenStatusColIdx + 1).setValue(ConfigService.TOKEN_STATUS.EXPIRED);
      logger.failure('TOKEN_VALIDATE', 'Token expired', emailHash);
      return {
        success: false,
        error: 'This booking link has expired. Please complete verification again.',
        expired: true
      };
    }

    // Token is valid - DO NOT mark as used yet
    // That happens when the user clicks "Open Booking"
    
    logger.success('TOKEN_VALIDATED', 'Token validated', emailHash);

    return {
      success: true,
      brand: rowData[brandColIdx],
      email: rowData[emailColIdx],
      textForEmail: rowData[textForEmailColIdx],
      rowIdx
    };
  }

  /**
   * Mark a token as used (burn it)
   * @param {string} token - Token to burn
   * @param {string} traceId - Trace ID for logging
   * @returns {Object} Result with booking URL
   */
  function burnToken(token, traceId) {
    const sheet = ConfigService.getTokensSheet();
    const data = sheet.getDataRange().getValues();
    const headers = data[0];

    // Find column indices
    const tokenColIdx = headers.indexOf('Token');
    const tokenStatusColIdx = headers.indexOf('TokenStatus');
    const tokenExpiryColIdx = headers.indexOf('TokenExpiryEpoch');
    const usedAtColIdx = headers.indexOf('UsedAt');
    const brandColIdx = headers.indexOf('Brand');
    const emailColIdx = headers.indexOf('Email');
    const textForEmailColIdx = headers.indexOf('TextForEmail');
    const emailHashColIdx = headers.indexOf('EmailHash');

    // Find the token row
    let rowIdx = -1;
    let rowData = null;

    for (let i = 1; i < data.length; i++) {
      if (data[i][tokenColIdx] === token) {
        rowIdx = i + 1;
        rowData = data[i];
        break;
      }
    }

    if (!rowData) {
      LoggingService.failure(traceId, '', 'TOKEN_BURN', 'Token not found', '');
      return {
        success: false,
        error: 'Invalid booking link.'
      };
    }

    const brand = rowData[brandColIdx];
    const emailHash = rowData[emailHashColIdx];
    const textForEmail = rowData[textForEmailColIdx];
    const tokenStatus = rowData[tokenStatusColIdx];

    // Check if already used
    if (tokenStatus === ConfigService.TOKEN_STATUS.USED) {
      LoggingService.failure(traceId, brand, 'TOKEN_BURN', 'Token already used', emailHash);
      return {
        success: false,
        error: 'This booking link has already been used.',
        alreadyUsed: true
      };
    }

    // Check if expired
    const expiryEpoch = rowData[tokenExpiryColIdx];
    if (Date.now() > expiryEpoch) {
      sheet.getRange(rowIdx, tokenStatusColIdx + 1).setValue(ConfigService.TOKEN_STATUS.EXPIRED);
      LoggingService.failure(traceId, brand, 'TOKEN_BURN', 'Token expired', emailHash);
      return {
        success: false,
        error: 'This booking link has expired.',
        expired: true
      };
    }

    // Mark as USED
    sheet.getRange(rowIdx, tokenStatusColIdx + 1).setValue(ConfigService.TOKEN_STATUS.USED);
    sheet.getRange(rowIdx, usedAtColIdx + 1).setValue(new Date().toISOString());

    // Get booking URL
    const bookingUrl = ConfigService.getBookingUrl(brand, textForEmail, null);

    LoggingService.success(traceId, brand, 'TOKEN_BURNED', 'Token consumed, redirecting to booking', emailHash, { bookingUrl });

    return {
      success: true,
      bookingUrl,
      brand,
      textForEmail
    };
  }

  /**
   * Check token status without consuming it
   */
  function checkTokenStatus(token) {
    const sheet = ConfigService.getTokensSheet();
    const data = sheet.getDataRange().getValues();
    const headers = data[0];

    const tokenColIdx = headers.indexOf('Token');
    const tokenStatusColIdx = headers.indexOf('TokenStatus');
    const tokenExpiryColIdx = headers.indexOf('TokenExpiryEpoch');
    const brandColIdx = headers.indexOf('Brand');

    for (let i = 1; i < data.length; i++) {
      if (data[i][tokenColIdx] === token) {
        return {
          found: true,
          status: data[i][tokenStatusColIdx],
          expired: Date.now() > data[i][tokenExpiryColIdx],
          brand: data[i][brandColIdx]
        };
      }
    }

    return { found: false };
  }

  // Public API
  return {
    issueToken,
    validateAndConsumeToken,
    burnToken,
    checkTokenStatus,
    TOKEN_EXPIRY_MS
  };
})();
