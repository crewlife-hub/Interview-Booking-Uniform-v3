/**
 * TestRunner.gs
 * Test functions to verify the OTP flow.
 * Run these from the Apps Script editor to test the system.
 */

/**
 * TEST 1: Generate a signed URL for testing
 * Run this, then copy the URL from the log and open in browser.
 */
function TEST_GenerateSignedUrl() {
  // ⚠️ CHANGE THIS to your real email to receive the OTP
  var testEmail = 'crewlife@seainfogroup.com';
  var testTextForEmail = 'Waiters - CL200';
  var testBrand = 'ROYAL';
  
  Logger.log('=== GENERATING SIGNED URL ===');
  Logger.log('Email: ' + testEmail);
  Logger.log('Position: ' + testTextForEmail);
  Logger.log('Brand: ' + testBrand);
  
  var result = generateSignedUrl_({
    brand: testBrand,
    email: testEmail,
    textForEmail: testTextForEmail
  });
  
  Logger.log('');
  Logger.log('=== RESULT ===');
  Logger.log(JSON.stringify(result, null, 2));
  
  if (result.ok) {
    Logger.log('');
    Logger.log('✅ SUCCESS! Copy this URL and open in your browser:');
    Logger.log('');
    Logger.log(result.url);
    Logger.log('');
    Logger.log('Link expires: ' + result.expiresAt);
  } else {
    Logger.log('');
    Logger.log('❌ ERROR: ' + result.error);
  }
  
  return result;
}

/**
 * TEST 2: Create an OTP directly (skips URL validation)
 * Use this to test OTP creation and email sending.
 * IMPORTANT: Logs the verify URL with token for deterministic verification.
 */
function TEST_CreateAndSendOtp() {
  // ⚠️ CHANGE THIS to your real email
  var testEmail = 'crewlife@seainfogroup.com';
  var testTextForEmail = 'Waiters - CL200';
  var testBrand = 'ROYAL';
  
  Logger.log('=== CREATING OTP ===');
  Logger.log('Email: ' + testEmail);
  
  var otpResult = createOtp_({
    email: testEmail,
    brand: testBrand,
    textForEmail: testTextForEmail,
    traceId: 'test-' + Date.now()
  });
  
  Logger.log('');
  Logger.log('=== OTP RESULT ===');
  Logger.log(JSON.stringify(otpResult, null, 2));
  
  if (!otpResult.ok) {
    Logger.log('❌ Failed to create OTP: ' + otpResult.error);
    return;
  }
  
  Logger.log('');
  Logger.log('✅ OTP Created: ' + otpResult.otp);
  Logger.log('✅ Token: ' + otpResult.token);
  Logger.log('Expires: ' + otpResult.expiresAt);
  Logger.log('');
  Logger.log('=== SENDING EMAIL ===');
  
  var emailResult = sendOtpEmail_({
    email: testEmail,
    otp: otpResult.otp,
    brand: testBrand,
    textForEmail: testTextForEmail,
    token: otpResult.token,  // Include token for deterministic verify URL
    expiryMinutes: otpResult.expiryMinutes,
    traceId: 'test-' + Date.now()
  });
  
  if (emailResult.ok) {
    Logger.log('✅ Email sent! Check inbox for: ' + testEmail);
    Logger.log('');
    Logger.log('OTP to enter: ' + otpResult.otp);
  } else {
    Logger.log('❌ Email failed: ' + emailResult.error);
  }
  
  // Build verify URL WITH TOKEN for deterministic lookup
  var verifyUrl = getWebAppUrl_() + 
    '?page=verify&brand=' + encodeURIComponent(testBrand) + 
    '&e=' + encodeURIComponent(testEmail) + 
    '&t=' + encodeURIComponent(testTextForEmail) +
    '&token=' + encodeURIComponent(otpResult.token);
  
  Logger.log('');
  Logger.log('=== VERIFY PAGE (with token) ===');
  Logger.log('Open this URL and enter the OTP:');
  Logger.log(verifyUrl);
  Logger.log('');
  Logger.log('OTP: ' + otpResult.otp);
}

/**
 * TEST 3: Validate an OTP
 * Run this after receiving the OTP email.
 */
