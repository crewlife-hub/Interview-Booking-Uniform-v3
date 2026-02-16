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
  
  // Support multiple Smartsheet IDs per brand (comma-separated in props/registry/brand config)
  var sheetIds = getSmartsheetIdsForBrand_(brand);
  if (!sheetIds || sheetIds.length === 0) {
    return { ok: false, error: 'Smartsheet ID not configured for brand: ' + brand, code: 'NO_SHEET_ID' };
  }

  try {
    var b = getBrand_(brand);
    var emailColumn = b ? b.emailColumn : 'Email';
    var textForEmailColumn = b ? b.textForEmailColumn : 'Text For Email';

    var overallMatches = [];
    var perSheetResults = [];

    for (var s = 0; s < sheetIds.length; s++) {
      var sheetId = sheetIds[s];
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
        logEvent_(generateTraceId_(), brand, email, 'SMARTSHEET_API_ERROR', { sheetId: sheetId, code: code });
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
        if (columns[i].title === emailColumn) emailColId = columns[i].id;
        if (columns[i].title === textForEmailColumn) textForEmailColId = columns[i].id;
      }

      if (!emailColId || !textForEmailColId) {
        return { ok: false, error: 'Required columns not found in Smartsheet: ' + sheetId, code: 'COLUMN_NOT_FOUND' };
      }

      var foundExact = false;
      var foundPartial = false;
      var matchedRow = null;

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
          if (cell.columnId === emailColId) rowEmail = String(cell.displayValue || cell.value || '').toLowerCase().trim();
          if (cell.columnId === textForEmailColId) rowTextForEmail = String(cell.displayValue || cell.value || '').trim();
        }

        var emailMatch = rowEmail === String(email).toLowerCase().trim();
        var textMatch = rowTextForEmail === String(textForEmail).trim();

        if (emailMatch && textMatch) {
          foundExact = true;
          matchedRow = rowData;
          break; // exact match found in this sheet
        } else if (emailMatch) {
          foundPartial = true;
          if (!matchedRow) matchedRow = rowData;
        }
      }

      perSheetResults.push({ sheetId: sheetId, foundExact: foundExact, foundPartial: foundPartial, rowId: matchedRow ? matchedRow.rowId : null });
      if (foundExact) overallMatches.push(matchedRow);
    }

    // If any configured sheet did not return an exact match, treat as not found
    for (var k = 0; k < perSheetResults.length; k++) {
      if (!perSheetResults[k].foundExact) {
        logEvent_(generateTraceId_(), brand, email, 'SMARTSHEET_MULTI_CHECK_FAILED', { checked: perSheetResults });
        return { ok: true, found: false, exactMatch: false, checked: perSheetResults, matchCount: overallMatches.length };
      }
    }

    var candidate = overallMatches.length > 0 ? overallMatches[0] : null;
    logEvent_(generateTraceId_(), brand, email, 'SMARTSHEET_MULTI_CHECK_OK', { checked: perSheetResults });
    return {
      ok: true,
      found: true,
      exactMatch: true,
      candidate: candidate,
      matchCount: overallMatches.length,
      checked: perSheetResults
    };

  } catch (e) {
    Logger.log('SmartsheetService error: ' + e);
    return { ok: false, error: 'Smartsheet lookup failed: ' + String(e), code: 'EXCEPTION' };
  }
}


/**
 * Get array of configured Smartsheet IDs for a brand.
 * Supports comma-separated values in script properties, brand registry, or BRAND_CONFIG tab.
 * @param {string} brand
 * @returns {Array} Array of sheet IDs (strings)
 */
function getSmartsheetIdsForBrand_(brand) {
  var ids = [];
  if (!brand) return ids;
  var bKey = String(brand).toUpperCase().trim();
  var props = PropertiesService.getScriptProperties();

  // Script property overrides: SMARTSHEET_ID_{BRAND}
  var prop = props.getProperty('SMARTSHEET_ID_' + bKey);
  if (prop) ids = ids.concat(String(prop).split(',').map(function(s) { return s.trim(); }).filter(function(s) { return s; }));

  // Brand registry entry
  var b = getBrand_(brand);
  if (b && b.smartsheetId) ids = ids.concat(String(b.smartsheetId).split(',').map(function(s) { return s.trim(); }).filter(function(s) { return s; }));

  // BRAND_CONFIG overrides
  try {
    var overrides = getBrandConfigOverrides_(brand);
    if (overrides && overrides.smartsheetId) ids = ids.concat(String(overrides.smartsheetId).split(',').map(function(s) { return s.trim(); }).filter(function(s) { return s; }));
  } catch (e) {
    // ignore
  }

  // Remove placeholders and dedupe
  var cleaned = [];
  for (var i = 0; i < ids.length; i++) {
    var id = ids[i];
    if (!id) continue;
    if (id.indexOf('PLACEHOLDER') === 0) continue;
    if (cleaned.indexOf(id) === -1) cleaned.push(id);
  }
  return cleaned;
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
