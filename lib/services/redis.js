'use strict';

var _ = require('lodash');

/**
 * Initialize Redis connection
 * @param {object} app Express instance
 * @param {object} config
 * @param {object} logger
 * @param {function} cb `callback(error, redis)`
 */
module.exports = function initRedis(app, config, logger, cb) {
  var redis;
  try {
    redis = require('redis');
  } catch (e) {
    throw new Error('Unable to require redis. It must be defined as a dependency in your package.json.');
  }

  var redisOpts = _.defaults(config.bootOptions.redis || {}, {
    'retry_max_delay': 10,
    'connect_timeout': 2
  });

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
        logger.info('Closed connection to Redis');
      });

      // Log late errors
      // TODO Exit application on redis error?
      client.on('error', function (redisError) {
        var msg = redisError instanceof Error ? redisError.message : redisError;
        logger.error('Redis error: ' + msg);
      });

      logger.info('Successfully connected to Redis');
      app.set('redis', client);
      cb(null);
    });
  };

  onError = function (redisError) {
    client.removeListener('ready', onReady);
    cb(redisError);
  };

  client.once('ready', onReady);
  client.once('error', onError);
};