function TEST_ValidateOtp() {
  // ⚠️ CHANGE THESE VALUES
  var testEmail = 'crewlife@seainfogroup.com';
  var testBrand = 'ROYAL';
  var testOtp = '123456';  // ← Enter the OTP from your email here
  var testTextForEmail = 'Waiters - CL200';
  
  Logger.log('=== VALIDATING OTP ===');
  Logger.log('Email: ' + testEmail);
  Logger.log('OTP: ' + testOtp);
  
  var result = validateOtp_({
    email: testEmail,
    brand: testBrand,
    otp: testOtp,
    textForEmail: testTextForEmail,
    traceId: 'test-' + Date.now()
  });
  
  Logger.log('');
  Logger.log('=== RESULT ===');
  Logger.log(JSON.stringify(result, null, 2));
  
  if (result.ok && result.verified) {
    Logger.log('');
    Logger.log('✅ OTP VERIFIED!');
    if (result.clResolution && result.clResolution.ok) {
      Logger.log('Booking URL: ' + result.clResolution.bookingUrl);
      Logger.log('Recruiter: ' + result.clResolution.recruiterName);
    } else {
      Logger.log('⚠️ CL Resolution failed: ' + (result.clResolution ? result.clResolution.error : 'No CL resolution'));
    }
  } else {
    Logger.log('');
    Logger.log('❌ FAILED: ' + result.error);
  }
}

/**
 * TEST 4: Check system configuration
 */
function TEST_SystemCheck() {
  Logger.log('=== SYSTEM CHECK ===');
  Logger.log('');
  
  // Config
  var cfg = getConfig_();
  Logger.log('Config Sheet ID: ' + (cfg.CONFIG_SHEET_ID ? '✅ Set' : '❌ Not set'));
  Logger.log('HMAC Secret: ' + (cfg.HMAC_SECRET ? '✅ Set (' + cfg.HMAC_SECRET.length + ' chars)' : '⚠️ Will auto-generate'));
  Logger.log('Safe Mode: ' + cfg.SAFE_MODE);
  Logger.log('OTP Expiry: ' + cfg.OTP_EXPIRY_MINUTES + ' minutes');
  Logger.log('Link Expiry: ' + cfg.LINK_EXPIRY_DAYS + ' days');
  Logger.log('');
  
  // Brands
  Logger.log('=== BRANDS ===');
  var brands = getAllBrandCodes_();
  brands.forEach(function(b) {
    var brand = getBrand_(b);
    Logger.log(b + ': ' + brand.name);
  });
  Logger.log('');
  
  // Config Sheet tabs
  Logger.log('=== CONFIG SHEET TABS ===');
  try {
    var ss = getConfigSheet_();
    var sheets = ss.getSheets();
    sheets.forEach(function(s) {
      Logger.log('  - ' + s.getName());
    });
  } catch (e) {
    Logger.log('❌ Cannot open config sheet: ' + e);
  }
  Logger.log('');
  
  // CL Codes
  Logger.log('=== CL CODES (ROYAL) ===');
  var clCodes = getCLCodesForBrand_('ROYAL');
  if (clCodes.length === 0) {
    Logger.log('⚠️ No CL codes configured for ROYAL');
    Logger.log('Add rows to CL_CODES tab with: Brand, CL Code, Recruiter Name, Booking Schedule URL, Active=TRUE');
  } else {
    clCodes.forEach(function(cl) {
      Logger.log('  ' + cl.clCode + ' - ' + cl.recruiterName + ' - ' + (cl.active ? 'Active' : 'Inactive'));
    });
  }
  Logger.log('');
  
  // Email quota
  Logger.log('=== EMAIL ===');
  Logger.log('Remaining daily quota: ' + getEmailQuota_());
  Logger.log('');
  
  // Web App URL
  Logger.log('=== WEB APP ===');
  Logger.log('URL: ' + getWebAppUrl_());
  Logger.log('');
  
  Logger.log('=== DONE ===');
}

/**
 * TEST 5: Add sample CL code for testing
 */
