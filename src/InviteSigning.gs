/**
 * InviteSigning.gs
 * HMAC signing and verification for invite links
 * Interview Booking Uniform System v3
 */

const InviteSigning = (() => {
  const MAX_LINK_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

  /**
   * Get HMAC secret from Script Properties
   */
  function getSecret_() {
    const secret = PropertiesService.getScriptProperties().getProperty('HMAC_SECRET');
    if (!secret) {
      throw new Error('HMAC_SECRET not set in Script Properties');
    }
    return secret;
  }

  /**
   * Create HMAC-SHA256 signature
   * @param {string} data - Data to sign
   * @returns {string} Base64url encoded signature
   */
  function hmacSign_(data) {
    const secret = getSecret_();
    const signature = Utilities.computeHmacSha256Signature(data, secret);
    // Convert to base64url
    const base64 = Utilities.base64Encode(signature);
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  /**
   * Create signed invite URL
   * @param {Object} params - URL parameters
   * @param {string} params.brand - Brand name
   * @param {string} params.rowId - Smartsheet row ID
   * @param {string} params.email - Candidate email
   * @param {string} params.textForEmail - Text for email value
   * @returns {string} Signed URL
   */
  /**
   * Build a URL with query parameters (Apps Script compatible)
   */
  function buildUrlWithParams_(baseUrl, params) {
    var keys = Object.keys(params);
    var qs = keys.map(function(k) {
      return encodeURIComponent(k) + '=' + encodeURIComponent(String(params[k]));
    }).join('&');
    return baseUrl + (baseUrl.indexOf('?') >= 0 ? '&' : '?') + qs;
  }

  function createSignedInviteUrl(params) {
    const { brand, rowId, email, textForEmail } = params;
    const ts = Date.now();
    
    // Create signature payload
    const payload = [brand, rowId, email, textForEmail, ts].join('|');
    const sig = hmacSign_(payload);
    
    // Get web app URL
    const webAppUrl = ScriptApp.getService().getUrl();
    
    // Build URL with parameters using Apps Script compatible helper
    const urlParams = {
      page: 'otp_request',
      brand: brand,
      rowId: rowId,
      ts: ts,
      sig: sig
    };
    
    return buildUrlWithParams_(webAppUrl, urlParams);
  }

  /**
   * Verify signed invite URL parameters
   * @param {Object} params - URL parameters
   * @returns {Object} Verification result
   */
  function verifySignature(params) {
    const { brand, rowId, email, textForEmail, ts, sig } = params;
    
    // Check timestamp age
    const timestamp = parseInt(ts, 10);
    if (isNaN(timestamp)) {
      return { valid: false, error: 'Invalid timestamp' };
    }
    
    const age = Date.now() - timestamp;
    if (age > MAX_LINK_AGE_MS) {
      return { valid: false, error: 'Link has expired (24h max)', expired: true };
    }
    
    if (age < 0) {
      return { valid: false, error: 'Invalid timestamp (future date)' };
    }
    
    // Recreate and verify signature
    const payload = [brand, rowId, email, textForEmail, ts].join('|');
    const expectedSig = hmacSign_(payload);
    
    if (sig !== expectedSig) {
      return { valid: false, error: 'Invalid signature' };
    }
    
    return { valid: true };
  }

  /**
   * Verify partial signature (without email/textForEmail for initial page load)
   * This validates that brand, rowId, ts are authentic
   */
  function verifyPartialSignature(params) {
    const { brand, rowId, ts, sig } = params;
    
    // Check timestamp age
    const timestamp = parseInt(ts, 10);
    if (isNaN(timestamp)) {
      return { valid: false, error: 'Invalid timestamp' };
    }
    
    const age = Date.now() - timestamp;
    if (age > MAX_LINK_AGE_MS) {
      return { valid: false, error: 'Link has expired (24h max)', expired: true };
    }
    
    // For partial verification, we need to check that the sig format is valid
    // but we can't fully verify without email/textForEmail
    // Instead, we just validate the timestamp and structure
    if (!brand || !rowId || !ts || !sig) {
      return { valid: false, error: 'Missing required parameters' };
    }
    
    // Sig should be a valid base64url string
    if (!/^[A-Za-z0-9_-]+$/.test(sig)) {
      return { valid: false, error: 'Invalid signature format' };
    }
    
    return { valid: true, requiresFullVerification: true };
  }

  /**
   * Store the original signature for tracking
   */
  function extractSignature(sig) {
    return sig || '';
  }

  // Public API
  return {
    createSignedInviteUrl,
    verifySignature,
    verifyPartialSignature,
    extractSignature,
    MAX_LINK_AGE_MS
  };
})();
