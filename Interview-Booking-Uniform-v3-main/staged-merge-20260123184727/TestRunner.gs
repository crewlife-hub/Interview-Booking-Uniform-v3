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
  Logger.log('Expires: ' + otpResult.expiresAt);
  Logger.log('');
  Logger.log('=== SENDING EMAIL ===');
  
  var emailResult = sendOtpEmail_({
    email: testEmail,
    otp: otpResult.otp,
    brand: testBrand,
    textForEmail: testTextForEmail,
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
  
  // Also log the verify page URL
  var verifyUrl = getWebAppUrl_() + 
    '?page=verify&brand=' + encodeURIComponent(testBrand) + 
    '&e=' + encodeURIComponent(testEmail) + 
    '&t=' + encodeURIComponent(testTextForEmail);
  
  Logger.log('');
  Logger.log('=== VERIFY PAGE ===');
  Logger.log('Open this URL and enter the OTP:');
  Logger.log(verifyUrl);
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
