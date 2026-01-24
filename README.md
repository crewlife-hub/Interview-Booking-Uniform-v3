# Interview Booking Uniform System v3

A production-ready Google Apps Script Web App for managing interview booking invitations via Smartsheet integration with anti-sharing security features.

## 🎯 Features

- **Smartsheet-Driven Invitations**: Automatically scans Smartsheet for rows with "Sideways" trigger value and sends branded invite emails
- **HMAC-Signed Links**: Secure, tamper-proof invitation URLs that expire after 24 hours
- **OTP Verification**: 6-digit verification codes with 10-minute expiry and 3 max attempts
- **One-Time Tokens**: Booking links can only be used once and are burned on click
- **Zero White Screens**: Every route exists with friendly error handling
- **Comprehensive Logging**: All actions logged to Google Sheets with trace IDs
- **Dry Run Mode**: Test dispatcher without sending emails or updating Smartsheet

## 📁 Project Structure

```
/src
  AppRouter.gs           # Main entry point and routing
  ConfigService.gs       # SSOT configuration from Google Sheets
  SmartsheetService.gs   # Smartsheet API integration
  InviteDispatcher.gs    # Scans and sends invites
  InviteSigning.gs       # HMAC signing and verification
  CandidateVerifyService.gs  # Candidate flow handlers
  OtpService.gs          # OTP generation and verification
  TokenService.gs        # One-time token management
  EmailService.gs        # Email sending
  LoggingService.gs      # Centralized logging
  TestRunner.gs          # Automated tests

/ui
  OtpRequest.html        # Email + position verification
  OtpVerify.html         # OTP code entry
  BookingConfirm.html    # Final booking button
  Diag.html              # Diagnostics dashboard
  SharedStyles.html      # Common CSS
  SharedScripts.html     # Common JavaScript
```

## 🚀 Setup Instructions

### 1. Create Google Apps Script Project

