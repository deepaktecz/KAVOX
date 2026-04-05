'use strict';

const winston = require('winston');
const path = require('path');

const { combine, timestamp, errors, json, colorize, printf, splat } = winston.format;

const logDir = path.join(__dirname, '../logs');

const consoleFormat = printf(({ level, message, timestamp: ts, stack, ...meta }) => {
  let log = `[${ts}] ${level}: ${message}`;
  if (stack) log += `\n${stack}`;
  if (Object.keys(meta).length > 0) {
    log += ` ${JSON.stringify(meta)}`;
  }
  return log;
});

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'warn' : 'debug'),
  format: combine(
    errors({ stack: true }),
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    splat(),
    json()
  ),
  defaultMeta: {
    service: process.env.SERVICE_NAME || 'auth-service',
    pid: process.pid,
  },
  transports: [
    // Console - colored in dev
    new winston.transports.Console({
      format: process.env.NODE_ENV === 'production'
        ? combine(timestamp(), json())
        : combine(colorize(), timestamp({ format: 'HH:mm:ss' }), consoleFormat),
      silent: process.env.NODE_ENV === 'test',
    }),
  ],
});

// Add file transports in production
if (process.env.NODE_ENV === 'production') {
  logger.add(new winston.transports.File({
    filename: path.join(logDir, 'error.log'),
    level: 'error',
    maxsize: 10 * 1024 * 1024, // 10MB
    maxFiles: 5,
    tailable: true,
  }));

  logger.add(new winston.transports.File({
    filename: path.join(logDir, 'combined.log'),
    maxsize: 20 * 1024 * 1024, // 20MB
    maxFiles: 10,
    tailable: true,
  }));
}

// HTTP request logger stream for Morgan
logger.stream = {
  write: (message) => logger.info(message.trim()),
};

module.exports = { logger };
