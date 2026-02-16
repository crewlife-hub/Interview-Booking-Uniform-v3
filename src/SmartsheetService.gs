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
    var b = getBrandConfig_(brand) || getBrand_(brand);
    var emailColumn = b ? b.emailColumn : 'Email';
    var textForEmailColumn = b ? b.textForEmailColumn : 'Text For Email';
    var emailColumnIdPref = b ? b.emailColumnId : '';
    var textForEmailColumnIdPref = b ? b.textForEmailColumnId : '';
    
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
    var emailColId = emailColumnIdPref ? Number(emailColumnIdPref) : null;
    var textForEmailColId = textForEmailColumnIdPref ? Number(textForEmailColumnIdPref) : null;
    var columnMap = {};
    
    for (var i = 0; i < columns.length; i++) {
      columnMap[columns[i].id] = columns[i].title;
      if (!emailColId && columns[i].title === emailColumn) {
        emailColId = columns[i].id;
      }
      if (!textForEmailColId && columns[i].title === textForEmailColumn) {
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
 * Fetch full Smartsheet data by sheet id
 * @param {string} sheetId - Smartsheet Sheet ID
 * @returns {Object} Result with columns/rows
 */
function fetchSmartsheetSheet_(sheetId) {
  var cfg = getConfig_();
  var apiToken = cfg.SMARTSHEET_API_TOKEN;
  if (!apiToken) return { ok: false, error: 'Smartsheet API token not configured' };
  try {
    var url = SMARTSHEET_API_BASE + '/sheets/' + sheetId;
    var options = {
      method: 'get',
      headers: { 'Authorization': 'Bearer ' + apiToken },
      muteHttpExceptions: true
    };
    var response = UrlFetchApp.fetch(url, options);
    if (response.getResponseCode() !== 200) {
      return { ok: false, error: 'HTTP ' + response.getResponseCode(), body: response.getContentText() };
    }
    var data = JSON.parse(response.getContentText());
    return { ok: true, columns: data.columns || [], rows: data.rows || [], name: data.name || '' };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/**
 * Detect trigger column from Smartsheet columns
 * @param {Array} columns - Smartsheet columns
 * @returns {Object|null} Detected column
 */
function detectTriggerColumn_(columns) {
  if (!columns || !columns.length) return null;
  var exactPriority = [
    'SEND 🔔1️⃣ Interview Invite',
    'Send Interview Invite'
  ];
  for (var i = 0; i < exactPriority.length; i++) {
    for (var c = 0; c < columns.length; c++) {
      if (columns[c].title === exactPriority[i]) return columns[c];
    }
  }
  for (var j = 0; j < columns.length; j++) {
    var t = String(columns[j].title || '').toLowerCase();
    if (t.indexOf('invite') !== -1 && t.indexOf('send') !== -1) return columns[j];
  }
  return null;
}

/**
 * Find column by title
 * @param {Array} columns - Smartsheet columns
 * @param {string} title - Column title
 * @returns {Object|null} Column
 */
function findColumnByTitle_(columns, title) {
  if (!columns || !title) return null;
  for (var i = 0; i < columns.length; i++) {
    if (columns[i].title === title) return columns[i];
  }
  return null;
}

/**
 * Get row data by rowId with column titles mapping
 * @param {string} brand - Brand code
 * @param {string} rowId - Smartsheet row id
 * @returns {Object} Row data with map
 */
function getSmartsheetRowById_(brand, rowId) {
  var sheetId = getSmartsheetIdForBrand_(brand);
  if (!sheetId) return { ok: false, error: 'Smartsheet ID not configured' };
  var sheet = fetchSmartsheetSheet_(sheetId);
  if (!sheet.ok) return sheet;
  var columns = sheet.columns || [];
  var colMap = {};
  for (var i = 0; i < columns.length; i++) {
    colMap[columns[i].id] = columns[i].title;
  }
  var rowData = null;
  for (var r = 0; r < sheet.rows.length; r++) {
    if (String(sheet.rows[r].id) === String(rowId)) {
      rowData = sheet.rows[r];
      break;
    }
  }
  if (!rowData) return { ok: false, error: 'Row not found' };
  var map = { rowId: rowData.id };
  (rowData.cells || []).forEach(function(cell) {
    var title = colMap[cell.columnId] || String(cell.columnId);
    map[title] = cell.displayValue || cell.value || '';
  });
  return { ok: true, row: rowData, map: map, columns: columns };
}

/**
 * Update a Smartsheet row with column title/value pairs
 * @param {string} sheetId - Smartsheet ID
 * @param {string} rowId - Row ID
 * @param {Object} updates - {title: value}
 * @returns {Object} Update result
 */
function updateSmartsheetRow_(sheetId, rowId, updates) {
  var cfg = getConfig_();
  var apiToken = cfg.SMARTSHEET_API_TOKEN;
  if (!apiToken) return { ok: false, error: 'Smartsheet API token not configured' };
  var sheet = fetchSmartsheetSheet_(sheetId);
  if (!sheet.ok) return sheet;

  var columns = sheet.columns || [];
  var titleToId = {};
  for (var i = 0; i < columns.length; i++) {
    titleToId[columns[i].title] = columns[i].id;
  }

  var cells = [];
  for (var title in updates) {
    if (!updates.hasOwnProperty(title)) continue;
    var colId = titleToId[title];
    if (!colId) continue;
    cells.push({ columnId: colId, value: updates[title] });
  }
  if (cells.length === 0) return { ok: false, error: 'No matching columns to update' };

  try {
    var url = SMARTSHEET_API_BASE + '/sheets/' + sheetId + '/rows';
    var payload = [{ id: Number(rowId), cells: cells }];
    var options = {
      method: 'put',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      headers: { 'Authorization': 'Bearer ' + apiToken },
      muteHttpExceptions: true
    };
    var response = UrlFetchApp.fetch(url, options);
    var code = response.getResponseCode();
    if (code >= 200 && code < 300) return { ok: true };
    return { ok: false, error: 'HTTP ' + code + ' - ' + response.getContentText() };
  } catch (e) {
    return { ok: false, error: String(e) };
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