1. Go to [script.google.com](https://script.google.com)
2. Create a new project: **Interview Booking System v3**
3. Copy all `.gs` files from `/src` folder to the project
4. Copy all `.html` files from `/ui` folder to the project

### 2. Create Config Spreadsheet

1. Create a new Google Spreadsheet
2. Copy the spreadsheet ID from the URL
3. The system will auto-create required tabs on first run

### 3. Set Script Properties

Go to **Project Settings → Script Properties** and add:

| Property | Description | Example |
|----------|-------------|---------|
| `CONFIG_SHEET_ID` | Google Spreadsheet ID for configuration | `1abc123...xyz` |
| `SM_TOKEN` | Smartsheet API token | `your-smartsheet-api-token` |
| `HMAC_SECRET` | Secret key for signing URLs (generate a random 32+ char string) | `your-super-secret-key-here` |

### 4. Deploy as Web App

1. Click **Deploy → New Deployment**
2. Select type: **Web app**
3. Settings:
   - Execute as: **Me**
   - Who has access: **Anyone** (or **Anyone with Google account**)
4. Click **Deploy**
5. Copy the Web App URL

### 5. Initialize System

1. Open the Config Spreadsheet
2. Go to **Extensions → Apps Script**
3. Run the `initializeSystem` function
4. This creates all required tabs with proper headers

### 6. Configure Brands

Fill in the **BRAND_CONFIG** tab:

| Column | Required | Description |
|--------|----------|-------------|
| Brand | ✅ | Brand name (e.g., "Acme Corp") |
| Active | ✅ | TRUE or FALSE |
| SmartsheetSheetId | ✅ | Smartsheet sheet ID |
| EmailColumnId | ✅ | Column ID for email in Smartsheet |
| TextForEmailColumnId | ✅ | Column ID for position/job |
| InviteTriggerColumnId | ❌ | Column ID for trigger (auto-detects if blank) |
| InviteTriggerValue | ❌ | Value to trigger invite (default: "Sideways") |
| InviteSentValue | ❌ | Value after sending (default: "🔔Sent") |
| DefaultBookingUrl | ✅ | Fallback booking URL |
| AdminEmails | ❌ | Comma-separated admin emails |

### 7. Configure Jobs

Fill in the **JOBS** tab:

| Column | Description |
|--------|-------------|
| Brand | Brand name (must match BRAND_CONFIG) |
| Text For Email | Job title/position name |
| Active | TRUE or FALSE |

### 8. Configure CL Codes (Optional)

Fill in the **CL_CODES** tab for job-specific booking URLs:

| Column | Description |
|--------|-------------|
| Brand | Brand name |
| CL Code | Optional CL code |
| Job | Job title (matches Text For Email) |
| BookingUrl | Specific booking URL for this job |
| Active | TRUE or FALSE |

### 9. Set Up Trigger (Optional)

To run the dispatcher automatically:

1. Open Apps Script editor
2. Go to **Triggers** (clock icon)
3. Add trigger:
   - Function: `runDispatcherLive`
   - Event source: Time-driven
   - Type: Minutes timer / Hour timer
   - Interval: As needed (e.g., every 5 minutes)

## 🔄 Candidate Flow

1. **Dispatcher scans Smartsheet** for rows with trigger value "Sideways"
2. **Invite email sent** with signed, personalized link
3. **Smartsheet updated** to "🔔Sent"
4. **Candidate clicks link** → OTP Request page
5. **Candidate enters email + position** → Verified against Smartsheet
6. **OTP sent to email** (6 digits, 10 min expiry)
7. **Candidate enters OTP** → Verified with 3 max attempts
8. **Token issued** (30 min expiry)
9. **Candidate clicks "Open Booking"** → Token burned, redirected to booking URL

## 🔒 Security Features

| Feature | Protection |
|---------|------------|
| HMAC-signed URLs | Prevents URL tampering |
| 24-hour link expiry | Limits sharing window |
| Email + Position verification | Confirms identity against Smartsheet |
| OTP (10 min, 3 attempts) | Proves email ownership |
| One-time tokens | Prevents link sharing/reuse |
| Email hashing in logs | Privacy protection |

## 📊 Diagnostics

Access the diagnostics page at:
```
https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec?page=diag
```

Features:
- Schema validation status
- Brand configuration overview
- Dispatcher controls (Dry Run / Live)
- Recent logs viewer

## 🧪 Testing

Run tests from the Apps Script editor:

```javascript
// Run all tests
runAllTests();

// Or individual test suites
TestRunner.testSchemaEnforcement();
TestRunner.testInviteSigning();
TestRunner.testOtpLifecycle();
TestRunner.testTokenLifecycle();
TestRunner.testDispatcherDryRun();
```

## 📋 Sheet Tab Reference

### TOKENS Tab (Auto-populated)
Tracks all verification attempts and tokens:
- OTP Status: PENDING, VERIFIED, FAILED, EXPIRED, SUPERSEDED
- Token Status: ISSUED, USED, REVOKED, EXPIRED

### LOGS Tab (Append-only)
All system events with:
- Timestamp
- Trace ID (for request tracking)
- Brand, Event, Result
- Hashed email (for privacy)
- Message and metadata

## 🔧 Troubleshooting

### "CONFIG_SHEET_ID not set"
Add the CONFIG_SHEET_ID to Script Properties.

### "SM_TOKEN not set"
Add your Smartsheet API token to Script Properties.

### "HMAC_SECRET not set"
Generate a random secret and add to Script Properties.

### Dispatcher not finding rows
1. Check SmartsheetSheetId is correct
2. Check EmailColumnId and TextForEmailColumnId are correct
3. Verify trigger column contains exact value "Sideways"
4. Run Dry Run from Diag page to see what's happening

### OTP emails not arriving
1. Check spam folder
2. Verify email quota in Apps Script
3. Check LOGS tab for errors

### Token already used error
Each booking link can only be used once. Candidate must restart verification.

## 📝 License

MIT License - Use freely for your organization.

## 👤 Author

Interview Booking Uniform System v3
Built with Google Apps Script + Smartsheet API
