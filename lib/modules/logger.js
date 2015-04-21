'use strict';

var fs = require('fs'),
  path = require('path'),
  winston = require('winston');

/**
 * Say hello to Winston, the logger
 * @param {object} options Options
 * @returns {object} Winston instance
 */
module.exports = function initLogger(options) {
  var logsPath = path.resolve(options.logsPath || path.join(options.basePath, '..', 'logs'));

  if (!fs.existsSync(logsPath)) {
    fs.mkdirSync(logsPath);
  }

  var isDev = process.env.NODE_ENV !== 'production';

  winston.setLevels({
    debug: 0,
    request: 1,
    info: 2,
    warn: 3,
    error: 4
  });

  if (isDev) {
    winston.addColors({
      debug: 'magenta',
      request: 'green',
      info: 'cyan',
      warn: 'yellow',
      error: 'red'
    });
  }

  // Remove the default console transport
  winston.remove(winston.transports.Console);

  winston.add(winston.transports.Console, {
    name: 'exception log - console',
    handleExceptions: true,
    level: isDev ? 'debug' : 'info',
    colorize: true
  });

  winston.add(winston.transports.File, {
    name: 'exception log',
    filename: path.join(logsPath, 'exceptions.log'),
    handleExceptions: true,
    level: 'error',
    colorize: true
  });

  winston.add(winston.transports.File, {
    name: 'application log',
    filename: path.join(logsPath, 'app.log'),
    level: 'info',
    colorize: true
  });

  winston.exitOnError = true;

  return winston;
};
