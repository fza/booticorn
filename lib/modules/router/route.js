'use strict';

var _ = require('lodash'),
  routeUtils = require('./util'),
  generateRouter = require('express').Router;

function Route(name, pattern, options) {
  var self = this;

  self.invoke = self.invoke.bind(this);

  if (self.prototype.constructor === Route) {
    throw new Error('Cannot instanciate abstract class "Route".');
  }

  var parentRoute;

  pattern = routeUtils.sanitizePattern(pattern);
  var parsedPattern = routeUtils.parsePattern(pattern, options);

  if (_.isString(parsedPattern)) {
    pattern = parsedPattern;
    parsedPattern = null;
  } else {
    pattern = parsedPattern.pattern;
  }

  var expressRouter = generateRouter({
    mergeParams: true
  });

  self._mounted = false;

  Object.defineProperties(self, {
    name: {
      configurable: false,
      value: name
    },

    configFile: {
      configurable: false,
      value: options.configFile
    },

    pattern: {
      configurable: false,
      get: pattern
    },

    parsedPattern: {
      configurable: false,
      value: parsedPattern
    },

    mounted: {
      configurable: false,
      get: function () {
        return self._mounted;
      }
    },

    expressRouter: {
      configurable: false,
      value: expressRouter
    },

    parentRoute: {
      configurable: false,
      get: function () {
        return parentRoute;
      },
      set: function (route) {
        if (self._mounted) {
          throw new Error('Cannot set parent route of already mounted route "' + name + '"');
        }

        self._mounted = true;
        parentRoute = route;
        parentRoute.expressRouter.use(pattern, self.invoke);
      }
    }
  });
}

_.extend(Route.prototype, {

  invoke: function () {
    throw new Error('Undefined method Route#invoke');
  },

  mount: function (parentRoute) {
    if (parentRoute instanceof Route) {
      this.parentRoute = parentRoute;
    } else {
      // Express router
      parentRoute.use(this.pattern, this.invoke);
      this._mounted = true;
    }
  },

  handleRequestParams: function handleRequestParams(req) {
    var self = this;

    if (!self.parsedPattern) {
      return;
    }

    self.parsedPattern.params.forEach(function (param) {
      var paramData = self.parsedPattern.paramData[param],
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

});

module.exports = Route;
