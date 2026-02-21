/**
 * ConfigService.gs
 * Manages Config Sheet operations: read CL_CODES, JOBS, ensure tabs exist.
 * CrewLife Interview Bookings Uniform Core
 */

var CONFIG_TABS = {
  CL_CODES: {
    name: 'CL_CODES',
    headers: ['Brand', 'CL Code', 'Recruiter Name', 'Recruiter Email', 'Booking Schedule URL', 'Active', 'Last Updated']
  },
  JOBS: {
    name: 'JOBS',
    headers: ['Brand', 'Job Title', 'Default CL Code', 'Department', 'Active']
  },
  TOKENS: {
    name: 'TOKENS',
    headers: ['Token', 'Email', 'Email Hash', 'Text For Email', 'Brand', 'CL Code', 'Status', 'Expiry', 'Created At', 'Used At', 'Issued By', 'Trace ID', 'OTP', 'Attempts', 'Position Link']
  },
  LOGS: {
    name: 'LOGS',
    headers: ['Timestamp', 'Trace ID', 'Brand', 'Email (Masked)', 'Event', 'Details', 'Actor']
  },
  BRAND_CONFIG: {
    name: 'BRAND_CONFIG',
    headers: ['Brand', 'Smartsheet ID', 'Token Expiry Hours', 'Active', 'Admin Emails']
  }
};

/**
 * Ensure all required tabs exist in config sheet with correct headers
 */
function ensureConfigSheetTabs_() {
  var cfg = getConfig_();
  var ss;
  try {
    ss = SpreadsheetApp.openById(cfg.CONFIG_SHEET_ID);
  } catch (e) {
    Logger.log('ConfigService: Cannot open config sheet: ' + e);
    return { ok: false, error: 'Cannot open config sheet' };
  }

  var created = [];
  for (var key in CONFIG_TABS) {
    var tabDef = CONFIG_TABS[key];
    var sheet = ss.getSheetByName(tabDef.name);
    if (!sheet) {
      sheet = ss.insertSheet(tabDef.name);
      sheet.getRange(1, 1, 1, tabDef.headers.length).setValues([tabDef.headers]);
      sheet.getRange(1, 1, 1, tabDef.headers.length).setFontWeight('bold');
      sheet.setFrozenRows(1);
      created.push(tabDef.name);
      Logger.log('ConfigService: Created tab ' + tabDef.name);
    }
  }
  if (created.length > 0) {
    logEvent_(generateTraceId_(), '', '', 'CONFIG_TABS_CREATED', { tabs: created });
  }
  return { ok: true, created: created };
}

/**
 * Reset (delete and recreate) a specific config tab with correct headers.
 * Use this to fix header mismatches.
 * @param {string} tabName - Name of the tab to reset (e.g., 'TOKENS')
 * @returns {Object} Result
 */
function resetConfigTab_(tabName) {
  var cfg = getConfig_();
  var ss;
  try {
    ss = SpreadsheetApp.openById(cfg.CONFIG_SHEET_ID);
  } catch (e) {
    return { ok: false, error: 'Cannot open config sheet: ' + e };
  }
  
  var tabDef = null;
  for (var key in CONFIG_TABS) {
    if (CONFIG_TABS[key].name === tabName) {
      tabDef = CONFIG_TABS[key];
      break;
    }
  }
  if (!tabDef) {
    return { ok: false, error: 'Unknown tab: ' + tabName };
  }
  
  // Delete existing sheet if present
  var existing = ss.getSheetByName(tabName);
  if (existing) {
    ss.deleteSheet(existing);
    Logger.log('resetConfigTab_: Deleted existing ' + tabName);
  }
  
  // Create fresh sheet with correct headers
  var sheet = ss.insertSheet(tabName);
  sheet.getRange(1, 1, 1, tabDef.headers.length).setValues([tabDef.headers]);
  sheet.getRange(1, 1, 1, tabDef.headers.length).setFontWeight('bold');
  sheet.setFrozenRows(1);
  
  Logger.log('resetConfigTab_: Created fresh ' + tabName + ' with headers: ' + tabDef.headers.join(', '));
  return { ok: true, headers: tabDef.headers };
}

/**
 * Reset all config tabs (deletes data!)
 * @returns {Object} Result
 */
function resetAllConfigTabs_() {
  var results = {};
  for (var key in CONFIG_TABS) {
    results[CONFIG_TABS[key].name] = resetConfigTab_(CONFIG_TABS[key].name);
  }
  return results;
}

/**
 * Reset the entire config sheet to a clean, known-good state.
 * - Deletes tabs not in CONFIG_TABS
 * - Recreates required tabs with correct headers
 * WARNING: This deletes data in all config tabs.
 * @returns {Object} Result summary
 */