function TEST_AddSampleCLCode() {
  Logger.log('=== ADDING SAMPLE CL CODE ===');
  
  var ss = getConfigSheet_();
  var sheet = ss.getSheetByName('CL_CODES');
  
  if (!sheet) {
    Logger.log('Creating CL_CODES tab...');
    ensureConfigSheetTabs_();
    sheet = ss.getSheetByName('CL_CODES');
  }
  
  // Check if already exists
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === 'ROYAL' && data[i][1] === 'CL200') {
      Logger.log('⚠️ CL200 already exists for ROYAL');
      return;
    }
  }
  
  // Add sample row
  sheet.appendRow([
    'ROYAL',           // Brand
    'CL200',           // CL Code
    'Test Recruiter',  // Recruiter Name
    'test@example.com',// Recruiter Email
    'https://calendar.google.com/calendar/appointments/schedules/test', // Booking URL
    'TRUE',            // Active
    new Date()         // Last Updated
  ]);
  
  Logger.log('✅ Added sample CL code: ROYAL / CL200');
  Logger.log('');
  Logger.log('Now run TEST_GenerateSignedUrl or TEST_CreateAndSendOtp to test!');
}

/**
 * TEST 6: Reset TOKENS sheet with correct headers
 * Run this to fix header mismatches that cause "No pending OTP found" errors.
 * WARNING: This deletes all existing token data!
 */
function TEST_ResetTokensSheet() {
  Logger.log('=== RESETTING TOKENS SHEET ===');
  Logger.log('⚠️ This will DELETE all existing token data!');
  Logger.log('');
  
  var result = resetConfigTab_('TOKENS');
  
  if (result.ok) {
    Logger.log('✅ TOKENS sheet reset successfully!');
    Logger.log('New headers: ' + result.headers.join(', '));
    Logger.log('');
    Logger.log('Now run TEST_CreateAndSendOtp to create a fresh OTP and test verification.');
  } else {
    Logger.log('❌ Failed to reset TOKENS sheet: ' + result.error);
  }
  
  return result;
}

/**
 * TEST 7: Verify TOKENS sheet headers match expected
 * Run this to diagnose header mismatches without deleting data.
 */
function TEST_CheckTokensHeaders() {
  Logger.log('=== CHECKING TOKENS SHEET HEADERS ===');
  Logger.log('');
  
  var ss = getConfigSheet_();
  var sheet = ss.getSheetByName('TOKENS');
  
  if (!sheet) {
    Logger.log('❌ TOKENS sheet does not exist!');
    Logger.log('Run ensureConfigSheetTabs_() or TEST_ResetTokensSheet() to create it.');
    return;
  }
  
  var actualHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var expectedHeaders = CONFIG_TABS.TOKENS.headers;
  
  Logger.log('Expected headers (' + expectedHeaders.length + '):');
  Logger.log('  ' + expectedHeaders.join(', '));
  Logger.log('');
  Logger.log('Actual headers (' + actualHeaders.length + '):');
  Logger.log('  ' + actualHeaders.join(', '));
  Logger.log('');
  
  // Check for missing headers
  var missing = [];
  var extra = [];
  
  for (var i = 0; i < expectedHeaders.length; i++) {
    if (actualHeaders.indexOf(expectedHeaders[i]) === -1) {
      missing.push(expectedHeaders[i]);
    }
  }
  
  for (var j = 0; j < actualHeaders.length; j++) {
    if (actualHeaders[j] && expectedHeaders.indexOf(actualHeaders[j]) === -1) {
      extra.push(actualHeaders[j]);
    }
  }
  
  if (missing.length === 0 && extra.length === 0) {
    Logger.log('✅ Headers match! TOKENS sheet is correctly configured.');
  } else {
    if (missing.length > 0) {
      Logger.log('❌ Missing headers: ' + missing.join(', '));
    }
    if (extra.length > 0) {
      Logger.log('⚠️ Extra headers (not used): ' + extra.join(', '));
    }
    Logger.log('');
    Logger.log('Run TEST_ResetTokensSheet() to fix header issues (WARNING: deletes data).');
  }
  
  // Check for data rows
  var rowCount = sheet.getLastRow() - 1;
  Logger.log('');
  Logger.log('Data rows: ' + rowCount);
  
  return { actual: actualHeaders, expected: expectedHeaders, missing: missing, extra: extra };
}

/**
 * TEST: Toggle OTP rate limit for testing
 * Usage: TEST_DisableOtpRateLimit() or TEST_EnableOtpRateLimit()
 */
