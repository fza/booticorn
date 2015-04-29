'use strict';

/**
 * Setup twig.js template engine
 * @param {object} app Express instance
 * @param {object} config App config
 * @param {object} options Boot options
 * @param {object} logger Winston instance
 * @param {function} cb `callback(error)`
 */
module.exports = function (app, config, options, logger, cb) {
  var twig;
  try {
    twig = require('twig');
  } catch (e) {
    cb(new Error(
      'Unable to require "twig". ' +
      'It must be defined as a dependency in your package.json.'
    ));
  }

  app.engine('twig', twig.renderFile);
  app.set('view engine', 'twig');
  app.set('view options', {
    layout: false
  });

  cb();
};
