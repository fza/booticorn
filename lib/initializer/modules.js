'use strict';

var _ = require('lodash'),
  async = require('async'),
  path = require('path'),
  recursiveReadDir = require('recursive-readdir');

var DEFAULT_SCOPE_BEFORE_ROUTE = '__before-route__',
  DEFAULT_SCOPE_AFTER_ROUTE = '__after-route__',
  DEFAULT_SCOPE_ERROR = '__error__';

var priorities = {};

module.exports = {

  /**
   * Loaded middleware as:
   * middleware.{scope}.{priority} = [setupFunc, setupFunc, ...]
   */
  modules: {},

  /**
   * Default scope ids
   */
  beforeRouteScope: DEFAULT_SCOPE_BEFORE_ROUTE,
  afterRouteScope: DEFAULT_SCOPE_AFTER_ROUTE,
  errorScope: DEFAULT_SCOPE_ERROR,

  /**
   * All gathered scopes as an array
   */
  scopes: [
    DEFAULT_SCOPE_BEFORE_ROUTE,
    DEFAULT_SCOPE_AFTER_ROUTE,
    DEFAULT_SCOPE_ERROR
  ],


  /**
   * Load all middleware/modules
   * @param {object} app Express instance
   * @param {object} config App config
   * @param {object} options Options
   * @param {object} logger Winston instance
   * @param {function} cb `callback(error)`
   */
  load: function loadModules(app, config, options, logger, cb) {
    var self = this;

    function registerMiddleware(scopes, priority, setupFunc) {
      if (_.isUndefined(scopes)) {
        setupFunc = priority;
        priority = scopes;
        scopes = [DEFAULT_SCOPE_APP];
      }

      if (!_.isArray(scopes)) {
        scopes = [scopes];
      }

      scopes.forEach(function (scope) {
        if (_.isUndefined(priorities[scope])) {
          priorities[scope] = [];
          self.modules[scope] = {};
        }

        if (self.scopes.indexOf(scope) === -1) {
          self.scopes.push(scope);
        }

        if (priorities[scope].indexOf(priority) === -1) {
          priorities[scope].push(priority);
          self.modules[scope][priority] = [];
        }

        self.modules[scope][priority].push(setupFunc);
      });
    }

    [DEFAULT_SCOPE_BEFORE_ROUTE, DEFAULT_SCOPE_AFTER_ROUTE, DEFAULT_SCOPE_ERROR].forEach(function (scope) {
      priorities[scope] = [];
      self.modules[scope] = {};
    });

    recursiveReadDir(path.join(options.basePath, 'modules'), function (readDirError, files) {
      if (readDirError) {
        cb(readDirError);
        return;
      }

      async.eachLimit(files, 5, function (filePath, taskCb) {
        var isAsync = false;
        require(filePath).call({
          app: app,
          modules: self,
          registerMiddleware: registerMiddleware,

          beforeRouteScope: DEFAULT_SCOPE_BEFORE_ROUTE,
          afterRouteScope: DEFAULT_SCOPE_AFTER_ROUTE,
          errorScope: DEFAULT_SCOPE_ERROR,

          async: function () {
            return (isAsync = true, taskCb);
          }
        }, app);

        if (!isAsync) {
          taskCb();
        }
      }, function (error) {
        if (error) {
          cb(error);
          return;
        }

        // Ensure all middleware is sorted
        _.each(priorities, function (scopePriorities) {
          scopePriorities.sort();
        });

        logger.info('Successfully loaded all middleware and modules');
        app.set('modules', self);
        cb();
      });
    });
  },

  /**
   * Setup middleware and modules in the context of a router or the app itself via the app's
   * default router.
   * @param {object} router express.Router instance
   * @param {string} scope Middleware scope
   */
  registerInScope: function registerMiddleware(router, scope) {
    var self = this;

    if (_.isUndefined(scope)) {
      scope = DEFAULT_SCOPE_APP;
    }

    if (_.isUndefined(self.modules[scope])) {
      throw new Error(
        'Cannot load middleware or modules for scope "' + scope + '". ' +
        'Scope not defined.'
      );
    }

    priorities[scope].forEach(function (priority) {
      self.modules[scope][priority].forEach(function (setupFunc) {
        setupFunc(router);
      });
    });
  }

};
