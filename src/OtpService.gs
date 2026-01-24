/**
 * OtpService.gs
 * OTP generation, storage, and verification
 * Interview Booking Uniform System v3
 */

const OtpService = (() => {
  const OTP_LENGTH = 6;
  const OTP_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
  const MAX_ATTEMPTS = 3;

  /**
   * Generate a random numeric OTP
   */
  function generateOtp_() {
    let otp = '';
    for (let i = 0; i < OTP_LENGTH; i++) {
      otp += Math.floor(Math.random() * 10);
    }
    return otp;
  }

  /**
   * Create a new OTP for a candidate
   * @param {Object} params - OTP parameters
   * @param {string} params.brand - Brand name
   * @param {string} params.email - Candidate email
   * @param {string} params.textForEmail - Text for email value
   * @param {string} params.inviteSig - Original invite signature
   * @param {string} params.traceId - Trace ID for logging
   * @returns {Object} OTP creation result
   */
  function createOtp(params) {
    const { brand, email, textForEmail, inviteSig, traceId } = params;
    const logger = LoggingService.createScopedLogger(traceId, brand);
    const emailHash = ConfigService.hashEmail(email);

    try {
      const sheet = ConfigService.getTokensSheet();
      const otp = generateOtp_();
      const createdAt = new Date().toISOString();
      const expiryEpoch = Date.now() + OTP_EXPIRY_MS;

      // Supersede any existing pending OTPs for this email
      supersedePendingOtps_(sheet, email, traceId);

      // Create new token row
      const row = [
        createdAt,           // CreatedAt
        brand,               // Brand
        email,               // Email
        emailHash,           // EmailHash
        textForEmail,        // TextForEmail
        otp,                 // Otp
        expiryEpoch,         // OtpExpiryEpoch
        0,                   // OtpAttempts
        ConfigService.OTP_STATUS.PENDING, // OtpStatus
        '',                  // Token
        '',                  // TokenExpiryEpoch
        '',                  // TokenStatus
        '',                  // VerifiedAt
        '',                  // UsedAt
        inviteSig,           // InviteSig
        traceId,             // TraceId
        ''                   // DebugNotes
      ];

      sheet.appendRow(row);

      logger.success('OTP_CREATED', `OTP created for ${emailHash}`, emailHash, { expiryEpoch });

      return {
        success: true,
        otp,
        expiryEpoch,
        traceId
      };
    } catch (e) {
      logger.error('OTP_CREATE_ERROR', e.message, emailHash);
      return {
        success: false,
        error: e.message
      };
    }
  }

  /**
   * Supersede any pending OTPs for an email
   */
  function supersedePendingOtps_(sheet, email, traceId) {
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const emailColIdx = headers.indexOf('Email');
    const statusColIdx = headers.indexOf('OtpStatus');
    const notesColIdx = headers.indexOf('DebugNotes');

    for (let i = 1; i < data.length; i++) {
      if (data[i][emailColIdx] === email && 
          data[i][statusColIdx] === ConfigService.OTP_STATUS.PENDING) {
        sheet.getRange(i + 1, statusColIdx + 1).setValue(ConfigService.OTP_STATUS.SUPERSEDED);
        sheet.getRange(i + 1, notesColIdx + 1).setValue(`Superseded by ${traceId}`);
      }
    }
  }

  /**
   * Verify an OTP
   * @param {Object} params - Verification parameters
   * @param {string} params.email - Candidate email
   * @param {string} params.otp - OTP to verify
   * @param {string} params.traceId - Trace ID for logging
   * @returns {Object} Verification result
   */
  function verifyOtp(params) {
    const { email, otp, traceId } = params;
    const emailHash = ConfigService.hashEmail(email);
    const sheet = ConfigService.getTokensSheet();
    const data = sheet.getDataRange().getValues();
    const headers = data[0];

    // Find column indices
    const emailColIdx = headers.indexOf('Email');
    const otpColIdx = headers.indexOf('Otp');
    const expiryColIdx = headers.indexOf('OtpExpiryEpoch');
    const attemptsColIdx = headers.indexOf('OtpAttempts');
    const statusColIdx = headers.indexOf('OtpStatus');
    const verifiedAtColIdx = headers.indexOf('VerifiedAt');
    const notesColIdx = headers.indexOf('DebugNotes');
    const brandColIdx = headers.indexOf('Brand');
    const textForEmailColIdx = headers.indexOf('TextForEmail');

    // Find the pending OTP row for this email
    let rowIdx = -1;
    let rowData = null;

    for (let i = data.length - 1; i >= 1; i--) {
      if (data[i][emailColIdx] === email && 
          data[i][statusColIdx] === ConfigService.OTP_STATUS.PENDING) {
        rowIdx = i + 1; // 1-indexed for sheet
        rowData = data[i];
        break;
      }
    }

    if (!rowData) {
      LoggingService.failure(traceId, '', 'OTP_VERIFY', 'No pending OTP found', emailHash);
      return {
        success: false,
        error: 'No pending verification found. Please request a new code.'
      };
    }

    const brand = rowData[brandColIdx];
    const logger = LoggingService.createScopedLogger(traceId, brand);

    // Check expiry
    const expiryEpoch = rowData[expiryColIdx];
    if (Date.now() > expiryEpoch) {
      sheet.getRange(rowIdx, statusColIdx + 1).setValue(ConfigService.OTP_STATUS.EXPIRED);
      logger.failure('OTP_VERIFY', 'OTP expired', emailHash);
      return {
        success: false,
        error: 'Verification code has expired. Please request a new one.',
        expired: true
      };
    }

    // Check attempts
    const attempts = rowData[attemptsColIdx] || 0;
    if (attempts >= MAX_ATTEMPTS) {
      sheet.getRange(rowIdx, statusColIdx + 1).setValue(ConfigService.OTP_STATUS.FAILED);
      logger.failure('OTP_VERIFY', 'Max attempts exceeded', emailHash, { attempts });
      return {
        success: false,
        error: 'Too many incorrect attempts. Please request a new code.',
        maxAttempts: true
      };
    }

    // Increment attempts
    sheet.getRange(rowIdx, attemptsColIdx + 1).setValue(attempts + 1);

    // Verify OTP
    const storedOtp = String(rowData[otpColIdx]);
    if (otp !== storedOtp) {
      const remaining = MAX_ATTEMPTS - (attempts + 1);
      logger.failure('OTP_VERIFY', `Invalid OTP, ${remaining} attempts remaining`, emailHash);
      
      if (remaining <= 0) {
        sheet.getRange(rowIdx, statusColIdx + 1).setValue(ConfigService.OTP_STATUS.FAILED);
        return {
          success: false,
          error: 'Too many incorrect attempts. Please request a new code.',
          maxAttempts: true
        };
      }
      
      return {
        success: false,
        error: `Invalid code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`,
        attemptsRemaining: remaining
      };
    }

    // OTP is valid - mark as verified
    sheet.getRange(rowIdx, statusColIdx + 1).setValue(ConfigService.OTP_STATUS.VERIFIED);
    sheet.getRange(rowIdx, verifiedAtColIdx + 1).setValue(new Date().toISOString());

    logger.success('OTP_VERIFIED', 'OTP verified successfully', emailHash);

    return {
      success: true,
      brand: brand,
      email: email,
      textForEmail: rowData[textForEmailColIdx],
      rowIdx
    };
  }

  /**
   * Get pending OTP data for an email
   */
  function getPendingOtpData(email) {
    const sheet = ConfigService.getTokensSheet();
    const data = sheet.getDataRange().getValues();
    const headers = data[0];

    const emailColIdx = headers.indexOf('Email');
    const statusColIdx = headers.indexOf('OtpStatus');
    const brandColIdx = headers.indexOf('Brand');
    const textForEmailColIdx = headers.indexOf('TextForEmail');

    for (let i = data.length - 1; i >= 1; i--) {
      if (data[i][emailColIdx] === email && 
          data[i][statusColIdx] === ConfigService.OTP_STATUS.PENDING) {
        return {
          brand: data[i][brandColIdx],
          textForEmail: data[i][textForEmailColIdx],
          rowIdx: i + 1
        };
      }
    }

    return null;
  }

  // Public API
  return {
    createOtp,
    verifyOtp,
    getPendingOtpData,
    OTP_LENGTH,
    OTP_EXPIRY_MS,
    MAX_ATTEMPTS
  };
})();
