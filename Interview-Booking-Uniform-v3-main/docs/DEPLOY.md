# Deployment Guide

## Prerequisites

1. Node.js installed
2. clasp CLI installed: `npm install -g @google/clasp`
3. Google account with Apps Script access
4. Access to the Config Google Sheet

## Step 1: Clone the Repository

```bash
git clone https://github.com/crewlife-hub/CrewLife-Interview-Bookings-Uniform.git
cd CrewLife-Interview-Bookings-Uniform
```

## Step 2: Connect to Existing Apps Script Project

The `.clasp.json` file is already configured with:
- Script ID: `1xNTjK690usBX6-NrKdmJWyD5-3nL3yQLV2DztOiikVZIMlPZUIWS8IEa`
- Root directory: `src`

Authenticate with clasp:
```bash
clasp login
```

## Step 3: Push Files to Apps Script

```bash
clasp push
```

Confirm when prompted to overwrite.

## Step 4: Deploy as Web App

### Option A: Using Apps Script Editor

1. Open the Apps Script Editor:
   ```bash
   clasp open
   ```

2. Click **Deploy** → **New deployment**

3. Configure:
   - Type: **Web app**
   - Description: `Production v1.0`
   - Execute as: **Me**
   - Who has access: **Anyone**

4. Click **Deploy**

5. Copy the Web App URL

### Option B: Using clasp CLI

```bash
clasp deploy --description "Production v1.0"
```

## Step 5: Set Script Properties

In the Apps Script Editor:

1. Go to **Project Settings** (gear icon)
2. Scroll to **Script Properties**
3. Add the following properties:

| Property | Value | Description |
|----------|-------|-------------|
| `CONFIG_SHEET_ID` | `1qM3ZEdBsvbEofDH8DayRWcRa4bUcrKQIv8kzKSYZ1AM` | Config sheet ID |
| `SAFE_MODE` | `true` | Start in safe mode |
| `TOKEN_EXPIRY_HOURS` | `48` | Token expiry (hours) |
| `SMARTSHEET_API_TOKEN` | `your-token` | Smartsheet API token |
| `WORKSPACE_DOMAIN` | `crewlifeatsea.com` | Allowed domain |
| `SMARTSHEET_ID_ROYAL` | `sheet-id` | Royal Smartsheet ID |
| `SMARTSHEET_ID_COSTA` | `sheet-id` | Costa Smartsheet ID |
| `SMARTSHEET_ID_SEACHEFS` | `sheet-id` | Seachefs Smartsheet ID |
| `SMARTSHEET_ID_CPD` | `sheet-id` | CPD Smartsheet ID |

## Step 6: Initialize Config Sheet

Visit the web app URL once. The system will automatically create the required tabs:
- CL_CODES
- JOBS
- TOKENS
- LOGS
- BRAND_CONFIG

## Step 7: Populate Config Data

### CL_CODES Tab
Add recruiter mappings:
```
Brand | CL Code | Recruiter Name | Recruiter Email | Booking Schedule URL | Active | Last Updated
ROYAL | CL200   | Jane Smith     | jane@crew...    | https://calendar...  | TRUE   | 
```

### JOBS Tab
Add job mappings:
```
Brand | Job Title      | Default CL Code | Department | Active
ROYAL | Shop Attendant | CL200           | Retail     | TRUE
```

## Step 8: Test Endpoints

### Brand Selector
```
https://script.google.com/macros/s/DEPLOY_ID/exec
```

### Admin Console
```
https://script.google.com/macros/s/DEPLOY_ID/exec?page=admin&brand=ROYAL
```

### Diagnostics
```
https://script.google.com/macros/s/DEPLOY_ID/exec?page=diag&brand=ROYAL
```

## Updating the Deployment

After code changes:

```bash
clasp push
clasp deploy -i DEPLOYMENT_ID --description "v1.x update"
```

To get deployment ID:
```bash
clasp deployments
```

## Troubleshooting

### "Script not authorized"
- Ensure the OAuth scopes in `appsscript.json` are correct
- Re-authorize by running any function in the editor

### "Config sheet not found"
- Verify `CONFIG_SHEET_ID` in script properties
- Ensure the logged-in user has edit access to the sheet

### "Smartsheet API error"
- Verify `SMARTSHEET_API_TOKEN` is correct
- Check the Smartsheet ID for the brand
