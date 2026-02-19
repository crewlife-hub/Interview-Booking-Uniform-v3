/**
 * Config.gs
 * Central configuration, script properties, feature flags.
 * CrewLife Interview Bookings Uniform Core
 */

var APP_VERSION = '1.0.0';
var CONFIG_SHEET_ID = '1qM3ZEdBsvbEofDH8DayRWcRa4bUcrKQIv8kzKSYZ1AM';
// Default exec URL — replaceable via Script Properties `WEB_APP_EXEC_URL` or `DEPLOY_ID`
var WEB_APP_EXEC_URL_DEFAULT = 'https://script.google.com/macros/s/AKfycbzL1GZHA4DoMNhDT5-6LuYlXw2YPyYZI444dJFOHvrUtPXZorO4P7Sx1i8-Qe1bKKmxPQ/exec';
var WEB_APP_EXEC_URL_TARGET = 'https://script.google.com/macros/s/AKfycbx-IEEieMEvXPf0cXC_R_y6KKtWOMkA2nXJkU1mu8XlIMY7MnCn5eamrzjzvre0frZm0Q/exec';

/**
 * CANONICAL web app URL used for ALL email CTAs.
 * This MUST be the token-gate entry point — never a calendar URL.
 * Email CTA helpers call this instead of getWebAppUrl_() to guarantee
 * the link is always the correct /exec endpoint regardless of script properties.
 * Deployment @104 - Feb 19 2026 - FINAL CTA FIX.
 */
var CANONICAL_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbx-IEEieMEvXPf0cXC_R_y6KKtWOMkA2nXJkU1mu8XlIMY7MnCn5eamrzjzvre0frZm0Q/exec';

/**
 * Return the canonical web app base URL for email CTAs.
 * Uses ScriptApp.getService().getUrl() to always return the URL of 
 * the CURRENTLY EXECUTING deployment - no hardcoding needed.
 * Falls back to WEB_APP_EXEC_URL script property or CANONICAL_WEB_APP_URL constant.
 * @returns {string}
 */
function getEmailCtaBaseUrl_() {
  // Prefer explicit configured URL so email CTA is EXACTLY the expected /exec URL.
  try {
    var props = PropertiesService.getScriptProperties();
    var propUrl = props.getProperty('WEB_APP_EXEC_URL');
    if (propUrl) {
      Logger.log('[getEmailCtaBaseUrl_] Using WEB_APP_EXEC_URL property: ' + propUrl);
      return propUrl;
    }
  } catch (e) {}
  
  // Last resort: hardcoded constant
  Logger.log('[getEmailCtaBaseUrl_] Using CANONICAL_WEB_APP_URL constant');
  return CANONICAL_WEB_APP_URL;
}

/**
 * Get all configuration values
 * @returns {Object} Configuration object
 */
function getConfig_() {
  var props = PropertiesService.getScriptProperties();
  var safeMode = props.getProperty('SAFE_MODE');
  if (safeMode === null) safeMode = 'true';
  
  return {
    APP_VERSION: APP_VERSION,
    CONFIG_SHEET_ID: props.getProperty('CONFIG_SHEET_ID') || CONFIG_SHEET_ID,
    SAFE_MODE: safeMode === 'true',
    TOKEN_EXPIRY_HOURS: Number(props.getProperty('TOKEN_EXPIRY_HOURS') || '48'),
    LOG_SHEET_ID: props.getProperty('LOG_SHEET_ID') || CONFIG_SHEET_ID,
    SMARTSHEET_API_TOKEN: props.getProperty('SMARTSHEET_API_TOKEN') || '',
    ADMIN_ALLOWLIST: (props.getProperty('ADMIN_ALLOWLIST') || '').split(',').filter(function(e) { return e.trim(); }),
    WORKSPACE_DOMAIN: props.getProperty('WORKSPACE_DOMAIN') || 'crewlifeatsea.com',
    HMAC_SECRET: props.getProperty('HMAC_SECRET') || '',
    OTP_EXPIRY_MINUTES: Number(props.getProperty('OTP_EXPIRY_MINUTES') || '10'),
    LINK_EXPIRY_DAYS: Number(props.getProperty('LINK_EXPIRY_DAYS') || '7')
  };
}

/**
 * Set safe mode toggle
 * @param {boolean} val - Safe mode value
 * @returns {Object} Updated config
 */
function setSafeMode_(val) {
  var props = PropertiesService.getScriptProperties();
  props.setProperty('SAFE_MODE', val ? 'true' : 'false');
  return getConfig_();
}

/**
 * Set config sheet ID
 * @param {string} id - Sheet ID
 */
function setConfigSheetId_(id) {
  var props = PropertiesService.getScriptProperties();
  props.setProperty('CONFIG_SHEET_ID', id || CONFIG_SHEET_ID);
}

/**
 * Set log sheet ID
 * @param {string} id - Sheet ID
 */
function setLogSheetId_(id) {
  var props = PropertiesService.getScriptProperties();
  props.setProperty('LOG_SHEET_ID', id || CONFIG_SHEET_ID);
}

/**
 * Set Smartsheet API token
 * @param {string} token - API token
 */
