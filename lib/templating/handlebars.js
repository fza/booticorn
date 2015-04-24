'use strict';

/**
 * Setup handlebars template engine
 * @param {function} cb `callback(error)`
 */
module.exports = function setupHandlebars(cb) {
  var expressHandlebars;
  try {
    expressHandlebars = require('express-handlebars');
  } catch (e) {
    cb(new Error(
      'Unable to require "express-handlebars". ' +
      'It must be defined as a dependency in your package.json.'
    ));
  }

  this.app.engine('handlebars', expressHandlebars());
  this.app.set('view engine', 'handlebars');

  cb();
};
