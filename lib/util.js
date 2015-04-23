'use strict';

var _ = require('lodash');

/**
 * String to integer conversion with default value
 */
function intval(val, dflt) {
  return val ? parseInt(val, 10) : dflt;
}

exports.intval = intval;

/**
 * Check whether val is numeric
 */
function isNumeric(val) {
  return /^\d+(\.\d+)?$/.test(val);
}

exports.isNumeric = isNumeric;

/**
 * Generate an absolute URL
 */
function generateUrlFromPath(app, urlPath, protocolRelative, secure) {
  var config = app.get('config');

  if (_.isUndefined(protocolRelative) && config.options.alwaysGenerateProtocolRelativeUrls) {
    protocolRelative = true;
  }

  var result = '';

  if (!protocolRelative) {
    result += secure ? 'https:' : 'http:';
  }

  result += '//' + config.domain;

  if ([80, 443].indexOf(config.externalPort) === -1) {
    result += ':' + config.externalPort;
  }

  return result + urlPath;
}

exports.generateUrlFromPath = generateUrlFromPath;
