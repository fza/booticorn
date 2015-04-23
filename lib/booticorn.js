'use strict';

var _ = require('lodash'),
  fs = require('fs'),
  path = require('path'),
  http = require('http'),
  async = require('async');

// Modules
var readConfig = require('./initializer/config'),
  initLogger = require('./initializer/logger'),
  initAssetHelpers = require('./initializer/asset-helpers.js'),
  modules = require('./initializer/modules'),
  routing = require('./initializer/routing');

// Express
var express = require('express');

/**
 * Let the unicorns free!
 * @param {object} options Options
 * @param {function} cb `callback(error, app)`
 */
module.exports = function booticorn(options, cb) {
  var config,
    logger;

  options = _.defaults(options || {}, {
    projectName: 'app',

    bootTimeout: 2 * 1000,

    app: null,
    server: null,
    address: '0.0.0.0',
    port: 3000,
    domain: 'localhost',

    basePath: path.join(process.cwd(), 'app'),
    logsPath: path.join(process.cwd(), 'logs'),
    viewsPath: path.join(process.cwd(), 'app', 'views'),

    assetsMountPath: path.join(process.cwd(), 'public'),
    assetsJsPath: path.join('assets', 'js'),
    assetsCssPath: path.join('assets', 'css'),
    assetsImagesPath: path.join('assets', 'images'),

    templateEngine: 'swig',
    alwaysGenerateProtocolRelativeUrls: true,

    useRedis: false,
    redis: null,

    useMongoDb: false,
    mongoose: null,

    useHttpFirewall: false,

    routing: {
      defaultMethod: 'get'
    },

    enableV8DebugBreak: false
  });

  // Resolve and check paths
  var ok = _.all(['base', 'logs', 'views'], function (key) {
    var val = options[path + 'Path'] = path.resolve(options[key + 'Path']);

    // Exclude logsPath as we mkdirSync() it later
    if (key !== 'logs' && !fs.existsSync(val)) {
      cb(new Error('options.' + key + 'Path = "' + val + '" does not exist.'));
      return false;
    }

    return true;
  });

  if (!ok) {
    return;
  }

  // Setup app
  var app = options.app || express();

  // Setup server
  var server = options.server || http.createServer(app);
  app.set('server', server);

  // Setup firewall
  if (options.useHttpFirewall) {
    var HttpFirewall = require('./firewall');
    app.set('firewall', new HttpFirewall())
  }

  var aborted = false,
    timeout = setTimeout(function () {
      aborted = true;
      cb(new Error('Timeout while initializing app.'));
    }, options.bootTimeout);

  function guardTask(fn) {
    return function (taskCb) {
      if (aborted) {
        taskCb();
        return;
      }

      fn(taskCb);
    };
  }

  var tasks = [

    /*
     * Setting up a logger is the first thing unicorns do!
     */
    guardTask(function (taskCb) {
      logger = initLogger(options);
      app.set('logger', logger);
      taskCb();
    }),

    /*
     * And then they always read their configuration!
     */
    guardTask(function (taskCb) {
      readConfig(options, function (configError, cfg) {
        if (configError) {
          taskCb(configError);
          return;
        }

        logger.info('Successfully read configuration');
        config = cfg;
        app.set('config', config);
        taskCb();
      });
    }),

    /*
     * Of course you know that unicorns always know when there is a rainbow guarding them.
     */
    guardTask(function (taskCb) {
      // Setup a very early middleware that sets req.secure to a boolean value depending
      // on whether the request was originally made via HTTPs or not, even behind a proxy.
      app.use(function (req, res, next) {
        if (app.enabled('trust proxy')) {
          var xForwardedProto = req.header('X-Fowarded-Proto');
          if (_.isString(xForwardedProto) && ['http', 'https'].indexOf(xForwardedProto.toLowerCase()) !== -1) {
            req.secure = xForwardedProto.toLowerCase() === 'https';
            next();
            return;
          }

          var xForwardedPort = req.header('X-Fowarded-Port');
          if (_.isString(xForwardedPort) && ['80', '443'].indexOf(xForwardedPort) !== -1) {
            req.secure = xForwardedPort === '443';
            next();
            return;
          }
        }

        next();
      });

      taskCb();
    }),

    /*
     * Sometimes even a unicorn can forget stuff. Good when there is a Redis refreshing her memory.
     */
    guardTask(function (taskCb) {
      if (options.useRedis) {
        var initRedis = require('./services/redis');
        initRedis(app, config, options, logger, taskCb);
      } else {
        taskCb();
      }
    }),

    /*
     * Mongoose is a unicorn's best friend. Should we invite her?
     */
    guardTask(function (taskCb) {
      if (options.useMongoDb) {
        var initMongoose = require('./services/mongoose');
        initMongoose(app, config, options, logger, taskCb);
      } else {
        taskCb();
      }
    }),

    /*
     * Unicorns like templates, yep, they love 'em!
     */
    guardTask(function (taskCb) {
      var setupTemplateEngine;

      // Load template engine
      if (_.isFunction(options.templateEngine)) {
        setupTemplateEngine = options.templateEngine;
      } else {
        try {
          setupTemplateEngine = require('./templating/' + options.templateEngine.toLowerCase());
        } catch (e) {
          taskCb(new Error('Unable to load template engine "' + options.templateEngine + '"'));
        }
      }

      app.set('views', options.viewsPath);
      app.set('view cache', !config.envProd);

      // Setup template engine
      setupTemplateEngine(app, config, options, logger, function (error) {
        if (error) {
          taskCb(error);
          return;
        }

        // Setup template helpers for assets
        initAssetHelpers(app, config, options, logger, function (error) {
          if (error) {
            taskCb(error);
            return;
          }

          logger.info('Successfully setup template engine');
          taskCb();
        });
      });
    }),

    /*
     * Middleware and crunchy modules are what unicorns eat for breakfast!
     */
    guardTask(function (taskCb) {
      modules.load(app, config, options, logger, taskCb);
    }),

    /*
     * Unicorns need to know the paths that keep them far away from all the witches.
     * Give them some maps!
     */
    guardTask(function (taskCb) {
      try {
        // Register before-route global middleware
        modules.registerMiddlewareInRouter(app, modules.beforeRouteScope);

        // Load routing configuraton, load controllers and setup routers
        routing.setup(app, config, options, logger, function (error) {
          if (error) {
            taskCb(error);
            return;
          }

          // Setup routing template helpers
          app.locals.generatePath = app.generatePath = routing.generatePath.bind(null, app);
          app.locals.generateUrl = app.generateUrl = routing.generateUrl.bind(null, app);

          // Register after-route global middleware
          modules.registerMiddlewareInRouter(app, modules.afterRouteScope);

          // Register app-scope error middleware
          modules.registerMiddlewareInRouter(app, modules.errorScope);

          taskCb();
        });
      } catch (e) {
        taskCb(e);
      }
    }),

    /*
     * There is a time when unicorns need to explore the world. Let them free!
     */
    guardTask(function (taskCb) {
      if (options.useHttpFirewall) {
        var firewall = app.get('firewall');
        firewall.logger = logger;
        firewall.enable(server);
      }

      server.listen(config.port || 3000, config.address || '0.0.0.0');
      server.once('listening', function () {
        var address = server.address();
        app.get('logger').info('Server listening at http://%s:%s', address.address, address.port);

        taskCb();
      });
    })

  ];

  async.series(tasks, function (error) {
    if (aborted) {
      return;
    }

    if (error) {
      cb(error);
      return;
    }

    clearTimeout(timeout);
    cb(null, app);
  });
};
