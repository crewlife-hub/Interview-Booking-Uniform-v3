# CrewLife Interview Bookings Uniform Core

Unified booking system for ROYAL, COSTA, SEACHEFS, and CPD brands.

## Overview

This system replaces manual Google Forms editing with a config-driven, brand-aware booking flow that:

- Validates candidates against Smartsheet (Email + Text For Email match)
- Issues secure, single-use booking tokens
- Protects against email scanner prefetch
- Routes to recruiter-specific Google Calendar appointment schedules
- Provides full audit logging

## Project Structure

```
src/
├── Config.gs              # Script properties and toggles
├── BrandRegistry.gs       # Brand definitions (ROYAL, COSTA, SEACHEFS, CPD)
├── ConfigService.gs       # Config Sheet operations
├── TokenService.gs        # Token CRUD and state machine
├── SmartsheetService.gs   # Read-only Smartsheet API
├── EmailService.gs        # Send invite emails
├── Router.gs              # HTTP entry points (doGet/doPost)
├── AdminController.gs     # Admin console logic
├── CandidateController.gs # Candidate verification flow
├── LogService.gs          # Structured logging
├── Utils.gs               # Helper functions
├── appsscript.json        # Manifest with OAuth scopes
├── AdminConsole.html      # Admin UI
├── CandidateConfirm.html  # Candidate confirmation page
├── ErrorPage.html         # Error display
├── BrandSelector.html     # Brand selection landing
└── Styles.html            # Shared CSS

docs/
├── DEPLOY.md              # Deployment instructions
├── MIGRATION.md           # Rollout plan
├── ADMIN_GUIDE.md         # Admin user guide
└── TROUBLESHOOTING.md     # Common issues
```

## Quick Start

1. Clone this repo
2. Run `clasp login`
3. Run `clasp push`
4. Deploy as web app
5. Set script properties (see docs/DEPLOY.md)

## URLs

| Endpoint | Description |
|----------|-------------|
| `/exec` | Brand selector |
| `/exec?page=admin&brand=ROYAL` | Admin console |
| `/exec?brand=ROYAL&token=xxx` | Candidate booking |
| `/exec?page=diag&brand=ROYAL` | Diagnostics |

## Config Sheet

ID: `1qM3ZEdBsvbEofDH8DayRWcRa4bUcrKQIv8kzKSYZ1AM`

Required tabs (auto-created):
- CL_CODES - Recruiter mappings
- JOBS - Job title mappings
- TOKENS - Token storage
- LOGS - Audit log
- BRAND_CONFIG - Brand overrides

## Safe Mode

`SAFE_MODE = true` by default. No Smartsheet writes occur.

## Test Checklist

See [TEST_CHECKLIST.md](TEST_CHECKLIST.md) for full QA checklist.

## OTP Web App (New)

This project now includes a full OTP-based Web App that replaces the previous Google Forms flow.

- Trigger: Smartsheet "SEND Invite" column set to "Sideways" → Smartsheet automation requests a signed URL from the Apps Script webhook.
- Email: Candidate receives an email with a signed link to the Web App.
- Flow: Click signed link → OTP request page → Send OTP to email → Enter OTP → Verified → Booking redirect.

How to test locally via Apps Script editor:

1. Open the Apps Script project: https://script.google.com/d/1xNTjK690usBX6-NrKdmJWyD5-3nL3yQLV2DztOiikVZIMlPZUIWS8IEa/edit
2. Run `TEST_SystemCheck` (verifies config and sheets)
3. Run `TEST_AddSampleCLCode` to add `ROYAL / CL200` test data (if missing)
4. Run `TEST_CreateAndSendOtp` to generate an OTP and send the email
5. Open the `verify` URL logged by the test and enter the OTP

Notes:
- OTPs expire in `OTP_EXPIRY_MINUTES` (default 10)
- Signed links expire in `LINK_EXPIRY_DAYS` (default 7)
- HMAC secret stored in Script Properties as `HMAC_SECRET` (auto-generated if missing)


## Documentation

- [Deployment Guide](docs/DEPLOY.md)
- [Migration Strategy](docs/MIGRATION.md)
- [Admin Guide](docs/ADMIN_GUIDE.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)
