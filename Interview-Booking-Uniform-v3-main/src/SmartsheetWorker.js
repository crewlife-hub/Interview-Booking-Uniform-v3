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
  var limit = Number(opts.limit) || 200;
  var brands = opts.brand ? [String(opts.brand).toUpperCase()] : getAllBrandCodes_();

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

      for (var s = 0; s < sheetIds.length; s++) {
        var sheetId = sheetIds[s];
        // Fetch sheet metadata and rows
        var sheetData = fetchSmartsheet_(sheetId, apiToken);
        if (!sheetData.ok) {
          logEvent_(traceId, brand, '', 'SIDEWAYS_SHEET_FETCH_FAILED', { sheetId: sheetId, error: sheetData.error });
          results.errors.push({ sheetId: sheetId, error: sheetData.error });
          continue;
        }

        var columns = sheetData.columns; // array of {id,title}
        var rows = sheetData.rows || [];
        var colTitleToId = {};
        for (var i = 0; i < columns.length; i++) colTitleToId[columns[i].title] = columns[i].id;

        var sendCol = colTitleToId['SEND Interview Invite'] || colTitleToId['Send Interview Invite'] || colTitleToId['SEND Interview'];
        if (!sendCol) {
          logEvent_(traceId, brand, '', 'SIDEWAYS_NO_SEND_COLUMN', { sheetId: sheetId });
          continue;
        }

        var emailColName = getBrand_(brand) && getBrand_(brand).emailColumn ? getBrand_(brand).emailColumn : 'Email';
        var textForEmailCol = getBrand_(brand) && getBrand_(brand).textForEmailColumn ? getBrand_(brand).textForEmailColumn : 'Text For Email';
        var positionLinkCol = colTitleToId['Position Link'] ? 'Position Link' : (colTitleToId['PositionLink'] ? 'PositionLink' : 'Position Link');
        var interviewerCol = colTitleToId['Interviewer'] ? 'Interviewer' : 'Interviewer';
        var dateSentCol = colTitleToId['Date Sent'] ? 'Date Sent' : (colTitleToId['DATE SENT'] ? 'DATE SENT' : null);
        var interviewLinkCol = colTitleToId['Interview Link'] ? 'Interview Link' : (colTitleToId['InterviewLink'] ? 'InterviewLink' : null);

        var found = 0;
        for (var r = 0; r < rows.length && results.processed < limit; r++) {
          var row = rows[r];
          var cells = row.cells || [];
          var rowMap = { rowId: row.id };
          var sendVal = '';
          for (var c = 0; c < cells.length; c++) {
            var cell = cells[c];
            var title = (colTitleToId && colTitleToId) ? (function(){
              for (var t in colTitleToId) { if (colTitleToId[t] === cell.columnId) return t; } return ''; })() : '';
            var value = cell.displayValue || cell.value || '';
            rowMap[title] = value;
            if (cell.columnId === sendCol) sendVal = String(value || '').trim();
          }

          if (String(sendVal).toLowerCase() === 'sideways') {
            results.processed++;
            found++;
            // Validate required fields
            var candidateEmail = rowMap[emailColName] || '';
            var textForEmail = rowMap[textForEmailCol] || '';
            var posLink = rowMap[positionLinkCol] || '';
            var interviewer = rowMap[interviewerCol] || '';

            var stepDetails = { sheetId: sheetId, rowId: row.id, email: candidateEmail, brand: brand, textForEmail: textForEmail };
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

            // Choose booking link: row Position Link preferred, else CL_CODES bookingUrl
            var chosenLink = '';
            var chosenSource = '';
            if (posLink && isValidUrl_(posLink)) {
              chosenLink = posLink;
              chosenSource = 'SMARTSHEET_POSITION_LINK';
            } else {
              var clRes = resolveCLCodeFromTextForEmail_(brand, textForEmail);
              if (clRes && clRes.ok && clRes.bookingUrl) {
                chosenLink = clRes.bookingUrl;
                chosenSource = 'CL_CODES_BOOKING_URL';
              }
            }

            // Verify chosen link looks like a booking schedule (basic check)
            var linkVerified = verifyBookingUrl_(chosenLink);
            if (!linkVerified.ok) {
              logEvent_(traceId, brand, candidateEmail, 'SIDEWAYS_NO_VALID_LINK', { rowId: row.id, chosenLink: chosenLink || null, reason: linkVerified.error });
              results.errors.push({ rowId: row.id, error: 'No valid booking link: ' + linkVerified.error });
              results.skipped++;
              continue;
            }

            // Send email (respect dryRun)
            var recipient = dryRun ? testEmail : candidateEmail;
            var emailResult = sendBookingConfirmEmail_({
              email: recipient,
              brand: brand,
              textForEmail: textForEmail,
              bookingUrl: chosenLink,
              traceId: traceId
            });

            logEvent_(traceId, brand, candidateEmail, 'SIDEWAYS_EMAIL_SENT_ATTEMPT', { rowId: row.id, to: recipient, dryRun: dryRun, ok: emailResult.ok, error: emailResult.error || null });

            if (!emailResult.ok) {
              results.errors.push({ rowId: row.id, error: 'Email send failed: ' + emailResult.error });
              results.skipped++;
              continue;
            }

            // Update Smartsheet row: set SEND Interview Invite -> '🔔Sent', Date Sent, Interview Link
            var updates = {};
            updates['SEND Interview Invite'] = '🔔Sent';
            if (dateSentCol) updates[dateSentCol] = new Date().toISOString();
            if (interviewLinkCol) updates[interviewLinkCol] = chosenLink;

            var updateRes = updateSmartsheetRow_(sheetId, row.id, updates, apiToken);
            logEvent_(traceId, brand, candidateEmail, 'SIDEWAYS_SMARTSHEET_UPDATE', { rowId: row.id, ok: updateRes.ok, error: updateRes.error || null });

            if (!updateRes.ok) {
              results.errors.push({ rowId: row.id, error: 'Smartsheet update failed: ' + updateRes.error });
              results.skipped++;
              continue;
            }

            results.sent++;
            logEvent_(traceId, brand, candidateEmail, 'SIDEWAYS_COMPLETE', { rowId: row.id, chosenSource: chosenSource, chosenLinkMask: maskUrl_(chosenLink) });
          }
        }

        logEvent_(traceId, brand, '', 'SIDEWAYS_SHEET_SUMMARY', { sheetId: sheetId, found: found });
      }
    }
  } catch (e) {
    logEvent_(traceId, '', '', 'SIDEWAYS_EXCEPTION', { error: String(e), stack: e.stack });
    return { ok: false, error: String(e) };
  }

  logEvent_(traceId, '', '', 'SIDEWAYS_RUN_COMPLETE', results);
  return { ok: true, summary: results };
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
    return { ok: true, columns: data.columns || [], rows: data.rows || [] };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}


