'use strict';

var _ = require('lodash'),
  fs = require('fs'),
  path = require('path'),
  yaml = require('js-yaml'),
  httpMethods = require('methods'),
  generateRouter = require('express').Router;

/**
 * Get a route chain for debugging
 */
function debugGetRouteChain(route) {
  var chain = [];
  do {
    chain.unshift(route.name);
  } while (!_.isUndefined(route = route.parentRoute));

  return chain.join(' → ');
}

/**
 * Sanitize a pattern, so that it always starts with a "/", does not end with a "/"
 * and does not contain double slashes in between.
 */
function sanitizePattern(pattern) {
  return '/' + _.trim((pattern || '').replace(/\/+/g, '/'), '/');
}

/**
 * Handle route parameters
 */
function handleParams(req, parsedPattern) {
  if (!parsedPattern) {
    return;
  }

  parsedPattern.params.forEach(function (param) {
    var paramData = parsedPattern.paramData[param],
      val = req.params[param];

    if (!val && paramData.defaultValue) {
      val = req.params[param] = paramData.defaultValue;
    }

    if (!val && !paramData.optional) {
      throw new Error('Missing parameter "' + param + '"');
    }

    if (val && paramData.regExp && !paramData.regExp.test(val)) {
      throw new Error('Invalid value "' + val + '" for parameter: "' + param + '"');
    }
  });
}

/**
 * Parses a pattern, splitting up parts and params
 */
function parsePattern(route) {
  var params = [],
    paramData = {},
    optionalParams = [],
    mandatoryParams = [];

  var pattern = route.pattern,
    requirements = route.requirements || {},
    defaults = route.defaults || {},
    resetPattern = false;

  var parts = pattern
    .split('/')
    .filter(function (part) {
      return part.length > 0;
    })
    .map(function (part) {
      if (part.charAt(0) !== ':') {
        // Not a param
        return {
          isParam: false,
          value: part
        };
      }

      var param = part.substr(1).replace(/\?$/, ''),
        hasQuestionMark = part.charAt(part.length - 1) === '?',
        optional = hasQuestionMark || !!defaults[param];

      var checkRoute = route;
      if (optional) {
        do {
          if (checkRoute.parsedPattern && checkRoute.parsedPattern.optionalParams.length) {
            throw new Error(
              'There can be no more than one optional param in a route path: ' +
              debugGetRouteChain(route)
            );
          }
        } while (!_.isUndefined(checkRoute = checkRoute.parentRoute))
      }

      if (optional && !hasQuestionMark) {
        resetPattern = true;
        part += '?';
      }

      if (!/[\?\*\+\(\)]/.test(param)) {
        params.push(param);
        (optional ? optionalParams : mandatoryParams).push(param);

        var regExp = null;
        if (requirements[param]) {
          var regExpStr = requirements[param];

          if (regExpStr.charAt(0) === '/') {
            regExpStr = regExpStr.substring(1, regExpStr.length - 1);
          }

          regExp = new RegExp(regExpStr);
        }

        return paramData[param] = {
          isParam: true,
          value: part,
          param: param,
          optional: optional,
          regExp: regExp,
          defaultValue: defaults[param]
        };
      }
    });

  if (parts.length === 0) {
    // Reset pattern, just in case...
    route.pattern = '/';

    return null;
  }

  if (resetPattern) {
    route.pattern = parts.reduce(function (memo, part) {
      return memo + '/' + part.value;
    }, '');
  }

  return {
    parts: parts,
    params: params,
    paramData: paramData,
    optionalParams: optionalParams,
    mandatoryParams: mandatoryParams
  };
}

/**
 * Load routes starting at a given entry point file
 */
