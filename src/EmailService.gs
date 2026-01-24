/**
 * EmailService.gs
 * Email sending for invites and OTP
 * Interview Booking Uniform System v3
 */

const EmailService = (() => {
  /**
   * Send invite email with signed link
   * @param {Object} params - Email parameters
   * @param {string} params.to - Recipient email
   * @param {string} params.brand - Brand name
   * @param {string} params.textForEmail - Job/position
   * @param {string} params.inviteUrl - Signed invite URL
   * @param {string} params.traceId - Trace ID for logging
   * @param {boolean} params.dryRun - If true, don't actually send
   * @returns {Object} Send result
   */
  function sendInviteEmail(params) {
    const { to, brand, textForEmail, inviteUrl, traceId, dryRun } = params;
    const emailHash = ConfigService.hashEmail(to);
    const logger = LoggingService.createScopedLogger(traceId, brand);

    const subject = `Interview Invitation - ${brand}`;
    
    const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 28px;">Interview Invitation</h1>
    <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 16px;">${brand}</p>
  </div>
  
  <div style="background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none;">
    <p style="font-size: 16px; margin-bottom: 20px;">Hello,</p>
    
    <p style="font-size: 16px; margin-bottom: 20px;">
      You have been invited to schedule an interview for the <strong>${textForEmail}</strong> position at <strong>${brand}</strong>.
    </p>
    
    <p style="font-size: 16px; margin-bottom: 25px;">
      Please click the button below to verify your identity and book your interview slot.
    </p>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="${inviteUrl}" 
         style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                color: white; padding: 15px 40px; text-decoration: none; border-radius: 8px; 
                font-size: 18px; font-weight: bold; box-shadow: 0 4px 15px rgba(102,126,234,0.4);">
        Book Your Interview
      </a>
    </div>
    
    <p style="font-size: 14px; color: #666; margin-top: 30px;">
      <strong>Important:</strong> This link is personalized for you and will expire in 24 hours. 
      Please do not share it with others.
    </p>
    
    <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 25px 0;">
    
    <p style="font-size: 12px; color: #999; margin: 0;">
      If you did not expect this invitation, please ignore this email.
    </p>
  </div>
  
  <div style="background: #f5f5f5; padding: 20px; border-radius: 0 0 10px 10px; text-align: center;">
    <p style="font-size: 12px; color: #666; margin: 0;">
      &copy; ${new Date().getFullYear()} ${brand}. All rights reserved.
    </p>
  </div>
</body>
</html>`;

    const textBody = `Interview Invitation - ${brand}

Hello,

You have been invited to schedule an interview for the ${textForEmail} position at ${brand}.

Please click the link below to verify your identity and book your interview slot:

${inviteUrl}

Important: This link is personalized for you and will expire in 24 hours. Please do not share it with others.

If you did not expect this invitation, please ignore this email.`;

    if (dryRun) {
      logger.info('INVITE_EMAIL_DRYRUN', `Would send invite email to ${emailHash}`, emailHash, { subject });
      return { success: true, dryRun: true };
    }

    try {
      MailApp.sendEmail({
        to: to,
        subject: subject,
        body: textBody,
        htmlBody: htmlBody
      });
      
      logger.success('INVITE_EMAIL_SENT', 'Invite email sent', emailHash, { subject });
      return { success: true };
    } catch (e) {
      logger.error('INVITE_EMAIL_ERROR', e.message, emailHash);
      return { success: false, error: e.message };
    }
  }

  /**
   * Send OTP verification email
   * @param {Object} params - Email parameters
   * @param {string} params.to - Recipient email
   * @param {string} params.brand - Brand name
   * @param {string} params.otp - OTP code
   * @param {string} params.traceId - Trace ID for logging
   * @returns {Object} Send result
   */
  function sendOtpEmail(params) {
    const { to, brand, otp, traceId } = params;
    const emailHash = ConfigService.hashEmail(to);
    const logger = LoggingService.createScopedLogger(traceId, brand);

    const subject = `Your Verification Code - ${brand}`;
    
    const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 28px;">Verification Code</h1>
    <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 16px;">${brand}</p>
  </div>
  
  <div style="background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; text-align: center;">
    <p style="font-size: 16px; margin-bottom: 20px;">Your verification code is:</p>
    
    <div style="background: #f8f9fa; border: 2px dashed #667eea; border-radius: 10px; padding: 20px; margin: 20px 0;">
      <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #667eea;">${otp}</span>
    </div>
    
    <p style="font-size: 14px; color: #666; margin-top: 20px;">
      This code will expire in <strong>10 minutes</strong>.
    </p>
    
    <p style="font-size: 14px; color: #666;">
      If you didn't request this code, please ignore this email.
    </p>
  </div>
  
  <div style="background: #f5f5f5; padding: 20px; border-radius: 0 0 10px 10px; text-align: center;">
    <p style="font-size: 12px; color: #666; margin: 0;">
      &copy; ${new Date().getFullYear()} ${brand}. All rights reserved.
    </p>
  </div>
</body>
</html>`;

    const textBody = `Verification Code - ${brand}

Your verification code is: ${otp}

This code will expire in 10 minutes.

If you didn't request this code, please ignore this email.`;

    try {
      MailApp.sendEmail({
        to: to,
        subject: subject,
        body: textBody,
        htmlBody: htmlBody
      });
      
      logger.success('OTP_EMAIL_SENT', 'OTP email sent', emailHash);
      return { success: true };
    } catch (e) {
      logger.error('OTP_EMAIL_ERROR', e.message, emailHash);
      return { success: false, error: e.message };
    }
  }

  // Public API
  return {
    sendInviteEmail,
    sendOtpEmail
  };
})();
