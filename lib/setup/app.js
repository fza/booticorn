'use strict';

var util = require('../util');

module.exports = function setupApp(cb) {
  var app = this.app = this.options.app || require('express')();

  // Setup a very early middleware that sets req.secure to a boolean value depending
  // on whether the request was originally made via HTTPs or not, even behind a proxy.
  app.use(function (req, res, next) {
    if (app.enabled('trust proxy')) {
      var xForwardedProto = req.header('X-Fowarded-Proto');
      if (xForwardedProto && xForwardedProto.toLowerCase() === 'https') {
        req.secure = true;
        next();
        return;
      }

      var xForwardedPort = req.header('X-Fowarded-Port');
      if (xForwardedPort && util.intval(xForwardedPort) === 443) {
        req.secure = true;
        next();
        return;
      }
    }

    next();
  });

  cb();
};
