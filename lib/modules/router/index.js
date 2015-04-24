'use strict';

var _ = require('lodash'),
  fs = require('fs'),
  path = require('path'),
  yaml = require('js-yaml'),
  util = require('../../util'),
  routeUtils = require('./util'),
  SegmentRoute = require('./segment-route'),
  ActionableRoute = require('./actionable-route');

function Router(app, moduleManager, options) {
  this.app = app;
  this.moduleManager = moduleManager;
  this.options = _.defaults(options || {}, {
    defaultMethod: 'get',
    controllerBasePath: path.join(process.cwd(), 'app', 'controllers')
  });

  this.options.defaultMethod = this.options.defaultMethod.toLowerCase();

  app.set('router', this);
  app.generatePath = this.generatePath.bind(this);
  app.generateUrl = this.generateUrl.bind(this);

  this.routes = {};
  this.controllers = {};
}

_.extend(Router.prototype, {

  loadRoutes: function loadRoutes(ymlFile, basePath, baseRouter) {
    var self = this;

    if (!_.isString(basePath)) {
      baseRouter = basePath;
      basePath = null;
    }

    basePath = basePath || path.dirname(ymlFile);

    function loadRoutesFromYmlFile(file, baseExpressRouter) {
      var routingFilePath = path.join(basePath, file),
        yamlData, routeConfigs;

      try {
        yamlData = fs.readFileSync(routingFilePath);
      } catch (e) {
        throw new Error('Cannot load routing config file: ' + routingFilePath);
      }

      try {
        routeConfigs = yaml.safeLoad(yamlData);
      } catch (e) {
        throw new Error('Cannot parse routing config file: ' + routingFilePath);
      }

      var routes = {};

      _.each(routeConfigs, function (routeConfig, routeName) {
        if (self.routes[routeName]) {
          throw new Error('The route "' + routeName + '" has been defined twice or more.');
        }

        var subRoutes, routeType = 'actionable';

        // Load subroutes first
        if (routeConfig.resource) {
          routeType = 'segment';

          // Do not set a baseRouter here!
          subRoutes = loadRoutesFromYmlFile(routeConfig.resource);

          // No need to create the segment route at all, if there are no sub routes
          if (subRoutes.length === 0) {
            // @todo Print a debugging message?
            return;
          }
        }

        // Top level routes must be given the express base router explicitly. There is no
        // parent route that they could bind to.
        if (baseExpressRouter) {
          routeConfig.baseExpressRouter = baseExpressRouter;
        }

        var route = routes[routeName] = this._createRoute(routeType, routeName, routeConfig, routingFilePath);

        if (subRoutes) {
          route.addSubRoutes(subRoutes);
        }

        self.routes[routeName] = route;
      });

      return routes;
    }

    loadRoutesFromYmlFile(ymlFile, baseRouter || self.app);
  },

  generatePath: function (routeName, params, checkRequirements) {
    var route = this.routes[routeName];

    if (!route) {
      throw new Error('Cannot generate path/URL for route "' + routeName + '": Route not found.');
    }

    return route.generatePath(params, checkRequirements);
  },

  generateUrl: function generateUrl(routeName, params, checkRequirements) {
    return util.generateUrlFromPath(this.app, this.generatePath(routeName, params, checkRequirements));
  },

  getRoute: function (routeName) {
    return this.routes[routeName];
  },

  hasRoute: function (routeName) {
    return !!this.routes[routeName];
  },

  _getController: function (controllerPath) {
    if (!this.controllers[controllerPath]) {
      try {
        var controllerFile = controllerPath.replace(/\.js$/, '');
        if (!path.isAbsolute(controllerPath)) {
          controllerFile = path.join(this.options.controllerBasePath, controllerPath);
        }

        var Controller = require(controllerFile);
        this.controllers[controllerPath] = new Controller(this.app);
      } catch (e) {
        throw new Error('Cannot load controller: ' + controllerPath);
      }
    }

    return this.controllers[controllerPath];
  },

  _createRoute: function (type, routeName, routeConfig, configFile) {
    if (!routeConfig.pattern) {
      throw new Error(
        'Cannot create route "' + routeName + '": ' +
        'No pattern given.'
      );
    }

    var routeOptions = {
      configFile: configFile,
      defaults: routeConfig.defaults,
      requirements: routeConfig.requirements
    };

    var RouteClass;
    switch (type) {
      case 'segment':
        RouteClass = SegmentRoute;
        break;

      case 'actionable':
        RouteClass = ActionableRoute;

        if (!routeConfig.controller) {
          throw new Error(
            'Cannot create actionable route "' + routeName + '": ' +
            'No controller defined.'
          );
        }

        var parsedController = routeUtils.parseControllerConfig(routeConfig.controller);
        routeOptions.methods = routeConfig.methods || [this.options.defaultMethod];
        routeOptions.controller = this._getController(parsedController.controllerPath);
        routeOptions.actionName = parsedController.actionName;
        break;
    }

    var route = new RouteClass(routeName, routeConfig.pattern, routeOptions);

    // Automatically register middleware in "scoped" routes
    if (this.moduleManager && routeConfig.scope) {
      if (!this.moduleManager.hasScope(routeConfig.scope)) {
        throw new Error(
          'Cannot setup middleware for scope "' + routeConfig.scope + '" ' +
          'in route "' + route.name + '". Scope is not defined.'
        );
      }

      this.moduleManager.registerMiddleware(routeConfig.scope, route.expressRouter);
    }

    if (routeConfig.baseExpressRouter) {
      route.mount(routeConfig.baseExpressRouter);
    }

    return route;
  }

});

module.exports = Router;
