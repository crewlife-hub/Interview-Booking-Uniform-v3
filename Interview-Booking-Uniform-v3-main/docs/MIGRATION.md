# Migration Strategy

## Overview

This document outlines the safe rollout plan for migrating from the legacy Forms-based booking systems to the Unified Booking Core.

## Timeline

| Phase | Duration | Scope |
|-------|----------|-------|
| Phase 0: Preparation | Week 1 | Setup and configuration |
| Phase 1: Internal Testing | Week 2 | QA and recruiter testing |
| Phase 2: Pilot | Week 3 | Single department, single brand |
| Phase 3: Expand | Week 4-5 | All departments for one brand |
| Phase 4: Full Rollout | Week 6-8 | All brands |
| Phase 5: Decommission | Week 9+ | Remove legacy systems |

---

## Phase 0: Preparation (Week 1)

### Tasks

- [ ] Deploy Apps Script project
- [ ] Configure script properties (API tokens, sheet IDs)
- [ ] Verify Config Sheet tabs are created
- [ ] Populate CL_CODES with recruiter mappings
- [ ] Populate JOBS with job title mappings
- [ ] Set SAFE_MODE = true
- [ ] Test Smartsheet connections for all brands
- [ ] Document current Forms URLs for reference

### Verification

```
GET /exec?page=diag&brand=ROYAL
GET /exec?page=diag&brand=COSTA
GET /exec?page=diag&brand=SEACHEFS
GET /exec?page=diag&brand=CPD
```

All should return `ok: true` with valid configuration.

---

## Phase 1: Internal Testing (Week 2)

### Tasks

- [ ] Recruiters access Admin Console in read-only mode
- [ ] Test candidate lookup for each brand
- [ ] Test token issuance (using test email addresses)
- [ ] Test token verification flow
- [ ] Test re-issue functionality
- [ ] Verify email templates
- [ ] Verify booking redirects work
- [ ] Review LOGS tab for audit trail
- [ ] Fix any bugs found

### Test Accounts

Create test entries in Smartsheet with:
- Email: `test+royal@crewlifeatsea.com`
- Text For Email: `Test Position - CL999`

### Acceptance Criteria

- [ ] All 4 brands show in Admin Console
- [ ] Candidate lookup returns correct data
- [ ] Token emails are received
- [ ] Confirmation page displays correctly
- [ ] Redirect to booking calendar works
- [ ] Token cannot be reused

---

## Phase 2: Pilot (Week 3)

### Scope

- **Brand**: ROYAL
- **Department**: Retail (lowest volume)
- **CL Code**: CL200

### Tasks

- [ ] Announce pilot to Retail recruiters
- [ ] Train recruiters on Admin Console
- [ ] Disable SAFE_MODE for ROYAL only (if writes needed)
- [ ] Route new Retail candidates through unified system
- [ ] Keep legacy Forms active for other departments
- [ ] Daily monitoring of LOGS tab
- [ ] Daily check-in with pilot users

### Success Metrics

- [ ] ≥95% successful token sends
- [ ] <5 min average recruiter task time
- [ ] Zero data mismatches
- [ ] Zero security incidents

### Rollback Trigger

If any of these occur, revert to legacy:
- Email delivery failures >10%
- Smartsheet lookup failures >5%
- Any security breach
- Recruiter blocking issues

---

## Phase 3: Expand (Week 4-5)

### Week 4: All ROYAL Departments

- [ ] Extend to all ROYAL departments
- [ ] Update email templates to use new URLs
- [ ] Monitor for 7 days

### Week 5: Add COSTA

- [ ] Enable unified system for COSTA
- [ ] Train COSTA recruiters
- [ ] Keep ROYAL in production
- [ ] Monitor both brands

---

## Phase 4: Full Rollout (Week 6-8)

### Week 6: SEACHEFS

- [ ] Enable SEACHEFS
- [ ] Verify all CL codes populated

### Week 7: CPD

- [ ] Enable CPD
- [ ] All brands now on unified system

### Week 8: Stabilization

- [ ] Monitor all brands
- [ ] Address any edge cases
- [ ] Optimize performance
- [ ] Update documentation

---

## Phase 5: Decommission (Week 9+)

### Preparation

- [ ] Export all legacy Forms responses to archive
- [ ] Verify 30 days of stable operation
- [ ] Communicate decommission date to all users

### Decommission Steps

1. Remove legacy Forms links from all email templates
2. Set legacy Forms to "not accepting responses"
3. Archive Forms responses
4. Keep legacy systems read-only for 30 days
5. After 30 days, delete legacy scripts

### Final Verification

- [ ] All booking flows use unified system
- [ ] No references to legacy Forms
- [ ] Audit logs complete

---

## Rollback Plan

### Immediate Rollback (< 1 hour)

1. Set SAFE_MODE = true
2. Re-enable legacy Forms
3. Update email templates to use legacy URLs
4. Notify recruiters

### Investigation

1. Review LOGS tab for errors
2. Check Smartsheet connectivity
3. Review token states
4. Identify root cause

### Recovery

1. Fix identified issue
2. Test in isolated environment
3. Gradual re-rollout

---

## Communication Plan

| When | Who | What |
|------|-----|------|
| Phase 0 | All recruiters | Announcement of new system |
| Phase 1 | QA team | Testing instructions |
| Phase 2 | Pilot recruiters | Training session |
| Phase 3 | All ROYAL | Training + go-live notice |
| Phase 4 | All brands | Brand-specific training |
| Phase 5 | All | Legacy decommission notice |

---

## Contacts

| Role | Contact |
|------|---------|
| Project Lead | TBD |
| Technical Support | TBD |
| Recruiter Lead | TBD |
