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
 * Single-call in-memory scan to find a blocking prior invite.
 * Matches on Brand + Text For Email + (Email OR Email Hash variants).
 * Blocks if Status in {USED, LOCKED} OR Locked == LOCKED.
 * Does NOT block on SUPERSEDED rows unless Locked == LOCKED.
 *
 * @param {{sheet?:GoogleAppsScript.Spreadsheet.Sheet, brand:string, email:string, textForEmail:string}} params
 * @returns {{blocked:boolean, rowIndex?:number, status?:string, locked?:string}}
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

  // LOCKED marker fallback:
  // - Prefer an explicit 'Locked' header if present
  // - Otherwise, fall back to column AB (28) if the sheet has that many columns
  //   (TokenService writes LOCKED to AB regardless of header schema)
  var AB_LOCKED_ZERO_BASED = 27;
  if (idxLocked === -1 && lastCol >= 28) {
    idxLocked = AB_LOCKED_ZERO_BASED;
  }

  if (idxBrand === -1 || idxText === -1 || idxStatus === -1) {
    return { blocked: false };
  }

  var emailHashes = getEmailHashVariants_(emailKey);

  // Scan newest -> oldest to find the latest relevant row quickly.
  for (var r = values.length - 1; r >= 1; r--) {
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

    var status = String(row[idxStatus] || '').trim().toUpperCase();
    var locked = idxLocked === -1 ? '' : String(row[idxLocked] || '').trim().toUpperCase();

    if (locked === 'LOCKED' || status === 'USED' || status === 'LOCKED') {
      var tokenPrefix = '';
      try {
        if (idxToken !== -1) {
          var tok = String(row[idxToken] || '');
          if (tok) tokenPrefix = tok.substring(0, 8) + '...';
        }
      } catch (e) {}
      return { blocked: true, rowIndex: r + 1, status: status, locked: locked, tokenPrefix: tokenPrefix };
    }
  }

  return { blocked: false };
}