/**
 * Update a Smartsheet row by id. `updates` is an object mapping columnTitle -> value
 */
function updateSmartsheetRow_(sheetId, rowId, updates, apiToken) {
  try {
    var fetchRes = fetchSmartsheet_(sheetId, apiToken);
    if (!fetchRes.ok) return { ok: false, error: 'Fetch sheet failed: ' + fetchRes.error };
    var columns = fetchRes.columns;
    var titleToId = {};
    for (var i = 0; i < columns.length; i++) titleToId[columns[i].title] = columns[i].id;

    var cells = [];
    for (var title in updates) {
      if (!updates.hasOwnProperty(title)) continue;
      var colId = titleToId[title];
      if (!colId) continue;
      cells.push({ columnId: colId, value: updates[title] });
    }

    if (cells.length === 0) return { ok: false, error: 'No matching columns to update' };

    var body = { id: Number(rowId), cells: cells };
    var url = SMARTSHEET_API_BASE + '/sheets/' + sheetId + '/rows';
    var options = { method: 'put', contentType: 'application/json', payload: JSON.stringify([body]), headers: { 'Authorization': 'Bearer ' + apiToken }, muteHttpExceptions: true };
    var resp = UrlFetchApp.fetch(url, options);
    if (resp.getResponseCode() >= 200 && resp.getResponseCode() < 300) return { ok: true };
    return { ok: false, error: 'HTTP ' + resp.getResponseCode() + ' - ' + resp.getContentText() };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
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
