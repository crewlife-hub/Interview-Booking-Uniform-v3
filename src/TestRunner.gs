/**
 * TestRunner.gs
 * Deterministic tests for Interview Booking System v3
 */

const TestRunner = (() => {
  let results = [];
  let currentSuite = '';

  /**
   * Assert helper
   */
  function assert(condition, message) {
    if (condition) {
      results.push({ suite: currentSuite, test: message, status: 'PASS' });
    } else {
      results.push({ suite: currentSuite, test: message, status: 'FAIL' });
    }
    return condition;
  }

  /**
   * Assert equals helper
   */
  function assertEquals(expected, actual, message) {
    const pass = expected === actual;
    results.push({
      suite: currentSuite,
      test: message,
      status: pass ? 'PASS' : 'FAIL',
      expected: String(expected),
      actual: String(actual)
    });
    return pass;
  }

  /**
   * Parse URL query parameters (Apps Script compatible, no URL constructor)
   */
  function parseUrlParams_(url) {
    const params = {};
    const queryStart = url.indexOf('?');
    if (queryStart === -1) return params;
    
    const queryString = url.substring(queryStart + 1);
    const pairs = queryString.split('&');
    
    for (let i = 0; i < pairs.length; i++) {
      const pair = pairs[i].split('=');
      if (pair.length === 2) {
        params[decodeURIComponent(pair[0])] = decodeURIComponent(pair[1]);
      }
    }
    return params;
  }

  /**
   * Test schema enforcement
   */
  function testSchemaEnforcement() {
    currentSuite = 'Schema Enforcement';
    
    try {
      const schemaResults = ConfigService.enforceSchema();
      
      assert(Array.isArray(schemaResults), 'enforceSchema returns array');
      
      const expectedTabs = ['BRAND_CONFIG', 'CL_CODES', 'JOBS', 'TOKENS', 'LOGS'];
      for (const tab of expectedTabs) {
        const tabResult = schemaResults.find(r => r.tab === tab);
        assert(tabResult !== undefined, `Tab ${tab} exists in results`);
        assert(tabResult.status === 'OK' || tabResult.status === 'FIXED', `Tab ${tab} is OK or FIXED`);
      }
      
      // Verify headers on TOKENS tab
      const tokensSheet = ConfigService.getTokensSheet();
      const headers = tokensSheet.getRange(1, 1, 1, tokensSheet.getLastColumn()).getValues()[0];
      
      assert(headers.includes('CreatedAt'), 'TOKENS has CreatedAt header');
      assert(headers.includes('OtpStatus'), 'TOKENS has OtpStatus header');
      assert(headers.includes('TokenStatus'), 'TOKENS has TokenStatus header');
      assert(headers.includes('TraceId'), 'TOKENS has TraceId header');
      
    } catch (e) {
      results.push({ suite: currentSuite, test: 'Schema enforcement', status: 'ERROR', error: e.message });
    }
  }

  /**
   * Test HMAC signing
   */
  function testInviteSigning() {
    currentSuite = 'Invite Signing';
    
    try {
      // Test that signature is created
      const params = {
        brand: 'TestBrand',
        rowId: '12345',
        email: 'test@example.com',
        textForEmail: 'Test Position'
      };
      
      const url = InviteSigning.createSignedInviteUrl(params);
      assert(url.includes('sig='), 'Signed URL contains signature');
      assert(url.includes('ts='), 'Signed URL contains timestamp');
      assert(url.includes('brand=TestBrand'), 'Signed URL contains brand');
      assert(url.includes('page=otp_request'), 'Signed URL contains page');
      
      // Test partial signature verification (Apps Script compatible URL parsing)
      const partialParams = parseUrlParams_(url);
      
      const partialResult = InviteSigning.verifyPartialSignature(partialParams);
      assert(partialResult.valid, 'Partial signature verification passes');
      
      // Test expired link detection
      const oldParams = {
        brand: 'TestBrand',
        rowId: '12345',
        ts: String(Date.now() - 25 * 60 * 60 * 1000), // 25 hours ago
        sig: 'somesig'
      };
      
      const expiredResult = InviteSigning.verifyPartialSignature(oldParams);
      assert(!expiredResult.valid, 'Expired link is rejected');
      assert(expiredResult.expired === true, 'Expired flag is set');
      
    } catch (e) {
      results.push({ suite: currentSuite, test: 'Invite signing', status: 'ERROR', error: e.message });
    }
  }

  /**
   * Test OTP lifecycle
   */
  function testOtpLifecycle() {
    currentSuite = 'OTP Lifecycle';
    
    try {
      const testEmail = `test_${Date.now()}@example.com`;
      const traceId = ConfigService.generateTraceId();
      
      // Create OTP
      const createResult = OtpService.createOtp({
        brand: 'TestBrand',
        email: testEmail,
        textForEmail: 'Test Position',
        inviteSig: 'testsig',
        traceId
      });
      
      assert(createResult.success, 'OTP creation succeeds');
      assert(createResult.otp.length === 6, 'OTP is 6 digits');
      assert(createResult.expiryEpoch > Date.now(), 'OTP expiry is in future');
      
      // Verify wrong OTP
      const wrongResult = OtpService.verifyOtp({
        email: testEmail,
        otp: '000000',
        traceId
      });
      
      assert(!wrongResult.success, 'Wrong OTP fails verification');
      assert(wrongResult.attemptsRemaining !== undefined, 'Attempts remaining is returned');
      
      // Verify correct OTP
      const correctResult = OtpService.verifyOtp({
        email: testEmail,
        otp: createResult.otp,
        traceId
      });
      
      assert(correctResult.success, 'Correct OTP passes verification');
      assert(correctResult.brand === 'TestBrand', 'Brand is returned');
      
      // Verify OTP cannot be reused
      const reuseResult = OtpService.verifyOtp({
        email: testEmail,
        otp: createResult.otp,
        traceId
      });
      
      assert(!reuseResult.success, 'OTP cannot be reused after verification');
      
    } catch (e) {
      results.push({ suite: currentSuite, test: 'OTP lifecycle', status: 'ERROR', error: e.message });
    }
  }

  /**
   * Test token lifecycle
   */
  function testTokenLifecycle() {
    currentSuite = 'Token Lifecycle';
    
    try {
      const testEmail = `token_test_${Date.now()}@example.com`;
      const traceId = ConfigService.generateTraceId();
      
      // Create OTP first
      const otpResult = OtpService.createOtp({
        brand: 'TestBrand',
        email: testEmail,
        textForEmail: 'Test Position',
        inviteSig: 'testsig',
        traceId
      });
      
      // Verify OTP
      const verifyResult = OtpService.verifyOtp({
        email: testEmail,
        otp: otpResult.otp,
        traceId
      });
      
      assert(verifyResult.success, 'OTP verification for token test');
      
      // Issue token
      const tokenResult = TokenService.issueToken({
        email: testEmail,
        traceId,
        rowIdx: verifyResult.rowIdx
      });
      
      assert(tokenResult.success, 'Token issuance succeeds');
      assert(tokenResult.token.length > 20, 'Token has sufficient length');
      
      // Validate token
      const validateResult = TokenService.validateAndConsumeToken(tokenResult.token, traceId);
      assert(validateResult.success, 'Token validation succeeds');
      assert(validateResult.brand === 'TestBrand', 'Token contains correct brand');
      
      // Burn token
      const burnResult = TokenService.burnToken(tokenResult.token, traceId);
      assert(burnResult.success, 'Token burn succeeds');
      
      // Try to burn again
      const reuseBurnResult = TokenService.burnToken(tokenResult.token, traceId);
      assert(!reuseBurnResult.success, 'Token cannot be burned twice');
      assert(reuseBurnResult.alreadyUsed === true, 'Already used flag is set');
      
    } catch (e) {
      results.push({ suite: currentSuite, test: 'Token lifecycle', status: 'ERROR', error: e.message });
    }
  }

  /**
   * Test dispatcher dry run
   */
  function testDispatcherDryRun() {
    currentSuite = 'Dispatcher Dry Run';
    
    try {
      // Note: This test requires at least one active brand configured
      const brands = ConfigService.getActiveBrands();
      
      if (brands.length === 0) {
        results.push({ 
          suite: currentSuite, 
          test: 'Dry run execution', 
          status: 'SKIP', 
          message: 'No active brands configured' 
        });
        return;
      }
      
      const dispatcherResult = InviteDispatcher.runInviteDispatcher(true); // dry run
      
      assert(dispatcherResult.dryRun === true, 'Dry run flag is set');
      assert(dispatcherResult.traceId !== undefined, 'Trace ID is generated');
      assert(Array.isArray(dispatcherResult.brands), 'Brands array is returned');
      
      // Verify no Smartsheet updates in dry run
      for (const brandResult of dispatcherResult.brands) {
        for (const row of (brandResult.rows || [])) {
          if (row.status === 'dry_run') {
            assert(row.wouldUpdate !== undefined, 'Dry run shows what would be updated');
          }
        }
      }
      
    } catch (e) {
      results.push({ suite: currentSuite, test: 'Dispatcher dry run', status: 'ERROR', error: e.message });
    }
  }

  /**
   * Test email hash consistency
   */
  function testEmailHashing() {
    currentSuite = 'Email Hashing';
    
    try {
      const email1 = 'Test@Example.com';
      const email2 = 'test@example.com';
      const email3 = '  TEST@EXAMPLE.COM  ';
      
      const hash1 = ConfigService.hashEmail(email1);
      const hash2 = ConfigService.hashEmail(email2);
      const hash3 = ConfigService.hashEmail(email3);
      
      assertEquals(hash1, hash2, 'Case-insensitive email hashing');
      assertEquals(hash2, hash3, 'Trimmed email hashing');
      assert(hash1.length === 16, 'Hash is 16 hex characters');
      
    } catch (e) {
      results.push({ suite: currentSuite, test: 'Email hashing', status: 'ERROR', error: e.message });
    }
  }

  /**
   * Test config service
   */
  function testConfigService() {
    currentSuite = 'Config Service';
    
    try {
      // Test trace ID generation
      const traceId1 = ConfigService.generateTraceId();
      const traceId2 = ConfigService.generateTraceId();
      
      assert(traceId1.length > 0, 'Trace ID is generated');
      assert(traceId1 !== traceId2, 'Trace IDs are unique');
      
      // Test status enums exist
      assert(ConfigService.OTP_STATUS.PENDING === 'PENDING', 'OTP_STATUS.PENDING exists');
      assert(ConfigService.OTP_STATUS.VERIFIED === 'VERIFIED', 'OTP_STATUS.VERIFIED exists');
      assert(ConfigService.TOKEN_STATUS.ISSUED === 'ISSUED', 'TOKEN_STATUS.ISSUED exists');
      assert(ConfigService.TOKEN_STATUS.USED === 'USED', 'TOKEN_STATUS.USED exists');
      
    } catch (e) {
      results.push({ suite: currentSuite, test: 'Config service', status: 'ERROR', error: e.message });
    }
  }

  /**
   * Run all tests
   */
  function runAll() {
    results = [];
    
    console.log('=== Starting Test Runner ===');
    
    testSchemaEnforcement();
    testConfigService();
    testEmailHashing();
    testInviteSigning();
    testOtpLifecycle();
    testTokenLifecycle();
    testDispatcherDryRun();
    
    // Generate summary
    const passed = results.filter(r => r.status === 'PASS').length;
    const failed = results.filter(r => r.status === 'FAIL').length;
    const errors = results.filter(r => r.status === 'ERROR').length;
    const skipped = results.filter(r => r.status === 'SKIP').length;
    
    const summary = {
      total: results.length,
      passed,
      failed,
      errors,
      skipped,
      results
    };
    
    console.log(`\n=== Test Results ===`);
    console.log(`Total: ${summary.total}`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    console.log(`Errors: ${errors}`);
    console.log(`Skipped: ${skipped}`);
    
    // Log failures
    if (failed > 0 || errors > 0) {
      console.log('\n=== Failures ===');
      results.filter(r => r.status === 'FAIL' || r.status === 'ERROR').forEach(r => {
        console.log(`[${r.status}] ${r.suite} > ${r.test}`);
        if (r.expected) console.log(`  Expected: ${r.expected}, Actual: ${r.actual}`);
        if (r.error) console.log(`  Error: ${r.error}`);
      });
    }
    
    // Log to sheet
    LoggingService.info(
      ConfigService.generateTraceId(),
      '',
      'TEST_RUN_COMPLETE',
      `Tests complete: ${passed}/${summary.total} passed`,
      '',
      { passed, failed, errors, skipped }
    );
    
    return summary;
  }

  // Public API
  return {
    runAll,
    testSchemaEnforcement,
    testInviteSigning,
    testOtpLifecycle,
    testTokenLifecycle,
    testDispatcherDryRun
  };
})();

/**
 * Global function for menu/trigger
 */
function runAllTests() {
  return TestRunner.runAll();
}
