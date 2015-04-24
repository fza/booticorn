'use strict';

var _ = require('lodash'),
  Router = require('../modules/router');

module.exports = function setupRoutingAndRegisterMiddleware(cb) {
  var app = this.app,
    options = this.options,
    moduleManager = this.moduleManager;

  var routerOpts = _.defaults(options.routing || {}, {
    defaultMethod: 'get',
    controllerBasePath: options.controllersPath,
    entryFile: 'routing.yml'
  });

  var router = new Router(app, moduleManager, routerOpts);
  app.set('router', router);

  moduleManager.registerMiddleware(moduleManager.DEFAULT_SCOPE_BEFORE_ROUTE, app);

  router.loadRoutes(routerOpts.entryFile, options.routesConfigPath, app);

  moduleManager.registerMiddleware(moduleManager.DEFAULT_SCOPE_AFTER_ROUTE, app);
  moduleManager.registerMiddleware(moduleManager.DEFAULT_SCOPE_ERROR, app);

  this.logger.info('Successfully setup routing and registered middleware');

  cb();
};
