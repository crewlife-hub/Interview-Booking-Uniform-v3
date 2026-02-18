# Test Checklist

## Setup Verification

- [ ] 1. Visit `/exec` without brand → Shows brand selector with ROYAL, COSTA, SEACHEFS, CPD
- [ ] 2. Visit `/exec?page=diag&brand=ROYAL` → Returns JSON with `ok: true`, version, safeMode
- [ ] 3. Config Sheet tabs auto-created → CL_CODES, JOBS, TOKENS, LOGS, BRAND_CONFIG exist
- [ ] 4. Script properties set → CONFIG_SHEET_ID, SMARTSHEET_API_TOKEN visible in settings

## Admin Console

- [ ] 5. Visit `/exec?page=admin&brand=ROYAL` → Admin console loads with brand name
- [ ] 6. Candidate lookup with valid email → Returns Smartsheet data or suggestions
- [ ] 7. Candidate lookup with invalid email → Shows "not found" message
- [ ] 8. Candidate lookup with partial match → Shows Text For Email suggestions
- [ ] 9. CL code resolution → Displays recruiter name and booking URL
- [ ] 10. Send invite (no active token) → Token issued, email sent, log entry created
- [ ] 11. Send invite (active token exists) → Error "Active token exists, use re-issue"
- [ ] 12. Re-issue link → Old tokens revoked, new token issued, email sent
- [ ] 13. Update CL code URL → Saves to sheet, Last Updated timestamp set
- [ ] 14. Recent activity shows → Latest log entries visible

## Candidate Flow

- [ ] 15. Open token link (GET) → CandidateConfirm.html displays, token NOT burned
- [ ] 16. Token status after GET → Status = CONFIRMED (not USED)
- [ ] 17. Click confirm (POST) → Redirects to booking URL
- [ ] 18. Token status after confirm → Status = USED, Used At timestamp set
- [ ] 19. Re-use same token → Error "Link already used"
- [ ] 20. Expired token → Error "Link expired"
- [ ] 21. Revoked token → Error "Link revoked"
- [ ] 22. Invalid/fake token → Error "Token not found"
- [ ] 23. Brand mismatch → Error "Brand mismatch"

## Security

- [ ] 24. Scanner-safe: GET does not burn token → Confirm page requires POST
- [ ] 25. Token single-use → Second confirm attempt fails
- [ ] 26. Token 48h expiry → Token expires after configured hours
- [ ] 27. Email masking → Logs show masked emails (jo***@gmail.com)
- [ ] 28. Access control → Non-domain users blocked from admin (if configured)

## Email

- [ ] 29. Invite email received → Contains brand, position, booking link
- [ ] 30. Re-issue email received → Subject includes "(Re-sent)"
- [ ] 31. Email quota check → `getEmailQuota_()` returns remaining

## Config Sheet

- [ ] 32. CL_CODES populated → Brand, CL Code, Recruiter, URL, Active columns
- [ ] 33. JOBS populated → Brand, Job Title, Default CL Code, Active columns
- [ ] 34. TOKENS recorded → New rows for each issued token
- [ ] 35. LOGS recorded → Events with traceId, timestamp, actor

## Edge Cases

- [ ] 36. Unknown brand in URL → Shows error or brand selector
- [ ] 37. Missing CL code in CL_CODES → Clear error message
- [ ] 38. Inactive CL code → Error "CL code is inactive"
- [ ] 39. Missing booking URL → Error "No booking URL configured"
- [ ] 40. Smartsheet API down → Graceful error, diag shows status

## Diagnostics

- [ ] 41. `/exec?page=diag&brand=ROYAL` → JSON with config status
- [ ] 42. Smartsheet connection test → Shows ok/error status
- [ ] 43. Email quota shown → Remaining daily quota
- [ ] 44. CL codes count shown → Number of configured codes
- [ ] 45. Jobs count shown → Number of configured jobs