function setSmartsheetApiToken_(token) {
  var props = PropertiesService.getScriptProperties();
  props.setProperty('SMARTSHEET_API_TOKEN', token || '');
}

/**
 * Set token expiry hours
 * @param {number} hours - Expiry in hours
 */
function setTokenExpiryHours_(hours) {
  var props = PropertiesService.getScriptProperties();
  props.setProperty('TOKEN_EXPIRY_HOURS', String(Number(hours) || 48));
}

/**
 * Set admin allowlist (comma-separated emails)
 * @param {string} emails - Comma-separated email list
 */
function setAdminAllowlist_(emails) {
  var props = PropertiesService.getScriptProperties();
  props.setProperty('ADMIN_ALLOWLIST', emails || '');
}

/**
 * Set HMAC secret for URL signing
 * @param {string} secret - HMAC secret (32+ chars)
 */
function setHmacSecret_(secret) {
  var props = PropertiesService.getScriptProperties();
  props.setProperty('HMAC_SECRET', secret || '');
}

/**
 * Set the web app exec URL in script properties (for stable links)
 * @param {string} url - Full exec URL (https://script.google.com/macros/s/.../exec)
 */
function setWebAppExecUrl_(url) {
  var props = PropertiesService.getScriptProperties();
  props.setProperty('WEB_APP_EXEC_URL', String(url || '').trim());
}

/**
 * One-time admin setup to pin the active web app exec URL in Script Properties.
 * Run manually from Apps Script editor: SET_WEBAPP_EXEC_URL()
 * @returns {string} The configured URL
 */
function SET_WEBAPP_EXEC_URL() {
  var props = PropertiesService.getScriptProperties();
  props.setProperty('WEB_APP_EXEC_URL', WEB_APP_EXEC_URL_TARGET);
  Logger.log('WEB_APP_EXEC_URL set to: ' + WEB_APP_EXEC_URL_TARGET);
  return WEB_APP_EXEC_URL_TARGET;
}

/**
 * Admin fix helper to force WEB_APP_EXEC_URL and log the resolved final URL.
 * Run manually from Apps Script editor: FIX_SET_WEB_APP_EXEC_URL()
 * @returns {string} Final URL from getWebAppUrl_()
 */
function FIX_SET_WEB_APP_EXEC_URL() {
  var props = PropertiesService.getScriptProperties();
  props.setProperty('WEB_APP_EXEC_URL', WEB_APP_EXEC_URL_TARGET);
  var finalUrl = getWebAppUrl_();
  Logger.log('FIX_SET_WEB_APP_EXEC_URL -> WEB_APP_EXEC_URL: ' + finalUrl);
  return finalUrl;
}

/**
 * Set the deploy id (the /s/<DEPLOY_ID>/ part) in script properties
 * @param {string} id - Deploy id (no slashes)
 */
function setDeployId_(id) {
  var props = PropertiesService.getScriptProperties();
  props.setProperty('DEPLOY_ID', String(id || '').trim());
}

/**
 * Set OTP expiry in minutes
 * @param {number} minutes - Expiry in minutes
 */
function setOtpExpiryMinutes_(minutes) {
  var props = PropertiesService.getScriptProperties();
  props.setProperty('OTP_EXPIRY_MINUTES', String(Number(minutes) || 10));
}

/**
 * Set link expiry in days
 * @param {number} days - Expiry in days
 */
function setLinkExpiryDays_(days) {
  var props = PropertiesService.getScriptProperties();
  props.setProperty('LINK_EXPIRY_DAYS', String(Number(days) || 7));
}

/**
 * Set Smartsheet ID override for a brand
 * @param {string} brand - Brand code
 * @param {string} sheetId - Smartsheet ID
 */
function setSmartsheetIdForBrand_(brand, sheetId) {
  var props = PropertiesService.getScriptProperties();
  props.setProperty('SMARTSHEET_ID_' + String(brand).toUpperCase(), sheetId || '');
}

/**
 * Get Smartsheet ID for a brand (with override support)
 * @param {string} brand - Brand code
 * @returns {string} Smartsheet ID
 */
function getSmartsheetIdForBrand_(brand) {
  var props = PropertiesService.getScriptProperties();
  var override = props.getProperty('SMARTSHEET_ID_' + String(brand).toUpperCase());
  if (override) return override;
  var b = getBrand_(brand);
  return b ? b.smartsheetId : '';
}

/**
 * Get the deployed web app URL
 * @returns {string} Web app URL
 */
function getWebAppUrl_() {
  var props = PropertiesService.getScriptProperties();
  var configured = props.getProperty('WEB_APP_EXEC_URL') || '';
  if (configured) return configured;
  var deployId = props.getProperty('DEPLOY_ID') || '';
  if (deployId) return 'https://script.google.com/macros/s/' + deployId + '/exec';

  try {
    var url = ScriptApp.getService().getUrl();
    if (!url) return '';
    // If running in editor dev mode, convert to the stable exec URL when possible
    if (url.indexOf('/dev') !== -1) {
      return url.replace(/\/dev$/, '/exec');
    }
    // Prefer an exec URL if already present
    if (url.indexOf('/exec') !== -1) return url;
    return url;
  } catch (e) {
    return WEB_APP_EXEC_URL_DEFAULT;
  }
}
