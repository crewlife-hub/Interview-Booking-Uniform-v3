# DEPLOY.md

Exact steps to create Apps Script project, connect clasp, push files and deploy.

1) Create a new GitHub private repo called `Crew-Bookings-Core` (or use an empty repo).

2) Initialize local git and connect remote (run in the project folder):

```bash
cd "C:\Users\crewl\Downloads\Crew Booking Core"
git init
git add .
git commit -m "init: Crew Bookings Core"
git branch -M main
git remote add origin git@github.com:YOUR_ORG/Crew-Bookings-Core.git
git push -u origin main
```

3) Ensure clasp is logged in (you already did):

```bash
clasp login
```

4) If you created the Apps Script project already via `clasp create`, ensure `.clasp.json` contains the correct `scriptId`. If not, create with:

```bash
clasp create --type standalone --title "Crew Bookings Core"
```

5) Push files to Apps Script:

```bash
clasp push
```

6) Deploy as Web App (execute as: me; access: anyone with link):

Use the Apps Script Editor -> Deploy -> New deployment -> Web app
- Select: Execute as: Me
- Who has access: Anyone

7) After deployment, note the web app URL and test endpoints:

Examples:
- https://script.google.com/macros/s/DEPLOY_ID/exec?brand=ROYAL
- https://script.google.com/macros/s/DEPLOY_ID/exec?brand=COSTA
- https://script.google.com/macros/s/DEPLOY_ID/exec?brand=SEACHEFS
- Diagnostic: https://script.google.com/macros/s/DEPLOY_ID/exec?page=diag&brand=SEACHEFS

8) Set script properties (optional):

```bash
# In node/terminal using clasp, or run from Apps Script console
# Example via clasp: clasp run --webhook "setLogSheetId_('SPREADSHEET_ID')"
```

Fill `LOG_SHEET_ID` with a spreadsheet ID where logs will be stored. Safe mode prevents writes to Smartsheet.