function TEST_DisableOtpRateLimit() {
  PropertiesService.getScriptProperties().setProperty('OTP_RATE_LIMIT_DISABLED', 'true');
  Logger.log('✅ OTP rate limit DISABLED (script property set)');
}

function TEST_EnableOtpRateLimit() {
  PropertiesService.getScriptProperties().setProperty('OTP_RATE_LIMIT_DISABLED', 'false');
  Logger.log('✅ OTP rate limit ENABLED (script property set)');
}

/**
 * TEST 8: Full end-to-end OTP test
 * Creates OTP and immediately validates it (no email step).
 */
function TEST_FullOtpFlow() {
  Logger.log('=== FULL OTP FLOW TEST ===');
  Logger.log('');
  
  var testEmail = 'crewlife@seainfogroup.com';
  var testTextForEmail = 'Waiters - CL200';
  var testBrand = 'ROYAL';
  
  // Step 1: Create OTP
  Logger.log('Step 1: Creating OTP...');
  var otpResult = createOtp_({
    email: testEmail,
    brand: testBrand,
    textForEmail: testTextForEmail,
    traceId: 'test-flow-' + Date.now()
  });
  
  if (!otpResult.ok) {
    Logger.log('❌ Failed to create OTP: ' + otpResult.error);
    return;
  }
  
  Logger.log('✅ OTP Created: ' + otpResult.otp);
  Logger.log('   Token: ' + otpResult.token);
  Logger.log('   Expires: ' + otpResult.expiresAt);
  Logger.log('');
  
  // Step 2: Immediately validate
  Logger.log('Step 2: Validating OTP...');
  var validateResult = validateOtp_({
    email: testEmail,
    brand: testBrand,
    otp: otpResult.otp,
    textForEmail: testTextForEmail,
    traceId: 'test-flow-' + Date.now()
  });
  
  Logger.log('');
  Logger.log('=== VALIDATION RESULT ===');
  Logger.log(JSON.stringify(validateResult, null, 2));
  
  if (validateResult.ok && validateResult.verified) {
    Logger.log('');
    Logger.log('✅ SUCCESS! OTP flow works correctly.');
    if (validateResult.clResolution && validateResult.clResolution.ok) {
      Logger.log('   Booking URL: ' + validateResult.clResolution.bookingUrl);
      Logger.log('   Recruiter: ' + validateResult.clResolution.recruiterName);
    }
  } else {
    Logger.log('');
    Logger.log('❌ FAILED: ' + (validateResult.error || 'Unknown error'));
    if (validateResult.diagnostics) {
      Logger.log('   Diagnostics: ' + JSON.stringify(validateResult.diagnostics));
    }
  }
  
  return validateResult;
}

/**
 * TEST 9: Full reset of config sheet (DELETES DATA) and seed minimal test data.
 * - Deletes unknown tabs
 * - Recreates required tabs with correct headers
 * - Adds sample CL200
 * - Disables OTP rate limit for testing
 */
function TEST_ResetAllAndSeed() {
  Logger.log('=== RESET CONFIG SHEET (DELETES DATA) ===');
  Logger.log('⚠️ This will DELETE all config tab data and unknown tabs.');
  Logger.log('');

  var resetResult = resetConfigSheet_();
  Logger.log('Reset result: ' + JSON.stringify(resetResult));

  if (!resetResult.ok) {
    Logger.log('❌ Reset failed: ' + resetResult.error);
    return resetResult;
  }

  Logger.log('');
  Logger.log('=== SEEDING SAMPLE DATA ===');
  TEST_AddSampleCLCode();

  Logger.log('');
  Logger.log('=== DISABLING OTP RATE LIMIT ===');
  TEST_DisableOtpRateLimit();

  Logger.log('');
  Logger.log('✅ Done. Now run TEST_CreateAndSendOtp or open the web app to test.');
  return resetResult;
}
/**
 * TEST 10: Debug dump TOKENS sheet
 * Shows all data in TOKENS tab to diagnose issues.
 */