function resetConfigSheet_() {
  var cfg = getConfig_();
  var ss;
  try {
    ss = SpreadsheetApp.openById(cfg.CONFIG_SHEET_ID);
  } catch (e) {
    return { ok: false, error: 'Cannot open config sheet: ' + e };
  }

  var allowed = {};
  for (var key in CONFIG_TABS) {
    allowed[CONFIG_TABS[key].name] = true;
  }

  // Delete unknown tabs
  var removed = [];
  var sheets = ss.getSheets();
  for (var i = sheets.length - 1; i >= 0; i--) {
    var name = sheets[i].getName();
    if (!allowed[name]) {
      ss.deleteSheet(sheets[i]);
      removed.push(name);
    }
  }

  // Recreate required tabs
  var recreated = resetAllConfigTabs_();

  return { ok: true, removedTabs: removed, recreated: recreated };
}

/**
 * Get config spreadsheet
 * @returns {Spreadsheet}
 */
function getConfigSheet_() {
  var cfg = getConfig_();
  return SpreadsheetApp.openById(cfg.CONFIG_SHEET_ID);
}

/**
 * Get all CL codes for a brand
 * @param {string} brand - Brand code
 * @returns {Array} Array of CL code objects
 */
function getCLCodesForBrand_(brand) {
  var ss = getConfigSheet_();
  var sheet = ss.getSheetByName('CL_CODES');
  if (!sheet) return [];
  
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  
  var headers = data[0];
  var brandIdx = headers.indexOf('Brand');
  var clCodeIdx = headers.indexOf('CL Code');
  var recruiterNameIdx = headers.indexOf('Recruiter Name');
  var recruiterEmailIdx = headers.indexOf('Recruiter Email');
  var bookingUrlIdx = headers.indexOf('Booking Schedule URL');
  var activeIdx = headers.indexOf('Active');
  
  var results = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (String(row[brandIdx]).toUpperCase() === String(brand).toUpperCase()) {
      results.push({
        brand: row[brandIdx],
        clCode: row[clCodeIdx],
        recruiterName: row[recruiterNameIdx],
        recruiterEmail: row[recruiterEmailIdx],
        bookingUrl: row[bookingUrlIdx],
        active: row[activeIdx] === true || String(row[activeIdx]).toUpperCase() === 'TRUE',
        rowIndex: i + 1
      });
    }
  }
  return results;
}

/**
 * Get CL code details
 * @param {string} brand - Brand code
 * @param {string} clCode - CL code
 * @returns {Object|null} CL code details
 */
function getCLCodeDetails_(brand, clCode) {
  var codes = getCLCodesForBrand_(brand);
  for (var i = 0; i < codes.length; i++) {
    if (String(codes[i].clCode).toUpperCase() === String(clCode).toUpperCase()) {
      return codes[i];
    }
  }
  return null;
}

/**
 * Get all jobs for a brand
 * @param {string} brand - Brand code
 * @returns {Array} Array of job objects
 */
function getJobsForBrand_(brand) {
  var ss = getConfigSheet_();
  var sheet = ss.getSheetByName('JOBS');
  if (!sheet) return [];
  
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  
  var headers = data[0];
  var brandIdx = headers.indexOf('Brand');
  var jobTitleIdx = headers.indexOf('Job Title');
  var defaultCLIdx = headers.indexOf('Default CL Code');
  var deptIdx = headers.indexOf('Department');
  var activeIdx = headers.indexOf('Active');
  
  var results = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (String(row[brandIdx]).toUpperCase() === String(brand).toUpperCase()) {
      results.push({
        brand: row[brandIdx],
        jobTitle: row[jobTitleIdx],
        defaultCLCode: row[defaultCLIdx],
        department: row[deptIdx],
        active: row[activeIdx] === true || String(row[activeIdx]).toUpperCase() === 'TRUE',
        rowIndex: i + 1
      });
    }
  }
  return results;
}

/**
 * Resolve CL code from Text For Email
 * @param {string} brand - Brand code
 * @param {string} textForEmail - Text For Email value (e.g. "Shop Attendant - CL200")
 * @returns {Object} Resolution result with clCode and bookingUrl
 */
