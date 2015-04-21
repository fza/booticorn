'use strict';

var _ = require('lodash'),
  async = require('async'),
  path = require('path'),
  recursiveReadDir = require('recursive-readdir');

/**
 * Setup mongoose models
 * @param app
 * @param timeoutVal
 * @param cb
 */
function setupModels(app, cb) {
  var db = app.get('db');

  var models = {};
  app.set('models', models);

  var aborted = false,
    modelsPath = path.join(app.get('basePath'), 'models');

  var timeout = setTimeout(function () {
    aborted = true;
    cb(new Error('Timeout while loading middleware.'));
  }, timeoutVal);

  recursiveReadDir(modelsPath, function (readDirError, files) {
    if (readDirError) {
      cb(readDirError);
    }

    async.eachLimit(files, 5, function (filePath, taskCb) {
      if (aborted) {
        return;
      }

      var name = _.capitalize(path.basename(filePath).replace(/\.js$/, ''));

      var modelSetupFunc = require(filePath);

      var registerModel = function (dbModel) {
        models[name] = dbModel;
        taskCb();
      };

      var isAsync = false;
      var model = modelSetupFunc.call({
        async: function () {
          return (isAsync = true, registerModel);
        }
      }, db.Schema, db, app);

      if (!isAsync) {
        registerModel(model);
      }
    }, function (error) {
      if (aborted) {
        return;
      }

      clearTimeout(timeout);

      if (error) {
        cb(error);
      }

      cb(null);
    });
  });
}

/**
 * Initialize mongoose
 * @param {object} config
 * @param {object} logger
 * @param {function} cb `callback(error, mongoose)`
 */
module.exports = function initMongoose(config, logger, cb) {
  var mongoose;
  try {
    mongoose = require('mongoose');
  } catch (e) {
    throw new Error('Unable to require mongoose. It must be defined as a dependency in your package.json.');
  }

  var url = config.hosts.reduce(function (memo, host, key) {
    return memo + (key > 0 ? ',' : '') + host.addr + ':' + host.port;
  }, 'mongodb://');

  url += '/' + config.db;

  var connectionOpts = _.defaults(config.bootOptions.mongoose || {}, {
    server: {
      auto_reconnect: true // eslint-disable-line camelcase
    }
  });

  if (config.user && config.password) {
    connectionOpts.user = config.user;
    connectionOpts.pass = config.password;
  }

  mongoose.connect(url, connectionOpts);

  var connection = mongoose.connection;

  var onConnected,
    onError;

  onConnected = function () {
    connection.removeListener('error', onError);

    connection.on('reconnected', function () {
      logger.info('Reconnected to MongoDB');
    });

    connection.on('close', function () {
      logger.info('Closed connection to MongoDB');
    });

    // Log late errors
    // TODO Exit application on mongoose error?
    connection.on('error', function (mongooseError) {
      var msg = mongooseError instanceof Error ? mongooseError.message : mongooseError;
      logger.error('Mongoose error: ' + msg);
    });

    logger.info('Successfully connected to MongoDB');

    setupModels(app, cb);
  };

  onError = function (mongooseError) {
    connection.removeListener('connected', onConnected);
    cb(mongooseError);
  };

  connection.on('connected', onConnected);
  connection.on('error', onError);
};
