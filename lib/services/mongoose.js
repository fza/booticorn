'use strict';

var _ = require('lodash'),
  async = require('async'),
  path = require('path'),
  recursiveReadDir = require('recursive-readdir');

/**
 * Setup mongoose models
 * @param {object} db mongoose instance
 * @param {function} cb `callback(error)`
 */
function setupModels(db, cb) {
  var self = this;

  recursiveReadDir(self.options.modelsPath, function (readDirError, files) {
    if (readDirError) {
      cb(readDirError);
      return;
    }

    var models = {};

    async.eachLimit(files, 5, function setupModel(filePath, taskCb) {
      var modelName = _.capitalize(path.basename(filePath).replace(/\.js$/, ''));

      function registerModel(dbModel) {
        models[modelName] = dbModel;
        taskCb();
      }

      function modelSetupCallback(error, mongooseModel) {
        if (error) {
          taskCb(error);
          return;
        }

        registerModel(mongooseModel);
      }

      var isAsync = false;
      var model = require(filePath).call({
        async: function () {
          return (isAsync = true, modelSetupCallback);
        }
      }, modelName, db.Schema, db, this.app);

      if (!isAsync) {
        registerModel(model);
      }
    }, function (error) {
      if (error) {
        cb(error);
        return;
      }

      self.logger.info('Successfully setup all models');
      self.app.set('models', models);
      cb();
    });
  });
}

/**
 * Setup mongoose
 * @param {function} cb `callback(error)`
 */
module.exports = function setupMongoose(cb) {
  var self = this;

  var mongoose;
  try {
    mongoose = require('mongoose');
  } catch (e) {
    cb(new Error(
      'Unable to require mongoose. ' +
      'It must be defined as a dependency in your package.json.'
    ));
    return;
  }

  var config = self.options.mongoDb ||
    this.configReader.lookupContainerService(self.options.projectName, 'mongodb', 27017, ['db'], ['user', 'password']);

  if (!config) {
    cb(new Error('Unable to gather MongoDb configuration.'));
    return;
  }

  var url = config.hosts.reduce(function (memo, host, key) {
    return memo + (key > 0 ? ',' : '') + host.addr + ':' + host.port;
  }, 'mongodb://');

  url += '/' + config.db;

  var connectionOpts = _.defaults(self.options.mongoose || {}, {
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

  var onConnected, onError;

  onConnected = function () {
    connection.removeListener('error', onError);

    connection.on('reconnected', function () {
      self.logger.info('Reconnected to MongoDB');
    });

    connection.on('close', function () {
      self.logger.info('Closed connection to MongoDB');
    });

    // Log late errors
    // TODO Exit application on mongoose error?
    connection.on('error', function (mongooseError) {
      var msg = mongooseError instanceof Error ? mongooseError.message : mongooseError;
      self.logger.error('Mongoose error: ' + msg);
    });

    self.logger.info('Successfully connected to MongoDB');
    self.app.set('db', mongoose);
    setupModels.call(self, mongoose, cb);
  };

  onError = function (mongooseError) {
    connection.removeListener('connected', onConnected);
    cb(mongooseError);
  };

  connection.on('connected', onConnected);
  connection.on('error', onError);
};
