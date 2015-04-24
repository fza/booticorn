'use strict';

/**
 * Setup swig template engine
 * @param {function} cb `callback(error)`
 */
module.exports = function setupSwig(cb) {
  var swig;
  try {
    swig = require('swig');
  } catch (e) {
    cb(new Error(
      'Unable to require "swig". ' +
      'It must be defined as a dependency in your package.json.'
    ));
  }

  this.app.engine('swig', swig.renderFile);
  this.app.set('view engine', 'swig');

  swig.setDefaults({
    cache: this.config.envDev ? false : 'memory'
  });

  cb();
};
