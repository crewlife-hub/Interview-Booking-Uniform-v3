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
    featureFlags: {
      otpEnabled: true,
      scannerProtection: true
    }
  },
  SEACHEFS: {
    name: 'Seachefs',
    code: 'SEACHEFS',
    smartsheetId: '356995853930372',
    emailColumnId: '2951912162545540',
    textForEmailColumnId: '6048136906362756',
    emailColumn: 'Email',
    textForEmailColumn: 'Text For Email',
    featureFlags: {
      otpEnabled: true,
      scannerProtection: true
    }
  },
  CPD: {
    name: 'CPD',
    code: 'CPD',
    smartsheetId: 'PLACEHOLDER_CPD_SMARTSHEET_ID', // ← REPLACE WITH ACTUAL ID
    emailColumn: 'Email',
    textForEmailColumn: 'Text For Email',
    featureFlags: {
      otpEnabled: true,
      scannerProtection: true
    }
  }
};

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
 * Validate if brand exists
 * @param {string} key - Brand code
 * @returns {boolean} True if brand exists
 */
function isValidBrand_(key) {
  return getBrand_(key) !== null;
}
