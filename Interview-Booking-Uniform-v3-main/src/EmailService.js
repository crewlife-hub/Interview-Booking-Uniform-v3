/**
 * EmailService.gs
 * Send invite and re-issue emails.
 * CrewLife Interview Bookings Uniform Core
 */

/**
 * Send booking invite email to candidate
 * @param {Object} params - Email parameters
 * @param {string} params.email - Recipient email
 * @param {string} params.brand - Brand code
 * @param {string} params.token - Access token
 * @param {string} params.textForEmail - Job/position text
 * @param {string} params.clCode - CL code
 * @param {string} params.recruiterName - Recruiter name
 * @param {string} params.traceId - Trace ID
 * @param {boolean} params.isReissue - Is this a re-issue?
 * @returns {Object} Send result
 */
function sendInviteEmail_(params) {
  try {
    var brandInfo = getBrand_(params.brand);
    var brandName = brandInfo ? brandInfo.name : params.brand;
    var webAppUrl = getWebAppUrl_();
    var bookingLink = webAppUrl + '?page=access&token=' + encodeURIComponent(params.token || '');
    
    var subject = params.isReissue
      ? '(Re-sent) Your Interview Booking Link – ' + brandName
      : 'Your Interview Booking Link – ' + brandName;
    
    var body = 'Hello,\n\n';
    body += 'You have been invited to book your interview';
    if (params.textForEmail) {
      body += ' for: ' + params.textForEmail;
    }
    body += '\n\n';
    body += 'Brand: ' + brandName + '\n';
    if (params.recruiterName) {
      body += 'Recruiter: ' + params.recruiterName + '\n';
    }
    body += '\n';
    body += 'Click the link below to proceed to the booking page:\n\n';
    body += bookingLink + '\n\n';
    body += '⚠️ Important:\n';
    body += '• This link is personal and can only be used once.\n';
    body += '• Do not share this link with others.\n';
    body += '• This link will expire in 48 hours.\n\n';
    body += 'If you did not request this, please ignore this email.\n\n';
    body += 'Best regards,\n';
    body += 'CrewLife Recruitment Team';
    
    var htmlBody = '<html><body>';
    htmlBody += '<p>Hello,</p>';
    htmlBody += '<p>You have been invited to book your interview';
    if (params.textForEmail) {
      htmlBody += ' for: <strong>' + escapeHtml_(params.textForEmail) + '</strong>';
    }
    htmlBody += '</p>';
    htmlBody += '<p><strong>Brand:</strong> ' + escapeHtml_(brandName) + '<br>';
    if (params.recruiterName) {
      htmlBody += '<strong>Recruiter:</strong> ' + escapeHtml_(params.recruiterName);
    }
    htmlBody += '</p>';
    htmlBody += '<p>Click the button below to proceed to the booking page:</p>';
    htmlBody += '<p><a href="' + bookingLink + '" style="display:inline-block;padding:12px 24px;background-color:#0066cc;color:#ffffff;text-decoration:none;border-radius:4px;font-weight:bold;">Book Your Interview</a></p>';
    htmlBody += '<p style="color:#666;font-size:12px;">';
    htmlBody += '⚠️ <strong>Important:</strong><br>';
    htmlBody += '• This link is personal and can only be used once.<br>';
    htmlBody += '• Do not share this link with others.<br>';
    htmlBody += '• This link will expire in 48 hours.';
    htmlBody += '</p>';
    htmlBody += '<p style="color:#999;font-size:11px;">If you did not request this, please ignore this email.</p>';
    htmlBody += '<p>Best regards,<br>CrewLife Recruitment Team</p>';
    htmlBody += '</body></html>';
    
    MailApp.sendEmail({
      to: params.email,
      subject: subject,
      body: body,
      htmlBody: htmlBody
    });
    
    logEvent_(params.traceId, params.brand, params.email, params.isReissue ? 'EMAIL_REISSUE_SENT' : 'EMAIL_SENT', {
      textForEmail: params.textForEmail,
      clCode: params.clCode,
      recruiter: params.recruiterName
    });
    
    return { ok: true, sent: true };
    
  } catch (e) {
    Logger.log('EmailService error: ' + e);
    logEvent_(params.traceId, params.brand, params.email, 'EMAIL_FAILED', {
      error: String(e)
    });
    return { ok: false, error: String(e) };
  }
}

/**
 * Escape HTML entities
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function escapeHtml_(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Get remaining email quota
 * @returns {number} Remaining daily quota
 */
function getEmailQuota_() {
  return MailApp.getRemainingDailyQuota();
}
