/**
 * ConfigService.gs
 * Single Source of Truth (SSOT) configuration from Google Sheets
 * Interview Booking Uniform System v3
 */

const ConfigService = (() => {
  // Tab and header definitions - SSOT for schema
  const SCHEMA = {
    BRAND_CONFIG: {
      tabName: 'BRAND_CONFIG',
      headers: [
        'Brand', 'Active', 'SmartsheetSheetId', 'EmailColumnId', 'TextForEmailColumnId',
        'InviteTriggerColumnId', 'InviteTriggerValue', 'InviteSentValue',
        'DefaultBookingUrl', 'AdminEmails'
      ],
      defaults: {
        InviteTriggerValue: 'Sideways',
        InviteSentValue: '🔔Sent'
      }
    },
    CL_CODES: {
      tabName: 'CL_CODES',
      headers: ['Brand', 'CL Code', 'Job', 'BookingUrl', 'Active']
    },
    JOBS: {
      tabName: 'JOBS',
      headers: ['Brand', 'Text For Email', 'Active']
    },
    TOKENS: {
      tabName: 'TOKENS',
      headers: [
        'CreatedAt', 'Brand', 'Email', 'EmailHash', 'TextForEmail', 'Otp',
        'OtpExpiryEpoch', 'OtpAttempts', 'OtpStatus', 'Token', 'TokenExpiryEpoch',
        'TokenStatus', 'VerifiedAt', 'UsedAt', 'InviteSig', 'TraceId', 'DebugNotes'
      ]
    },
    LOGS: {
      tabName: 'LOGS',
      headers: ['Timestamp', 'TraceId', 'Brand', 'Event', 'EmailHash', 'Result', 'Message', 'MetaJson']
    }
  };

  // OTP Status enum
  const OTP_STATUS = {
    PENDING: 'PENDING',
    VERIFIED: 'VERIFIED',
    FAILED: 'FAILED',
    EXPIRED: 'EXPIRED',
    SUPERSEDED: 'SUPERSEDED'
  };

  // Token Status enum
  const TOKEN_STATUS = {
    ISSUED: 'ISSUED',
    USED: 'USED',
    REVOKED: 'REVOKED',
    EXPIRED: 'EXPIRED'
  };

  /**
   * Get config spreadsheet
   */
  function getConfigSpreadsheet_() {
    const sheetId = PropertiesService.getScriptProperties().getProperty('CONFIG_SHEET_ID');
    if (!sheetId) {
      throw new Error('CONFIG_SHEET_ID not set in Script Properties');
    }
    return SpreadsheetApp.openById(sheetId);
  }

  /**
   * Get or create a sheet tab with required headers
   */
  function getOrCreateTab_(tabName, headers) {
    const ss = getConfigSpreadsheet_();
    let sheet = ss.getSheetByName(tabName);
    
    if (!sheet) {
      sheet = ss.insertSheet(tabName);
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.setFrozenRows(1);
      // Format header row
      sheet.getRange(1, 1, 1, headers.length)
        .setBackground('#4285f4')
        .setFontColor('#ffffff')
        .setFontWeight('bold');
    }
    
    return sheet;
  }

  /**
   * Validate and enforce all tabs exist with correct headers
   */
  function enforceSchema() {
    const results = [];
    
    for (const [key, config] of Object.entries(SCHEMA)) {
      try {
        const sheet = getOrCreateTab_(config.tabName, config.headers);
        const existingHeaders = sheet.getRange(1, 1, 1, config.headers.length).getValues()[0];
        
        // Check headers match
        const missingHeaders = config.headers.filter((h, i) => existingHeaders[i] !== h);
        if (missingHeaders.length > 0) {
          // Update headers
          sheet.getRange(1, 1, 1, config.headers.length).setValues([config.headers]);
          results.push({ tab: config.tabName, status: 'FIXED', message: 'Headers updated' });
        } else {
          results.push({ tab: config.tabName, status: 'OK', message: 'Schema valid' });
        }
      } catch (e) {
        results.push({ tab: config.tabName, status: 'ERROR', message: e.message });
      }
    }
    
    return results;
  }

  /**
   * Get all rows from a tab as objects
   */
  function getTabData_(tabName, headers) {
    const sheet = getOrCreateTab_(tabName, headers);
    const data = sheet.getDataRange().getValues();
    
    if (data.length <= 1) return [];
    
    const headerRow = data[0];
    return data.slice(1).map((row, idx) => {
      const obj = { _rowIndex: idx + 2 }; // 1-indexed, +1 for header
      headerRow.forEach((h, i) => {
        obj[h] = row[i];
      });
      return obj;
    });
  }

  /**
   * Get active brand configurations
   */
  function getActiveBrands() {
    const all = getTabData_(SCHEMA.BRAND_CONFIG.tabName, SCHEMA.BRAND_CONFIG.headers)
      .map(applyBrandPropertyOverrides_);
    return all.filter(b => String(b.Active).toUpperCase() === 'TRUE' || b.Active === true);
  }

  /**
   * Get brand config by name
   */
  function getBrandConfig(brandName) {
    const all = getTabData_(SCHEMA.BRAND_CONFIG.tabName, SCHEMA.BRAND_CONFIG.headers)
      .map(applyBrandPropertyOverrides_);
    return all.find(b => b.Brand === brandName) || null;
  }

  /**
   * Get jobs for a brand (for dropdown)
   */
  function getJobsForBrand(brandName) {
    const all = getTabData_(SCHEMA.JOBS.tabName, SCHEMA.JOBS.headers);
    return all.filter(j => 
      j.Brand === brandName && 
      (String(j.Active).toUpperCase() === 'TRUE' || j.Active === true)
    ).map(j => j['Text For Email']);
  }

  /**
   * Get booking URL from CL_CODES or default
   */
  function getBookingUrl(brand, textForEmail, clCode) {
    const clCodes = getTabData_(SCHEMA.CL_CODES.tabName, SCHEMA.CL_CODES.headers);
    const brandConfig = getBrandConfig(brand);
    
    // Try CL Code match first
    if (clCode) {
      const match = clCodes.find(c => 
        c.Brand === brand && 
        c['CL Code'] === clCode &&
        (String(c.Active).toUpperCase() === 'TRUE' || c.Active === true)
      );
      if (match && match.BookingUrl) return match.BookingUrl;
    }
    
    // Try TextForEmail match (Job)
    if (textForEmail) {
      const match = clCodes.find(c => 
        c.Brand === brand && 
        c.Job === textForEmail &&
        (String(c.Active).toUpperCase() === 'TRUE' || c.Active === true)
      );
      if (match && match.BookingUrl) return match.BookingUrl;
    }
    
    // Fallback to default
    return brandConfig ? brandConfig.DefaultBookingUrl : null;
  }

  /**
   * Get TOKENS sheet for direct manipulation
   */
  function getTokensSheet() {
    return getOrCreateTab_(SCHEMA.TOKENS.tabName, SCHEMA.TOKENS.headers);
  }

  /**
   * Get LOGS sheet for direct manipulation
   */
  function getLogsSheet() {
    return getOrCreateTab_(SCHEMA.LOGS.tabName, SCHEMA.LOGS.headers);
  }

  /**
   * Get all tokens (for diagnostics)
   */
  function getAllTokens() {
    return getTabData_(SCHEMA.TOKENS.tabName, SCHEMA.TOKENS.headers);
  }

  /**
   * Get recent logs
   */
  function getRecentLogs(count = 50) {
    const all = getTabData_(SCHEMA.LOGS.tabName, SCHEMA.LOGS.headers);
    return all.slice(-count).reverse();
  }

  /**
   * Get all brand configs (for diagnostics)
   */
  function getAllBrandConfigs() {
    return getTabData_(SCHEMA.BRAND_CONFIG.tabName, SCHEMA.BRAND_CONFIG.headers)
      .map(applyBrandPropertyOverrides_);
  }

  /**
   * Hash email for privacy in logs
   */
  function hashEmail(email) {
    if (!email) return '';
    const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, email.toLowerCase().trim());
    return bytes.slice(0, 8).map(b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join('');
  }

  /**
   * Generate trace ID
   */
  function generateTraceId() {
    return Utilities.getUuid().split('-')[0].toUpperCase();
  }

  /**
   * Apply Script Properties overrides for a brand config.
   * Supported keys (brand uppercased, spaces -> underscores):
   * - SMARTSHEET_ID_<BRAND>
   * - COL_EMAIL_ID_<BRAND>
   * - COL_TEXT_FOR_EMAIL_ID_<BRAND>
   */
  function applyBrandPropertyOverrides_(brandConfig) {
    if (!brandConfig || !brandConfig.Brand) return brandConfig;

    const brandKey = String(brandConfig.Brand).trim().toUpperCase().replace(/\s+/g, '_');
    const props = PropertiesService.getScriptProperties();

    const sheetId = props.getProperty(`SMARTSHEET_ID_${brandKey}`);
    const emailColId = props.getProperty(`COL_EMAIL_ID_${brandKey}`);
    const textForEmailColId = props.getProperty(`COL_TEXT_FOR_EMAIL_ID_${brandKey}`);

    if (sheetId) brandConfig.SmartsheetSheetId = sheetId;
    if (emailColId) brandConfig.EmailColumnId = emailColId;
    if (textForEmailColId) brandConfig.TextForEmailColumnId = textForEmailColId;

    return brandConfig;
  }

  // Public API
  return {
    SCHEMA,
    OTP_STATUS,
    TOKEN_STATUS,
    enforceSchema,
    getActiveBrands,
    getBrandConfig,
    getJobsForBrand,
    getBookingUrl,
    getTokensSheet,
    getLogsSheet,
    getAllTokens,
    getRecentLogs,
    getAllBrandConfigs,
    hashEmail,
    generateTraceId
  };
})();
