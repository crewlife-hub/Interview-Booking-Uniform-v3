/**
 * InviteGuard.gs
 * Prevents re-issuing invites (new token rows / emails) when a candidate has
 * already USED or LOCKED an invite for the same brand + email + textForEmail.
 */

function normalizeEmailKey_(email) {
  return String(email || '').toLowerCase().trim();
}

function normalizeBrandKey_(brand) {
  return String(brand || '').toUpperCase().trim();
}

function normalizeTextKey_(textForEmail) {
  return String(textForEmail || '').toLowerCase().trim();
}

function computeEmailHashHex_(email) {
  var e = normalizeEmailKey_(email);
  if (!e) return '';
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, e)
    .map(function(b) { return ('0' + (b & 0xFF).toString(16)).slice(-2); })
    .join('');
}

function computeEmailHashBase64_(email) {
  var e = normalizeEmailKey_(email);
  if (!e) return '';
  var hash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, e);
  return Utilities.base64Encode(hash);
}

function getEmailHashVariants_(email) {
  return {
    hex: computeEmailHashHex_(email),
    base64: computeEmailHashBase64_(email)
  };
}

/**
 * Scan TOKENS for matching rows and decide whether issuance must be blocked.
 *
 * Matching key: Brand + Text For Email + (Email OR Email Hash variants).
 * Latest row: chosen by Created At timestamp (fallback: sheet row order).
 *
 * Decision rules (applied to LATEST row only):
 * 1) If latest.Status == "USED" => BLOCK always
 * 2) Else if latest.Locked == "LOCKED" => BLOCK
 * 3) Else if latest.Locked == "UNLOCK" => ALLOW
 * 4) Else if latest.Status == "LOCKED" => BLOCK
 * 5) Else ALLOW
 *
 * Header-based lookup only (no fixed indices). If Locked header is missing,
 * Locked is treated as blank and only Status rules apply.
 *
 * @param {{sheet?:GoogleAppsScript.Spreadsheet.Sheet, brand:string, email:string, textForEmail:string}} params
 * @returns {{blocked:boolean, found?:boolean, rowIndex?:number, status?:string, locked?:string, tokenPrefix?:string, overrideUnlock?:boolean, reason?:string}}
 */
function findBlockingInviteInTokens_(params) {
  var sheet = params.sheet;
  if (!sheet) {
    var ss = getConfigSheet_();
    sheet = ss.getSheetByName('TOKENS');
  }
  if (!sheet) return { blocked: false };

  var brandKey = normalizeBrandKey_(params.brand);
  var emailKey = normalizeEmailKey_(params.email);
  var textKey = normalizeTextKey_(params.textForEmail);
  if (!brandKey || !emailKey || !textKey) return { blocked: false };

  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 2) return { blocked: false };

  var values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  var headers = values[0].map(function(h) { return String(h || '').trim(); });

  function idxOf(name) {
    return headers.indexOf(name);
  }

  var idxBrand = idxOf('Brand');
  var idxEmail = idxOf('Email');
  var idxEmailHash = idxOf('Email Hash');
  var idxText = idxOf('Text For Email');
  var idxStatus = idxOf('Status');
  var idxLocked = idxOf('Locked');
  var idxToken = idxOf('Token');
  var idxCreatedAt = idxOf('Created At');

  if (idxBrand === -1 || idxText === -1 || idxStatus === -1) {
    return { blocked: false };
  }

  var emailHashes = getEmailHashVariants_(emailKey);

  function toMillis_(v) {
    if (!v) return NaN;
    if (Object.prototype.toString.call(v) === '[object Date]') {
      var t = v.getTime();
      return isFinite(t) ? t : NaN;
    }
    var d = new Date(v);
    var ms = d.getTime();
    return isFinite(ms) ? ms : NaN;
  }

  var latestRow = null;
  var latestR = -1;
  var latestMs = NaN;
  var sawValidMs = false;

  // Query all matching rows, then choose latest by Created At (fallback row order).
  for (var r = 1; r < values.length; r++) {
    var row = values[r];

    var rowBrand = normalizeBrandKey_(row[idxBrand]);
    if (rowBrand !== brandKey) continue;

    var rowText = normalizeTextKey_(row[idxText]);
    if (rowText !== textKey) continue;

    var emailMatch = false;
    if (idxEmail !== -1) {
      var rowEmail = normalizeEmailKey_(row[idxEmail]);
      if (rowEmail && rowEmail === emailKey) emailMatch = true;
    }
    if (!emailMatch && idxEmailHash !== -1) {
      var rowHash = String(row[idxEmailHash] || '').trim();
      if (rowHash && (rowHash === emailHashes.hex || rowHash === emailHashes.base64)) {
        emailMatch = true;
      }
    }
    if (!emailMatch) continue;

    var ms = NaN;
    if (idxCreatedAt !== -1) {
      ms = toMillis_(row[idxCreatedAt]);
      if (isFinite(ms)) {
        if (!sawValidMs || ms > latestMs || (ms === latestMs && r > latestR)) {
          latestRow = row;
          latestR = r;
          latestMs = ms;
        }
        sawValidMs = true;
        continue;
      }
    }

    // Fallback: if no valid Created At seen, pick by row order.
    if (!sawValidMs) {
      if (r > latestR) {
        latestRow = row;
        latestR = r;
      }
    }
  }

  if (!latestRow) return { blocked: false, found: false };

  var latestStatus = String(latestRow[idxStatus] || '').trim().toUpperCase();
  var latestLocked = idxLocked === -1 ? '' : String(latestRow[idxLocked] || '').trim().toUpperCase();

  var tokenPrefix = '';
  try {
    if (idxToken !== -1) {
      var tok = String(latestRow[idxToken] || '');
      if (tok) tokenPrefix = tok.substring(0, 8) + '...';
    }
  } catch (e) {}

  // Apply decision rules to latest row only.
  if (latestStatus === 'USED') {
    return { blocked: true, found: true, rowIndex: latestR + 1, status: latestStatus, locked: latestLocked, tokenPrefix: tokenPrefix, reason: 'LATEST_USED' };
  }
  if (latestLocked === 'LOCKED') {
    return { blocked: true, found: true, rowIndex: latestR + 1, status: latestStatus, locked: latestLocked, tokenPrefix: tokenPrefix, reason: 'LATEST_LOCKED_FLAG' };
  }
  if (latestLocked === 'UNLOCK') {
    return { blocked: false, found: true, rowIndex: latestR + 1, status: latestStatus, locked: latestLocked, tokenPrefix: tokenPrefix, overrideUnlock: true, reason: 'LATEST_UNLOCK_OVERRIDE' };
  }
  if (latestStatus === 'LOCKED') {
    return { blocked: true, found: true, rowIndex: latestR + 1, status: latestStatus, locked: latestLocked, tokenPrefix: tokenPrefix, reason: 'LATEST_LOCKED_STATUS' };
  }

  return { blocked: false, found: true, rowIndex: latestR + 1, status: latestStatus, locked: latestLocked, tokenPrefix: tokenPrefix, reason: 'LATEST_ALLOWED' };
}
