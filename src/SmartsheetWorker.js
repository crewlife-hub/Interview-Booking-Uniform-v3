/**
 * SmartsheetWorker.js
 * ===========================================================================
 * Worker to scan Smartsheet rows where SEND column == "Sideways",
 * send token-gated booking invite emails, and batch-update rows.
 *
 * FLAGS (via opts):
 *   brand   (optional)      - restrict to one brand (e.g. 'ROYAL')
 *   limit   (optional)      - max rows to process
 *
 * NO testEmail parameter - emails ALWAYS go to the real candidate address.
 * ===========================================================================
 */

/**
 * Process rows across all brands (or single brand) where SEND == "Sideways".
 * @param {Object} opts - { brand: string|null, limit: number }
 * @returns {Object} summary
 */
function processSidewaysInvites_(opts) {
  opts = opts || {};

  var limit = (opts.limit === undefined || opts.limit === null || opts.limit === '')
    ? Number.MAX_SAFE_INTEGER
    : Number(opts.limit);
  if (!isFinite(limit) || limit <= 0) limit = Number.MAX_SAFE_INTEGER;

  var brands = opts.brand ? [String(opts.brand).toUpperCase()] : getAllBrandCodes_();

  var traceId = generateTraceId_();
  logEvent_(traceId, '', '', 'SIDEWAYS_RUN_START', { mode: 'LIVE', brands: brands, limit: limit });

  var results = {
    traceId: traceId,
    totalRows: 0,
    sidewaysFound: 0,
    emailsSent: 0,
    updatesWritten: 0,
    failures: 0,
    processed: 0,
    sent: 0,
    updated: 0,
    skipped: 0,
    errors: []
  };

  var cfg = getConfig_();
  var apiToken = cfg.SMARTSHEET_API_TOKEN;
  if (!apiToken) {
    logEvent_(traceId, '', '', 'SIDEWAYS_NO_TOKEN', {});
    return { ok: false, error: 'SMARTSHEET API token not configured' };
  }

  try {
    for (var b = 0; b < brands.length; b++) {
      var brand = String(brands[b]).toUpperCase();
      var sheetIds = getSmartsheetIdsForBrand_(brand);
      if (!sheetIds || sheetIds.length === 0) {
        logEvent_(traceId, brand, '', 'SIDEWAYS_NO_SHEETS', {});
        continue;
      }
      logEvent_(traceId, brand, '', 'SIDEWAYS_BRAND_SHEETS', { sheetIds: sheetIds, sheetCount: sheetIds.length });

      for (var s = 0; s < sheetIds.length; s++) {
        if (results.processed >= limit) break;
        var sheetId = sheetIds[s];
        var remaining = limit - results.processed;
        var sheetResult = processSidewaysForSheet_(sheetId, brand, {
          apiToken: apiToken,
          traceId: traceId,
          limit: remaining
        });

        if (!sheetResult.ok) {
          results.failures += 1;
          results.errors.push({ sheetId: sheetId, error: sheetResult.error || 'Sheet processing failed' });
          continue;
        }

        results.totalRows += (sheetResult.totalRows || 0);
        results.sidewaysFound += (sheetResult.sidewaysFound || 0);
        results.emailsSent += (sheetResult.emailsSent || 0);
        results.updatesWritten += (sheetResult.updatesWritten || 0);
        results.failures += (sheetResult.failures || 0);

        results.processed += (sheetResult.processed || 0);
        results.sent += (sheetResult.emailsSent || 0);
        results.updated += (sheetResult.updatesWritten || 0);
        results.skipped += (sheetResult.skipped || 0);

        if (sheetResult.errors && sheetResult.errors.length) {
          for (var eidx = 0; eidx < sheetResult.errors.length; eidx++) {
            results.errors.push(sheetResult.errors[eidx]);
          }
        }
      }
    }
  } catch (e) {
    logEvent_(traceId, '', '', 'SIDEWAYS_EXCEPTION', { error: String(e), stack: e.stack });
    return { ok: false, error: String(e) };
  }

  Logger.log('[SIDEWAYS_SUMMARY] totalRows=%s sidewaysFound=%s emailsSent=%s updatesWritten=%s failures=%s processed=%s sent=%s updated=%s skipped=%s errors=%s',
    results.totalRows, results.sidewaysFound, results.emailsSent, results.updatesWritten, results.failures,
    results.processed, results.sent, results.updated, results.skipped, (results.errors || []).length);
  logEvent_(traceId, '', '', 'SIDEWAYS_RUN_COMPLETE', results);
  return { ok: true, summary: results };
}

