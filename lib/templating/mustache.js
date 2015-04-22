'use strict';

var util = require('../util');

/**
 * Setup mustache template engine
 * @param {object} app Express instance
 * @param {object} config App config
 * @param {object} options Boot options
 * @param {object} logger Winston instance
 * @param {function} cb `callback(error)`
 */
module.exports = function (app, config, options, logger, cb) {
  var mustacheExpress;
  try {
    mustacheExpress = require('mustache-express');
  } catch (e) {
    cb(new Error(
      'Unable to require "mustache-express". ' +
      'It must be defined as a dependency in your package.json.'
    ));
  }

  app.engine('mustache', mustacheExpress());
  app.set('view engine', 'mustache');
  app.set('views', options.viewsPath);
  app.set('view cache', config.envProd);

  cb();
}
