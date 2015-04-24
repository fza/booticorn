'use strict';

var _ = require('lodash'),
  async = require('async');

module.exports = function setupServices(cb) {
  var self = this;

  var options = this.options;

  if (_.isString(options.services)) {
    options.services = [options.services];
  } else if (!_.isArray(options.services)) {
    cb(new Error('options.services must be an array.'));
    return;
  }

  async.each(options.services, function setupService(service, setupServiceCb) {
    var setupFn;

    if (!_.isFunction(service)) {
      try {
        setupFn = require('../services/' + service.toLowerCase());
      } catch (e) {
        setupServiceCb(new Error('Unable to load service "' + service + '"'));
        return;
      }
    }

    setupFn.call(self, setupServiceCb);
  }, cb);
};
