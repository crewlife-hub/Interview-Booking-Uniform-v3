# MIGRATION.md

Safe rollout plan for replacing Royal/Costa/Seachefs department booking flows with the Unified Booking Core.

1) Preparation
- Create the unified project and deploy with `SAFE_MODE=true` (read-only routing). Fill booking URLs in `src/BrandRegistry.gs`.
- Create a `Logs` Google Sheet and set `LOG_SHEET_ID` in script properties.

2) Pilot (1 department)
- Choose one low-risk department (e.g., Hotel for ROYAL).
- Update the Department-specific systems to include a link to the unified flow (or start sending candidate emails pointing at unified URL for that department).
- Monitor logs and diagnostics for 14 days.

3) Expand
- Gradually add more departments and brands in 1–2 week increments.

4) Switch window
- Keep old systems running unchanged for 30 days after full rollout.
- After stable operations, update email templates and marketing to use new URLs.

5) Toggle writes
- Once confident, switch `SAFE_MODE` to `false` via `setSafeMode_(false)` to allow writes to Smartsheet (if implemented).

6) Rollback plan
- If issues found, flip `SAFE_MODE` back to `true` and redirect traffic back to legacy systems.
