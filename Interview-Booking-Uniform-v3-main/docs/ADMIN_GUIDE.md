# Admin Console Guide

## Overview

The Admin Console is the primary interface for recruiters to:
- Look up candidates
- Send booking invite links
- Re-issue expired or lost links
- Manage CL code booking URLs

## Accessing the Admin Console

### URL Pattern
```
https://script.google.com/.../exec?page=admin&brand=BRAND
```

Replace `BRAND` with: `ROYAL`, `COSTA`, `SEACHEFS`, or `CPD`

### Access Requirements

- Must be logged into a Google account
- Account must be on the `@crewlifeatsea.com` domain, OR
- Account must be in the admin allowlist

---

## Candidate Lookup

### Step 1: Enter Candidate Email

Type the candidate's email address in the "Candidate Email" field.

### Step 2: Enter Text For Email (Optional)

For an exact match, enter the "Text For Email" value exactly as it appears in Smartsheet.

Example: `Shop Attendant - CL200`

If left blank, the system will show all positions for that email.

### Step 3: Click "Search Smartsheet"

The system will query the brand's Smartsheet for matching records.

### Results

**Exact Match Found:**
- Shows candidate details
- Shows resolved CL code and recruiter
- Shows booking URL
- Shows token history

**Partial Match Found:**
- Lists all positions for that email
- Click a position to select it

**No Match:**
- Candidate not found in Smartsheet
- Verify email spelling
- Confirm candidate is in the correct brand's sheet

---

## Sending Invites

### Prerequisites

- Candidate must exist in Smartsheet
- Email + Text For Email must match exactly
- CL code must be active
- Booking URL must be configured

### Send New Invite

1. Search for the candidate (exact match required)
2. Verify the resolved CL code and booking URL
3. Click **"Send Invite"**
4. Candidate receives email with booking link

### Token Details

- Link expires in 48 hours (configurable)
- Link can only be used once
- Link is personal to the candidate

---

## Re-issuing Links

Use this when:
- Candidate lost the original link
- Original link expired
- Candidate accidentally clicked the link

### Process

1. Search for the candidate
2. If an active token exists, you'll see **"Re-issue Link"** button
3. Click **"Re-issue Link"**
4. System will:
   - Revoke all existing active tokens
   - Generate a new token
   - Send a new email marked "(Re-sent)"

---

## Managing CL Codes

### Updating Booking URLs

Each CL code has a configurable booking schedule URL.

1. Find the CL code in the table
2. Edit the URL in the text field
3. Click **"Save URL"**

### When to Update

- Recruiter changes
- Calendar link regenerated
- New Google Calendar created

### Best Practices

- Test the URL before saving
- Notify candidates if their recruiter changes
- Keep URLs up to date

---

## Token States

| Status | Meaning |
|--------|---------|
| ISSUED | Link sent, not yet opened |
| CONFIRMED | Candidate viewed confirmation page |
| USED | Candidate completed booking redirect |
| REVOKED | Link was cancelled (re-issue) |
| EXPIRED | 48+ hours passed without use |

---

## Common Issues

### "No exact match found"

- Verify email spelling
- Check Text For Email matches exactly
- Confirm candidate is in this brand's Smartsheet

### "CL code is inactive"

- The CL code is disabled in the CL_CODES tab
- Contact admin to reactivate

### "No booking URL configured"

- The CL code doesn't have a booking URL
- Add the URL in the CL_CODES tab or Admin Console

### "Active token already exists"

- Candidate already has a valid, unused link
- Use "Re-issue Link" to send a new one

---

## Recent Activity

The bottom of the Admin Console shows recent events:
- Token issues
- Token uses
- Errors

This helps track what's happening in real-time.

---

## Support

For technical issues:
1. Note the error message and trace ID
2. Check the LOGS tab in the Config Sheet
3. Contact the technical team
