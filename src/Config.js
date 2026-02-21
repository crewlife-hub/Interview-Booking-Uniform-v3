/**
 * Config.gs
 * Central configuration, script properties, feature flags.
 * CrewLife Interview Bookings Uniform Core
 */

var APP_VERSION = '1.0.0';
var BUILD_ID = '20260221-ui-patch-01';
var CONFIG_SHEET_ID = '1qM3ZEdBsvbEofDH8DayRWcRa4bUcrKQIv8kzKSYZ1AM';

/**
 * CANONICAL exec URL - the ONLY URL that should ever be used for this deployment.
 * Set via Script Properties WEB_APP_EXEC_URL for override, but defaults to this.
 */
var CANONICAL_EXEC_URL = 'https://script.google.com/macros/s/AKfycbwvIDYbgnnDBQJK9FxJdAKq3AXJheYnYi3gcwYQSrp7XdvK9osed2iOo_TAWez_SfxD/exec';

// Legacy aliases - all point to CANONICAL_EXEC_URL
var WEB_APP_EXEC_URL_DEFAULT = CANONICAL_EXEC_URL;
var WEB_APP_EXEC_URL_TARGET = CANONICAL_EXEC_URL;

// Legacy alias - points to CANONICAL_EXEC_URL
var CANONICAL_WEB_APP_URL = CANONICAL_EXEC_URL;

/**
 * Return the web app base URL for email CTAs.
 * REQUIRED: must be configured via Script Properties `WEB_APP_EXEC_URL`.
 * @returns {string}
 */
function getEmailCtaBaseUrl_() {
  var props = PropertiesService.getScriptProperties();
  var propUrl = String(props.getProperty('WEB_APP_EXEC_URL') || '').trim();
  if (!propUrl) {
    throw new Error('Missing Script Property WEB_APP_EXEC_URL. Set it to the deployed web app /exec URL.');
  }
  // Normalize trailing slash only (do not invent/replace URLs)
  if (propUrl.slice(-1) === '/') propUrl = propUrl.slice(0, -1);
  Logger.log('[getEmailCtaBaseUrl_] WEB_APP_EXEC_URL=%s', propUrl);
  return propUrl;
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
 * One-time admin setup to pin the CANONICAL exec URL in Script Properties.
 * Run manually from Apps Script editor: SET_CANONICAL_URL()
 * @returns {string} The configured URL
 */
function SET_CANONICAL_URL() {
  var props = PropertiesService.getScriptProperties();
  props.setProperty('WEB_APP_EXEC_URL', CANONICAL_EXEC_URL);
  Logger.log('WEB_APP_EXEC_URL set to canonical: ' + CANONICAL_EXEC_URL);
  return CANONICAL_EXEC_URL;
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
 * Get the deployed web app URL.
 * Priority: 1) Script Property WEB_APP_EXEC_URL, 2) CANONICAL_EXEC_URL constant.
 * This ensures all links always point to the correct deployment.
 * @returns {string} Web app URL
 */
function getWebAppUrl_() {
  try {
    var props = PropertiesService.getScriptProperties();
    var configured = (props.getProperty('WEB_APP_EXEC_URL') || '').trim();
    if (configured) {
      Logger.log('[getWebAppUrl_] Using Script Property: ' + configured);
      return configured;
    }
  } catch (e) {
    Logger.log('[getWebAppUrl_] Error reading props: ' + e);
  }
  Logger.log('[getWebAppUrl_] Using CANONICAL_EXEC_URL: ' + CANONICAL_EXEC_URL);
  return CANONICAL_EXEC_URL;
}

/**
 * Get the canonical exec base URL (guaranteed stable).
 * Always returns CANONICAL_EXEC_URL - never derived, never changes.
 * @returns {string} Canonical exec URL
 */
function getExecBaseUrl_() {
  return CANONICAL_EXEC_URL;
}
