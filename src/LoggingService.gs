/**
 * LoggingService.gs
 * Centralized logging to LOGS tab
 * Interview Booking Uniform System v3
 */

const LoggingService = (() => {
  /**
   * Log an event to the LOGS sheet
   * @param {Object} params - Log parameters
   * @param {string} params.traceId - Trace ID for request tracking
   * @param {string} params.brand - Brand name
   * @param {string} params.event - Event type
   * @param {string} params.emailHash - Hashed email for privacy
   * @param {string} params.result - SUCCESS, FAILURE, ERROR, INFO
   * @param {string} params.message - Human-readable message
   * @param {Object} params.meta - Additional metadata (will be JSON stringified)
   */
  function log(params) {
    try {
      const sheet = ConfigService.getLogsSheet();
      const timestamp = new Date().toISOString();
      const metaJson = params.meta ? JSON.stringify(params.meta) : '';
      
      const row = [
        timestamp,
        params.traceId || '',
        params.brand || '',
        params.event || '',
        params.emailHash || '',
        params.result || 'INFO',
        params.message || '',
        metaJson
      ];
      
      sheet.appendRow(row);
      
      // Also log to console for debugging
      console.log(`[${params.result || 'INFO'}] ${params.event}: ${params.message}`);
    } catch (e) {
      // Fallback to console if sheet logging fails
      console.error('LoggingService.log failed:', e.message);
      console.log('Original log:', JSON.stringify(params));
    }
  }

  /**
   * Log successful event
   */
  function success(traceId, brand, event, message, emailHash, meta) {
    log({ traceId, brand, event, emailHash, result: 'SUCCESS', message, meta });
  }

  /**
   * Log failure event
   */
  function failure(traceId, brand, event, message, emailHash, meta) {
    log({ traceId, brand, event, emailHash, result: 'FAILURE', message, meta });
  }

  /**
   * Log error event
   */
  function error(traceId, brand, event, message, emailHash, meta) {
    log({ traceId, brand, event, emailHash, result: 'ERROR', message, meta });
  }

  /**
   * Log info event
   */
  function info(traceId, brand, event, message, emailHash, meta) {
    log({ traceId, brand, event, emailHash, result: 'INFO', message, meta });
  }

  /**
   * Create a logger scoped to a trace ID
   */
  function createScopedLogger(traceId, brand) {
    return {
      success: (event, message, emailHash, meta) => 
        success(traceId, brand, event, message, emailHash, meta),
      failure: (event, message, emailHash, meta) => 
        failure(traceId, brand, event, message, emailHash, meta),
      error: (event, message, emailHash, meta) => 
        error(traceId, brand, event, message, emailHash, meta),
      info: (event, message, emailHash, meta) => 
        info(traceId, brand, event, message, emailHash, meta)
    };
  }

  // Public API
  return {
    log,
    success,
    failure,
    error,
    info,
    createScopedLogger
  };
})();
