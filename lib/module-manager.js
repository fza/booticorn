'use strict';

var _ = require('lodash'),
  util = require('./util'),
  async = require('async'),
  fs = require('fs'),
  path = require('path'),
  recursiveReadDir = require('recursive-readdir'),
  minimatch = require('minimatch');

var jsFileFilter = minimatch.filter('*.js', {
  matchBase: true
});

/**
 * Module and middleware manager
 * @param app
 * @constructor
 */
function ModuleManager(app) {
  var self = this;

  self.app = app;

  app.set('modules', self);

  // modules[module-name]
  self.modules = {};

  // middleware[scope][priority] = [setupFn, setupFn, …]
  self.middleware = {};
  self.priorities = {};

  self.scopes = [
    self.DEFAULT_SCOPE_BEFORE_ROUTE,
    self.DEFAULT_SCOPE_AFTER_ROUTE,
    self.DEFAULT_SCOPE_ERROR
  ];

  self.scopes.forEach(function (scope) {
    self.priorities[scope] = [];
    self.middleware[scope] = {};
  });
}

_.extend(ModuleManager.prototype, {

  DEFAULT_SCOPE_BEFORE_ROUTE: '@@before-route',
  DEFAULT_SCOPE_AFTER_ROUTE: '@@after-route',
  DEFAULT_SCOPE_ERROR: '@@error',

  /**
   * Load a single module, multiple modules when given an array of functions, a single module when
   * given a path to a single .js file or multiple modules when given a directory path.
   * @todo Describe module calling context
   * @param {string} [name] Module name. If multiple modules are loaded, this argument is ignored.
   *   This is used as the name the module will be registered as. If omitted, a lowercased
   *   version of `moduleFn.name` is used. If the function is anonymous (has no name) and the
   *   module is loaded by path, the lowercased basename of the .js file is used (ex. "Module.js"
   *   -> "module"). Otherwise an error is thrown.
   * @param {function|function[]|string} modules Module function(s) or path to load modules from.
   *   If path is a directory, it will be scanned recursively for *.js files.
   * @param {function} cb `callback(error)`
   * @example `app.get('modules').load(function customcache() {… return cache;});
   *  var cache = app.get('customcache');`
   */
  load: function loadModules(name, modules, cb) {
    var self = this;

    if (arguments.length < 3) {
      modules = name;
      cb = modules;
      name = null;
    }

    function makeModuleDescriptorFromJsFile(file) {
      return {
        name: path.basename(file).replace(/\.js$/, '').toLowerCase(),
        fn: require(file)
      };
    }

    function scanDir(dir, scanDirCb) {
      recursiveReadDir(dir, function (readDirError, files) {
        if (readDirError) {
          scanDirCb(readDirError);
          return;
        }

        scanDirCb(null, files.filter(jsFileFilter).map(makeModuleDescriptorFromJsFile));
      });
    }

    var isSingleModule = false;

    if (_.isString(modules) || _.isFunction(modules)) {
      isSingleModule = true;
      modules = [modules];
    }

    if (_.isArray(modules)) {
      async.map(modules, function (module, mapCb) {
        var moduleType = typeof module;
        switch (moduleType) {
          case 'function':
            mapCb(null, {
              fn: module
            });
            break;

          case 'string':
            fs.stat(module, function (statError, stat) {
              if (statError) {
                mapCb(statError);
                return;
              }

              if (stat.isDirectory()) {
                isSingleModule = false;
                scanDir(module, mapCb);
              } else if (stat.isFile()) {
                mapCb(null, [module].filter(jsFileFilter).map(makeModuleDescriptorFromJsFile));
              } else {
                mapCb(new Error('Unable to load module from ' + module));
              }
            });
            break;

          default:
            mapCb(new TypeError('Unable to load modules with type ' + moduleType));
        }
      }, function (mapError, moduleDescriptors) {
        if (mapError) {
          cb(mapError);
          return;
        }

        moduleDescriptors = _.flattenDeep(moduleDescriptors);

        if (moduleDescriptors.length === 0) {
          cb();
          return;
        }

        if (moduleDescriptors.length === 1 && isSingleModule && name) {
          moduleDescriptors[0].name = name;
        }

        async.eachLimit(moduleDescriptors, 5, function loadModule(descriptor, loadCb) {
          var moduleName = descriptor.name || descriptor.fn.name;

          if (!moduleName) {
            loadCb(new Error('Unable to load module without a name.'));
            return;
          }

          try {
            self._loadModule(moduleName, descriptor.fn, loadCb);
          } catch (loadModuleError) {
            loadCb(loadModuleError);
          }
        }, function (loadModuleError) {
          if (loadModuleError) {
            cb(loadModuleError);
            return;
          }

          // Ensure all middleware is sorted
          _.each(self.priorities, function (scopePriorities) {
            scopePriorities.sort();
          });

          cb();
        });
      });

      return;
    }

    cb(new TypeError('Unable to load modules with type ' + (typeof modules)));
  },

  /**
   * Add a new middleware in a given scope
   * @param {string|string[]} [scopes=DEFAULT_SCOPE_BEFORE_ROUTE] Scopes to add this middleware to.
   * @param {number} [priority=0] Priority used to arrange this middleware. Should be an integer.
   * @param {function} fn Setup function (`setupFn(router)`) that adds middleware via
   *   `router.use()`. If setupFn's signature has 3 or more arguments (typically `[err], req, res,
   *   next`, setupFn is treated as the middleware itself.
   * @returns {boolean|undefined} True if `setupFn` was recognized as the middleware itself,
   *   undefined otherwise.
   */
  addMiddleware: function addMiddleware(scopes, priority, fn) {
    var self = this;

    if (_.isUndefined(scopes)) {
      fn = priority;
      priority = scopes;
      scopes = [self.DEFAULT_SCOPE_BEFORE_ROUTE];
    }

    if (_.isFunction(priority)) {
      fn = priority;
      priority = 0;
    }

    if (!_.isArray(scopes)) {
      scopes = [scopes];
    }

    // Priority should always be an integer
    priority = util.intval(priority);

    var middlewareDetected = fn.length > 2;
    if (middlewareDetected) {
      var middlewareFn = fn;
      fn = function (router) {
        router.use(middlewareFn);
      };
    }

    self.addScopes(scopes);

    scopes.forEach(function (scope) {
      if (self.priorities[scope].indexOf(priority) === -1) {
        self.priorities[scope].push(priority);
        self.middleware[scope][priority] = [];
      }

      self.middleware[scope][priority].push(fn);
    });

    return middlewareDetected;
  },

  /**
   * Get a sorted list of all middleware setup functions for a given scope. If the `router`
   * argument is omitted, the middleware setup functions are returned, not the middleware itself.
   * If `router` is omitted, the returned functions must be called as `setupFn(app|router)` in
   * order for the middleware to be registered.
   * @param {string} scope Middleware scope
   * @param {function} [router] Router to call the middleware setup functions with
   * @returns {function[]}
   */
  getMiddlewareOfScope: function getMiddlewareOfScope(scope, router) {
    var self = this;

    if (_.isUndefined(scope)) {
      throw new Error('Must specify a scope to select middleware from.');
    }

    if (_.isUndefined(self.middleware[scope])) {
      throw new Error('Cannot load middleware for scope "' + scope + '". Scope not defined.');
    }

    var setupFns = _.flattenDeep(self.middleware[scope]);

    if (_.isFunction(router) && _.isFunction(router.use)) {
      setupFns.forEach(function (setupFn) {
        setupFn(router, self.app);
      });
    }

    return setupFns;
  },

  /**
   * Semantic alias for `getMiddlewareOfScope()` that registers middleware of a given scope in the
   * context of a given router. Does not return anything.
   * @param {string} scope Middleware scope
   * @param {function} router Router to call the middleware setup functions with
   */
  registerMiddleware: function registerMiddleware(scope, router) {
    this.getMiddlewareOfScope.call(this, scope, router);
  },

  /**
   * Get a module
   * @param {string} moduleName
   * @returns {function|object}
   */
  get: function getModule(moduleName) {
    if (!this.modules[moduleName]) {
      throw new Error('Module "' + moduleName + '" is not defined');
    }

    return this.modules[moduleName];
  },

  /**
   * Register a module
   * @param {string} moduleName Module name
   * @param {object} module Module
   */
  set: function setModule(moduleName, module) {
    this.modules[moduleName] = module;
  },

  /**
   * Check if a module has been loaded
   * @param {string} moduleName
   * @returns {boolean}
   */
  has: function hasModule(moduleName) {
    return !!this.modules[moduleName];
  },

  /**
   * Add scopes
   * @param {string|string[]} scope
   */
  addScopes: function addMiddlewareScopes(scopes) {
    var self = this;

    if (_.isString(scopes)) {
      scopes = [scopes];
    }

    scopes.forEach(function (scope) {
      if (_.isUndefined(self.priorities[scope])) {
        self.priorities[scope] = [];
        self.middleware[scope] = {};
      }

      if (self.scopes.indexOf(scope) === -1) {
        self.scopes.push(scope);
      }
    });
  },

  /**
   * Get all scopes
   * @returns {string[]}
   */
  getAllScopes: function getAllMiddlewareScopes() {
    return this.scopes;
  },

  /**
   * Check if a scope exists
   * @param {string} scope Scope
   * @returns {boolean}
   */
  hasScope: function hasMiddlewareScope(scope) {
    return !!this.middleware[scope];
  },

  /**
   * Load a module
   * @param {string} name Module name
   * @param {function} moduleSetupFn Module setup function
   * @param {function} cb `callback(error)`
   * @private
   */
  _loadModule: function loadModule(name, moduleSetupFn, cb) {
    var self = this;

    var registerModule = function (error, moduleObj) {
      if (error) {
        cb(error);
        return;
      }

      if (moduleObj) {
        self.modules[name] = moduleObj;

        if (self.app.get(name)) {
          self.app.get('logger').warn(
            'Refusing to add module "' + name + '" to app settings: ' +
            'Property with same name already exists.'
          );
        } else {
          Object.defineProperty(self.app.settings, name, {
            configurable: false,
            value: moduleObj
          });
        }
      }

      cb();
    };

    var isAsync = false;

    var context = {
      app: self.app,
      modules: self,
      addMiddleware: self.addMiddleware.bind(self),

      beforeRouteScope: self.DEFAULT_SCOPE_BEFORE_ROUTE,
      afterRouteScope: self.DEFAULT_SCOPE_AFTER_ROUTE,
      errorScope: self.DEFAULT_SCOPE_ERROR,

      async: function () {
        return (isAsync = true, registerModule);
      }
    };

    var module = moduleSetupFn.call(context, self.app);

    if (!isAsync) {
      registerModule(module);
    }
  }

});

module.exports = ModuleManager;
