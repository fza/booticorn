'use strict';

var util = require('../util');

/**
 * Setup swig template engine
 * @param {object} app Express instance
 * @param {object} config App config
 * @param {object} options Boot options
 * @param {object} logger Winston instance
 * @param {function} cb `callback(error)`
 */
module.exports = function (app, config, options, logger, cb) {
  var swig;
  try {
    swig = require('swig');
  } catch (e) {
    cb(new Error(
      'Unable to require "swig". ' +
      'It must be defined as a dependency in your package.json.'
    ));
  }

  app.engine('swig', swig.renderFile);
  app.set('view engine', 'swig');

  swig.setDefaults({
    cache: config.envDev ? false : 'memory'
  });

  cb();
}