function resolveCLCodeFromTextForEmail_(brand, textForEmail) {
  if (!textForEmail) {
    return { ok: false, error: 'Text For Email is empty' };
  }
  
  // Try to extract CL code directly from text (e.g. "Job Title - CL200")
  var clMatch = String(textForEmail).match(/CL\d+/i);
  var extractedCL = clMatch ? clMatch[0].toUpperCase() : null;
  
  // Look up CL code details
  if (extractedCL) {
    var clDetails = getCLCodeDetails_(brand, extractedCL);
    if (clDetails) {
      if (!clDetails.active) {
        return { ok: false, error: 'CL code ' + extractedCL + ' is inactive', clCode: extractedCL };
      }
      if (!clDetails.bookingUrl) {
        return { ok: false, error: 'No booking URL configured for ' + extractedCL, clCode: extractedCL };
      }
      return {
        ok: true,
        clCode: extractedCL,
        recruiterName: clDetails.recruiterName,
        recruiterEmail: clDetails.recruiterEmail,
        bookingUrl: clDetails.bookingUrl
      };
    }
  }
  
  // Try to match job title
  var jobs = getJobsForBrand_(brand);
  for (var i = 0; i < jobs.length; i++) {
    if (String(textForEmail).toLowerCase().indexOf(String(jobs[i].jobTitle).toLowerCase()) !== -1) {
      var jobCL = jobs[i].defaultCLCode;
      var clDet = getCLCodeDetails_(brand, jobCL);
      if (clDet && clDet.active && clDet.bookingUrl) {
        return {
          ok: true,
          clCode: jobCL,
          recruiterName: clDet.recruiterName,
          recruiterEmail: clDet.recruiterEmail,
          bookingUrl: clDet.bookingUrl,
          matchedJob: jobs[i].jobTitle
        };
      }
    }
  }
  
  return { ok: false, error: 'Could not resolve CL code from: ' + textForEmail };
}

/**
 * Update CL code booking URL
 * @param {string} brand - Brand code
 * @param {string} clCode - CL code
 * @param {string} newUrl - New booking URL
 * @returns {Object} Result
 */
function updateCLCodeBookingUrl_(brand, clCode, newUrl) {
  var ss = getConfigSheet_();
  var sheet = ss.getSheetByName('CL_CODES');
  if (!sheet) return { ok: false, error: 'CL_CODES tab not found' };
  
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var brandIdx = headers.indexOf('Brand');
  var clCodeIdx = headers.indexOf('CL Code');
  var bookingUrlIdx = headers.indexOf('Booking Schedule URL');
  var lastUpdatedIdx = headers.indexOf('Last Updated');
  
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][brandIdx]).toUpperCase() === String(brand).toUpperCase() &&
        String(data[i][clCodeIdx]).toUpperCase() === String(clCode).toUpperCase()) {
      sheet.getRange(i + 1, bookingUrlIdx + 1).setValue(newUrl);
      if (lastUpdatedIdx >= 0) {
        sheet.getRange(i + 1, lastUpdatedIdx + 1).setValue(new Date());
      }
      return { ok: true, updated: true };
    }
  }
  return { ok: false, error: 'CL code not found' };
}

/**
 * Get brand config overrides from BRAND_CONFIG tab
 * @param {string} brand - Brand code
 * @returns {Object} Brand config
 */
function getBrandConfigOverrides_(brand) {
  var ss = getConfigSheet_();
  var sheet = ss.getSheetByName('BRAND_CONFIG');
  if (!sheet) return {};
  
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return {};
  
  var headers = data[0];
  var brandIdx = headers.indexOf('Brand');
  var smartsheetIdx = headers.indexOf('Smartsheet ID');
  var expiryIdx = headers.indexOf('Token Expiry Hours');
  var activeIdx = headers.indexOf('Active');
  var adminIdx = headers.indexOf('Admin Emails');
  
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][brandIdx]).toUpperCase() === String(brand).toUpperCase()) {
      return {
        smartsheetId: data[i][smartsheetIdx] || '',
        tokenExpiryHours: Number(data[i][expiryIdx]) || null,
        active: data[i][activeIdx] === true || String(data[i][activeIdx]).toUpperCase() === 'TRUE',
        adminEmails: String(data[i][adminIdx] || '').split(',').map(function(e) { return e.trim(); }).filter(function(e) { return e; })
      };
    }
  }
  return {};
}
/**
 * Get all active CL codes for a brand (for landing page dropdown)
 * @param {string} brand - Brand code
 * @returns {Array} Array of CL code strings
 */
function getAllCLCodesForBrand_(brand) {
  var codes = getCLCodesForBrand_(brand);
  var result = [];
  for (var i = 0; i < codes.length; i++) {
    if (codes[i].active) {
      result.push(codes[i].clCode);
    }
  }
  result.sort();
  return result;
}

/**
 * Get all active job titles for a brand (for landing page dropdown)
 * @param {string} brand - Brand code
 * @returns {Array} Array of job title strings
 */
function getAllJobTitlesForBrand_(brand) {
  var jobs = getJobsForBrand_(brand);
  var result = [];
  for (var i = 0; i < jobs.length; i++) {
    if (jobs[i].active && result.indexOf(jobs[i].jobTitle) === -1) {
      result.push(jobs[i].jobTitle);
    }
  }
  result.sort();
  return result;
}