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
    var masked = maskEmail_(email);
    var detailsJson = JSON.stringify(details || {});
    var actorValue = actor || (email ? 'SYSTEM' : '');
    
    // Try to get current user as actor if not provided
    if (!actorValue) {
      try {
        var user = Session.getActiveUser();
        if (user && user.getEmail()) {
          actorValue = user.getEmail();
        }
      } catch (e) {
        actorValue = 'SYSTEM';
      }
    }
    
    var row = [
      new Date(),           // Timestamp
      traceId || '',        // Trace ID
      brand || '',          // Brand
      masked,               // Email (Masked)
      event || '',          // Event
      detailsJson,          // Details
      actorValue            // Actor
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
    Logger.log('[' + event + '] ' + brand + ' | ' + masked + ' | ' + detailsJson);
    
  } catch (e) {
    Logger.log('LogService.logEvent_ failed: ' + e);
  }
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

/**
 * Retrieve log rows for a given traceId from LOGS tab
 * @param {string} traceId
 * @returns {Object} { ok: true, entries: [ { Timestamp, Trace ID, Brand, Email (Masked), Event, Details, Actor } ] }
 */
function getLogsForTraceId_(traceId) {
  var cfg = getConfig_();
  var sheetId = cfg.LOG_SHEET_ID || cfg.CONFIG_SHEET_ID;
  if (!sheetId) return { ok: false, error: 'Config sheet not set' };
  try {
    var ss = SpreadsheetApp.openById(sheetId);
    var sheet = ss.getSheetByName('LOGS');
    if (!sheet) return { ok: false, error: 'LOGS sheet not found' };
    var data = sheet.getDataRange().getValues();
    var headers = data[0] || [];
    var results = [];
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][1]) === String(traceId)) {
        var row = {};
        for (var j = 0; j < headers.length; j++) row[headers[j]] = data[i][j];
        results.push(row);
      }
    }
    return { ok: true, entries: results };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