function loadRoutes(basePath, ymlFile) {
  var allRoutes = {};

  function load(file, parentRoute) {
    var routingFilePath = path.join(basePath, file),
      yamlData, routes;

    try {
      yamlData = fs.readFileSync(routingFilePath);
    } catch (e) {
      throw new Error('Cannot load routing config file: ' + routingFilePath);
    }

    try {
      routes = yaml.safeLoad(yamlData);
    } catch (e) {
      throw new Error('Cannot parse routing config file: ' + routingFilePath);
    }

    _.each(routes, function (route, routeName) {
      if (allRoutes[routeName]) {
        throw new Error('The route "' + routeName + '" has been defined twice or more.');
      }

      route.name = routeName;
      route.pattern = sanitizePattern(route.pattern);
      route.isEndpoint = !route.resource;

      if (parentRoute) {
        route.parentRoute = parentRoute;
      }

      if (route.resource) {
        route.subRoutes = load(route.resource, route);
      }

      allRoutes[routeName] = route;
    });

    return routes;
  }

  var nestedRoutes = load(ymlFile, null);

  return {
    nested: nestedRoutes,
    all: allRoutes
  };
}

var controllers = {};

/**
 * Get a controller setup function
 */
function getControllerSetup(app, controllerPath) {
  controllerPath = path.join(app.get('basePath'), 'controllers', controllerPath);

  if (!controllers[controllerPath]) {
    try {
      controllers[controllerPath] = require(controllerPath);
    } catch (e) {
      throw new Error('Cannot load controller: ' + controllerPath);
    }
  }

  return controllers[controllerPath];
}

/**
 * Setup a route that is actionable, i.e. can be handled by an action
 */
function setupActionableRoute(app, options, router, route, parsedPattern) {
  function invokeAction(fn, req, res, next) {
    try {
      handleParams(req, parsedPattern);
    } catch (e) {
      next(e);
      return;
    }

    fn(req, res, next);
  }

  if (!route.controller) {
    throw new Error('Route "' + route.name + '" has no controller definition');
  }

  var parsedController = route.controller.split(':');

  var setupController = getControllerSetup(app, parsedController[0]);
  if (!setupController) {
    throw new Error(
      'Cannot load controller "' + parsedController[0] + '" ' +
      'for route "' + route.name + '"'
    );
  }

  var controller = setupController(app, router);

  var actionName = parsedController[1];

  if (!actionName) {
    // Verb-style controller
    var i = 0;
    _.each(controller, function (verbAction, verb) {
      if (httpMethods.indexOf(verb) === -1) {
        return;
      }

      router[verb](route.pattern, invokeAction.bind(null, verbAction));
      i++;
    });

    if (i === 0) {
      throw new Error(
        'The verb-style controller "' + parsedController[0] + '" ' +
        'does not define any valid HTTP verbs.'
      );
    }

    return;
  }

  var action = route.action = controller[actionName];

  if (!action) {
    throw new Error(
      'Action "' + actionName + '" is not defined in controller "' + parsedController[0] + '" ' +
      'in route "' + route.name + '"'
    );
  }

  var routeMethods = [options.defaultMethod.toLowerCase()];
  if (_.isString(route.methods) && route.methods.length > 0) {
    routeMethods = [route.methods.toLowerCase()];
  } else if (_.isArray(route.methods) && route.methods.length > 0) {
    routeMethods = route.methods.map(function (method) {
      return method.toLowerCase();
    });
  }
  route.methods = routeMethods;

  routeMethods.forEach(function (method) {
    if (method !== 'all' && httpMethods.indexOf(method) === -1) {
      throw new Error('Invalid method "' + method + '" in route "' + route.name + '"');
    }

    router[method](route.pattern, invokeAction.bind(null, action));
  });
}

/**
 * Setup a route so that it can be handled by express' routing system
 */
