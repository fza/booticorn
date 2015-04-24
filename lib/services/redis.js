'use strict';

var _ = require('lodash');

/**
 * Setup redis
 * @param {function} cb `callback(error)`
 */
module.exports = function setupRedis(cb) {
  var self = this;

  var redis;
  try {
    redis = require('redis');
  } catch (e) {
    cb(new Error(
      'Unable to require redis. ' +
      'It must be defined as a dependency in your package.json.'
    ));
    return;
  }

  var redisOpts = _.defaults(self.options.redis || {}, {
    'retry_max_delay': 10,
    'connect_timeout': 2
  });

  var config = self.options.redis ||
    this.configReader.lookupContainerService(self.options.projectName, 'redis', 6379, ['db']);

  var client = redis.createClient(config.hosts[0].port, config.hosts[0].addr, redisOpts);

  var onReady,
    onError;

  onReady = function () {
    client.removeListener('error', onError);
    client.select(config.db || 0, function (selectError) {
      if (selectError) {
        cb(selectError);
        return;
      }

      client.on('end', function () {
        self.logger.info('Closed connection to Redis');
      });

      // Log late errors
      // TODO Exit application on redis error?
      client.on('error', function (redisError) {
        var msg = redisError instanceof Error ? redisError.message : redisError;
        self.logger.error('Redis error: ' + msg);
      });

      self.logger.info('Successfully connected to Redis');
      self.app.set('redis', client);
      cb();
    });
  };

  onError = function (redisError) {
    client.removeListener('ready', onReady);
    cb(redisError);
  };

  client.once('ready', onReady);
  client.once('error', onError);
};
