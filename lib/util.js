'use strict';

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
