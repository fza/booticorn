'use strict';

/**
 * Setup twig.js template engine
 * @param {function} cb `callback(error)`
 */
module.exports = function setupTwig(cb) {
  var twig;
  try {
    twig = require('twig');
  } catch (e) {
    cb(new Error(
      'Unable to require "twig". ' +
      'It must be defined as a dependency in your package.json.'
    ));
  }

  this.app.engine('twig', twig.renderFile);
  this.app.set('view engine', 'twig');
  this.app.set('view options', {
    layout: false
  });

  cb();
};
