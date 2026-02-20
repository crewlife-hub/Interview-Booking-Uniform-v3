/**
 * SmartsheetWorker.gs
 * Worker to scan Smartsheet rows for SEND Interview Invite == "Sideways"
 * Sends invite emails with chosen booking link and updates Smartsheet rows.
 */

/**
 * Process rows across all brands (or single brand) where SEND Interview Invite == "Sideways"
 * @param {Object} opts - { dryRun: boolean, testEmail: string, brand: string|null, limit: number }
 * @returns {Object} summary
 */
function processSidewaysInvites_(opts) {
  opts = opts || {};
  var dryRun = !!opts.dryRun;
  var testEmail = opts.testEmail || 'info@crewlifeatsea.com';
  // Never update Smartsheet in dryRun.
  var updateSheet = !dryRun && ((opts.updateSheet === undefined || opts.updateSheet === null) ? true : !!opts.updateSheet);
  // Limit is optional. When omitted, we do not cap processing.
  // Note: Apps Script runtime/quota may still impose practical limits.
  var limit = (opts.limit === undefined || opts.limit === null || opts.limit === '')
    ? Number.MAX_SAFE_INTEGER
    : Number(opts.limit);
  if (!isFinite(limit) || limit <= 0) limit = Number.MAX_SAFE_INTEGER;
  var brands = opts.brand ? [String(opts.brand).toUpperCase()] : getAllBrandCodes_();
  var SIDEWAYS_CTA_BASE = 'https://script.google.com/macros/s/AKfycbx-IEEieMEvXPf0cXC_R_y6KKtWOMkA2nXJkU1mu8XlIMY7MnCn5eamrzjzvre0frZm0Q/exec';

  var traceId = generateTraceId_();
  logEvent_(traceId, '', '', 'SIDEWAYS_RUN_START', { dryRun: dryRun, brands: brands, limit: limit });

  var results = { traceId: traceId, processed: 0, sent: 0, skipped: 0, errors: [] };

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
        var sheetId = sheetIds[s];
        // Fetch sheet metadata and rows
        var sheetData = fetchSmartsheet_(sheetId, apiToken);
        if (!sheetData.ok) {
          logEvent_(traceId, brand, '', 'SIDEWAYS_SHEET_FETCH_FAILED', { sheetId: sheetId, error: sheetData.error });
          results.errors.push({ sheetId: sheetId, error: sheetData.error });
          continue;
        }

        var columns = sheetData.columns; // array of {id,title,...}
        var rows = sheetData.rows || [];
  var sheetName = String(sheetData.name || '');
  Logger.log('[SIDEWAYS_SHEET] brand=' + brand + ' sheetId=' + sheetId + ' sheetName="' + sheetName + '" rows=' + rows.length);
        var colTitleToId = {};
        var colIdToTitle = {};
        for (var i = 0; i < columns.length; i++) {
          colTitleToId[columns[i].title] = columns[i].id;
          colIdToTitle[String(columns[i].id)] = columns[i].title;
        }

        // ══════════════════════════════════════════════════════════════
        // COLUMN RESOLUTION — USE COLUMN IDs FROM BRAND CONFIG FIRST
        // ══════════════════════════════════════════════════════════════
        var brandCfg = getBrand_(brand) || {};

        // Helper: resolve a column by brand config ID first, then by title name
        function resolveCol_(configIdKey, titleCandidates) {
          var cfgId = brandCfg[configIdKey] ? String(brandCfg[configIdKey]) : null;
          if (cfgId && colIdToTitle[cfgId]) {
            Logger.log('[RESOLVE_COL] ' + configIdKey + ' -> id=' + cfgId + ' title="' + colIdToTitle[cfgId] + '"');
            return { id: Number(cfgId), title: colIdToTitle[cfgId] };
          }
          // Fallback: try exact title matches
          for (var ti = 0; ti < titleCandidates.length; ti++) {
            if (colTitleToId[titleCandidates[ti]]) {
              Logger.log('[RESOLVE_COL] ' + configIdKey + ' -> title match "' + titleCandidates[ti] + '"');
              return { id: colTitleToId[titleCandidates[ti]], title: titleCandidates[ti] };
            }
          }
          return null;
        }

        // SEND column
        var sendRes = resolveCol_('sendColumnId', ['SEND Interview Invite', 'Send Interview Invite', 'SEND Interview']);
        // If not found by ID or exact title, fuzzy-match any column containing "send"
        if (!sendRes) {
          var best = null; var bestScore = -1;
          for (var sc = 0; sc < columns.length; sc++) {
            var t = String(columns[sc].title || '');
            var stripped = t.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
            if (stripped.indexOf('send') === -1) continue;
            var score = 1;
            if (stripped.indexOf('invite') !== -1) score += 3;
            if (stripped.indexOf('interview') !== -1) score += 5;
            if (stripped.indexOf('1') !== -1) score += 1;
            Logger.log('  SEND_FUZZY: "' + t + '" stripped="' + stripped + '" score=' + score);
            if (score > bestScore) { bestScore = score; best = columns[sc]; }
          }
          if (best) sendRes = { id: best.id, title: best.title };
        }

        var sendColTitle = sendRes ? sendRes.title : null;
        var sendCol = sendRes ? sendRes.id : null;

        if (!sendCol || !sendColTitle) {
          var sampleTitles = [];
          for (var ct = 0; ct < Math.min(columns.length, 30); ct++) sampleTitles.push(columns[ct].title);
          Logger.log('[SIDEWAYS_NO_SEND_COLUMN] sampleTitles: ' + JSON.stringify(sampleTitles));
          logEvent_(traceId, brand, '', 'SIDEWAYS_NO_SEND_COLUMN', { sheetId: sheetId, colCount: columns.length, sample: sampleTitles.slice(0, 10) });
          continue;
        }
        Logger.log('[SIDEWAYS] Using SEND column: id=' + sendCol + ' title="' + sendColTitle + '"');

        // Email column
        var emailRes = resolveCol_('emailColumnId', [brandCfg.emailColumn || 'Email', 'Email']);
        var emailColName = emailRes ? emailRes.title : (brandCfg.emailColumn || 'Email');

        // Text For Email column
        var textRes = resolveCol_('textForEmailColumnId', [brandCfg.textForEmailColumn || 'Text For Email', 'Text For Email']);
        var textForEmailCol = textRes ? textRes.title : (brandCfg.textForEmailColumn || 'Text For Email');

        // Interview Link column
        var linkRes = resolveCol_('interviewLinkColumnId', ['Interview 1 Link', 'Interview 1 link', 'Interview Link', 'InterviewLink']);
        var interviewLinkCol = linkRes ? linkRes.title : null;

        // Date Sent column
        var dateRes = resolveCol_('dateSentColumnId', ['Date Sent', 'DATE SENT', 'DATE_SENT']);
        if (!dateRes) {
          for (var di = 0; di < columns.length; di++) {
            var dt = String(columns[di].title || '');
            var normalized = dt.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (normalized === 'datesent') {
              dateRes = { id: columns[di].id, title: columns[di].title };
              break;
            }
          }
        }
        var dateSentCol = dateRes ? dateRes.title : null;
        var dateSentColId = dateRes ? dateRes.id : null;

        // Position Link column
        var posRes = resolveCol_('positionLinkColumnId', ['Position Link', 'PositionLink']);
        var positionLinkCol = posRes ? posRes.title : 'Position Link';

        // Full Name column
        var nameRes = resolveCol_('fullNameColumnId', ['Full Name', 'Name', 'First Name']);

        // Interviewer column
        var interviewerCol = colTitleToId['Interviewer'] ? 'Interviewer' : 'Interviewer';

        var found = 0;
        for (var r = 0; r < rows.length && results.processed < limit; r++) {
          var row = rows[r];
          var cells = row.cells || [];
          var rowMap = { rowId: row.id };
          var sendVal = '';
          for (var c = 0; c < cells.length; c++) {
            var cell = cells[c];
            var title = colIdToTitle[String(cell.columnId)] || '';
            var value = getSmartsheetCellString_(cell);
            rowMap[title] = value;
            if (cell.columnId === sendCol) sendVal = String(value || '').trim();
          }

          if (String(sendVal).toLowerCase() === 'sideways') {
            results.processed++;
            found++;
            // Validate required fields
            var candidateEmail = rowMap[emailColName] || '';
            var textForEmail = rowMap[textForEmailCol] || '';
            var interviewer = rowMap[interviewerCol] || '';
            // Candidate name — try Full Name, Name, First Name columns
            var candidateName = rowMap['Full Name'] || rowMap['Name'] || rowMap['First Name'] || '';
            // Position — try Position Applied, Position, Job Title columns; fall back to textForEmail
            var position = rowMap['Position Applied'] || rowMap['Position'] || rowMap['Job Title'] || textForEmail;

            var stepDetails = { sheetId: sheetId, sheetName: sheetName, rowId: row.id, email: candidateEmail, brand: brand, textForEmail: textForEmail };
            logEvent_(traceId, brand, candidateEmail, 'SIDEWAYS_ROW_FOUND', stepDetails);

            // Field validation
            if (!candidateEmail) {
              logEvent_(traceId, brand, candidateEmail, 'SIDEWAYS_ROW_SKIPPED_NO_EMAIL', { rowId: row.id });
              results.skipped++;
              continue;
            }
            if (!textForEmail) {
              logEvent_(traceId, brand, candidateEmail, 'SIDEWAYS_ROW_SKIPPED_NO_TEXT', { rowId: row.id });
              results.skipped++;
              continue;
            }

            // Build token-gated CTA URL WITHOUT requiring any Smartsheet booking link fields.
            var otpCreated = createOtp_({
              email: candidateEmail,
              brand: brand,
              textForEmail: textForEmail,
              traceId: traceId
            });
            if (!otpCreated.ok || !otpCreated.token) {
              logEvent_(traceId, brand, candidateEmail, 'SIDEWAYS_TOKEN_CREATE_FAILED', { rowId: row.id, error: otpCreated.error || 'unknown' });
              results.errors.push({ rowId: row.id, error: 'Token creation failed: ' + (otpCreated.error || 'unknown') });
              results.skipped++;
              continue;
            }

            var ctaUrl = SIDEWAYS_CTA_BASE + '?token=' + encodeURIComponent(otpCreated.token);
            Logger.log('[SIDEWAYS_CTA_URL] base=' + SIDEWAYS_CTA_BASE + ' hasToken=' + (!!otpCreated.token));

            // Send email (respect dryRun)
            var recipient = dryRun ? testEmail : candidateEmail;
            Logger.log('[SIDEWAYS_EMAIL_SEND] brand=' + brand + ' rowId=' + row.id + ' email=' + recipient);
            var emailResult = sendBookingConfirmEmail_({
              email: recipient,
              brand: brand,
              textForEmail: textForEmail,
              position: position,
              token: otpCreated.token,
              ctaUrl: ctaUrl,
              candidateName: candidateName,
              traceId: traceId
            });

            logEvent_(traceId, brand, candidateEmail, 'SIDEWAYS_EMAIL_SENT_ATTEMPT', { rowId: row.id, to: recipient, dryRun: dryRun, ok: emailResult.ok, error: emailResult.error || null });

            if (!emailResult.ok) {
              results.errors.push({ rowId: row.id, error: 'Email send failed: ' + emailResult.error });
              results.skipped++;
              continue;
            }

            results.sent++;
            if (!updateSheet) {
              logEvent_(traceId, brand, candidateEmail, 'SIDEWAYS_DRYRUN_NO_UPDATE', { rowId: row.id });
              logEvent_(traceId, brand, candidateEmail, 'SIDEWAYS_COMPLETE', { rowId: row.id });
            } else {
              var cellsToUpdate = [{ columnId: Number(sendCol), value: '🔔Sent' }];
              var dateSentValue = null;
              if (dateSentColId) {
                dateSentValue = new Date().toISOString();
                cellsToUpdate.push({ columnId: Number(dateSentColId), value: dateSentValue });
              }

              var updateRes = patchRowCellsByColumnId_(sheetId, row.id, cellsToUpdate, apiToken);
              logEvent_(traceId, brand, candidateEmail, 'SIDEWAYS_SMARTSHEET_UPDATE', { rowId: row.id, ok: updateRes.ok, error: updateRes.error || null });

              if (!updateRes.ok) {
                results.errors.push({ rowId: row.id, error: 'Smartsheet update failed: ' + updateRes.error });
                results.skipped++;
                continue;
              }

              logEvent_(traceId, brand, candidateEmail, 'SIDEWAYS_ROW_UPDATED', {
                sheetId: sheetId,
                rowId: row.id,
                send: '🔔Sent',
                dateSent: dateSentValue
              });
              Logger.log('[SIDEWAYS_UPDATE_SENT] rowId=' + row.id + ' updatedTo=🔔Sent');
              logEvent_(traceId, brand, candidateEmail, 'SIDEWAYS_COMPLETE', { rowId: row.id });
            }
          }
        }

        logEvent_(traceId, brand, '', 'SIDEWAYS_SHEET_SUMMARY', { sheetId: sheetId, sheetName: sheetName, found: found });
      }
    }
  } catch (e) {
    logEvent_(traceId, '', '', 'SIDEWAYS_EXCEPTION', { error: String(e), stack: e.stack });
    return { ok: false, error: String(e) };
  }

  logEvent_(traceId, '', '', 'SIDEWAYS_RUN_COMPLETE', results);
  return { ok: true, summary: results };
}

