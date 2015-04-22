'use strict';

var util = require('../util');

/**
 * Setup jade template engine
 * @param {object} app Express instance
 * @param {object} config App config
 * @param {object} options Boot options
 * @param {object} logger Winston instance
 * @param {function} cb `callback(error)`
 */
module.exports = function (app, config, options, logger, cb) {
  var jade;
  try {
    jade = require('jade');
  } catch (e) {
    cb(new Error(
      'Unable to require "jade". ' +
      'It must be defined as a dependency in your package.json.'
    ));
  }

  app.set('view engine', 'jade');
  app.set('views', options.viewsPath);
  app.set('view cache', config.envProd);

  cb();
}