function TEST_DebugTokensSheet() {
  Logger.log('=== DEBUG: TOKENS SHEET DUMP ===');
  Logger.log('');
  
  var ss = getConfigSheet_();
  var sheet = ss.getSheetByName('TOKENS');
  
  if (!sheet) {
    Logger.log('❌ TOKENS sheet does not exist!');
    Logger.log('Run TEST_ResetAllAndSeed() to create it.');
    return { ok: false, error: 'TOKENS sheet missing' };
  }
  
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  
  Logger.log('Sheet: TOKENS');
  Logger.log('Rows: ' + lastRow + ' (including header)');
  Logger.log('Columns: ' + lastCol);
  Logger.log('');
  
  if (lastRow < 1 || lastCol < 1) {
    Logger.log('⚠️ Sheet appears empty!');
    return { ok: true, rows: 0, data: [] };
  }
  
  var data = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  var headers = data[0];
  
  Logger.log('Headers: ' + headers.join(' | '));
  Logger.log('');
  
  // Find key column indices
  var emailIdx = headers.indexOf('Email');
  var otpIdx = headers.indexOf('OTP');
  var statusIdx = headers.indexOf('Status');
  var expiryIdx = headers.indexOf('Expiry');
  var brandIdx = headers.indexOf('Brand');
  var textIdx = headers.indexOf('Text For Email');
  
  Logger.log('Column indices: Email=' + emailIdx + ', OTP=' + otpIdx + ', Status=' + statusIdx + ', Expiry=' + expiryIdx);
  Logger.log('');
  
  if (lastRow === 1) {
    Logger.log('⚠️ No data rows (only header). No OTPs have been created yet.');
    return { ok: true, rows: 0, headers: headers };
  }
  
  Logger.log('=== DATA ROWS ===');
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var rowInfo = 'Row ' + (i + 1) + ': ';
    rowInfo += 'Email=' + (emailIdx >= 0 ? row[emailIdx] : 'N/A') + ', ';
    rowInfo += 'OTP=' + (otpIdx >= 0 ? row[otpIdx] : 'N/A') + ', ';
    rowInfo += 'Status=' + (statusIdx >= 0 ? row[statusIdx] : 'N/A') + ', ';
    rowInfo += 'Brand=' + (brandIdx >= 0 ? row[brandIdx] : 'N/A') + ', ';
    rowInfo += 'Expiry=' + (expiryIdx >= 0 ? row[expiryIdx] : 'N/A');
    Logger.log(rowInfo);
  }
  
  Logger.log('');
  Logger.log('=== SUMMARY ===');
  
  // Count by status
  var statusCounts = {};
  for (var j = 1; j < data.length; j++) {
    var status = (statusIdx >= 0 ? data[j][statusIdx] : 'UNKNOWN') || 'EMPTY';
    statusCounts[status] = (statusCounts[status] || 0) + 1;
  }
  
  for (var s in statusCounts) {
    Logger.log('  ' + s + ': ' + statusCounts[s]);
  }
  
  return { ok: true, rows: lastRow - 1, headers: headers, statusCounts: statusCounts };
}

/**
 * TEST: Validate OTP Success using token-based lookup
 */
function TEST_ValidateOtp_Success() {
  Logger.log('=== TEST: Validate OTP Success (Token-Based) ===');
  
  var otpResult = createOtp_({
    email: 'test-success-' + Date.now() + '@example.com',
    brand: 'ROYAL',
    textForEmail: 'Test Position - CL200',
    traceId: 'test-success-' + Date.now()
  });
  
  if (!otpResult.ok) {
    Logger.log('FAIL: Could not create OTP: ' + otpResult.error);
    return { pass: false };
  }
  
  Logger.log('Created OTP: %s, Token: %s', otpResult.otp, otpResult.token);
  
  var result = validateOtp_({
    token: otpResult.token,  // Use token for deterministic lookup
    otp: otpResult.otp,
    traceId: 'test-success-' + Date.now()
  });
  
  if (result.ok && result.verified) {
    Logger.log('✅ PASS: OTP validated successfully using token');
    return { pass: true };
  } else {
    Logger.log('❌ FAIL: ' + JSON.stringify(result));
    return { pass: false };
  }
}

/**
 * TEST: Validate OTP Wrong Code (should increment attempts)
 */