function getSmartsheetCellString_(cell) {
  if (!cell) return '';
  try {
    if (cell.displayValue !== undefined && cell.displayValue !== null && cell.displayValue !== '') {
      return String(cell.displayValue);
    }
    var v = cell.value;
    if (v === undefined || v === null) return '';
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v);
    // Smartsheet hyperlink values can sometimes be objects.
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
 * Uses a conservative limit to reduce timeouts/quota spikes.
 */
function processSidewaysInvitesScheduled_() {
  return processSidewaysInvites_({ limit: 200 });
}


/**
 * Fetch sheet metadata and rows
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
 * Update a Smartsheet row by id. `updates` is an object mapping columnTitle -> value.
 * Automatically skips columns that have column-level formulas (which Smartsheet blocks from API writes).
 * If the first attempt fails with error 1302, retries with only non-formula columns.
 */
function updateSmartsheetRow_(sheetId, rowId, updates, apiToken) {
  try {
    var fetchRes = fetchSmartsheet_(sheetId, apiToken);
    if (!fetchRes.ok) return { ok: false, error: 'Fetch sheet failed: ' + fetchRes.error };
    var columns = fetchRes.columns;
    var titleToId = {};
    var formulaCols = {};  // column IDs that have column formulas
    for (var i = 0; i < columns.length; i++) {
      titleToId[columns[i].title] = columns[i].id;
      // Smartsheet API returns 'formula' on columns with column-level formulas
      if (columns[i].formula) {
        formulaCols[String(columns[i].id)] = true;
        Logger.log('[updateSmartsheetRow_] Skipping formula column: ' + columns[i].title);
      }
    }

    var cells = [];
    for (var title in updates) {
      if (!updates.hasOwnProperty(title)) continue;
      var colId = titleToId[title];
      if (!colId) continue;
      if (formulaCols[String(colId)]) continue;  // skip formula columns
      cells.push({ columnId: colId, value: updates[title] });
    }

    if (cells.length === 0) return { ok: false, error: 'No writable columns to update (all have formulas?)' };

    var body = { id: Number(rowId), cells: cells };
    var url = SMARTSHEET_API_BASE + '/sheets/' + sheetId + '/rows';
    var options = { method: 'put', contentType: 'application/json', payload: JSON.stringify([body]), headers: { 'Authorization': 'Bearer ' + apiToken }, muteHttpExceptions: true };
    var resp = UrlFetchApp.fetch(url, options);
    var code = resp.getResponseCode();
    if (code >= 200 && code < 300) return { ok: true };

    // If error 1302 (column formula), retry with fewer columns one-by-one
    var respText = resp.getContentText();
    if (code === 400 && respText.indexOf('1302') !== -1 && cells.length > 1) {
      Logger.log('[updateSmartsheetRow_] Got 1302 error, retrying cells individually...');
      var anyOk = false;
      for (var ci = 0; ci < cells.length; ci++) {
        var singleBody = { id: Number(rowId), cells: [cells[ci]] };
        var retryOpts = { method: 'put', contentType: 'application/json', payload: JSON.stringify([singleBody]), headers: { 'Authorization': 'Bearer ' + apiToken }, muteHttpExceptions: true };
        var retryResp = UrlFetchApp.fetch(url, retryOpts);
        var retryCode = retryResp.getResponseCode();
        if (retryCode >= 200 && retryCode < 300) {
          anyOk = true;
          Logger.log('[updateSmartsheetRow_] Cell ' + ci + ' updated OK');
        } else {
          Logger.log('[updateSmartsheetRow_] Cell ' + ci + ' failed: ' + retryResp.getContentText().substring(0, 200));
        }
      }
      return anyOk ? { ok: true, partial: true } : { ok: false, error: 'All individual cell updates failed (formula columns?)' };
    }

    return { ok: false, error: 'HTTP ' + code + ' - ' + respText };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/**
 * Update specific Smartsheet cells by columnId for a row.
 * Bypasses title-based mapping and formula-column skip logic.
 * @param {string|number} sheetId
 * @param {string|number} rowId
 * @param {Array} cells - [{columnId:number, value:any}]
 * @param {string} apiToken
 * @returns {{ok:boolean, error?:string, partial?:boolean}}
 */
function patchRowCellsByColumnId_(sheetId, rowId, cells, apiToken) {
  try {
    if (!cells || !cells.length) return { ok: false, error: 'No cells provided' };

    var validCells = [];
    for (var i = 0; i < cells.length; i++) {
      var c = cells[i] || {};
      if (!c.columnId) continue;
      validCells.push({ columnId: Number(c.columnId), value: c.value });
    }
    if (!validCells.length) return { ok: false, error: 'No valid columnId cells provided' };

    // Preflight diagnostics for formula/locked-like columns.
    var colMetaById = {};
    var fetchRes = fetchSmartsheet_(sheetId, apiToken);
    if (fetchRes.ok && fetchRes.columns) {
      for (var fi = 0; fi < fetchRes.columns.length; fi++) {
        var fc = fetchRes.columns[fi];
        colMetaById[String(fc.id)] = fc;
      }
      var formulaLocked = [];
      for (var vi = 0; vi < validCells.length; vi++) {
        var meta = colMetaById[String(validCells[vi].columnId)];
        if (meta && meta.formula) {
          formulaLocked.push({ columnId: validCells[vi].columnId, title: meta.title || '', reason: 'column_formula' });
        }
      }
      if (formulaLocked.length > 0) {
        var formulaMsg = 'Formula/locked column(s) cannot be updated: ' + JSON.stringify(formulaLocked);
        Logger.log('[patchRowCellsByColumnId_] ' + formulaMsg);
        return { ok: false, code: 'FORMULA_OR_LOCKED', error: formulaMsg };
      }
    }

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

    var lowerText = String(text || '').toLowerCase();
    if (lowerText.indexOf('formula') !== -1 || lowerText.indexOf('locked') !== -1 || lowerText.indexOf('read only') !== -1) {
      var lockMsg = 'Smartsheet rejected update (formula/locked/read-only column): HTTP ' + code + ' - ' + text;
      Logger.log('[patchRowCellsByColumnId_] ' + lockMsg);
      return { ok: false, code: 'FORMULA_OR_LOCKED', error: lockMsg };
    }

    // Safe fallback: retry one cell at a time to survive partial write constraints.
    if (code === 400 && validCells.length > 1) {
      var anyOk = false;
      var cellErrors = [];
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
        var singleCode = singleResp.getResponseCode();
        if (singleCode >= 200 && singleCode < 300) {
          anyOk = true;
        } else {
          var singleText = String(singleResp.getContentText() || '');
          cellErrors.push({ columnId: validCells[ci].columnId, code: singleCode, error: singleText.substring(0, 300) });
        }
      }
      if (anyOk) return { ok: true, partial: true };
      return { ok: false, error: 'Cell-by-columnId updates failed: HTTP ' + code + ' - ' + text + ' details=' + JSON.stringify(cellErrors) };
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
 * Basic booking URL verifier – checks scheme and common Google Calendar appointments path
 */
function verifyBookingUrl_(url) {
  if (!url) return { ok: false, error: 'empty' };
  try {
    var s = String(url).trim();
    if (s.indexOf('http://') === 0 || s.indexOf('https://') === 0) {
      // basic check for google appointments schedule pattern
      if (s.indexOf('calendar.google.com') !== -1 || s.indexOf('/appointments/schedules/') !== -1) return { ok: true };
      // otherwise accept as valid absolute URL but mark non-calendar
      return { ok: true, warning: 'non_calendar_url' };
    }
    return { ok: false, error: 'invalid_scheme' };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/**
 * Basic absolute URL validator.
 * Used for Smartsheet fields like "Position Link".
 */
function isValidUrl_(url) {
  if (!url) return false;
  try {
    var s = String(url).trim();
    if (!s) return false;
    if (s.indexOf('http://') !== 0 && s.indexOf('https://') !== 0) return false;
    if (s.indexOf(' ') !== -1) return false;
    // avoid obviously broken URLs
    if (s.length < 10) return false;
    return true;
  } catch (e) {
    return false;
  }
}
