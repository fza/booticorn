'use strict';

/**
 * Setup jade template engine
 * @param {function} cb `callback(error)`
 */
module.exports = function setupJade(cb) {
  try {
    require('jade');
  } catch (e) {
    cb(new Error(
      'Unable to require "jade". ' +
      'It must be defined as a dependency in your package.json.'
    ));
  }

  this.app.set('view engine', 'jade');

  cb();
};
