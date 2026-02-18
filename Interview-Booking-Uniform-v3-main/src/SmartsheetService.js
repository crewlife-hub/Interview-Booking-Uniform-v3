/**
 * SmartsheetService.gs
 * Read-only Smartsheet API integration.
 * CrewLife Interview Bookings Uniform Core
 */

var SMARTSHEET_API_BASE = 'https://api.smartsheet.com/2.0';

/**
 * Search for a candidate in Smartsheet by Email + Text For Email.
 * ANY-sheet match wins: returns on the first exact match found.
 * Sheets are searched in the configured order for this brand.
 * @param {string} brand - Brand code
 * @param {string} email - Candidate email
 * @param {string} textForEmail - Text For Email value
 * @returns {Object} Search result
 */
function searchCandidateInSmartsheet_(brand, email, textForEmail) {
  var cfg      = getConfig_();
  var apiToken = cfg.SMARTSHEET_API_TOKEN;
  var traceId  = generateTraceId_();

  if (!apiToken) {
    return { ok: false, error: 'Smartsheet API token not configured', code: 'NO_API_TOKEN' };
  }

  var sheetIds = getSmartsheetIdsForBrand_(brand);
  if (!sheetIds || sheetIds.length === 0) {
    return { ok: false, error: 'Smartsheet ID not configured for brand: ' + brand, code: 'NO_SHEET_ID' };
  }

  // Normalise inputs once
  var normEmail = String(email        || '').toLowerCase().trim();
  var normTfe   = String(textForEmail || '').trim().replace(/\s+/g, ' ').toLowerCase();

  var atLeastOneReadable = false;

  for (var s = 0; s < sheetIds.length; s++) {
    var sheetId = sheetIds[s];
    var response, httpCode;

    try {
      response = UrlFetchApp.fetch(
        SMARTSHEET_API_BASE + '/sheets/' + sheetId,
        {
          method: 'get',
          headers: { 'Authorization': 'Bearer ' + apiToken, 'Content-Type': 'application/json' },
          muteHttpExceptions: true
        }
      );
      httpCode = response.getResponseCode();
    } catch (fetchErr) {
      logEvent_(traceId, brand, email, 'SMARTSHEET_API_ERROR',
        { sheetId: sheetId, message: String(fetchErr) });
      continue;
    }

    if (httpCode !== 200) {
      logEvent_(traceId, brand, email, 'SMARTSHEET_API_ERROR',
        { sheetId: sheetId, code: httpCode });
      continue;
    }

    atLeastOneReadable = true;
    var data    = JSON.parse(response.getContentText());
    var columns = data.columns || [];
    var rows    = data.rows    || [];

    // Locate columns by case-insensitive trimmed title (flexible Interview Link match)
    var emailColId         = null;
    var tfeColId           = null;
    var interviewLinkColId = null;
    var columnMap          = {};

    for (var i = 0; i < columns.length; i++) {
      var col = columns[i];
      var normTitle = String(col.title || '').trim().toLowerCase();
      columnMap[col.id] = col.title;

      if (normTitle === 'email') emailColId = col.id;
      if (normTitle === 'text for email') tfeColId = col.id;

      // Interview link can be "Interview: Link", "Interview : Link", etc.
      if (normTitle === 'interview link') interviewLinkColId = col.id;
    }

    // Flexible fallback: if exact "interview link" not found, match any title containing both words
    if (!interviewLinkColId) {
      for (var j = 0; j < columns.length; j++) {
        var col2 = columns[j];
        var t2 = String(col2.title || '').trim().toLowerCase();
        if (t2.indexOf('interview') !== -1 && t2.indexOf('link') !== -1) {
          interviewLinkColId = col2.id;
          break;
        }
      }
    }

    if (!emailColId || !tfeColId) {
      logEvent_(traceId, brand, email, 'SMARTSHEET_API_ERROR',
        { sheetId: sheetId, message: 'Required columns not found (Email / Text For Email)' });
      continue;
    }

    for (var r = 0; r < rows.length; r++) {
      var row   = rows[r];
      var cells = row.cells || [];
      var rowEmail         = '';
      var rowTfe           = '';
      var rowInterviewLink = '';
      var rowData          = { rowId: row.id };

      for (var c = 0; c < cells.length; c++) {
        var cell    = cells[c];
        var cellVal = String(cell.displayValue || cell.value || '');
        rowData[columnMap[cell.columnId]] = cellVal;
        if (cell.columnId === emailColId)                               rowEmail         = cellVal.toLowerCase().trim();
        if (cell.columnId === tfeColId)                                 rowTfe           = cellVal.trim().replace(/\s+/g, ' ').toLowerCase();
        if (interviewLinkColId && cell.columnId === interviewLinkColId) rowInterviewLink = cellVal.trim();
      }

      if (rowEmail === normEmail && rowTfe === normTfe) {
        logEvent_(traceId, brand, email, 'MATCH_FOUND', { matchedSheetId: sheetId });
        return {
          ok:             true,
          found:          true,
          exactMatch:     true,
          matchedSheetId: sheetId,
          interviewLink:  rowInterviewLink,
          candidate:      rowData
        };
      }
    }
  }

  // No exact match across all sheets
  if (atLeastOneReadable) {
    logEvent_(traceId, brand, email, 'MATCH_FAIL', { brand: brand });
    return { ok: true, found: false, exactMatch: false };
  }

  return { ok: false, error: 'All configured sheets unavailable for brand: ' + brand, code: 'ALL_SHEETS_FAILED' };
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
 * Public: returns sorted unique Text For Email values for a brand from Smartsheet.
 * Called via google.script.run — no underscore.
 * @param {string} brand
 * @returns {string[]}
 */
function getTextForEmailOptionsForBrandApi(brand) {
  brand = String(brand || '').toUpperCase().trim();
  var traceId  = generateTraceId_();
  var cacheKey = 'TFE_OPTIONS_' + brand;
  var cache    = CacheService.getScriptCache();

  var cached = cache.get(cacheKey);
  if (cached) {
    try { return JSON.parse(cached); } catch (e) { /* fall through */ }
  }

  var cfg      = getConfig_();
  var apiToken = cfg.SMARTSHEET_API_TOKEN;
  var sheetIds = getSmartsheetIdsForBrand_(brand);
  var seen     = {};
  var options  = [];

  if (apiToken && sheetIds && sheetIds.length > 0) {
    for (var s = 0; s < sheetIds.length; s++) {
      var sheetId = sheetIds[s];
      try {
        var response = UrlFetchApp.fetch(
          SMARTSHEET_API_BASE + '/sheets/' + sheetId,
          {
            method: 'get',
            headers: { 'Authorization': 'Bearer ' + apiToken, 'Content-Type': 'application/json' },
            muteHttpExceptions: true
          }
        );
        if (response.getResponseCode() !== 200) continue;

        var data    = JSON.parse(response.getContentText());
        var columns = data.columns || [];
        var rows    = data.rows    || [];

        var tfeColId = null;
        for (var i = 0; i < columns.length; i++) {
          if (String(columns[i].title || '').trim().toLowerCase() === 'text for email') {
            tfeColId = columns[i].id;
            break;
          }
        }
        if (!tfeColId) continue;

        for (var r = 0; r < rows.length; r++) {
          var cells = rows[r].cells || [];
          for (var c = 0; c < cells.length; c++) {
            if (cells[c].columnId === tfeColId) {
              var val = String(cells[c].displayValue || cells[c].value || '').trim();
              if (val && !seen[val]) { seen[val] = true; options.push(val); }
            }
          }
        }
      } catch (e) {
        logEvent_(traceId, brand, '', 'SMARTSHEET_API_ERROR', { sheetId: sheetId, message: String(e) });
      }
    }
  }

  options.sort(function(a, b) { return a.toLowerCase().localeCompare(b.toLowerCase()); });
  logEvent_(traceId, brand, '', 'OPTIONS_LOADED', { brand: brand, count: options.length });

  try { cache.put(cacheKey, JSON.stringify(options), 600); } catch (e) { /* ignore */ }
  return options;
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
