/**
 * CandidateVerifyService.gs
 * Candidate verification flow handlers
 * Interview Booking Uniform System v3
 */

const CandidateVerifyService = (() => {
  /**
   * Validate OTP request page parameters
   * @param {Object} params - URL parameters
   * @returns {Object} Validation result
   */
  function validateOtpRequestParams(params) {
    const { brand, rowId, ts, sig } = params;
    
    if (!brand || !rowId || !ts || !sig) {
      return {
        valid: false,
        error: 'Missing required parameters in the invitation link.'
      };
    }
    
    const sigCheck = InviteSigning.verifyPartialSignature(params);
    if (!sigCheck.valid) {
      return {
        valid: false,
        error: sigCheck.error,
        expired: sigCheck.expired
      };
    }
    
    // Verify brand exists
    const brandConfig = ConfigService.getBrandConfig(brand);
    if (!brandConfig) {
      return {
        valid: false,
        error: 'Invalid brand in invitation link.'
      };
    }
    
    return { valid: true, brand, brandConfig };
  }

  /**
   * Process OTP request form submission
   * @param {Object} params - Form parameters
   * @returns {Object} Processing result
   */
  function processOtpRequest(params) {
    const { brand, rowId, ts, sig, email, textForEmail } = params;
    const traceId = ConfigService.generateTraceId();
    const emailHash = ConfigService.hashEmail(email);
    const logger = LoggingService.createScopedLogger(traceId, brand);

    logger.info('OTP_REQUEST_START', 'Processing OTP request', emailHash);

    // Validate inputs
    if (!email || !textForEmail) {
      logger.failure('OTP_REQUEST', 'Missing email or text for email', emailHash);
      return {
        success: false,
        error: 'Please provide both email and position.'
      };
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      logger.failure('OTP_REQUEST', 'Invalid email format', emailHash);
      return {
        success: false,
        error: 'Please enter a valid email address.'
      };
    }

    // Get brand config
    const brandConfig = ConfigService.getBrandConfig(brand);
    if (!brandConfig) {
      logger.failure('OTP_REQUEST', 'Brand not found', emailHash);
      return {
        success: false,
        error: 'Invalid brand configuration.'
      };
    }

    // Verify against Smartsheet
    const verification = SmartsheetService.verifyRowData(
      brandConfig.SmartsheetSheetId,
      rowId,
      brandConfig.EmailColumnId,
      brandConfig.TextForEmailColumnId,
      email,
      textForEmail
    );

    if (!verification.success) {
      logger.failure('OTP_REQUEST', 'Smartsheet verification failed', emailHash, {
        emailMatch: verification.emailMatch,
        textMatch: verification.textMatch,
        error: verification.error
      });
      
      return {
        success: false,
        error: 'The information provided does not match our records. Please check your email and position.'
      };
    }

    // Create OTP
    const otpResult = OtpService.createOtp({
      brand,
      email,
      textForEmail,
      inviteSig: sig,
      traceId
    });

    if (!otpResult.success) {
      logger.error('OTP_REQUEST', 'Failed to create OTP', emailHash, { error: otpResult.error });
      return {
        success: false,
        error: 'Failed to generate verification code. Please try again.'
      };
    }

    // Send OTP email
    const emailResult = EmailService.sendOtpEmail({
      to: email,
      brand,
      otp: otpResult.otp,
      traceId
    });

    if (!emailResult.success) {
      logger.error('OTP_REQUEST', 'Failed to send OTP email', emailHash, { error: emailResult.error });
      return {
        success: false,
        error: 'Failed to send verification code. Please try again.'
      };
    }

    logger.success('OTP_REQUEST', 'OTP sent successfully', emailHash);

    return {
      success: true,
      email,
      brand,
      traceId
    };
  }

  /**
   * Process OTP verification form submission
   * @param {Object} params - Form parameters
   * @returns {Object} Processing result
   */
  function processOtpVerification(params) {
    const { email, otp } = params;
    const traceId = ConfigService.generateTraceId();
    const emailHash = ConfigService.hashEmail(email);

    LoggingService.info(traceId, '', 'OTP_VERIFY_START', 'Processing OTP verification', emailHash);

    // Validate inputs
    if (!email || !otp) {
      return {
        success: false,
        error: 'Please provide email and verification code.'
      };
    }

    // Normalize OTP (remove spaces)
    const normalizedOtp = otp.replace(/\s/g, '');

    // Verify OTP
    const verifyResult = OtpService.verifyOtp({
      email,
      otp: normalizedOtp,
      traceId
    });

    if (!verifyResult.success) {
      return {
        success: false,
        error: verifyResult.error,
        expired: verifyResult.expired,
        maxAttempts: verifyResult.maxAttempts,
        attemptsRemaining: verifyResult.attemptsRemaining
      };
    }

    // Issue token
    const tokenResult = TokenService.issueToken({
      email,
      traceId,
      rowIdx: verifyResult.rowIdx
    });

    if (!tokenResult.success) {
      LoggingService.error(traceId, verifyResult.brand, 'TOKEN_ISSUE', 'Failed to issue token', emailHash);
      return {
        success: false,
        error: 'Failed to generate booking link. Please try again.'
      };
    }

    LoggingService.success(traceId, verifyResult.brand, 'OTP_VERIFY_COMPLETE', 'Verification complete, token issued', emailHash);

    return {
      success: true,
      token: tokenResult.token,
      brand: verifyResult.brand
    };
  }

  /**
   * Process booking confirmation (token burn)
   * @param {Object} params - Parameters
   * @returns {Object} Processing result
   */
  function processBookingConfirm(params) {
    const { token } = params;
    const traceId = ConfigService.generateTraceId();

    LoggingService.info(traceId, '', 'BOOKING_CONFIRM_START', 'Processing booking confirmation', '');

    if (!token) {
      return {
        success: false,
        error: 'Missing booking token.'
      };
    }

    // Burn the token and get booking URL
    const burnResult = TokenService.burnToken(token, traceId);

    if (!burnResult.success) {
      return {
        success: false,
        error: burnResult.error,
        alreadyUsed: burnResult.alreadyUsed,
        expired: burnResult.expired
      };
    }

    if (!burnResult.bookingUrl) {
      LoggingService.error(traceId, burnResult.brand, 'BOOKING_CONFIRM', 'No booking URL configured', '');
      return {
        success: false,
        error: 'No booking URL configured for this position. Please contact support.'
      };
    }

    return {
      success: true,
      bookingUrl: burnResult.bookingUrl,
      brand: burnResult.brand
    };
  }

  /**
   * Validate token for booking confirm page
   * @param {string} token - Token to validate
   * @returns {Object} Validation result
   */
  function validateBookingToken(token) {
    if (!token) {
      return {
        valid: false,
        error: 'Missing booking token.'
      };
    }

    const traceId = ConfigService.generateTraceId();
    const result = TokenService.validateAndConsumeToken(token, traceId);

    if (!result.success) {
      return {
        valid: false,
        error: result.error,
        alreadyUsed: result.alreadyUsed,
        expired: result.expired
      };
    }

    return {
      valid: true,
      brand: result.brand,
      textForEmail: result.textForEmail
    };
  }

  // Public API
  return {
    validateOtpRequestParams,
    processOtpRequest,
    processOtpVerification,
    processBookingConfirm,
    validateBookingToken
  };
})();
