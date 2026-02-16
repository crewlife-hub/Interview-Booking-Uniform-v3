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
    headers: ['Brand', 'Text For Email', 'Job Title', 'Default CL Code', 'Department', 'Active']
  },
  TOKENS: {
    name: 'TOKENS',
    headers: [
      'Created At',
      'Brand',
      'Email',
      'Email Hash',
      'Text For Email',
      'CL Code',
      'OTP',
      'OTP Expiry Epoch',
      'OTP Attempts',
      'OTP Status',
      'Token',
      'Token Expiry Epoch',
      'Token Status',
      'Verified At',
      'Used At',
      'Invite Sig',
      'Trace ID',
      'Debug Notes'
    ]
  },
  LOGS: {
    name: 'LOGS',
    headers: ['Timestamp', 'Trace ID', 'Brand', 'Event', 'Email Hash', 'Token Last6', 'OTP Last2', 'Result', 'Message', 'Function']
  },
  BRAND_CONFIG: {
    name: 'BRAND_CONFIG',
    headers: [
      'Brand',
      'Smartsheet ID',
      'Email Column ID',
      'Text For Email Column ID',
      'Trigger Column ID',
      'Trigger Column Title',
      'Invite Sent At Column Title',
      'Default CL Code',
      'Default Booking URL',
      'Token Expiry Hours',
      'Active',
      'Admin Emails'
    ]
  }
};

/**
 * Ensure required headers exist in a sheet (append missing headers)
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - Sheet
 * @param {Array} headers - Required headers
 */
function ensureSheetHeaders_(sheet, headers) {
  var existing = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var updated = false;
  headers.forEach(function(h) {
    if (existing.indexOf(h) === -1) {
      sheet.getRange(1, existing.length + 1).setValue(h);
      existing.push(h);
      updated = true;
    }
  });
  if (updated) {
    sheet.getRange(1, 1, 1, existing.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
}

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
    } else {
      ensureSheetHeaders_(sheet, tabDef.headers);
    }
  }
  if (created.length > 0) {
    logEvent_(generateTraceId_(), '', '', 'CONFIG_TABS_CREATED', { tabs: created });
  }
  return { ok: true, created: created };
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
  var textForEmailIdx = headers.indexOf('Text For Email');
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
        textForEmail: row[textForEmailIdx],
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
  var emailColIdx = headers.indexOf('Email Column ID');
  var textColIdx = headers.indexOf('Text For Email Column ID');
  var triggerColIdx = headers.indexOf('Trigger Column ID');
  var triggerTitleIdx = headers.indexOf('Trigger Column Title');
  var inviteSentIdx = headers.indexOf('Invite Sent At Column Title');
  var defaultClIdx = headers.indexOf('Default CL Code');
  var defaultBookingIdx = headers.indexOf('Default Booking URL');
  var expiryIdx = headers.indexOf('Token Expiry Hours');
  var activeIdx = headers.indexOf('Active');
  var adminIdx = headers.indexOf('Admin Emails');
  
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][brandIdx]).toUpperCase() === String(brand).toUpperCase()) {
      return {
        smartsheetId: data[i][smartsheetIdx] || '',
        emailColumnId: data[i][emailColIdx] || '',
        textForEmailColumnId: data[i][textColIdx] || '',
        triggerColumnId: data[i][triggerColIdx] || '',
        triggerColumnTitle: data[i][triggerTitleIdx] || '',
        inviteSentAtColumnTitle: data[i][inviteSentIdx] || '',
        defaultClCode: data[i][defaultClIdx] || '',
        defaultBookingUrl: data[i][defaultBookingIdx] || '',
        tokenExpiryHours: Number(data[i][expiryIdx]) || null,
        active: data[i][activeIdx] === true || String(data[i][activeIdx]).toUpperCase() === 'TRUE',
        adminEmails: String(data[i][adminIdx] || '').split(',').map(function(e) { return e.trim(); }).filter(function(e) { return e; })
      };
    }
  }
  return {};
}
