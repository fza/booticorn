'use strict';

var util = require('../util');

/**
 * Setup handlebars template engine
 * @param {object} app Express instance
 * @param {object} config App config
 * @param {object} options Boot options
 * @param {object} logger Winston instance
 * @param {function} cb `callback(error)`
 */
module.exports = function (app, config, options, logger, cb) {
  var expressHandlebars;
  try {
    expressHandlebars = require('express-handlebars');
  } catch (e) {
    cb(new Error(
      'Unable to require "express-handlebars". ' +
      'It must be defined as a dependency in your package.json.'
    ));
  }

  app.engine('handlebars', expressHandlebars());
  app.set('view engine', 'handlebars');

  cb();
}