function processSidewaysForSheet_(sheetId, brand, opts) {
  opts = opts || {};

  var traceId = opts.traceId || generateTraceId_();
  var apiToken = opts.apiToken;
  if (!apiToken) {
    var cfg = getConfig_();
    apiToken = cfg.SMARTSHEET_API_TOKEN;
  }
  if (!apiToken) {
    return { ok: false, error: 'SMARTSHEET API token not configured' };
  }

  var limit = (opts.limit === undefined || opts.limit === null || opts.limit === '')
    ? Number.MAX_SAFE_INTEGER
    : Number(opts.limit);
  if (!isFinite(limit) || limit <= 0) limit = Number.MAX_SAFE_INTEGER;

  var summary = {
    ok: true,
    sheetId: sheetId,
    brand: brand,
    totalRows: 0,
    sidewaysFound: 0,
    emailsSent: 0,
    updatesWritten: 0,
    failures: 0,
    processed: 0,
    skipped: 0,
    errors: []
  };

  var sheetData = fetchSmartsheet_(sheetId, apiToken);
  if (!sheetData.ok) {
    logEvent_(traceId, brand, '', 'SIDEWAYS_SHEET_FETCH_FAILED', { sheetId: sheetId, error: sheetData.error });
    return { ok: false, error: sheetData.error || 'Sheet fetch failed' };
  }

  var columns = sheetData.columns || [];
  var rows = sheetData.rows || [];
  var sheetName = String(sheetData.name || '');
  summary.totalRows = rows.length;

  Logger.log('[SIDEWAYS_SHEET] brand=%s sheetId=%s sheetName="%s" totalRows=%s', brand, sheetId, sheetName, rows.length);

  var colTitleToId = {};
  var colIdToTitle = {};
  var colMetaById = {};
  for (var i = 0; i < columns.length; i++) {
    colTitleToId[columns[i].title] = columns[i].id;
    colIdToTitle[String(columns[i].id)] = columns[i].title;
    colMetaById[String(columns[i].id)] = columns[i];
  }

  var brandCfg = getBrand_(brand) || {};

  function resolveCol_(configIdKey, titleCandidates) {
    var cfgId = brandCfg[configIdKey] ? String(brandCfg[configIdKey]) : null;
    if (cfgId && colIdToTitle[cfgId]) return { id: Number(cfgId), title: colIdToTitle[cfgId] };
    for (var ti = 0; ti < titleCandidates.length; ti++) {
      if (colTitleToId[titleCandidates[ti]]) return { id: colTitleToId[titleCandidates[ti]], title: titleCandidates[ti] };
    }
    return null;
  }

  var sendRes = resolveCol_('sendColumnId', [
    'SEND 🔔1️⃣ Interview Invite',
    'SEND Interview Invite',
    'Send Interview Invite',
    'SEND Interview'
  ]);
  if (!sendRes) {
    var best = null;
    var bestScore = -1;
    for (var sc = 0; sc < columns.length; sc++) {
      var t = String(columns[sc].title || '');
      var stripped = t.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
      if (stripped.indexOf('send') === -1) continue;
      var score = 1;
      if (stripped.indexOf('invite') !== -1) score += 3;
      if (stripped.indexOf('interview') !== -1) score += 5;
      if (stripped.indexOf('1') !== -1) score += 1;
      if (score > bestScore) {
        bestScore = score;
        best = columns[sc];
      }
    }
    if (best) sendRes = { id: best.id, title: best.title };
  }

  var sendCol = sendRes ? sendRes.id : null;
  if (!sendCol) {
    logEvent_(traceId, brand, '', 'SIDEWAYS_NO_SEND_COLUMN', { sheetId: sheetId, colCount: columns.length });
    return { ok: false, error: 'SEND column not found' };
  }

  var emailRes = resolveCol_('emailColumnId', [brandCfg.emailColumn || 'Email', 'Email']);
  var emailColName = emailRes ? emailRes.title : (brandCfg.emailColumn || 'Email');

  var textRes = resolveCol_('textForEmailColumnId', [brandCfg.textForEmailColumn || 'Text For Email', 'Text For Email']);
  var textForEmailCol = textRes ? textRes.title : (brandCfg.textForEmailColumn || 'Text For Email');

  var dateRes = resolveCol_('dateSentColumnId', ['Date Sent', 'DATE SENT', 'DATE_SENT']);
  if (!dateRes) {
    for (var di = 0; di < columns.length; di++) {
      var dt = String(columns[di].title || '');
      if (dt.toLowerCase().replace(/[^a-z0-9]/g, '') === 'datesent') {
        dateRes = { id: columns[di].id, title: columns[di].title };
        break;
      }
    }
  }
  var dateSentColId = dateRes ? dateRes.id : null;

  var sidewaysRows = [];
  for (var r = 0; r < rows.length; r++) {
    var row = rows[r];
    var cells = row.cells || [];
    var rowMap = { rowId: row.id };
    var sendVal = '';

    for (var c = 0; c < cells.length; c++) {
      var cell = cells[c];
      var title = colIdToTitle[String(cell.columnId)] || '';
      var value = getSmartsheetCellString_(cell);
      rowMap[title] = value;
      if (Number(cell.columnId) === Number(sendCol)) sendVal = String(value || '').trim();
    }

    if (sendVal === 'Sideways') {
      sidewaysRows.push({ row: row, rowMap: rowMap });
    }
  }

  summary.sidewaysFound = sidewaysRows.length;
  Logger.log('[SIDEWAYS_COUNTS] sheetId=%s brand=%s totalRows=%s sidewaysFound=%s', sheetId, brand, summary.totalRows, summary.sidewaysFound);

  var pendingUpdates = [];
  for (var sr = 0; sr < sidewaysRows.length && summary.processed < limit; sr++) {
    var item = sidewaysRows[sr];
    var rowObj = item.row;
    var rowMapObj = item.rowMap;
    summary.processed++;

    var candidateEmail = rowMapObj[emailColName] || '';
    var textForEmail = rowMapObj[textForEmailCol] || '';
    var candidateName = rowMapObj['Full Name'] || rowMapObj['Name'] || rowMapObj['First Name'] || '';
    var position = rowMapObj['Position Applied'] || rowMapObj['Position'] || rowMapObj['Job Title'] || textForEmail;

    var candidateEmailNorm = String(candidateEmail || '').trim().toLowerCase();
    if (!candidateEmailNorm || !isValidEmail_(candidateEmailNorm) || isPlaceholderEmail_(candidateEmailNorm) || isForbiddenRecipientEmail_(candidateEmailNorm)) {
      summary.skipped++;
      summary.failures++;
      summary.errors.push({ rowId: rowObj.id, error: 'Invalid email' });
      continue;
    }
    if (!textForEmail) {
      summary.skipped++;
      summary.failures++;
      summary.errors.push({ rowId: rowObj.id, error: 'Missing Text For Email' });
      continue;
    }

    var otpCreated = createOtp_({
      email: candidateEmailNorm,
      brand: brand,
      textForEmail: textForEmail,
      traceId: traceId
    });
    if (!otpCreated.ok || !otpCreated.token) {
      summary.skipped++;
      summary.failures++;
      summary.errors.push({ rowId: rowObj.id, error: 'Token creation failed: ' + (otpCreated.error || 'unknown') });
      continue;
    }

    var emailResult = sendBookingConfirmEmail_({
      email: candidateEmailNorm,
      brand: brand,
      textForEmail: textForEmail,
      position: position,
      token: otpCreated.token,
      candidateName: candidateName,
      traceId: traceId
    });

    if (!emailResult.ok) {
      summary.skipped++;
      summary.failures++;
      summary.errors.push({ rowId: rowObj.id, error: 'Email send failed: ' + (emailResult.error || 'unknown') });
      continue;
    }

    summary.emailsSent++;

    var cellsToUpdate = [{ columnId: Number(sendCol), value: '🔔Sent' }];
    if (dateSentColId) {
      cellsToUpdate.push({ columnId: Number(dateSentColId), value: new Date().toISOString() });
    }
    pendingUpdates.push({ id: Number(rowObj.id), cells: cellsToUpdate });
  }

  if (pendingUpdates.length > 0) {
    var batchResult = batchUpdateSmartsheetRows_(sheetId, pendingUpdates, apiToken, colMetaById);
    summary.updatesWritten += (batchResult.updated || 0);
    if (!batchResult.ok) {
      summary.failures += (batchResult.failedRowIds && batchResult.failedRowIds.length) ? batchResult.failedRowIds.length : 1;
      if (batchResult.failedRowIds && batchResult.failedRowIds.length) {
        for (var fr = 0; fr < batchResult.failedRowIds.length; fr++) {
          summary.errors.push({ rowId: batchResult.failedRowIds[fr], error: 'Batch update failed' });
        }
      } else {
        summary.errors.push({ sheetId: sheetId, error: batchResult.error || 'Batch update failed' });
      }
    }
  }

  Logger.log('[SIDEWAYS_SHEET_SUMMARY] brand=%s sheetId=%s totalRows=%s sidewaysFound=%s emailsSent=%s updatesWritten=%s failures=%s',
    brand, sheetId, summary.totalRows, summary.sidewaysFound, summary.emailsSent, summary.updatesWritten, summary.failures);

  logEvent_(traceId, brand, '', 'SIDEWAYS_SHEET_SUMMARY', {
    sheetId: sheetId,
    sheetName: sheetName,
    totalRows: summary.totalRows,
    sidewaysFound: summary.sidewaysFound,
    emailsSent: summary.emailsSent,
    updatesWritten: summary.updatesWritten,
    failures: summary.failures
  });

  return summary;
}


