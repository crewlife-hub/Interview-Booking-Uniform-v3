/**
 * Utils.gs
 * Pure helper functions with no side effects.
 * CrewLife Interview Bookings Uniform Core
 */

/**
 * Generate a unique trace ID for request correlation
 * @returns {string} Trace ID
 */
function generateTraceId_() {
  var now = new Date().getTime();
  var r = Math.floor(Math.random() * 1e9);
  var raw = now.toString(36) + '-' + r.toString(36);
  return 'tr-' + raw;
}

/**
 * Mask an email address for privacy (e.g., jo***@gmail.com)
 * @param {string} email - Email to mask
 * @returns {string} Masked email
 */
function maskEmail_(email) {
  if (!email) return '';
  var str = String(email).trim().toLowerCase();
  var parts = str.split('@');
  if (parts.length !== 2) return '***';
  var name = parts[0];
  var domain = parts[1];
  var visible = name.length > 2 ? name.slice(0, 2) : name.slice(0, 1);
  return visible + '***@' + domain;
}

/**
 * Create a JSON response
 * @param {Object} obj - Object to serialize
 * @returns {TextOutput} JSON response
 */
function jsonResponse_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj, null, 2))
    .setMimeType(ContentService.MimeType.JSON);
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
 * Format date for display
 * @param {Date} date - Date to format
 * @returns {string} Formatted date string
 */
function formatDate_(date) {
  if (!date) return '';
  var d = new Date(date);
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * Check if a string is a valid email
 * @param {string} email - Email to validate
 * @returns {boolean} True if valid
 */
function isValidEmail_(email) {
  if (!email) return false;
  var re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(String(email).trim());
}

/**
 * Debug dump for diagnostics endpoint
 * @param {string} brand - Brand code
 * @returns {Object} Diagnostic info
 */
function debugDump_(brand) {
  var traceId = generateTraceId_();
  try {
    var cfg = getConfig_();
    var brandInfo = getBrand_(brand);
    var brandConfig = brand ? getBrandConfigOverrides_(brand) : {};
    var clCodes = brand ? getCLCodesForBrand_(brand) : [];
    var jobs = brand ? getJobsForBrand_(brand) : [];
    
    var smartsheetTest = null;
    if (brand) {
      smartsheetTest = testSmartsheetConnection_(brand);
    }
    
    return {
      ok: true,
      timestamp: new Date().toISOString(),
      traceId: traceId,
      version: cfg.APP_VERSION,
      safeMode: cfg.SAFE_MODE,
      brand: brand || null,
      brandInfo: brandInfo ? {
        name: brandInfo.name,
        code: brandInfo.code,
        featureFlags: brandInfo.featureFlags
      } : null,
      configSheet: cfg.CONFIG_SHEET_ID ? 'CONFIGURED' : 'NOT_SET',
      tokenExpiryHours: cfg.TOKEN_EXPIRY_HOURS,
      clCodesCount: clCodes.length,
      jobsCount: jobs.length,
      smartsheetConnection: smartsheetTest,
      emailQuota: getEmailQuota_()
    };
  } catch (e) {
    return {
      ok: false,
      timestamp: new Date().toISOString(),
      traceId: traceId,
      error: String(e),
      stack: e.stack
    };
  }
}

/**
 * Mask a URL for logging: show host and last 8 chars only
 * @param {string} url - URL to mask
 * @returns {string} Masked URL fragment
 */
function maskUrl_(url) {
  if (!url) return '';
  try {
    var m = String(url).match(/https?:\/\/([^\/]+)/i);
    var host = m ? m[1] : '';
    var tail = String(url).slice(-8);
    return (host ? host + '...' : '...') + tail;
  } catch (e) {
    return 'masked';
  }
}
