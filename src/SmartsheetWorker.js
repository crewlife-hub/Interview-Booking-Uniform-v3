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

// Sideways performance constants
var SIDEWAYS_MAX_MS_PER_RUN = 330000; // ~5.5 minutes hard ceiling
var SIDEWAYS_MAX_ROWS_TO_SCAN = 10000; // max rows to examine per sheet per run
var SIDEWAYS_MAX_MATCHES = 60; // stop processing after this many Sideways hits
var SIDEWAYS_PROGRESS_INTERVAL = 300; // progress log every N rows scanned

/** Read the cursor index from ScriptProperties for a brand+sheet combo. */
function getSidewaysCursor_(brand, sheetId) {
  var key = 'SIDEWAYS_CURSOR_' + brand + '_' + sheetId;
  var val = PropertiesService.getScriptProperties().getProperty(key);
  return val ? Number(val) : 0;
}

/** Write the cursor index to ScriptProperties for a brand+sheet combo. */
function setSidewaysCursor_(brand, sheetId, index) {
  var key = 'SIDEWAYS_CURSOR_' + brand + '_' + sheetId;
  PropertiesService.getScriptProperties().setProperty(key, String(index));
}

/**
 * Process rows across all brands (or single brand) where SEND == "Sideways".
 * @param {Object} opts - { brand: string|null, limit: number }
 * @returns {Object} summary
 */
