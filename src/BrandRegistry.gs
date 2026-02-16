/**
 * BrandRegistry.gs
 * Central registry for brands with Smartsheet IDs and feature flags.
 * CrewLife Interview Bookings Uniform Core
 * 
 * PLACEHOLDER VALUES: Replace smartsheetId with actual Smartsheet IDs for each brand.
 */

var BRANDS = {
  ROYAL: {
    name: 'Royal Caribbean',
    code: 'ROYAL',
    smartsheetId: '118517627047812',
    emailColumnId: '8026953069842308',
    textForEmailColumnId: '1126793421213572',
    emailColumn: 'Email',
    textForEmailColumn: 'Text For Email',
    active: true,
    featureFlags: {
      otpEnabled: true,
      scannerProtection: true
    }
  },
  COSTA: {
    name: 'Costa Cruises',
    code: 'COSTA',
    smartsheetId: '1944430555647876',
    emailColumnId: '2945074574610308',
    textForEmailColumnId: '6041299318427524',
    emailColumn: 'Email',
    textForEmailColumn: 'Text For Email',
    active: true,
    featureFlags: {
      otpEnabled: true,
      scannerProtection: true
    }
  },
  SEACHEFS: {
    name: 'Seachefs',
    code: 'SEACHEFS',
    smartsheetId: '8560707416051588',
    emailColumnId: '2951912162545540',
    textForEmailColumnId: '6048136906362756',
    emailColumn: 'Email',
    textForEmailColumn: 'Text For Email',
    active: true,
    featureFlags: {
      otpEnabled: true,
      scannerProtection: true
    }
  },
  CPD: {
    name: 'CPD',
    code: 'CPD',
    smartsheetId: '',
    emailColumnId: '',
    textForEmailColumnId: '',
    emailColumn: 'Email',
    textForEmailColumn: 'Text For Email',
    active: false,
    featureFlags: {
      otpEnabled: false,
      scannerProtection: true
    }
  }
};

/**
 * Get merged brand config (base + BRAND_CONFIG + Script Properties overrides)
 * @param {string} key - Brand code
 * @returns {Object|null} Brand config or null
 */
function getBrandConfig_(key) {
  var base = getBrand_(key);
  if (!base) return null;
  var k = String(key).toUpperCase().trim();
  var overrides = getBrandConfigOverrides_(k) || {};
  var props = PropertiesService.getScriptProperties();

  var prop = function(name) {
    return props.getProperty(name + '_' + k) || props.getProperty('BRAND_' + k + '_' + name) || '';
  };

  return {
    name: base.name,
    code: base.code,
    smartsheetId: prop('SMARTSHEET_ID') || overrides.smartsheetId || base.smartsheetId,
    emailColumnId: prop('EMAIL_COLUMN_ID') || overrides.emailColumnId || base.emailColumnId,
    textForEmailColumnId: prop('TEXT_FOR_EMAIL_COLUMN_ID') || overrides.textForEmailColumnId || base.textForEmailColumnId,
    triggerColumnId: prop('TRIGGER_COLUMN_ID') || overrides.triggerColumnId || '',
    triggerColumnTitle: prop('TRIGGER_COLUMN_TITLE') || overrides.triggerColumnTitle || '',
    inviteSentAtColumnTitle: prop('INVITE_SENT_AT_COLUMN_TITLE') || overrides.inviteSentAtColumnTitle || '',
    defaultClCode: prop('DEFAULT_CL_CODE') || overrides.defaultClCode || '',
    defaultBookingUrl: prop('DEFAULT_BOOKING_URL') || overrides.defaultBookingUrl || '',
    tokenExpiryHours: overrides.tokenExpiryHours || null,
    active: overrides.active !== undefined ? overrides.active : base.active,
    emailColumn: base.emailColumn,
    textForEmailColumn: base.textForEmailColumn,
    featureFlags: base.featureFlags
  };
}

/**
 * Get brand configuration by key
 * @param {string} key - Brand code (ROYAL, COSTA, SEACHEFS, CPD)
 * @returns {Object|null} Brand config or null
 */
function getBrand_(key) {
  if (!key) return null;
  var k = String(key).toUpperCase().trim();
  return BRANDS[k] || null;
}

/**
 * Get all brand codes
 * @returns {Array} Array of brand codes
 */
function getAllBrandCodes_() {
  return Object.keys(BRANDS);
}

/**
 * Get all active brand codes
 * @returns {Array} Array of active brand codes
 */
function getActiveBrandCodes_() {
  return Object.keys(BRANDS).filter(function(k) {
    return !!BRANDS[k].active;
  });
}

/**
 * Validate if brand exists
 * @param {string} key - Brand code
 * @returns {boolean} True if brand exists
 */
function isValidBrand_(key) {
  return getBrand_(key) !== null;
}
