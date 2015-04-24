'use strict';

var _ = require('lodash');

module.exports = function setupTemplating(cb) {
  var self = this,
    options = this.options;

  var setupTemplateEngine;

  // Load template engine
  if (_.isFunction(options.templateEngine)) {
    setupTemplateEngine = options.templateEngine;
  } else {
    try {
      setupTemplateEngine = require('./templating/' + options.templateEngine.toLowerCase());
    } catch (e) {
      cb(new Error('Unable to load template engine "' + options.templateEngine + '"'));
      return;
    }
  }

  this.app.set('views', options.viewsPath);
  this.app.set('view cache', !this.config.envProd);

  // Setup template engine
  setupTemplateEngine.call(this, function (error) {
    if (error) {
      cb(error);
      return;
    }

    self.logger.info('Successfully setup template engine');

    cb();
  });
};
