'use strict';

var _ = require('lodash'),
  async = require('async'),
  path = require('path'),
  recursiveReadDir = require('recursive-readdir');

/**
 * Setup mongoose models
 * @param {object} db mongoose instance
 * @param {object} app Express instance
 * @param {object} config App config
 * @param {object} options Boot options
 * @param {object} logger Winston instance
 * @param {function} cb `callback(error)`
 */
function setupModels(db, app, config, options, logger, cb) {
  var models = {};

  recursiveReadDir(path.join(options.basePath, 'models'), function (readDirError, files) {
    if (readDirError) {
      cb(readDirError);
    }

    async.eachLimit(files, 5, function (filePath, taskCb) {
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
      if (error) {
        cb(error);
        return;
      }

      logger.info('Successfully setup all models');
      app.set('models', models);
      cb();
    });
  });
}

/**
 * Initialize mongoose
 * @param {object} app Express instance
 * @param {object} config App config
 * @param {object} options Boot options
 * @param {object} logger Winston instance
 * @param {function} cb `callback(error)`
 */
module.exports = function initMongoose(app, config, options, logger, cb) {
  var mongoose;
  try {
    mongoose = require('mongoose');
  } catch (e) {
    throw new Error('Unable to require mongoose. It must be defined as a dependency in your package.json.');
  }

  var url = config.mongo.hosts.reduce(function (memo, host, key) {
    return memo + (key > 0 ? ',' : '') + host.addr + ':' + host.port;
  }, 'mongodb://');

  url += '/' + config.mongo.db;

  var connectionOpts = _.defaults(options.mongoose || {}, {
    server: {
      auto_reconnect: true // eslint-disable-line camelcase
    }
  });

  if (config.mongo.user && config.mongo.password) {
    connectionOpts.user = config.mongo.user;
    connectionOpts.pass = config.mongo.password;
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
    app.set('db', mongoose);
    setupModels(mongoose, app, config, options, logger, cb);
  };

  onError = function (mongooseError) {
    connection.removeListener('connected', onConnected);
    cb(mongooseError);
  };

  connection.on('connected', onConnected);
  connection.on('error', onError);
};
