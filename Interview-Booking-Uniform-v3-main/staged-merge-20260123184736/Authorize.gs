/**
 * Trigger OAuth consent for common scopes by making harmless read-only calls.
 * Run `requestAuthorization()` from the Apps Script editor or call via webapp
 * to force the OAuth consent screen and allow you to re-grant permissions.
 */
function requestAuthorization() {
  var props = PropertiesService.getScriptProperties();
  var configId = props.getProperty('CONFIG_SHEET_ID');
  var results = {};
  try {
    if (configId) {
      var ss = SpreadsheetApp.openById(configId);
      results.spreadsheet = ss.getId() ? 'ok' : 'no-id';
    } else {
      results.spreadsheet = 'no CONFIG_SHEET_ID set';
    }
  } catch (e) {
    results.spreadsheet = String(e);
  }

  try {
    results.mailQuota = MailApp.getRemainingDailyQuota();
  } catch (e) {
    results.mailQuota = String(e);
  }

  try {
    results.calendarCount = CalendarApp.getAllCalendars().length;
  } catch (e) {
    results.calendarCount = String(e);
  }

  try {
    results.driveRoot = DriveApp.getRootFolder().getId();
  } catch (e) {
    results.driveRoot = String(e);
  }

  try {
    var r = UrlFetchApp.fetch('https://www.google.com');
    results.urlfetch = r.getResponseCode();
  } catch (e) {
    results.urlfetch = String(e);
  }

  Logger.log(JSON.stringify(results));
  return results;
}
