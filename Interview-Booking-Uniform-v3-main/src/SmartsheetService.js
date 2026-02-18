/**
 * SmartsheetService.gs
 * Read-only Smartsheet API integration.
 * CrewLife Interview Bookings Uniform Core
 */

var SMARTSHEET_API_BASE = 'https://api.smartsheet.com/2.0';

function isSeaChefsBrand_(brand) {
  return String(brand || '').toUpperCase().trim() === 'SEACHEFS';
}

function normalizeEmailForBrandMatch_(value, brand) {
  var out = String(value || '').toLowerCase().trim();
  if (!isSeaChefsBrand_(brand)) return out;
  return out.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeTextForEmailForBrandMatch_(value, brand) {
  var out = String(value || '');
  if (isSeaChefsBrand_(brand)) {
    out = out
      .replace(/\u00a0/g, ' ')
      .replace(/[\u2013\u2014\u2212]/g, '-')
      .replace(/\s+/g, ' ');
  } else {
    out = out.replace(/\s+/g, ' ');
  }
  return out.trim().toLowerCase();
}

function getFirstCharCodes_(value, maxChars) {
  var str = String(value || '');
  var limit = Math.max(0, Number(maxChars) || 30);
  var out = [];
  for (var i = 0; i < str.length && i < limit; i++) {
    out.push(str.charCodeAt(i));
  }
  return out;
}

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
  var seaChefs = isSeaChefsBrand_(brand);

  if (!apiToken) {
    return { ok: false, error: 'Smartsheet API token not configured', code: 'NO_API_TOKEN' };
  }

  var sheetIds = getSmartsheetIdsForBrand_(brand);
  if (!sheetIds || sheetIds.length === 0) {
    return { ok: false, error: 'Smartsheet ID not configured for brand: ' + brand, code: 'NO_SHEET_ID' };
  }

  // Normalise inputs once
  var normEmail = normalizeEmailForBrandMatch_(email, brand);
  var normTfe   = normalizeTextForEmailForBrandMatch_(textForEmail, brand);

  var seaChefsDebug = {
    brand: String(brand || '').toUpperCase().trim(),
    inputEmailRaw: String(email || ''),
    inputTfeRaw: String(textForEmail || ''),
    inputEmailNormalized: normEmail,
    inputTfeNormalized: normTfe,
    sheetIds: sheetIds,
    emailMatches: 0,
    textMismatchesAfterEmailMatch: 0,
    searchedSheets: []
  };

  if (seaChefs) {
    Logger.log('SEACHEFS_DEBUG start: sheetIds=%s normEmail=%s normTfe=%s',
      JSON.stringify(sheetIds), normEmail, normTfe);
    logEvent_(traceId, brand, email, 'SEACHEFS_DEBUG_INPUT', {
      sheetIds: sheetIds,
      normEmail: normEmail,
      normTfe: normTfe
    });
  }

  var atLeastOneReadable = false;

  for (var s = 0; s < sheetIds.length; s++) {
    var sheetId = sheetIds[s];
    var response, httpCode;

    if (seaChefs) {
      Logger.log('SEACHEFS_DEBUG searching sheetId=%s', sheetId);
      logEvent_(traceId, brand, email, 'SEACHEFS_DEBUG_SHEET_SEARCH', { sheetId: sheetId });
    }

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

    if (seaChefs) {
      seaChefsDebug.searchedSheets.push({ sheetId: sheetId, sheetName: String(data.name || ''), rows: rows.length });
    }

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
      var rowTfeRaw        = '';
      var rowInterviewLink = '';
      var rowData          = { rowId: row.id };

      for (var c = 0; c < cells.length; c++) {
        var cell    = cells[c];
        var cellVal = String(cell.displayValue || cell.value || '');
        rowData[columnMap[cell.columnId]] = cellVal;
        if (cell.columnId === emailColId)                               rowEmail         = normalizeEmailForBrandMatch_(cellVal, brand);
        if (cell.columnId === tfeColId) {
          rowTfeRaw = cellVal;
          rowTfe = normalizeTextForEmailForBrandMatch_(cellVal, brand);
        }
        if (interviewLinkColId && cell.columnId === interviewLinkColId) rowInterviewLink = cellVal.trim();
      }

      if (seaChefs && rowEmail === normEmail) {
        seaChefsDebug.emailMatches++;
        if (rowTfe !== normTfe) {
          seaChefsDebug.textMismatchesAfterEmailMatch++;
          var charCodes = getFirstCharCodes_(rowTfeRaw, 30);
          Logger.log('SEACHEFS_DEBUG email matched but text mismatch: sheetId=%s rowId=%s rawTfe=%s normRowTfe=%s normInputTfe=%s charCodes=%s',
            sheetId,
            row.id,
            rowTfeRaw,
            rowTfe,
            normTfe,
            JSON.stringify(charCodes));
          logEvent_(traceId, brand, email, 'SEACHEFS_DEBUG_TFE_MISMATCH', {
            sheetId: sheetId,
            rowId: row.id,
            rowTfeRaw: rowTfeRaw,
            rowTfeNormalized: rowTfe,
            inputTfeNormalized: normTfe,
            rowTfeCharCodesFirst30: charCodes
          });
        }
      }

      if (rowEmail === normEmail && rowTfe === normTfe) {
        logEvent_(traceId, brand, email, 'MATCH_FOUND', { matchedSheetId: sheetId });
        if (seaChefs) {
          Logger.log('SEACHEFS_DEBUG MATCH_FOUND sheetId=%s rowId=%s', sheetId, row.id);
        }
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
    var failMeta = { brand: brand, sheetIds: sheetIds, sheetIdsCount: sheetIds.length };
    if (seaChefs) {
      failMeta.seaChefsDebug = seaChefsDebug;
      Logger.log('SEACHEFS_DEBUG MATCH_FAIL details=%s', JSON.stringify(seaChefsDebug));
    }
    logEvent_(traceId, brand, email, 'MATCH_FAIL', failMeta);
    if (seaChefs) {
      return { ok: true, found: false, exactMatch: false, debug: seaChefsDebug };
    }
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
  var isSeaChefs = bKey === 'SEACHEFS';
  var props = PropertiesService.getScriptProperties();

  // Script property overrides: SMARTSHEET_IDS_{BRAND} (comma list) and SMARTSHEET_ID_{BRAND} (single/comma)
  var propList = props.getProperty('SMARTSHEET_IDS_' + bKey);
  var propListIds = [];
  if (propList) propListIds = propListIds.concat(String(propList).split(',').map(function(s) { return s.trim(); }).filter(function(s) { return s; }));

  var propSingle = props.getProperty('SMARTSHEET_ID_' + bKey);
  if (propSingle) propListIds = propListIds.concat(String(propSingle).split(',').map(function(s) { return s.trim(); }).filter(function(s) { return s; }));
  if (propListIds.length > 0) ids = ids.concat(propListIds);

  // Brand registry entry (SeaChefs: only use fallback when no explicit script-property IDs are configured)
  var shouldUseBrandFallback = !(isSeaChefs && propListIds.length > 0);
  if (shouldUseBrandFallback) {
    var b = getBrand_(brand);
    if (b && b.smartsheetId) ids = ids.concat(String(b.smartsheetId).split(',').map(function(s) { return s.trim(); }).filter(function(s) { return s; }));
  }

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
  logEvent_(traceId, brand, '', 'OPTIONS_LOADED', { brand: brand, sheetIds: sheetIds, sheetIdsCount: sheetIds.length, count: options.length });

  try { cache.put(cacheKey, JSON.stringify(options), 600); } catch (e) { /* ignore */ }
  return options;
}

/**
 * Diagnostics: verify brand -> Smartsheet sheet ID resolution.
 * Logs whether IDs are valid-looking (not placeholders) for ROYAL/COSTA/SEACHEFS.
 * Run from Apps Script editor: TEST_BrandSheetResolution()
 * @returns {Object}
 */
function TEST_BrandSheetResolution() {
  var brands = ['ROYAL', 'COSTA', 'SEACHEFS'];
  var out = {};

  function isPlaceholder_(value) {
    var v = String(value || '').toUpperCase();
    return !v || v.indexOf('PLACEHOLDER') !== -1;
  }

  for (var i = 0; i < brands.length; i++) {
    var brand = brands[i];
    var ids = getSmartsheetIdsForBrand_(brand);
    var validFlags = ids.map(function(id) { return !isPlaceholder_(id); });

    out[brand] = {
      sheetIds: ids,
      hasAnyIds: ids.length > 0,
      allValid: ids.length > 0 && validFlags.every(function(v) { return v; }),
      validFlags: validFlags
    };

    Logger.log('%s => sheetIds=%s validFlags=%s allValid=%s',
      brand,
      JSON.stringify(ids),
      JSON.stringify(validFlags),
      out[brand].allValid);
  }

  return out;
}

/**
 * Quick diagnostics helper for brand option loading.
 * Logs number of Text For Email options and first 10 options for ROYAL/COSTA/SEACHEFS.
 * Run from Apps Script editor: TEST_BrandOptionsCounts()
 * @returns {Object}
 */
function TEST_BrandOptionsCounts() {
  var brands = ['ROYAL', 'COSTA', 'SEACHEFS'];
  var out = {};

  for (var i = 0; i < brands.length; i++) {
    var brand = brands[i];
    var options = getTextForEmailOptionsForBrandApi(brand);
    var first10 = options.slice(0, 10);

    out[brand] = {
      optionsCount: options.length,
      first10: first10
    };

    Logger.log('%s => optionsCount=%s first10=%s',
      brand,
      options.length,
      JSON.stringify(first10));
  }

  return out;
}

/**
 * Focused diagnostics for SeaChefs matching issue.
 * Calls the main search function with known failing sample input.
 * Run from Apps Script editor: TEST_DebugSeachefsMatch()
 * @returns {Object}
 */
function TEST_DebugSeachefsMatch() {
  var brand = 'SEACHEFS';
  var email = 'crewlife@seainfogroup.com';
  var textForEmail = 'Assistant Waiters - CL100';

  Logger.log('SEACHEFS_DEBUG TEST start: brand=%s email=%s textForEmail=%s', brand, email, textForEmail);
  var result = searchCandidateInSmartsheet_(brand, email, textForEmail);
  Logger.log('SEACHEFS_DEBUG TEST result=%s', JSON.stringify(result));

  if (!result.ok) {
    Logger.log('SEACHEFS_DEBUG TEST failed early: code=%s error=%s', String(result.code || ''), String(result.error || ''));
  } else if (result.found && result.exactMatch) {
    Logger.log('SEACHEFS_DEBUG TEST exact match: matchedSheetId=%s', String(result.matchedSheetId || ''));
  } else {
    Logger.log('SEACHEFS_DEBUG TEST no exact match; inspect SEACHEFS_DEBUG_* logs for per-sheet and per-row mismatch details.');
  }

  return result;
}

/**
 * Diagnostics: verify configured SeaChefs sheet IDs and discover candidate sheets by name.
 * Run from Apps Script editor: TEST_SeachefsSheetNameDiagnostics()
 * @returns {Object}
 */
function TEST_SeachefsSheetNameDiagnostics() {
  var brand = 'SEACHEFS';
  var cfg = getConfig_();
  var apiToken = cfg.SMARTSHEET_API_TOKEN;
  if (!apiToken) return { ok: false, error: 'Smartsheet API token not configured', code: 'NO_API_TOKEN' };

  var targetName = 'SEACHEFS_APPLICANT_INTERVIEW_BOOKINGS';
  var configuredIds = getSmartsheetIdsForBrand_(brand);
  var configuredSheets = [];

  for (var i = 0; i < configuredIds.length; i++) {
    var sheetId = configuredIds[i];
    try {
      var detailRes = UrlFetchApp.fetch(
        SMARTSHEET_API_BASE + '/sheets/' + sheetId + '?pageSize=1',
        {
          method: 'get',
          headers: { 'Authorization': 'Bearer ' + apiToken, 'Content-Type': 'application/json' },
          muteHttpExceptions: true
        }
      );
      var code = detailRes.getResponseCode();
      if (code === 200) {
        var detail = JSON.parse(detailRes.getContentText());
        configuredSheets.push({ sheetId: String(sheetId), sheetName: String(detail.name || ''), status: 'OK' });
      } else {
        configuredSheets.push({ sheetId: String(sheetId), sheetName: '', status: 'HTTP_' + code });
      }
    } catch (e) {
      configuredSheets.push({ sheetId: String(sheetId), sheetName: '', status: 'ERROR', message: String(e) });
    }
  }

  var discoveredByName = [];
  try {
    var listRes = UrlFetchApp.fetch(
      SMARTSHEET_API_BASE + '/sheets?includeAll=true',
      {
        method: 'get',
        headers: { 'Authorization': 'Bearer ' + apiToken, 'Content-Type': 'application/json' },
        muteHttpExceptions: true
      }
    );
    if (listRes.getResponseCode() === 200) {
      var listData = JSON.parse(listRes.getContentText());
      var sheetList = listData.data || [];
      var targetUpper = targetName.toUpperCase();
      for (var s = 0; s < sheetList.length; s++) {
        var item = sheetList[s] || {};
        var name = String(item.name || '');
        if (name.toUpperCase() === targetUpper || name.toUpperCase().indexOf(targetUpper) !== -1) {
          discoveredByName.push({ sheetId: String(item.id || ''), sheetName: name });
        }
      }
    }
  } catch (e2) {
    discoveredByName.push({ sheetId: '', sheetName: '', error: String(e2) });
  }

  var configuredNamesUpper = configuredSheets.map(function(x) { return String(x.sheetName || '').toUpperCase(); });
  var configuredHasTarget = configuredNamesUpper.some(function(n) { return n === targetName || n.indexOf(targetName) !== -1; });

  var out = {
    ok: true,
    brand: brand,
    targetName: targetName,
    configuredIds: configuredIds,
    configuredSheets: configuredSheets,
    configuredHasTarget: configuredHasTarget,
    discoveredByName: discoveredByName
  };

  Logger.log('SEACHEFS_SHEET_DIAG => %s', JSON.stringify(out));
  return out;
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
