'use strict';

var _ = require('lodash'),
  path = require('path'),
  http = require('http'),
  async = require('async');

// Modules
var readConfig = require('./modules/config'),
  initLogger = require('./modules/logger'),
  middleware = require('./modules/middleware'),
  routing = require('./modules/routing');

// Express
var express = require('express');

// Templating
var swig = require('swig');

/**
 * Let the unicorns free!
 * @param {object} options Options
 * @param {function} cb `callback(error, app)`
 */
module.exports = function booticorn(options, cb) {
  var config,
    logger;

  options = _.defaults(options || {}, {
    app: null,
    server: null,
    port: 3000,
    domain: 'localhost',
    projectName: 'app',
    basePath: path.join(process.cwd(), 'app'),
    bootModuleTimeout: 2 * 1000,
    useRedis: false,
    useMongoDb: false,
    enableV8DebugBreak: false
  });

  // Setup app
  var app = options.app || express();
  app.set('basePath', path.resolve(options.basePath));

  // Setup server
  var server = options.server || http.createServer(app);
  app.set('server', server);

  var aborted = false,
    timeout = setTimeout(function () {
      aborted = true;
      cb(new Error('Timeout while initializing app.'));
    }, options.bootModuleTimeout);

  var tasks = [

    /*
     * Setting up a logger is the first thing unicorns do!
     */
    function (taskCb) {
      logger = initLogger(app);
      app.set('logger', logger);
      taskCb();
    },

    /*
     * And then they always read their configuration!
     */
    function (taskCb) {
      if (!aborted) {
        readConfig(function (configError, cfg) {
          if (configError) {
            taskCb(configError);
            return;
          }

          logger.info('Successfully read configuration');

          config = cfg;
          app.set('config', config);
          taskCb();
        });
      }
    },

    /*
     * And if they should connect to redis, they do to that, too.
     */
    function (taskCb) {
      if (!aborted) {
        var initRedis = require('./services/redis');
        initRedis(app, config.redis, logger, taskCb);
      }
    },

    /*
     * Mongoose is a unicorn's best friend. Should we invite her?
     */
    function (taskCb) {
      if (!aborted) {
        var initMongoose = require('./services/mongoose');
        initMongoose(app, config.mongo, logger, function (mongoError, db) {
          if (mongoError) {
            taskCb(mongoError);
            return;
          }

          app.set('db', db);
          taskCb();
        });
      }
    },

    /*
     * Unicorns like templates, yep, they love 'em!
     */
    function (taskCb) {
      // View engine
      app.engine('swig', swig.renderFile);
      app.set('view engine', 'swig');
      app.set('views', path.join(__dirname, 'views'));
      app.set('view cache', false); // Use swig's template cache
      swig.setDefaults({
        cache: config.envProd
      });

      // Expose app config as persistent template locals
      app.locals.config = app.get('config');

      taskCb();
    },

    /*
     * Middleware is what unicorns eat for breakfast!
     */
    function (taskCb) {
      middleware.load(app, taskCb);
    },

    /*
     * Unicorns need to know the paths that keep them far away from all the witches.
     * Give them some maps!
     */
    function (taskCb) {
      // Register app-scope middleware
      middleware.register(app, middleware.appScope);

      // Load routing configuraton, load controllers and setup routers
      routing.setup(app);

      // Setup routing helpers
      app.locals.generatePath = app.generatePath = routing.generatePath.bind(null, app);
      app.locals.generateUrl = app.generateUrl = routing.generateUrl.bind(null, app);

      // Register app-scope late middleware
      middleware.register(app, middleware.appLateInitScope);

      // Register app-scope error middleware
      middleware.register(app, middleware.errorScope);

      taskCb();
    },

    /*
     * There is a time when unicorns need to explore the world. Let them free!
     */
    function (taskCb) {
      server.listen(app.get('config').port || 3000);
      server.once('listening', function () {
        var address = server.address();
        app.get('logger').info('Server listening at http://%s:%s', address.address, address.port);

        taskCb();
      });
    }

  ];

  async.series(tasks, function (error) {
    if (error) {
      cb(error);
      return;
    }

    clearTimeout(timeout);
    cb(null, app);
  });
};