function TEST_ValidateOtp_WrongOtp() {
  Logger.log('=== TEST: Validate OTP Wrong Code ===');
  
  var otpResult = createOtp_({
    email: 'test-wrong-' + Date.now() + '@example.com',
    brand: 'ROYAL',
    textForEmail: 'Test Position - CL200',
    traceId: 'test-wrong-' + Date.now()
  });
  
  if (!otpResult.ok) {
    Logger.log('FAIL: Could not create OTP');
    return { pass: false };
  }
  
  var result = validateOtp_({
    token: otpResult.token,
    otp: '000000',  // Wrong OTP
    traceId: 'test-wrong-' + Date.now()
  });
  
  if (!result.ok && result.error.indexOf('Invalid OTP') >= 0) {
    Logger.log('✅ PASS: Correctly rejected wrong OTP');
    Logger.log('Error: ' + result.error);
    return { pass: true };
  } else {
    Logger.log('❌ FAIL: ' + JSON.stringify(result));
    return { pass: false };
  }
}

/**
 * TEST: Validate OTP Token Not Found
 */
function TEST_ValidateOtp_TokenNotFound() {
  Logger.log('=== TEST: Validate OTP Token Not Found ===');
  
  var result = validateOtp_({
    token: 'fake-token-that-does-not-exist-' + Date.now(),
    otp: '123456',
    traceId: 'test-notfound-' + Date.now()
  });
  
  if (!result.ok && result.error.indexOf('Invalid or expired') >= 0) {
    Logger.log('✅ PASS: Correctly rejected unknown token');
    Logger.log('Error: ' + result.error);
    return { pass: true };
  } else {
    Logger.log('❌ FAIL: ' + JSON.stringify(result));
    return { pass: false };
  }
}

/**
 * TEST: Validate OTP Already Used (VERIFIED status)
 */
function TEST_ValidateOtp_AlreadyUsed() {
  Logger.log('=== TEST: Validate OTP Already Used ===');
  
  var otpResult = createOtp_({
    email: 'test-used-' + Date.now() + '@example.com',
    brand: 'ROYAL',
    textForEmail: 'Test Position - CL200',
    traceId: 'test-used-' + Date.now()
  });
  
  if (!otpResult.ok) {
    Logger.log('FAIL: Could not create OTP');
    return { pass: false };
  }
  
  // First verification (should succeed)
  var result1 = validateOtp_({
    token: otpResult.token,
    otp: otpResult.otp,
    traceId: 'test-used-1-' + Date.now()
  });
  
  if (!result1.ok || !result1.verified) {
    Logger.log('FAIL: First validation should succeed');
    return { pass: false };
  }
  
  // Second verification (should fail - already used)
  var result2 = validateOtp_({
    token: otpResult.token,
    otp: otpResult.otp,
    traceId: 'test-used-2-' + Date.now()
  });
  
  if (!result2.ok && result2.error.indexOf('already been used') >= 0) {
    Logger.log('✅ PASS: Correctly rejected already-used OTP');
    Logger.log('Error: ' + result2.error);
    return { pass: true };
  } else {
    Logger.log('❌ FAIL: ' + JSON.stringify(result2));
    return { pass: false };
  }
}

/**
 * TEST: Run all validation tests
 */
function TEST_RunAllValidationTests() {
  Logger.log('========================================');
  Logger.log('RUNNING ALL OTP VALIDATION TESTS');
  Logger.log('========================================');
  Logger.log('');
  
  var tests = [
    { name: 'Success', fn: TEST_ValidateOtp_Success },
    { name: 'WrongOtp', fn: TEST_ValidateOtp_WrongOtp },
    { name: 'TokenNotFound', fn: TEST_ValidateOtp_TokenNotFound },
    { name: 'AlreadyUsed', fn: TEST_ValidateOtp_AlreadyUsed }
  ];
  
  var passed = 0;
  var failed = 0;
  
  for (var i = 0; i < tests.length; i++) {
    Logger.log('');
    try {
      var result = tests[i].fn();
      if (result && result.pass) {
        passed++;
      } else {
        failed++;
      }
    } catch (e) {
      Logger.log('❌ EXCEPTION in ' + tests[i].name + ': ' + e);
      failed++;
    }
  }
  
  Logger.log('');
  Logger.log('========================================');
  Logger.log('RESULTS: %s passed, %s failed', passed, failed);
  Logger.log('========================================');
}