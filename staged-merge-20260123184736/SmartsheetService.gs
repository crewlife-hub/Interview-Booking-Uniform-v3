/**
 * SmartsheetService.gs
 * Read-only Smartsheet API integration.
 * CrewLife Interview Bookings Uniform Core
 */

var SMARTSHEET_API_BASE = 'https://api.smartsheet.com/2.0';

/**
 * Search for a candidate in Smartsheet by Email + Text For Email
 * @param {string} brand - Brand code
 * @param {string} email - Candidate email
 * @param {string} textForEmail - Text For Email value
 * @returns {Object} Search result
 */
function searchCandidateInSmartsheet_(brand, email, textForEmail) {
  var cfg = getConfig_();
  var apiToken = cfg.SMARTSHEET_API_TOKEN;
  
  if (!apiToken) {
    return { ok: false, error: 'Smartsheet API token not configured', code: 'NO_API_TOKEN' };
  }
  
  var sheetId = getSmartsheetIdForBrand_(brand);
  if (!sheetId || sheetId.indexOf('PLACEHOLDER') === 0) {
    return { ok: false, error: 'Smartsheet ID not configured for brand: ' + brand, code: 'NO_SHEET_ID' };
  }
  
  try {
    var b = getBrand_(brand);
    var emailColumn = b ? b.emailColumn : 'Email';
    var textForEmailColumn = b ? b.textForEmailColumn : 'Text For Email';
    
    // Fetch sheet data
    var url = SMARTSHEET_API_BASE + '/sheets/' + sheetId;
    var options = {
      method: 'get',
      headers: {
        'Authorization': 'Bearer ' + apiToken,
        'Content-Type': 'application/json'
      },
      muteHttpExceptions: true
    };
    
    var response = UrlFetchApp.fetch(url, options);
    var code = response.getResponseCode();
    
    if (code !== 200) {
      Logger.log('Smartsheet API error: ' + code + ' - ' + response.getContentText());
      return { ok: false, error: 'Smartsheet API error: ' + code, code: 'API_ERROR' };
    }
    
    var data = JSON.parse(response.getContentText());
    var columns = data.columns || [];
    var rows = data.rows || [];
    
    // Find column indices
    var emailColId = null;
    var textForEmailColId = null;
    var columnMap = {};
    
    for (var i = 0; i < columns.length; i++) {
      columnMap[columns[i].id] = columns[i].title;
      if (columns[i].title === emailColumn) {
        emailColId = columns[i].id;
      }
      if (columns[i].title === textForEmailColumn) {
        textForEmailColId = columns[i].id;
      }
    }
    
    if (!emailColId) {
      return { ok: false, error: 'Email column not found in Smartsheet', code: 'COLUMN_NOT_FOUND' };
    }
    if (!textForEmailColId) {
      return { ok: false, error: 'Text For Email column not found in Smartsheet', code: 'COLUMN_NOT_FOUND' };
    }
    
    // Search for exact match
    var matches = [];
    var partialMatches = [];
    
    for (var r = 0; r < rows.length; r++) {
      var row = rows[r];
      var cells = row.cells || [];
      var rowEmail = '';
      var rowTextForEmail = '';
      var rowData = { rowId: row.id };
      
      for (var c = 0; c < cells.length; c++) {
        var cell = cells[c];
        var colTitle = columnMap[cell.columnId];
        rowData[colTitle] = cell.displayValue || cell.value || '';
        
        if (cell.columnId === emailColId) {
          rowEmail = String(cell.displayValue || cell.value || '').toLowerCase().trim();
        }
        if (cell.columnId === textForEmailColId) {
          rowTextForEmail = String(cell.displayValue || cell.value || '').trim();
        }
      }
      
      var emailMatch = rowEmail === String(email).toLowerCase().trim();
      var textMatch = rowTextForEmail === String(textForEmail).trim();
      
      if (emailMatch && textMatch) {
        matches.push(rowData);
      } else if (emailMatch) {
        partialMatches.push({
          data: rowData,
          textForEmail: rowTextForEmail
        });
      }
    }
    
    if (matches.length > 0) {
      return {
        ok: true,
        found: true,
        exactMatch: true,
        candidate: matches[0],
        matchCount: matches.length
      };
    }
    
    if (partialMatches.length > 0) {
      return {
        ok: true,
        found: true,
        exactMatch: false,
        candidates: partialMatches.map(function(p) { return p.data; }),
        suggestedTextForEmail: partialMatches.map(function(p) { return p.textForEmail; }),
        matchCount: partialMatches.length
      };
    }
    
    return {
      ok: true,
      found: false,
      exactMatch: false,
      matchCount: 0
    };
    
  } catch (e) {
    Logger.log('SmartsheetService error: ' + e);
    return { ok: false, error: 'Smartsheet lookup failed: ' + String(e), code: 'EXCEPTION' };
  }
}

/**
 * Get candidate suggestions by email only (for partial lookup)
 * @param {string} brand - Brand code
 * @param {string} email - Candidate email
 * @returns {Object} Suggestions result
 */
function getCandidateSuggestions_(brand, email) {
  return searchCandidateInSmartsheet_(brand, email, '');
}

/**
 * Test Smartsheet connection for a brand
 * @param {string} brand - Brand code
 * @returns {Object} Connection test result
 */
function testSmartsheetConnection_(brand) {
  var cfg = getConfig_();
  var apiToken = cfg.SMARTSHEET_API_TOKEN;
  
  if (!apiToken) {
    return { ok: false, error: 'API token not configured' };
  }
  
  var sheetId = getSmartsheetIdForBrand_(brand);
  if (!sheetId || sheetId.indexOf('PLACEHOLDER') === 0) {
    return { ok: false, error: 'Smartsheet ID not configured for brand' };
  }
  
  try {
    var url = SMARTSHEET_API_BASE + '/sheets/' + sheetId + '?pageSize=1';
    var options = {
      method: 'get',
      headers: {
        'Authorization': 'Bearer ' + apiToken
      },
      muteHttpExceptions: true
    };
    
    var response = UrlFetchApp.fetch(url, options);
    var code = response.getResponseCode();
    
    if (code === 200) {
      var data = JSON.parse(response.getContentText());
      return {
        ok: true,
        sheetName: data.name,
        columnCount: (data.columns || []).length,
        rowCount: data.totalRowCount || 0
      };
    } else {
      return { ok: false, error: 'API returned: ' + code };
    }
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