function processSidewaysInvites_(opts) {
  opts = opts || {};

  var runStart = Date.now();
  var hitTimeGuard = false;

  var scanned = 0;
  var skippedSent = 0;
  var matchedSideways = 0;
  var sendAttempted = 0;

  var limit = (opts.limit === undefined || opts.limit === null || opts.limit === '')
    ? SIDEWAYS_MAX_MATCHES
    : Number(opts.limit);
  if (!isFinite(limit) || limit <= 0) limit = SIDEWAYS_MAX_MATCHES;

  var brands = opts.brand ? [String(opts.brand).toUpperCase()] : getAllBrandCodes_();

  var traceId = generateTraceId_();
  logEvent_(traceId, '', '', 'SIDEWAYS_RUN_START', { mode: 'LIVE', brands: brands, limit: limit });

  var results = { traceId: traceId, processed: 0, sent: 0, updated: 0, skipped: 0, errors: [] };

  var cfg = getConfig_();
  var apiToken = cfg.SMARTSHEET_API_TOKEN;
  if (!apiToken) {
    logEvent_(traceId, '', '', 'SIDEWAYS_NO_TOKEN', {});
    return { ok: false, error: 'SMARTSHEET API token not configured' };
  }

  try {
    for (var b = 0; b < brands.length; b++) {
      if (results.processed >= limit) break;
      if (Date.now() - runStart > SIDEWAYS_MAX_MS_PER_RUN) { hitTimeGuard = true; break; }
      var brand = String(brands[b]).toUpperCase();
      var sheetIds = getSmartsheetIdsForBrand_(brand);
      if (!sheetIds || sheetIds.length === 0) {
        logEvent_(traceId, brand, '', 'SIDEWAYS_NO_SHEETS', {});
        continue;
      }
      logEvent_(traceId, brand, '', 'SIDEWAYS_BRAND_SHEETS', { sheetIds: sheetIds, sheetCount: sheetIds.length });

      for (var s = 0; s < sheetIds.length; s++) {
        if (results.processed >= limit) break;
        if (Date.now() - runStart > SIDEWAYS_MAX_MS_PER_RUN) { hitTimeGuard = true; break; }
        var sheetId = sheetIds[s];

        // == SINGLE FETCH per sheet ======================================
        var sheetData = fetchSmartsheet_(sheetId, apiToken);
        if (!sheetData.ok) {
          logEvent_(traceId, brand, '', 'SIDEWAYS_SHEET_FETCH_FAILED', { sheetId: sheetId, error: sheetData.error });
          results.errors.push({ sheetId: sheetId, error: sheetData.error });
          continue;
        }

        var columns = sheetData.columns;
        var rows = sheetData.rows || [];
        var sheetName = String(sheetData.name || '');
        Logger.log('[SIDEWAYS_SHEET] brand=%s sheetId=%s sheetName="%s" rows=%s', brand, sheetId, sheetName, rows.length);

        // == COLUMN MAP (cached from single fetch) =======================
        var colTitleToId = {};
        var colIdToTitle = {};
        var colMetaById = {};
        for (var i = 0; i < columns.length; i++) {
          colTitleToId[columns[i].title] = columns[i].id;
          colIdToTitle[String(columns[i].id)] = columns[i].title;
          colMetaById[String(columns[i].id)] = columns[i];
        }

        // == COLUMN RESOLUTION ===========================================
        var brandCfg = getBrand_(brand) || {};

        function resolveCol_(configIdKey, titleCandidates) {
          var cfgId = brandCfg[configIdKey] ? String(brandCfg[configIdKey]) : null;
          if (cfgId && colIdToTitle[cfgId]) {
            Logger.log('[RESOLVE_COL] %s -> id=%s title="%s"', configIdKey, cfgId, colIdToTitle[cfgId]);
            return { id: Number(cfgId), title: colIdToTitle[cfgId] };
          }
          for (var ti = 0; ti < titleCandidates.length; ti++) {
            if (colTitleToId[titleCandidates[ti]]) {
              Logger.log('[RESOLVE_COL] %s -> title match "%s"', configIdKey, titleCandidates[ti]);
              return { id: colTitleToId[titleCandidates[ti]], title: titleCandidates[ti] };
            }
          }
          return null;
        }

        // SEND column
        var sendRes = resolveCol_('sendColumnId', ['SEND Interview Invite', 'Send Interview Invite', 'SEND Interview']);
        if (!sendRes) {
          var best = null, bestScore = -1;
          for (var sc = 0; sc < columns.length; sc++) {
            var t = String(columns[sc].title || '');
            var stripped = t.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
            if (stripped.indexOf('send') === -1) continue;
            var score = 1;
            if (stripped.indexOf('invite') !== -1) score += 3;
            if (stripped.indexOf('interview') !== -1) score += 5;
            if (stripped.indexOf('1') !== -1) score += 1;
            Logger.log('  SEND_FUZZY: "%s" stripped="%s" score=%s', t, stripped, score);
            if (score > bestScore) { bestScore = score; best = columns[sc]; }
          }
          if (best) sendRes = { id: best.id, title: best.title };
        }

        var sendCol = sendRes ? sendRes.id : null;
        if (!sendCol) {
          var sampleTitles = [];
          for (var ct = 0; ct < Math.min(columns.length, 30); ct++) sampleTitles.push(columns[ct].title);
          logEvent_(traceId, brand, '', 'SIDEWAYS_NO_SEND_COLUMN', { sheetId: sheetId, colCount: columns.length, sample: sampleTitles.slice(0, 10) });
          continue;
        }
        Logger.log('[SIDEWAYS] Using SEND column: id=%s title="%s"', sendCol, sendRes.title);

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
            if (dt.toLowerCase().replace(/[^a-z0-9]/g, '') === 'datesent') {
              dateRes = { id: columns[di].id, title: columns[di].title };
              break;
            }
          }
        }
        var dateSentColId = dateRes ? dateRes.id : null;

        // Position Link column
        var posRes = resolveCol_('positionLinkColumnId', ['Position Link', 'PositionLink']);
        var positionLinkCol = posRes ? posRes.title : 'Position Link';

        // Full Name column
        var nameRes = resolveCol_('fullNameColumnId', ['Full Name', 'Name', 'First Name']);

        // Interviewer column
        var interviewerCol = colTitleToId['Interviewer'] ? 'Interviewer' : 'Interviewer';

        // == ROW PROCESSING ==============================================
        var pendingUpdates = []; // collect for batch update
        var found = 0;

        var rowCount = rows.length;
        var cursor = rowCount ? getSidewaysCursor_(brand, sheetId) : 0;
        if (!rowCount || !isFinite(cursor) || cursor < 0 || cursor >= rowCount) cursor = 0;
        var maxScans = Math.min(rowCount || 0, SIDEWAYS_MAX_ROWS_TO_SCAN);
        var scannedThisSheet = 0;
        var skippedSentThisSheet = 0;
        var matchedSidewaysThisSheet = 0;
        var sendAttemptedThisSheet = 0;

        for (var iScan = 0; iScan < maxScans && results.processed < limit; iScan++) {
          if (Date.now() - runStart > SIDEWAYS_MAX_MS_PER_RUN) { hitTimeGuard = true; break; }

          var rIndex = (cursor + iScan) % rowCount;
          var row = rows[rIndex];
          scannedThisSheet++;
          scanned++;

          if (SIDEWAYS_PROGRESS_INTERVAL > 0 && (scanned % SIDEWAYS_PROGRESS_INTERVAL) === 0) {
            var elapsedSec = Math.round((Date.now() - runStart) / 1000);
            Logger.log(
              '[SIDEWAYS_PROGRESS] brand=%s sheetId=%s scanned=%s processed=%s sidewaysFound=%s skippedSent=%s elapsedSec=%s',
              brand,
              sheetId,
              scanned,
              results.processed,
              matchedSideways,
              skippedSent,
              elapsedSec
            );
          }

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

          // -- IDEMPOTENCY: skip rows already sent ----------------------
          var sendLower = sendVal.toLowerCase();
          if (sendLower.indexOf('sent') !== -1 && sendLower !== 'sideways') {
            skippedSentThisSheet++;
            skippedSent++;
            results.skipped++;
            continue; // already processed (e.g. "🔔 Sent")
          }
          if (sendLower !== 'sideways') continue;

          results.processed++;
          found++;
          matchedSidewaysThisSheet++;
          matchedSideways++;

          var candidateEmail = rowMap[emailColName] || '';
          var textForEmail = rowMap[textForEmailCol] || '';
          var interviewer = rowMap[interviewerCol] || '';
          var candidateName = rowMap['Full Name'] || rowMap['Name'] || rowMap['First Name'] || '';
          var position = rowMap['Position Applied'] || rowMap['Position'] || rowMap['Job Title'] || textForEmail;

          Logger.log('[SIDEWAYS_ROW_FOUND] rowId=%s brand=%s email=%s', row.id, brand, String(candidateEmail || ''));

          var stepDetails = {
            sheetId: sheetId, sheetName: sheetName, rowId: row.id,
            email: candidateEmail, brand: brand, textForEmail: textForEmail
          };
          logEvent_(traceId, brand, candidateEmail, 'SIDEWAYS_ROW_FOUND', stepDetails);

          // -- FIELD VALIDATION -----------------------------------------
          var candidateEmailNorm = String(candidateEmail || '').trim().toLowerCase();
          if (!candidateEmailNorm || !isValidEmail_(candidateEmailNorm) || isPlaceholderEmail_(candidateEmailNorm) || isForbiddenRecipientEmail_(candidateEmailNorm)) {
            Logger.log('[SIDEWAYS_SKIP_INVALID_EMAIL] rowId=%s brand=%s email=%s', row.id, brand, String(candidateEmail || ''));
            logEvent_(traceId, brand, String(candidateEmail || ''), 'SIDEWAYS_ROW_SKIPPED_INVALID_EMAIL', {
              rowId: row.id,
              email: String(candidateEmail || ''),
              forbidden: isForbiddenRecipientEmail_(candidateEmailNorm),
              placeholder: isPlaceholderEmail_(candidateEmailNorm)
            });
            results.skipped++;
            continue;
          }
          if (!textForEmail) {
            logEvent_(traceId, brand, candidateEmail, 'SIDEWAYS_ROW_SKIPPED_NO_TEXT', { rowId: row.id });
            results.skipped++;
            continue;
          }

          // -- LIVE: create OTP + send email ----------------------------
          var otpCreated = createOtp_({
            email: candidateEmailNorm,
            brand: brand,
            textForEmail: textForEmail,
            traceId: traceId
          });
          if (!otpCreated.ok) {
            if (otpCreated.code === 'INVITE_BLOCKED') {
              Logger.log('[SIDEWAYS_SKIP_INVITE_BLOCKED] rowId=%s brand=%s email=%s', row.id, brand, candidateEmailNorm);
              logEvent_(traceId, brand, candidateEmailNorm, 'SIDEWAYS_INVITE_BLOCKED', {
                rowId: row.id,
                reason: otpCreated.reason || 'USED_OR_LOCKED'
              });
              results.skipped++;
              continue;
            }
          }
          if (!otpCreated.ok || !otpCreated.token) {
            logEvent_(traceId, brand, candidateEmailNorm, 'SIDEWAYS_TOKEN_CREATE_FAILED', { rowId: row.id, error: otpCreated.error || 'unknown' });
            results.errors.push({ rowId: row.id, error: 'Token creation failed: ' + (otpCreated.error || 'unknown') });
            results.skipped++;
            continue;
          }

          sendAttemptedThisSheet++;
          sendAttempted++;

          Logger.log('[OTP_CREATED] rowId=%s brand=%s email=%s', row.id, brand, candidateEmailNorm);
          logEvent_(traceId, brand, candidateEmailNorm, 'OTP_CREATED', { rowId: row.id });

          var emailResult = sendBookingConfirmEmail_({
            email: candidateEmailNorm,
            brand: brand,
            textForEmail: textForEmail,
            position: position,
            token: otpCreated.token,
            candidateName: candidateName,
            traceId: traceId
          });

          Logger.log('[SIDEWAYS_EMAIL_SENT] rowId=%s email=%s brand=%s ok=%s error=%s', row.id, candidateEmailNorm, brand, emailResult.ok, emailResult.error || '');
          logEvent_(traceId, brand, candidateEmailNorm, 'SIDEWAYS_EMAIL_SENT', {
            rowId: row.id, to: candidateEmailNorm, ok: emailResult.ok, error: emailResult.error || null
          });

          if (!emailResult.ok) {
            results.errors.push({ rowId: row.id, error: 'Email send failed: ' + emailResult.error });
            results.skipped++;
            continue;
          }

          results.sent++;

          // -- QUEUE ROW UPDATE for batch --------------------------------
          var cellsToUpdate = [{ columnId: Number(sendCol), value: '🔔 Sent' }];
          if (dateSentColId) {
            cellsToUpdate.push({ columnId: Number(dateSentColId), value: new Date().toISOString() });
          }
          pendingUpdates.push({ id: Number(row.id), cells: cellsToUpdate });
        }

        if (rowCount) {
          var newCursor = (cursor + scannedThisSheet) % rowCount;
          setSidewaysCursor_(brand, sheetId, newCursor);
        }

        // == BATCH UPDATE SMARTSHEET =====================================
        if (pendingUpdates.length > 0) {
          Logger.log('[SIDEWAYS_BATCH] Updating %s rows in sheet %s', pendingUpdates.length, sheetId);
          var batchResult = batchUpdateSmartsheetRows_(sheetId, pendingUpdates, apiToken, colMetaById);
          Logger.log('[SIDEWAYS_SMARTSHEET_UPDATE_OCCURRED] sheetId=%s ok=%s updated=%s', sheetId, batchResult.ok, batchResult.updated || 0);
          logEvent_(traceId, brand, '', 'SIDEWAYS_BATCH_UPDATE', {
            sheetId: sheetId, requested: pendingUpdates.length,
            ok: batchResult.ok, updated: batchResult.updated || 0,
            error: batchResult.error || null
          });
          if (batchResult.ok) {
            results.updated += (batchResult.updated || pendingUpdates.length);
            Logger.log('[SIDEWAYS_BATCH] %s rows updated successfully', batchResult.updated || pendingUpdates.length);
            var expectedUpdated = pendingUpdates.length;
            var actualUpdated = batchResult.updated || expectedUpdated;
            if (actualUpdated === expectedUpdated) {
              for (var u = 0; u < pendingUpdates.length; u++) {
                Logger.log('[SIDEWAYS_UPDATE_OK] sheetId=%s rowId=%s', sheetId, pendingUpdates[u].id);
              }
            } else {
              Logger.log('[SIDEWAYS_UPDATE_OK] sheetId=%s updated=%s', sheetId, actualUpdated);
            }
          } else {
            // Batch failed — fall back to per-row updates
            Logger.log('[SIDEWAYS_BATCH] Batch failed: %s — falling back to per-row', batchResult.error);
            for (var pu = 0; pu < pendingUpdates.length; pu++) {
              var rowUpdate = pendingUpdates[pu];
              var perRowResult = patchRowCellsByColumnId_(sheetId, rowUpdate.id, rowUpdate.cells, apiToken, colMetaById);
              if (perRowResult.ok) {
                results.updated++;
                Logger.log('[SIDEWAYS_UPDATE_OK] sheetId=%s rowId=%s', sheetId, rowUpdate.id);
              } else {
                results.errors.push({ rowId: rowUpdate.id, error: 'Row update failed: ' + perRowResult.error });
              }
            }
          }
        }

        logEvent_(traceId, brand, '', 'SIDEWAYS_SHEET_SUMMARY', {
          sheetId: sheetId, sheetName: sheetName, found: found, updated: pendingUpdates.length
        });
      }
    }
  } catch (e) {
    logEvent_(traceId, '', '', 'SIDEWAYS_EXCEPTION', { error: String(e), stack: e.stack });
    return { ok: false, error: String(e) };
  }

  var elapsedSec = Math.round((Date.now() - runStart) / 1000);
  Logger.log(
    '[SIDEWAYS_RUN_SUMMARY] traceId=%s processed=%s scanned=%s skippedSent=%s sidewaysFound=%s sendAttempted=%s sent=%s updated=%s skipped=%s errors=%s elapsedSec=%s timeGuard=%s',
    traceId,
    results.processed,
    scanned,
    skippedSent,
    matchedSideways,
    sendAttempted,
    results.sent,
    results.updated,
    results.skipped,
    (results.errors || []).length,
    elapsedSec,
    hitTimeGuard
  );
  logEvent_(traceId, '', '', 'SIDEWAYS_RUN_SUMMARY', {
    processed: results.processed,
    scanned: scanned,
    skippedSent: skippedSent,
    sidewaysFound: matchedSideways,
    sendAttempted: sendAttempted,
    sent: results.sent,
    updated: results.updated,
    skipped: results.skipped,
    errors: (results.errors || []).length,
    elapsedSec: elapsedSec,
    timeGuard: hitTimeGuard
  });

  Logger.log('[SIDEWAYS_SUMMARY] processed=%s sent=%s updated=%s skipped=%s errors=%s', results.processed, results.sent, results.updated, results.skipped, (results.errors || []).length);
  logEvent_(traceId, '', '', 'SIDEWAYS_RUN_COMPLETE', results);
  return { ok: true, summary: results };
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

    if (cleaned.length === 0) return { ok: false, error: 'No writable cells after formula filter' };

    var totalUpdated = 0;
    var BATCH_SIZE = 200;
    var url = SMARTSHEET_API_BASE + '/sheets/' + sheetId + '/rows';

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
      } else {
        var text = resp.getContentText();
        Logger.log('[BATCH_UPDATE] Failed chunk at offset %s: HTTP %s - %s', start, code, text.substring(0, 500));
        return { ok: false, error: 'HTTP ' + code + ' - ' + text.substring(0, 500), updated: totalUpdated };
      }
    }

    return { ok: true, updated: totalUpdated };
  } catch (e) {
    return { ok: false, error: String(e) };
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