// ===========================================================================
// HELPERS
// ===========================================================================

function getSmartsheetCellString_(cell) {
  if (!cell) return '';
  try {
    if (cell.displayValue !== undefined && cell.displayValue !== null && cell.displayValue !== '') {
      return String(cell.displayValue);
    }
    var v = cell.value;
    if (v === undefined || v === null) return '';
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v);
    if (typeof v === 'object') {
      if (v.url) return String(v.url);
      if (v.href) return String(v.href);
      if (v.link) return String(v.link);
    }
    return '';
  } catch (e) {
    return '';
  }
}

/**
 * Scheduled runner (time-based trigger target).
 * Runs LIVE — real emails, real Smartsheet updates.
 * Conservative limit to avoid timeouts/quota spikes.
 */
function processSidewaysInvitesScheduled_() {
  return processSidewaysInvites_({ limit: 200 });
}


/**
 * Fetch sheet metadata and rows — SINGLE API call per sheet.
 */
function fetchSmartsheet_(sheetId, apiToken) {
  try {
    var url = SMARTSHEET_API_BASE + '/sheets/' + sheetId;
    var options = { method: 'get', headers: { 'Authorization': 'Bearer ' + apiToken }, muteHttpExceptions: true };
    var resp = UrlFetchApp.fetch(url, options);
    if (resp.getResponseCode() !== 200) return { ok: false, error: 'HTTP ' + resp.getResponseCode() };
    var data = JSON.parse(resp.getContentText());
    return { ok: true, name: data.name || '', columns: data.columns || [], rows: data.rows || [] };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}


/**
 * Batch update multiple Smartsheet rows in one API call.
 * Smartsheet PUT /sheets/{sheetId}/rows accepts up to 200 rows per request.
 * @param {string|number} sheetId
 * @param {Array} rowUpdates - [{id: rowId, cells: [{columnId, value}]}]
 * @param {string} apiToken
 * @param {Object=} colMetaById - optional column metadata map for formula filtering
 * @returns {{ok: boolean, updated?: number, error?: string}}
 */
function batchUpdateSmartsheetRows_(sheetId, rowUpdates, apiToken, colMetaById) {
  try {
    if (!rowUpdates || rowUpdates.length === 0) return { ok: true, updated: 0 };

    // Filter out formula columns if metadata available
    var cleaned = [];
    for (var i = 0; i < rowUpdates.length; i++) {
      var ru = rowUpdates[i];
      var safeCells = [];
      for (var j = 0; j < ru.cells.length; j++) {
        var c = ru.cells[j];
        if (colMetaById) {
          var meta = colMetaById[String(c.columnId)];
          if (meta && meta.formula) {
            Logger.log('[BATCH_UPDATE] Skipping formula column %s for row %s', c.columnId, ru.id);
            continue;
          }
        }
        safeCells.push({ columnId: Number(c.columnId), value: c.value });
      }
      if (safeCells.length > 0) {
        cleaned.push({ id: Number(ru.id), cells: safeCells });
      }
    }

    if (cleaned.length === 0) return { ok: false, error: 'No writable cells after formula filter', updated: 0, failedRowIds: [] };

    var totalUpdated = 0;
    var BATCH_SIZE = 200;
    var url = SMARTSHEET_API_BASE + '/sheets/' + sheetId + '/rows';
    var failedRowIds = [];

    for (var start = 0; start < cleaned.length; start += BATCH_SIZE) {
      var chunk = cleaned.slice(start, start + BATCH_SIZE);

      var options = {
        method: 'put',
        contentType: 'application/json',
        payload: JSON.stringify(chunk),
        headers: { 'Authorization': 'Bearer ' + apiToken },
        muteHttpExceptions: true
      };

      var resp = UrlFetchApp.fetch(url, options);
      var code = resp.getResponseCode();
      if (code >= 200 && code < 300) {
        totalUpdated += chunk.length;
        continue;
      }

      Utilities.sleep(300);
      var retryResp = UrlFetchApp.fetch(url, options);
      var retryCode = retryResp.getResponseCode();
      if (retryCode >= 200 && retryCode < 300) {
        totalUpdated += chunk.length;
        continue;
      }

      for (var k = 0; k < chunk.length; k++) {
        failedRowIds.push(chunk[k].id);
      }
      Logger.log('[BATCH_UPDATE] Failed chunk at offset %s: HTTP %s / retry HTTP %s', start, code, retryCode);
    }

    return {
      ok: failedRowIds.length === 0,
      updated: totalUpdated,
      failedRowIds: failedRowIds,
      error: failedRowIds.length ? 'One or more chunks failed' : ''
    };
  } catch (e) {
    return { ok: false, error: String(e), updated: 0, failedRowIds: [] };
  }
}


/**
 * Update a Smartsheet row by title-based mapping.
 * Kept for backward compatibility — fetches sheet for column mapping.
 * @param {string|number} sheetId
 * @param {string|number} rowId
 * @param {Object} updates - { columnTitle: value, ... }
 * @param {string} apiToken
 * @returns {{ok: boolean, error?: string, partial?: boolean}}
 */
function updateSmartsheetRow_(sheetId, rowId, updates, apiToken) {
  try {
    var fetchRes = fetchSmartsheet_(sheetId, apiToken);
    if (!fetchRes.ok) return { ok: false, error: 'Fetch sheet failed: ' + fetchRes.error };
    var columns = fetchRes.columns;
    var titleToId = {};
    var formulaCols = {};
    for (var i = 0; i < columns.length; i++) {
      titleToId[columns[i].title] = columns[i].id;
      if (columns[i].formula) formulaCols[String(columns[i].id)] = true;
    }

    var cells = [];
    for (var title in updates) {
      if (!updates.hasOwnProperty(title)) continue;
      var colId = titleToId[title];
      if (!colId) continue;
      if (formulaCols[String(colId)]) continue;
      cells.push({ columnId: colId, value: updates[title] });
    }

    if (cells.length === 0) return { ok: false, error: 'No writable columns to update (all have formulas?)' };

    var body = [{ id: Number(rowId), cells: cells }];
    var url = SMARTSHEET_API_BASE + '/sheets/' + sheetId + '/rows';
    var options = { method: 'put', contentType: 'application/json', payload: JSON.stringify(body), headers: { 'Authorization': 'Bearer ' + apiToken }, muteHttpExceptions: true };
    var resp = UrlFetchApp.fetch(url, options);
    var code = resp.getResponseCode();
    if (code >= 200 && code < 300) return { ok: true };

    var respText = resp.getContentText();
    if (code === 400 && respText.indexOf('1302') !== -1 && cells.length > 1) {
      Logger.log('[updateSmartsheetRow_] Got 1302, retrying cells individually...');
      var anyOk = false;
      for (var ci = 0; ci < cells.length; ci++) {
        var singleBody = [{ id: Number(rowId), cells: [cells[ci]] }];
        var retryOpts = { method: 'put', contentType: 'application/json', payload: JSON.stringify(singleBody), headers: { 'Authorization': 'Bearer ' + apiToken }, muteHttpExceptions: true };
        var retryResp = UrlFetchApp.fetch(url, retryOpts);
        if (retryResp.getResponseCode() >= 200 && retryResp.getResponseCode() < 300) anyOk = true;
      }
      return anyOk ? { ok: true, partial: true } : { ok: false, error: 'All cell updates failed' };
    }

    return { ok: false, error: 'HTTP ' + code + ' - ' + respText };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/**
 * Update specific cells by columnId for a single row.
 * No redundant sheet refetch — uses optional colMetaById for formula checks.
 * @param {string|number} sheetId
 * @param {string|number} rowId
 * @param {Array} cells - [{columnId, value}]
 * @param {string} apiToken
 * @param {Object=} colMetaById - optional column metadata for formula filtering
 * @returns {{ok: boolean, error?: string, partial?: boolean}}
 */
function patchRowCellsByColumnId_(sheetId, rowId, cells, apiToken, colMetaById) {
  try {
    if (!cells || !cells.length) return { ok: false, error: 'No cells provided' };

    var validCells = [];
    for (var i = 0; i < cells.length; i++) {
      var c = cells[i] || {};
      if (!c.columnId) continue;
      // Skip formula columns if metadata available
      if (colMetaById) {
        var meta = colMetaById[String(c.columnId)];
        if (meta && meta.formula) {
          Logger.log('[patchRowCellsByColumnId_] Skipping formula column %s', c.columnId);
          continue;
        }
      }
      validCells.push({ columnId: Number(c.columnId), value: c.value });
    }
    if (!validCells.length) return { ok: false, error: 'No valid cells' };

    var body = [{ id: Number(rowId), cells: validCells }];
    var url = SMARTSHEET_API_BASE + '/sheets/' + sheetId + '/rows';
    var options = {
      method: 'put',
      contentType: 'application/json',
      payload: JSON.stringify(body),
      headers: { 'Authorization': 'Bearer ' + apiToken },
      muteHttpExceptions: true
    };

    var resp = UrlFetchApp.fetch(url, options);
    var code = resp.getResponseCode();
    var text = resp.getContentText();
    if (code >= 200 && code < 300) return { ok: true };

    // Retry one cell at a time on 400 errors
    if (code === 400 && validCells.length > 1) {
      var anyOk = false;
      for (var ci = 0; ci < validCells.length; ci++) {
        var singleBody = [{ id: Number(rowId), cells: [validCells[ci]] }];
        var singleOpts = {
          method: 'put',
          contentType: 'application/json',
          payload: JSON.stringify(singleBody),
          headers: { 'Authorization': 'Bearer ' + apiToken },
          muteHttpExceptions: true
        };
        var singleResp = UrlFetchApp.fetch(url, singleOpts);
        if (singleResp.getResponseCode() >= 200 && singleResp.getResponseCode() < 300) anyOk = true;
      }
      if (anyOk) return { ok: true, partial: true };
    }

    return { ok: false, error: 'HTTP ' + code + ' - ' + text };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

// Backward compatibility alias
function updateSmartsheetCellsByColumnId_(sheetId, rowId, cells, apiToken) {
  return patchRowCellsByColumnId_(sheetId, rowId, cells, apiToken);
}


/**
 * Basic booking URL verifier - checks scheme and Google Calendar path.
 */
function verifyBookingUrl_(url) {
  if (!url) return { ok: false, error: 'empty' };
  try {
    var s = String(url).trim();
    if (s.indexOf('http://') === 0 || s.indexOf('https://') === 0) {
      if (s.indexOf('calendar.google.com') !== -1 || s.indexOf('/appointments/schedules/') !== -1) return { ok: true };
      return { ok: true, warning: 'non_calendar_url' };
    }
    return { ok: false, error: 'invalid_scheme' };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/**
 * Basic absolute URL validator.
 */
function isValidUrl_(url) {
  if (!url) return false;
  try {
    var s = String(url).trim();
    if (!s) return false;
    if (s.indexOf('http://') !== 0 && s.indexOf('https://') !== 0) return false;
    if (s.indexOf(' ') !== -1) return false;
    if (s.length < 10) return false;
    return true;
  } catch (e) {
    return false;
  }
}
