'use strict';

var _ = require('lodash'),
  inherits = require('util').inherits,
  httpMethods = require('methods'),
  Route = require('./route'),
  routeUtils = require('./util');

function ActionableRoute(routeName, pattern, options) {
  var self = this;

  Route.apply(self, arguments);

  var verbStyle = false,
    methods = options.methods || ['get'],
    controller = options.controller,
    actionName = options.actionName,
    _actions = self._actions = {};

  if (actionName) {
    if (!controller[actionName]) {
      throw new Error(
        'Action method "' + actionName + '" is not defined in' +
        'controller in route "' + self.name + '"'
      );
    }

    if (_.isString(methods) && methods.length > 0) {
      methods = [methods.toLowerCase()];
    } else if (_.isArray(methods) && methods.length > 0) {
      methods = methods.map(function (method) {
        return method.toLowerCase();
      });
    }

    if (methods.indexOf('all') !== -1) {
      methods = ['all'];
    }

    methods.forEach(function (method) {
      _actions[method] = controller[actionName];
    });
  } else {
    verbStyle = true;

    var verbLength = 0;
    _.each(controller, function (verbAction, verb) {
      if (httpMethods.indexOf(verb) === -1) {
        return;
      }

      _actions[verb] = verbAction;
      verbLength++;
    });

    if (verbLength === 0) {
      throw new Error(
        'The verb-style controller for route "' + self.name + '" ' +
        'does not define any valid HTTP verbs.'
      );
    }
  }

  _actions.forEach(function (action, method) {
    if (method !== 'all' && httpMethods.indexOf(method) === -1) {
      throw new Error('Invalid method "' + method + '" in route "' + self.name + '"');
    }

    self.expressRouter[method](self.pattern, self.invoke);
  });

  Object.defineProperties(self, {
    methods: {
      configurable: false,
      value: methods
    },

    controller: {
      configurable: false,
      value: controller
    },

    actionName: {
      configurable: false,
      get: actionName
    },

    actions: {
      configurable: false,
      value: _actions
    },

    verbStyle: {
      configurable: false,
      value: verbStyle
    }
  });
}

inherits(ActionableRoute, Route);
_.extend(ActionableRoute.prototype, {

  invoke: function invokeRouteAction(req, res, next) {
    // Make this route object available in the req for easy backlink-style route path generation
    req.route = this;

    try {
      this.handleRequestParams(req, this.parsedPattern);
    } catch (e) {
      next(e);
      return;
    }

    var reqMethod = req.method.toLowerCase();

    if (!this.actions[reqMethod]) {
      if (this._actions['all']) {
        reqMethod = 'all';
      } else {
        next(new Error(
          'Express invoked a route on a path/method ' +
          'that the route was not configured for.'
        ));
        return;
      }
    }

    this._actions[reqMethod](req, res, next);
  },

  generatePath: function generatePath(params, checkRequirements) {
    var self = this;

    if (_.isBoolean(params)) {
      checkRequirements = params;
      params = {};
    }

    if (_.isUndefined(checkRequirements)) {
      checkRequirements = true;
    }

    params = params || {};

    var route = self, segments = [];
    do {
      if (_.isRegExp(route.pattern)) {
        throw new Error(
          'Cannot generate path/URL of a true RegExp pattern for route "' + self.name + '" ' +
          '(see route "' + route.name + '")'
        );
      }

      if (!route.parsedPattern) {
        segments.unshift('/');
        continue;
      }

      segments.unshift(route.parsedPattern.segments.reduce(function (memo, segment) {
        if (!segment.isParam) {
          return memo + '/' + segment.value.replace(/[\?\*\+\(\)]/g, '');
        }

        var val = params[segment.param],
          useDefault = false;

        if (!val) {
          if (!segment.optional && !segment.defaultValue) {
            throw new Error(
              'Cannot generate path/URL for route "' + self.name + '". ' +
              'Param "' + segment.param + '" not set.'
            );
          } else if (segment.optional && !segment.defaultValue) {
            // Skip
            return memo;
          }

          val = segment.defaultValue;
          useDefault = true;
        }

        if (checkRequirements && segment.regExp && !segment.regExp.test(val)) {
          throw new Error(
            'Cannot generate path/URL for route "' + self.name + '". ' +
            'Value "' + val + '" ' + (useDefault ? '(=default)' : '') + ' does not ' +
            'pass requirement for param "' + segment.param + '". ' +
            'Route chain: ' + routeUtils.getRouteChain(self)
          );
        }

        return memo + '/' + val;
      }, ''));
    } while (!_.isUndefined(route = route.parentRoute));

    return segments.join('').replace(/\/+/g, '/').replace(/\/+$/, '');
  }

});

module.exports = ActionableRoute;
