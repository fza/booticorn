'use strict';

/**
 * Setup mustache template engine
 * @param {function} cb `callback(error)`
 */
module.exports = function setupMustache(cb) {
  var mustacheExpress;
  try {
    mustacheExpress = require('mustache-express');
  } catch (e) {
    cb(new Error(
      'Unable to require "mustache-express". ' +
      'It must be defined as a dependency in your package.json.'
    ));
  }

  this.app.engine('mustache', mustacheExpress());
  this.app.set('view engine', 'mustache');

  cb();
};
