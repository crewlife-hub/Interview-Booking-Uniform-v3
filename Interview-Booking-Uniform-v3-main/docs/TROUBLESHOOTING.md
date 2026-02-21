# Troubleshooting Guide

## Quick Diagnostics

Visit the diagnostics endpoint to check system status:

```
/exec?page=diag&brand=ROYAL
```

This returns:
- Version
- Safe mode status
- Config sheet status
- CL codes count
- Jobs count
- Smartsheet connection status
- Email quota remaining

---

## Common Issues

### 1. "Config sheet not found"

**Symptoms:**
- Error on page load
- Diag shows `configSheet: NOT_SET`

**Causes:**
- `CONFIG_SHEET_ID` not set in script properties
- Sheet was deleted or moved
- User doesn't have access to sheet

**Solutions:**
1. Verify script property `CONFIG_SHEET_ID` is set
2. Ensure the sheet exists and is shared with the script owner
3. Re-deploy if sheet ID changed

---

### 2. "Smartsheet API error"

**Symptoms:**
- Lookup returns error
- Diag shows `smartsheetConnection: { ok: false }`

**Causes:**
- API token expired or invalid
- Wrong Smartsheet ID
- Network issues

**Solutions:**
1. Regenerate Smartsheet API token
2. Update `SMARTSHEET_API_TOKEN` in script properties
3. Verify `SMARTSHEET_ID_BRAND` is correct
4. Test connection via diag endpoint

---

### 3. "No candidate found"

**Symptoms:**
- Lookup returns no results
- Candidate exists in Smartsheet

**Causes:**
- Email mismatch (case, typo, whitespace)
- Wrong brand selected
- Smartsheet not synced

**Solutions:**
1. Check email spelling exactly
2. Verify correct brand
3. Check Smartsheet directly
4. Try lookup without Text For Email

---

### 4. "Could not resolve CL code"

**Symptoms:**
- Candidate found but CL code not resolved
- "No booking URL" error

**Causes:**
- CL code not in CL_CODES tab
- CL code marked inactive
- Text For Email doesn't contain CL code

**Solutions:**
1. Add CL code to CL_CODES tab
2. Set Active = TRUE
3. Add booking URL
4. Verify Text For Email format includes CL code

---

### 5. Token expired immediately

**Symptoms:**
- Candidate reports link already expired
- Token shows EXPIRED in history

**Causes:**
- Token created with past expiry
- Server time zone issue
- Token expiry set too low

**Solutions:**
1. Check `TOKEN_EXPIRY_HOURS` (default: 48)
2. Verify system time zone
3. Re-issue a new token

---

### 6. Token already used

**Symptoms:**
- Candidate sees "Link already used"
- Token status = USED

**Causes:**
- Candidate already clicked confirm
- Email scanner triggered the link
- Link was shared

**Solutions:**
1. Check TOKENS tab for Used At timestamp
2. If scanner issue, the scanner-safe page should prevent this
3. Re-issue a new token

---

### 7. Email not received

**Symptoms:**
- Candidate didn't get invite email
- Log shows EMAIL_SENT

**Causes:**
- Email in spam folder
- Invalid email address
- Gmail quota exceeded

**Solutions:**
1. Check spam/junk folder
2. Verify email address spelling
3. Check email quota: `MailApp.getRemainingDailyQuota()`
4. Try re-issue

---

### 8. Access denied to Admin Console

**Symptoms:**
- "Access Denied" error
- Cannot access admin page

**Causes:**
- User not on allowed domain
- User not in allowlist
- Not logged into Google

**Solutions:**
1. Log in with @crewlifeatsea.com account
2. Add email to `ADMIN_ALLOWLIST` script property
3. Add email to BRAND_CONFIG tab

---

### 9. Booking URL doesn't work

**Symptoms:**
- Redirect goes to broken page
- Google Calendar shows error

**Causes:**
- Calendar deleted or permissions changed
- URL format invalid
- URL is for wrong calendar type

**Solutions:**
1. Recreate Google Calendar Appointment Schedule
2. Update URL in CL_CODES tab
3. Test URL manually in browser

---

### 10. CL_CODES/JOBS tabs empty

**Symptoms:**
- No CL codes shown in Admin Console
- "No CL codes configured" message

**Causes:**
- Tabs not populated
- Wrong brand filter
- Headers missing/wrong

**Solutions:**
1. Add data to CL_CODES tab
2. Ensure Brand column matches exactly (ROYAL, COSTA, etc.)
3. Verify headers match expected names

---

## Viewing Logs

### In Config Sheet

1. Open the Config Sheet
2. Go to LOGS tab
3. Filter by Brand or Event

### Key Events to Monitor

| Event | Meaning |
|-------|---------|
| TOKEN_ISSUED | New invite sent |
| TOKEN_USED | Candidate completed flow |
| TOKEN_REVOKED | Admin re-issued |
| TOKENS_EXPIRED | Automatic expiry |
| EMAIL_SENT | Email delivered |
| EMAIL_FAILED | Email error |
| ADMIN_LOOKUP | Admin searched |
| ROUTER_ERROR | System error |

---

## Getting Help

1. **Collect information:**
   - Screenshot of error
   - Trace ID (shown on error pages)
   - Exact steps to reproduce

2. **Check logs:**
   - LOGS tab in Config Sheet
   - Apps Script execution logs

3. **Contact support:**
   - Include all collected information
   - Specify brand and action

---

## Emergency Procedures

### Disable All Invites

Set `SAFE_MODE = true` in script properties.

### Revoke All Active Tokens

In Apps Script editor, run:
```javascript
function revokeAllActive() {
  // Custom function to mass-revoke
}
```

### Roll Back to Legacy

1. Set SAFE_MODE = true
2. Re-enable legacy Forms
3. Notify recruiters
