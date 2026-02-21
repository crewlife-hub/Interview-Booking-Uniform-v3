/**
 * Config.gs
 * Central configuration, script properties, feature flags.
 * CrewLife Interview Bookings Uniform Core
 */

var APP_VERSION = '1.0.0';
var CONFIG_SHEET_ID = '1qM3ZEdBsvbEofDH8DayRWcRa4bUcrKQIv8kzKSYZ1AM';

/**
 * CANONICAL web app exec URL — the single hard-coded fallback.
 * Script Property `WEB_APP_EXEC_URL` takes precedence when set.
 * All email CTAs and page links resolve through getExecBaseUrl_().
 */
var CANONICAL_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbx-IEEieMEvXPf0cXC_R_y6KKtWOMkA2nXJkU1mu8XlIMY7MnCn5eamrzjzvre0frZm0Q/exec';

/**
 * Single source of truth for the deployed web app /exec URL.
 * Resolution order:
 *   1. Script Property  WEB_APP_EXEC_URL  (set via admin panel or setWebAppExecUrl_)
 *   2. Hard-coded       CANONICAL_WEB_APP_URL
 * NEVER throws — always returns a usable URL.
 * @returns {string} Full /exec URL (no trailing slash)
 */
function getExecBaseUrl_() {
  try {
    var propUrl = String(
      PropertiesService.getScriptProperties().getProperty('WEB_APP_EXEC_URL') || ''
    ).trim();
    if (propUrl) {
      if (propUrl.slice(-1) === '/') propUrl = propUrl.slice(0, -1);
      return propUrl;
    }
  } catch (e) {
    Logger.log('[getExecBaseUrl_] Script Properties read error: %s', e);
  }
  return CANONICAL_WEB_APP_URL;
}

/**
 * Return the web app base URL for email CTAs.
 * Delegates to getExecBaseUrl_() — never throws.
 * @returns {string}
 */
function getEmailCtaBaseUrl_() {
  var url = getExecBaseUrl_();
  Logger.log('[getEmailCtaBaseUrl_] resolved=%s', url);
  return url;
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
  props.setProperty('WEB_APP_EXEC_URL', CANONICAL_WEB_APP_URL);
  Logger.log('WEB_APP_EXEC_URL set to: ' + CANONICAL_WEB_APP_URL);
  return CANONICAL_WEB_APP_URL;
}

/**
 * Admin fix helper to force WEB_APP_EXEC_URL and log the resolved final URL.
 * Run manually from Apps Script editor: FIX_SET_WEB_APP_EXEC_URL()
 * @returns {string} Final URL from getWebAppUrl_()
 */
function FIX_SET_WEB_APP_EXEC_URL() {
  var props = PropertiesService.getScriptProperties();
  props.setProperty('WEB_APP_EXEC_URL', CANONICAL_WEB_APP_URL);
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
 * Get the deployed web app URL — for page links, verify URLs, etc.
 * Delegates to getExecBaseUrl_() so every path in the app resolves
 * the same canonical URL.
 * @returns {string} Web app URL
 */
function getWebAppUrl_() {
  return getExecBaseUrl_();
}
