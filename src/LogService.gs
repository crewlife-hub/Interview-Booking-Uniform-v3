/**
 * LogService.gs
 * Structured logging to LOGS tab and Logger.
 * CrewLife Interview Bookings Uniform Core
 */

/**
 * Log an event to the LOGS sheet and Logger
 * @param {string} traceId - Trace ID for request correlation
 * @param {string} brand - Brand code
 * @param {string} email - Email (will be masked)
 * @param {string} event - Event name
 * @param {Object} details - Additional details object
 * @param {string} actor - Optional actor (admin email or 'SYSTEM')
 */
function logEvent_(traceId, brand, email, event, details, actor) {
  try {
    var cfg = getConfig_();
    var detailsObj = details && typeof details === 'object' ? details : { message: String(details || '') };
    var emailHash = email ? computeEmailHash_(email) : '';
    var tokenLast6 = detailsObj.tokenLast6 || (detailsObj.token ? String(detailsObj.token).slice(-6) : '');
    var otpLast2 = detailsObj.otpLast2 || (detailsObj.otp ? String(detailsObj.otp).slice(-2) : '');
    var result = detailsObj.result || (detailsObj.ok === true ? 'OK' : (detailsObj.ok === false ? 'ERROR' : ''));
    var message = detailsObj.message || detailsObj.error || '';
    var functionName = detailsObj.functionName || detailsObj.function || '';

    var row = [
      new Date(),           // Timestamp
      traceId || '',        // Trace ID
      brand || '',          // Brand
      event || '',          // Event
      emailHash,            // Email Hash
      tokenLast6,           // Token Last6
      otpLast2,             // OTP Last2
      result,               // Result
      message,              // Message
      functionName          // Function
    ];
    
    // Log to sheet
    var sheetId = cfg.LOG_SHEET_ID || cfg.CONFIG_SHEET_ID;
    if (sheetId) {
      try {
        var ss = SpreadsheetApp.openById(sheetId);
        var sheet = ss.getSheetByName('LOGS');
        if (sheet) {
          sheet.appendRow(row);
        } else {
          // Create LOGS sheet if missing
          sheet = ss.insertSheet('LOGS');
          sheet.appendRow(['Timestamp', 'Trace ID', 'Brand', 'Email (Masked)', 'Event', 'Details', 'Actor']);
          sheet.getRange(1, 1, 1, 7).setFontWeight('bold');
          sheet.setFrozenRows(1);
          sheet.appendRow(row);
        }
      } catch (e) {
        Logger.log('LogService: Error writing to sheet: ' + e);
      }
    }
    
    // Always log to Logger as backup
    Logger.log('[' + event + '] ' + brand + ' | ' + emailHash + ' | ' + JSON.stringify(detailsObj));
    
  } catch (e) {
    Logger.log('LogService.logEvent_ failed: ' + e);
  }
}

/**
 * Hash email to hex SHA-256
 * @param {string} email - Email
 * @returns {string} Hex hash
 */
function computeEmailHash_(email) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(email).toLowerCase().trim());
  return bytes.map(function(b) { return ('0' + (b & 0xFF).toString(16)).slice(-2); }).join('');
}

/**
 * Log with admin actor
 * @param {string} traceId - Trace ID
 * @param {string} brand - Brand code
 * @param {string} email - Candidate email
 * @param {string} event - Event name
 * @param {Object} details - Details
 * @param {string} adminEmail - Admin email
 */
function logAdminEvent_(traceId, brand, email, event, details, adminEmail) {
  logEvent_(traceId, brand, email, event, details, adminEmail);
}

/**
 * Get structured log entry
 * @param {string} event - Event type
 * @param {Object} data - Log data
 * @returns {Object} Structured log object
 */
function createLogEntry_(event, data) {
  return {
    timestamp: new Date().toISOString(),
    event: event,
    data: data
  };
}
