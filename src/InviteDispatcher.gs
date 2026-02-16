/**
 * InviteDispatcher.gs
 * Scans Smartsheets and sends invite emails
 * Interview Booking Uniform System v3
 */

const InviteDispatcher = (() => {
  /**
   * Run the invite dispatcher for all active brands
   * @param {boolean} dryRun - If true, don't send emails or update Smartsheet
   * @returns {Object} Dispatcher results
   */
  function runInviteDispatcher(dryRun = false) {
    const traceId = ConfigService.generateTraceId();
    const results = {
      traceId,
      dryRun,
      startTime: new Date().toISOString(),
      brands: [],
      totalProcessed: 0,
      totalSent: 0,
      totalErrors: 0
    };

    LoggingService.info(traceId, '', 'DISPATCHER_START', 
      `Starting invite dispatcher (dryRun=${dryRun})`, '', { dryRun });

    try {
      const brands = ConfigService.getActiveBrands();
      
      if (brands.length === 0) {
        LoggingService.info(traceId, '', 'DISPATCHER_NO_BRANDS', 'No active brands found', '');
        results.message = 'No active brands configured';
        return results;
      }

      for (const brand of brands) {
        const brandResult = processBrand_(brand, dryRun, traceId);
        results.brands.push(brandResult);
        results.totalProcessed += brandResult.processed;
        results.totalSent += brandResult.sent;
        results.totalErrors += brandResult.errors;
      }

      results.endTime = new Date().toISOString();
      results.success = true;

      LoggingService.success(traceId, '', 'DISPATCHER_COMPLETE', 
        `Dispatcher complete: ${results.totalSent} sent, ${results.totalErrors} errors`, '', 
        { totalProcessed: results.totalProcessed, totalSent: results.totalSent, totalErrors: results.totalErrors });

    } catch (e) {
      results.success = false;
      results.error = e.message;
      LoggingService.error(traceId, '', 'DISPATCHER_ERROR', e.message, '', { stack: e.stack });
    }

    return results;
  }

  /**
   * Process a single brand
   */
  function processBrand_(brandConfig, dryRun, traceId) {
    const brand = brandConfig.Brand;
    const logger = LoggingService.createScopedLogger(traceId, brand);
    
    const result = {
      brand,
      processed: 0,
      sent: 0,
      errors: 0,
      rows: []
    };

    logger.info('BRAND_PROCESS_START', `Processing brand: ${brand}`, '');

    try {
      // Get Smartsheet data
      const sheetId = brandConfig.SmartsheetSheetId;
      if (!sheetId) {
        logger.failure('BRAND_PROCESS', 'No SmartsheetSheetId configured', '');
        result.error = 'No SmartsheetSheetId configured';
        return result;
      }

      const columns = SmartsheetService.getColumns(sheetId);
      
      // Resolve column IDs
      const emailColumnId = brandConfig.EmailColumnId;
      const textForEmailColumnId = brandConfig.TextForEmailColumnId;
      
      // Resolve invite trigger column
      let inviteTriggerColumnId = brandConfig.InviteTriggerColumnId;
      if (!inviteTriggerColumnId) {
        const autoDetected = SmartsheetService.autoDetectInviteTriggerColumn(columns);
        if (autoDetected) {
          inviteTriggerColumnId = autoDetected.id;
          logger.info('COLUMN_AUTODETECT', `Auto-detected invite trigger column: ${autoDetected.title}`, '', 
            { columnId: inviteTriggerColumnId });
        } else {
          logger.failure('BRAND_PROCESS', 'Could not auto-detect invite trigger column', '');
          result.error = 'Could not determine invite trigger column';
          return result;
        }
      }

      // Get trigger values with defaults
      const inviteTriggerValue = brandConfig.InviteTriggerValue || 'Sideways';
      const inviteSentValue = brandConfig.InviteSentValue || '🔔Sent';

      // Get all rows
      const rows = SmartsheetService.getRows(sheetId);
      
      // Find rows with trigger value
      for (const row of rows) {
        const triggerValue = SmartsheetService.getCellValue(row, inviteTriggerColumnId);
        
        if (triggerValue === inviteTriggerValue) {
          result.processed++;
          
          const email = SmartsheetService.getCellValue(row, emailColumnId);
          const textForEmail = SmartsheetService.getCellValue(row, textForEmailColumnId);
          const emailHash = ConfigService.hashEmail(email);
          
          const rowResult = {
            rowId: row.id,
            emailHash,
            textForEmail,
            status: 'pending'
          };

          // Validate required fields
          if (!email) {
            rowResult.status = 'skipped';
            rowResult.error = 'Missing email';
            result.rows.push(rowResult);
            logger.failure('ROW_PROCESS', 'Missing email in row', emailHash, { rowId: row.id });
            continue;
          }

          if (!textForEmail) {
            rowResult.status = 'skipped';
            rowResult.error = 'Missing text for email';
            result.rows.push(rowResult);
            logger.failure('ROW_PROCESS', 'Missing text for email in row', emailHash, { rowId: row.id });
            continue;
          }

          // Create signed invite URL
          const inviteUrl = InviteSigning.createSignedInviteUrl({
            brand,
            rowId: row.id,
            email,
            textForEmail
          });

          // Send invite email
          const emailResult = EmailService.sendInviteEmail({
            to: email,
            brand,
            textForEmail,
            inviteUrl,
            traceId,
            dryRun
          });

          if (!emailResult.success && !dryRun) {
            rowResult.status = 'error';
            rowResult.error = emailResult.error;
            result.errors++;
            result.rows.push(rowResult);
            logger.error('ROW_PROCESS', `Failed to send email: ${emailResult.error}`, emailHash, { rowId: row.id });
            continue;
          }

          // Update Smartsheet cell
          if (!dryRun) {
            try {
              SmartsheetService.updateCell(sheetId, row.id, inviteTriggerColumnId, inviteSentValue);
              rowResult.status = 'sent';
              rowResult.updatedTo = inviteSentValue;
              result.sent++;
              logger.success('ROW_PROCESS', 'Invite sent and cell updated', emailHash, 
                { rowId: row.id, updatedTo: inviteSentValue });
            } catch (updateError) {
              rowResult.status = 'sent_update_failed';
              rowResult.error = updateError.message;
              result.sent++;
              result.errors++;
              logger.error('ROW_UPDATE', `Email sent but cell update failed: ${updateError.message}`, emailHash, 
                { rowId: row.id });
            }
          } else {
            rowResult.status = 'dry_run';
            rowResult.wouldUpdate = inviteSentValue;
            result.sent++;
            logger.info('ROW_DRYRUN', `Would send invite and update cell`, emailHash, 
              { rowId: row.id, wouldUpdate: inviteSentValue });
          }

          result.rows.push(rowResult);
        }
      }

      logger.success('BRAND_PROCESS_COMPLETE', 
        `Brand processing complete: ${result.sent}/${result.processed} sent`, '', 
        { processed: result.processed, sent: result.sent, errors: result.errors });

    } catch (e) {
      result.error = e.message;
      logger.error('BRAND_PROCESS_ERROR', e.message, '', { stack: e.stack });
    }

    return result;
  }

  /**
   * Run dispatcher for a single brand (for testing)
   */
  function runForBrand(brandName, dryRun = true) {
    const traceId = ConfigService.generateTraceId();
    const brandConfig = ConfigService.getBrandConfig(brandName);
    
    if (!brandConfig) {
      return { success: false, error: `Brand not found: ${brandName}` };
    }
    
    return processBrand_(brandConfig, dryRun, traceId);
  }

  // Public API
  return {
    runInviteDispatcher,
    runForBrand
  };
})();

/**
 * Global function for trigger/menu
 */
function runDispatcherLive() {
  return InviteDispatcher.runInviteDispatcher(false);
}

/**
 * Global function for dry run
 */
function runDispatcherDryRun() {
  return InviteDispatcher.runInviteDispatcher(true);
}
