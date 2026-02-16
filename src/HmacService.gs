/**
 * HmacService.gs
 * HMAC signature generation and validation for secure URL signing.
 * Prevents URL tampering for Smartsheet email links.
 * CrewLife Interview Bookings Uniform Core
 */

/**
 * Get HMAC secret from script properties
 * @returns {string} HMAC secret
 */
function getHmacSecret_() {
  var props = PropertiesService.getScriptProperties();
  var secret = props.getProperty('HMAC_SECRET');
  if (!secret || secret.length < 32) {
    // Generate a new secret if not set
    secret = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
    props.setProperty('HMAC_SECRET', secret);
    Logger.log('HmacService: Generated new HMAC_SECRET');
  }
  return secret;
}

/**
 * Compute HMAC-SHA256 signature
 * @param {string} secret - Secret key
 * @param {string} data - Data to sign
 * @returns {string} Hex-encoded signature
 */
function computeHmac_(secret, data) {
  var signature = Utilities.computeHmacSha256Signature(data, secret);
  return signature.map(function(byte) {
    return ('0' + (byte & 0xFF).toString(16)).slice(-2);
  }).join('');
}

/**
 * Generate a signed invite URL for OTP request flow
 * @param {Object} params - URL parameters
 * @param {string} params.brand - Brand code
 * @param {string} params.rowId - Smartsheet row ID
 * @param {string} params.email - Candidate email
 * @param {string} params.textForEmail - Text For Email value
 * @returns {Object} Result with signed URL
 */
function generateSignedUrl_(params) {
  var brand = String(params.brand || '').toUpperCase().trim();
  var rowId = String(params.rowId || '').trim();
  var email = String(params.email || '').toLowerCase().trim();
  var textForEmail = String(params.textForEmail || '').trim();
  
  if (!brand || !rowId || !email || !textForEmail) {
    return { ok: false, error: 'Missing required parameters: brand, rowId, email, textForEmail' };
  }
  
  if (!isValidBrand_(brand)) {
    return { ok: false, error: 'Invalid brand: ' + brand };
  }
  
  // Current timestamp in seconds
  var timestamp = Math.floor(Date.now() / 1000);
  
  // Data to sign: brand|rowId|email|textForEmail|timestamp
  var dataToSign = brand + '|' + rowId + '|' + email + '|' + textForEmail + '|' + timestamp;
  
  // Compute signature (first 16 chars of HMAC-SHA256)
  var secret = getHmacSecret_();
  var fullSig = computeHmac_(secret, dataToSign);
  var sig = fullSig.substring(0, 16);
  
  // Build URL
  var baseUrl = getWebAppUrl_();
  var url = baseUrl +
    '?page=otp_request' +
    '&brand=' + encodeURIComponent(brand) +
    '&rowId=' + encodeURIComponent(rowId) +
    '&ts=' + timestamp +
    '&sig=' + sig;
  
  return {
    ok: true,
    url: url,
    brand: brand,
    email: email,
    textForEmail: textForEmail,
    timestamp: timestamp,
    expiresAt: new Date((timestamp + getLinkExpirySeconds_()) * 1000).toISOString()
  };
}

/**
 * Validate a signed invite URL using row data
 * @param {Object} params - URL parameters from request
 * @param {Object} rowData - Row data with email/textForEmail
 * @returns {Object} Validation result
 */
function validateSignedUrl_(params, rowData) {
  var brand = String(params.brand || '').toUpperCase().trim();
  var rowId = String(params.rowId || '').trim();
  var email = String((rowData && rowData.email) || '').toLowerCase().trim();
  var textForEmail = String((rowData && rowData.textForEmail) || '').trim();
  var timestamp = Number(params.ts || 0);
  var providedSig = String(params.sig || '').toLowerCase();
  
  // Check required params
  if (!brand || !rowId || !email || !textForEmail || !timestamp || !providedSig) {
    return { ok: false, error: 'Missing required URL parameters', code: 'MISSING_PARAMS' };
  }
  
  // Check brand validity
  if (!isValidBrand_(brand)) {
    return { ok: false, error: 'Invalid brand', code: 'INVALID_BRAND' };
  }
  
  // Check timestamp freshness (default max 24 hours)
  var cfg = getConfig_();
  var now = Math.floor(Date.now() / 1000);
  var maxAge = Number(cfg.INVITE_LINK_MAX_AGE_HOURS || 24) * 60 * 60;
  if (now - timestamp > maxAge) {
    return { ok: false, error: 'Link has expired', code: 'LINK_EXPIRED' };
  }
  
  // Recompute signature
  var dataToSign = brand + '|' + rowId + '|' + email + '|' + textForEmail + '|' + timestamp;
  var secret = getHmacSecret_();
  var expectedSig = computeHmac_(secret, dataToSign).substring(0, 16);
  
  if (providedSig !== expectedSig) {
    return { ok: false, error: 'Invalid link signature', code: 'INVALID_SIGNATURE' };
  }
  
  return {
    ok: true,
    brand: brand,
    rowId: rowId,
    email: email,
    textForEmail: textForEmail,
    timestamp: timestamp
  };
}

/**
 * Get link expiry in seconds (default 7 days)
 * @returns {number} Seconds
 */
function getLinkExpirySeconds_() {
  var props = PropertiesService.getScriptProperties();
  var days = Number(props.getProperty('LINK_EXPIRY_DAYS') || 7);
  return days * 24 * 60 * 60;
}

/**
 * Handle generateSignedUrl API call (for Smartsheet webhook)
 * @param {Object} params - Request parameters
 * @param {string} traceId - Trace ID
 * @returns {TextOutput} JSON response
 */
function handleGenerateSignedUrl_(params, traceId) {
  var brand = params.brand;
  var email = params.email;
  var textForEmail = params.textForEmail;
  var rowId = params.rowId;
  
  // Validate against Smartsheet first
  var candidate = searchCandidateInSmartsheet_(brand, email, textForEmail);
  if (!candidate.ok) {
    logEvent_(traceId, brand, email, 'SIGNED_URL_REJECTED', { error: candidate.error });
    return jsonResponse_({ ok: false, error: 'Candidate validation failed: ' + candidate.error });
  }
  if (!candidate.found || !candidate.exactMatch) {
    logEvent_(traceId, brand, email, 'SIGNED_URL_REJECTED', { error: 'Candidate not found in Smartsheet' });
    return jsonResponse_({ ok: false, error: 'Candidate not found in Smartsheet' });
  }
  
  // Generate signed URL
  var result = generateSignedUrl_({
    brand: brand,
    rowId: rowId,
    email: email,
    textForEmail: textForEmail
  });
  
  if (result.ok) {
    logEvent_(traceId, brand, email, 'SIGNED_URL_GENERATED', { textForEmail: textForEmail });
  }
  
  return jsonResponse_(result);
}