function setupRoute(app, options, parentRouter, mountPath, prevParsedPattern, route) {
  if (!route.isEndpoint && route.subRoutes.length === 0) {
    return;
  }

  var router = route.router = generateRouter({
    mergeParams: true
  });

  var parsedPattern = route.parsedPattern = parsePattern(route);

  parentRouter.use(mountPath, function invokeRouter(req, res, next) {
    if (prevParsedPattern) {
      try {
        handleParams(req, prevParsedPattern);
      } catch (e) {
        next(e);
        return;
      }
    }

    router(req, res, next);
  });

  if (route.isEndpoint) {
    // Route is actionable
    setupActionableRoute(app, options, router, route, parsedPattern);
    return;
  }

  // Route has subroutes and is not actionable itself
  _.each(route.subRoutes, function (subRoute) {
    setupRoute(app, options, router, route.pattern, parsedPattern, subRoute);
  });
}

/**
 * Generate a path based on a named route and given parameters
 */
function generatePath(app, routeName, params, checkRequirements) {
  if (_.isBoolean(params)) {
    checkRequirements = params;
    params = {};
  }

  if (_.isUndefined(checkRequirements)) {
    checkRequirements = true;
  }

  params = params || {};

  var route = app.get('routes')[routeName];

  if (!route) {
    throw new Error('Cannot generate path/URL for route "' + routeName + '": route not found.');
  }

  if (!route.isEndpoint) {
    throw new Error('Cannot generate path/URL for non-endpoint route: "' + routeName + '"');
  }

  var parts = [];
  do {
    if (_.isRegExp(route.pattern)) {
      throw new Error(
        'Cannot generate path/URL of a true RegExp pattern for route "' + routeName + '" ' +
        '(see route "' + route.name + '")'
      );
    }

    if (route.parsedPattern === null) {
      parts.unshift('/');
      continue;
    }

    parts.unshift(route.parsedPattern.parts.reduce(function (memo, part) {
      if (!part.isParam) {
        return memo + '/' + part.value.replace(/[\?\*\+\(\)]/g, '');
      }

      var val = params[part.param],
        useDefault = false;

      if (!val) {
        if (!part.optional && !part.defaultValue) {
          throw new Error(
            'Cannot generate path/URL for route "' + routeName + '". ' +
            'Param "' + part.param + '" not set.'
          );
        } else if (part.optional && !part.defaultValue) {
          // Skip
          return memo;
        }

        val = part.defaultValue;
        useDefault = true;
      }

      if (checkRequirements && part.regExp && !part.regExp.test(val)) {
        throw new Error(
          'Cannot generate path/URL for route "' + routeName + '". ' +
          'Value "' + val + '" ' + (useDefault ? '(=default)' : '') + ' does not ' +
          'pass requirement for param "' + part.param + '". ' +
          'Route chain: ' + debugGetRouteChain(route)
        );
      }

      return memo + '/' + val;
    }, ''));
  } while (!_.isUndefined(route = route.parentRoute));

  return parts.join('').replace(/\/+/g, '/');
}

module.exports = {

  /**
   * Generate a path based on a named route and given parameters
   */
  generatePath: generatePath,

  /**
   * Generate a URL based on a named route and given parameters
   */
  generateUrl: function generateUrl(app, routeName, params, checkRequirements) {
    var urlPath = generatePath(routeName, params, checkRequirements),
      config = app.get('config');

    // TODO Handle TLS
    return 'http://' + config.domain + (config.externalPort !== 80 ? ':' + config.externalPort : '') + urlPath;
  },

  /**
   * Setup routes
   * @param {object} app Express instance
   * @param {object} config App config
   * @param {object} options Boot options
   * @param {object} logger Winston instance
   * @param {function} cb `callback(error)`
   */
  setup: function setupRouting(app, config, options, logger, cb) {
    options.routing = _.defaults(options.routing || {}, {
      defaultMethod: 'get',
      configFile: 'routing.yml'
    });

    var routing = loadRoutes(path.join(options.basePath, 'routing'), options.routing.configFile);
    _.each(routing.nested, setupRoute.bind(null, app, options.routing, app, '/', null));

    logger.info('Successfully setup routing');
    app.set('routes', routing.all);
    cb();
  }

};
