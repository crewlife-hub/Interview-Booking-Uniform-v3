/**
 * SmartsheetService.gs
 * Smartsheet API integration
 * Interview Booking Uniform System v3
 */

const SmartsheetService = (() => {
  const API_BASE = 'https://api.smartsheet.com/2.0';

  /**
   * Get Smartsheet API token from Script Properties
   */
  function getToken_() {
    const scriptProps = PropertiesService.getScriptProperties();
    const token = scriptProps.getProperty('SM_TOKEN') || scriptProps.getProperty('SMARTSHEET_API_TOKEN');
    if (!token) {
      throw new Error('SM_TOKEN (or SMARTSHEET_API_TOKEN) not set in Script Properties');
    }
    return token;
  }

  /**
   * Make authenticated API request to Smartsheet
   */
  function apiRequest_(method, endpoint, payload) {
    const options = {
      method: method,
      headers: {
        'Authorization': 'Bearer ' + getToken_(),
        'Content-Type': 'application/json'
      },
      muteHttpExceptions: true
    };

    if (payload) {
      options.payload = JSON.stringify(payload);
    }

    const response = UrlFetchApp.fetch(API_BASE + endpoint, options);
    const code = response.getResponseCode();
    const body = response.getContentText();

    if (code >= 400) {
      throw new Error(`Smartsheet API error ${code}: ${body}`);
    }

    return JSON.parse(body);
  }

  /**
   * Get sheet metadata including columns
   */
  function getSheet(sheetId) {
    return apiRequest_('GET', `/sheets/${sheetId}`);
  }

  /**
   * Get sheet columns
   */
  function getColumns(sheetId) {
    const sheet = getSheet(sheetId);
    return sheet.columns || [];
  }

  /**
   * Find column by ID
   */
  function getColumnById(columns, columnId) {
    return columns.find(c => String(c.id) === String(columnId));
  }

  /**
   * Find column by title (case-insensitive partial match)
   */
  function findColumnByTitle(columns, ...keywords) {
    return columns.find(col => {
      const title = (col.title || '').toLowerCase();
      return keywords.every(kw => title.includes(kw.toLowerCase()));
    });
  }

  /**
   * Auto-detect invite trigger column
   * Looks for column titles containing "invite" and "send"
   */
  function autoDetectInviteTriggerColumn(columns) {
    // Try exact patterns first
    const patterns = [
      ['invite', 'send'],
      ['send', 'invite'],
      ['invite trigger'],
      ['trigger']
    ];

    for (const pattern of patterns) {
      const col = findColumnByTitle(columns, ...pattern);
      if (col) return col;
    }

    return null;
  }

  /**
   * Get all rows from a sheet
   */
  function getRows(sheetId) {
    const sheet = getSheet(sheetId);
    return sheet.rows || [];
  }

  /**
   * Get cell value from a row by column ID
   */
  function getCellValue(row, columnId) {
    const cell = (row.cells || []).find(c => String(c.columnId) === String(columnId));
    return cell ? (cell.displayValue || cell.value || '') : '';
  }

  /**
   * Update a cell value
   */
  function updateCell(sheetId, rowId, columnId, value) {
    const payload = {
      cells: [{
        columnId: Number(columnId),
        value: value
      }]
    };

    return apiRequest_('PUT', `/sheets/${sheetId}/rows/${rowId}`, payload);
  }

  /**
   * Get a specific row by ID
   */
  function getRow(sheetId, rowId) {
    return apiRequest_('GET', `/sheets/${sheetId}/rows/${rowId}`);
  }

  /**
   * Find rows matching a specific cell value
   */
  function findRowsWithValue(sheetId, columnId, value) {
    const sheet = getSheet(sheetId);
    const rows = sheet.rows || [];
    
    return rows.filter(row => {
      const cellValue = getCellValue(row, columnId);
      return cellValue === value;
    });
  }

  /**
   * Verify candidate data matches Smartsheet row
   */
  function verifyRowData(sheetId, rowId, emailColumnId, textForEmailColumnId, email, textForEmail) {
    try {
      const row = getRow(sheetId, rowId);
      const rowEmail = getCellValue(row, emailColumnId);
      const rowTextForEmail = getCellValue(row, textForEmailColumnId);
      
      const emailMatch = rowEmail.toLowerCase().trim() === email.toLowerCase().trim();
      const textMatch = rowTextForEmail.toLowerCase().trim() === textForEmail.toLowerCase().trim();
      
      return {
        success: emailMatch && textMatch,
        emailMatch,
        textMatch,
        rowEmail,
        rowTextForEmail
      };
    } catch (e) {
      return {
        success: false,
        error: e.message
      };
    }
  }

  // Public API
  return {
    getSheet,
    getColumns,
    getColumnById,
    findColumnByTitle,
    autoDetectInviteTriggerColumn,
    getRows,
    getCellValue,
    updateCell,
    getRow,
    findRowsWithValue,
    verifyRowData
  };
})();
