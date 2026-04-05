'use strict';

/**
 * LOGGER UTILITY
 * ═════════════════════════════════════════════════════════════════════════════
 * Centralized logging for all microservices
 */

const fs = require('fs');
const path = require('path');

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

class Logger {
  constructor(serviceName = 'app') {
    this.serviceName = serviceName;
    this.logFile = path.join(logsDir, `${serviceName}.log`);
  }

  /**
   * Format log message
   */
  formatMessage(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${this.serviceName}] [${level}]`;

    if (data) {
      return `${prefix} ${message} ${JSON.stringify(data)}`;
    }
    return `${prefix} ${message}`;
  }

  /**
   * Write to file
   */
  writeToFile(message) {
    try {
      fs.appendFileSync(this.logFile, message + '\n');
    } catch (error) {
      console.error('Failed to write to log file:', error);
    }
  }

  /**
   * Info level
   */
  info(message, data = null) {
    const formatted = this.formatMessage('INFO', message, data);
    console.log(`\x1b[36m${formatted}\x1b[0m`); // Cyan
    this.writeToFile(formatted);
  }

  /**
   * Error level
   */
  error(message, data = null) {
    const formatted = this.formatMessage('ERROR', message, data);
    console.error(`\x1b[31m${formatted}\x1b[0m`); // Red
    this.writeToFile(formatted);
  }

  /**
   * Warning level
   */
  warn(message, data = null) {
    const formatted = this.formatMessage('WARN', message, data);
    console.warn(`\x1b[33m${formatted}\x1b[0m`); // Yellow
    this.writeToFile(formatted);
  }

  /**
   * Debug level
   */
  debug(message, data = null) {
    if (process.env.DEBUG !== 'true') return;

    const formatted = this.formatMessage('DEBUG', message, data);
    console.log(`\x1b[35m${formatted}\x1b[0m`); // Magenta
    this.writeToFile(formatted);
  }

  /**
   * Success level
   */
  success(message, data = null) {
    const formatted = this.formatMessage('SUCCESS', message, data);
    console.log(`\x1b[32m${formatted}\x1b[0m`); // Green
    this.writeToFile(formatted);
  }
}

module.exports = new Logger(process.env.SERVICE_NAME || 'kavox');
