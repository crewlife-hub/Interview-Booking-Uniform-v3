# TEST_CHECKLIST.md - Interview Booking Uniform System v3

## Pre-Deployment Automated Tests

Run these in the Apps Script editor before deploying:

```javascript
runAllTests();
```

Expected output:
- ✅ Schema Enforcement: All tabs created with correct headers
- ✅ Config Service: Trace IDs generated, enums exist
- ✅ Email Hashing: Consistent, case-insensitive
- ✅ Invite Signing: URLs signed, expiry detected
- ✅ OTP Lifecycle: Create, verify, expire, max attempts
- ✅ Token Lifecycle: Issue, validate, burn, prevent reuse
- ✅ Dispatcher Dry Run: Processes without sending

---

## Live Test Checklist

### Phase 1: Setup Verification

- [ ] **1.1** Script Properties configured:
  - [ ] CONFIG_SHEET_ID set
  - [ ] SM_TOKEN set  
  - [ ] HMAC_SECRET set (32+ random characters)

- [ ] **1.2** Config spreadsheet initialized:
  - [ ] BRAND_CONFIG tab exists with headers
  - [ ] CL_CODES tab exists with headers
  - [ ] JOBS tab exists with headers
  - [ ] TOKENS tab exists with headers
  - [ ] LOGS tab exists with headers

- [ ] **1.3** Brand configured in BRAND_CONFIG:
  - [ ] Brand name filled
  - [ ] Active = TRUE
  - [ ] SmartsheetSheetId correct
  - [ ] EmailColumnId correct
  - [ ] TextForEmailColumnId correct
  - [ ] DefaultBookingUrl set

- [ ] **1.4** Jobs configured in JOBS tab:
  - [ ] At least one job for test brand
  - [ ] Active = TRUE

### Phase 2: Diagnostics Page

- [ ] **2.1** Access diag page: `?page=diag`
- [ ] **2.2** Schema Status shows all tabs OK/FIXED
- [ ] **2.3** Brand Configurations shows test brand as Active
- [ ] **2.4** "Dry Run" button works:
  - [ ] Click "Dry Run"
  - [ ] Shows success message with trace ID
  - [ ] No emails sent
  - [ ] No Smartsheet cells updated
  - [ ] Logs appear in LOGS tab

### Phase 3: Dispatcher Live Test

- [ ] **3.1** Set up test row in Smartsheet:
  - [ ] Email column = your test email
  - [ ] TextForEmail column = a configured job
  - [ ] Trigger column = "Sideways"

- [ ] **3.2** Run Live Dispatcher:
  - [ ] Click "Run Live" in Diag page
  - [ ] Shows success message

- [ ] **3.3** Verify results:
  - [ ] Smartsheet cell updated to "🔔Sent"
  - [ ] Email received with invite link
  - [ ] LOGS tab shows INVITE_EMAIL_SENT

### Phase 4: Candidate Flow - OTP Request

- [ ] **4.1** Click invite link in email
- [ ] **4.2** OTP Request page loads:
  - [ ] Brand name displayed
  - [ ] Email input visible
  - [ ] Position dropdown populated

- [ ] **4.3** Test invalid data:
  - [ ] Wrong email → Error message
  - [ ] Wrong position → Error message
  - [ ] Missing fields → Error message

- [ ] **4.4** Submit correct data:
  - [ ] Matches Smartsheet row
  - [ ] Redirects to OTP Verify page
  - [ ] OTP email received
  - [ ] TOKENS tab shows new row with OTP

### Phase 5: Candidate Flow - OTP Verify

- [ ] **5.1** OTP Verify page loads:
  - [ ] Shows email address
  - [ ] Timer counting down
  - [ ] OTP input focused

- [ ] **5.2** Test wrong OTP:
  - [ ] Enter wrong code → Error with attempts remaining
  - [ ] Second wrong → 1 attempt remaining
  - [ ] Third wrong → "Too many attempts" error

- [ ] **5.3** Test correct OTP (new verification):
  - [ ] Restart from invite link
  - [ ] Enter correct OTP
  - [ ] Redirects to Booking Confirm page
  - [ ] TOKENS tab shows OtpStatus = VERIFIED

### Phase 6: Candidate Flow - Booking Confirm

- [ ] **6.1** Booking Confirm page loads:
  - [ ] Shows "Verification Complete"
  - [ ] Shows brand and position
  - [ ] "Open Booking Calendar" button visible

- [ ] **6.2** Click booking button:
  - [ ] Redirects to booking URL
  - [ ] TOKENS tab shows TokenStatus = USED
  - [ ] UsedAt timestamp populated

- [ ] **6.3** Test token reuse (go back or save URL):
  - [ ] Access booking_confirm with same token
  - [ ] Shows "Link Already Used" error

### Phase 7: Edge Cases

- [ ] **7.1** Expired invite link (>24h):
  - [ ] Manually edit ts param to old timestamp
  - [ ] Shows "Link Expired" error page

- [ ] **7.2** Invalid signature:
  - [ ] Modify sig param
  - [ ] Shows "Invalid Link" error page

- [ ] **7.3** OTP expiry (wait 10+ minutes):
  - [ ] Request OTP
  - [ ] Wait 10 minutes
  - [ ] Enter correct OTP
  - [ ] Shows "Code expired" error

- [ ] **7.4** Token expiry (wait 30+ minutes):
  - [ ] Complete OTP verification
  - [ ] Wait 30 minutes without clicking booking
  - [ ] Click booking button
  - [ ] Shows "Link expired" error

- [ ] **7.5** Invalid pages:
  - [ ] Access `?page=nonexistent`
  - [ ] Shows "Page Not Found" error

- [ ] **7.6** Missing parameters:
  - [ ] Access `?page=otp_request` (no params)
  - [ ] Shows "Missing parameters" error
  - [ ] Access `?page=booking_confirm` (no token)
  - [ ] Shows "Missing token" error

### Phase 8: Logging Verification

- [ ] **8.1** Check LOGS tab contains:
  - [ ] DISPATCHER_START entries
  - [ ] INVITE_EMAIL_SENT entries
  - [ ] OTP_CREATED entries
  - [ ] OTP_VERIFIED entries
  - [ ] TOKEN_ISSUED entries
  - [ ] TOKEN_BURNED entries

- [ ] **8.2** Verify log privacy:
  - [ ] Email addresses are hashed (16 hex chars)
  - [ ] No plain text emails in logs

- [ ] **8.3** Trace ID consistency:
  - [ ] Related events share same TraceId

### Phase 9: Trigger Test (if configured)

- [ ] **9.1** Set up time-driven trigger
- [ ] **9.2** Add new row with "Sideways" in Smartsheet
- [ ] **9.3** Wait for trigger to fire
- [ ] **9.4** Verify:
  - [ ] Cell updated to "🔔Sent"
  - [ ] Email received
  - [ ] Logs recorded

---

## Performance Checklist

- [ ] Page load time < 3 seconds
- [ ] OTP email delivery < 30 seconds
- [ ] No Apps Script timeout errors (< 6 min execution)
- [ ] Dispatcher handles 50+ rows without timeout

---

## Security Checklist

- [ ] HMAC_SECRET is 32+ random characters
- [ ] Script Properties are not visible to users
- [ ] Emails are hashed in logs
- [ ] Tokens are one-time use only
- [ ] OTP has max 3 attempts
- [ ] Links expire appropriately

---

## Sign-Off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Developer | | | |
| QA Tester | | | |
| Project Owner | | | |

---

## Notes

Record any issues or observations here:

```
[Date] [Issue/Note]
```
