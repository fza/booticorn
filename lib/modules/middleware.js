'use strict';

var _ = require('lodash'),
  async = require('async'),
  path = require('path'),
  recursiveReadDir = require('recursive-readdir');

var DEFAULT_SCOPE_APP = 'app',
  DEFAULT_SCOPE_APP_LATE_INIT = 'appLateInit',
  DEFAULT_SCOPE_ERROR = 'error';

var priorities = {};

module.exports = {

  /**
   * Loaded middleware as:
   * middleware.{scope}.{priority} = [setupFunc, setupFunc, ...]
   */
  middleware: {},

  /**
   * Default scope ids
   */
  appScope: DEFAULT_SCOPE_APP,
  appLateInitScope: DEFAULT_SCOPE_APP_LATE_INIT,
  errorScope: DEFAULT_SCOPE_ERROR,

  /**
   * All gathered scopes as an array
   */
  scopes: [
    DEFAULT_SCOPE_APP,
    DEFAULT_SCOPE_APP_LATE_INIT,
    DEFAULT_SCOPE_ERROR
  ],


  /**
   * Load all middleware
   * @param {object} app Express instance
   * @param {object} config App config
   * @param {object} options Options
   * @param {object} logger Winston instance
   * @param {function} cb `callback(error)`
   */
  load: function loadMiddleware(app, config, options, logger, cb) {
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
          self.middleware[scope] = {};
        }

        if (self.scopes.indexOf(scope) === -1) {
          self.scopes.push(scope);
        }

        if (priorities[scope].indexOf(priority) === -1) {
          priorities[scope].push(priority);
          self.middleware[scope][priority] = [];
        }

        self.middleware[scope][priority].push(setupFunc);
      });
    }

    [DEFAULT_SCOPE_APP, DEFAULT_SCOPE_APP_LATE_INIT, DEFAULT_SCOPE_ERROR].forEach(function (scope) {
      priorities[scope] = [];
      self.middleware[scope] = {};
    });

    recursiveReadDir(path.join(options.basePath, 'middleware'), function (readDirError, files) {
      if (readDirError) {
        cb(readDirError);
        return;
      }

      async.eachLimit(files, 5, function (filePath, taskCb) {
        var middlewareSetupFunc = require(filePath);

        var isAsync = false;
        middlewareSetupFunc.call({
          async: function () {
            return (isAsync = true, taskCb);
          }
        }, registerMiddleware, app, self);

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

        logger.info('Loaded all middleware');
        app.set('middleware', self);
        cb();
      });
    });
  },

  /**
   * Setup middleware in the context of a router or the app itself via the app's default router
   * @param {object} router express.Router instance
   * @param {string} scope Middleware scope
   */
  register: function registerMiddleware(router, scope) {
    var self = this;

    if (!self.loaded) {
      self.load();
    }

    if (_.isUndefined(scope)) {
      scope = DEFAULT_SCOPE_APP;
    }

    if (_.isUndefined(self.middleware[scope])) {
      throw new Error('Cannot load middleware for scope "' + scope + '". Scope not defined.');
    }

    priorities[scope].forEach(function (priority) {
      self.middleware[scope][priority].forEach(function (setupFunc) {
        setupFunc(router);
      });
    });
  }

};
