'use strict';

var _ = require('lodash');

/**
 * Initialize Redis connection
 * @param {object} app Express instance
 * @param {object} config App config
 * @param {object} options Boot options
 * @param {object} logger Winston instance
 * @param {function} cb `callback(error)`
 */
module.exports = function initRedis(app, config, options, logger, cb) {
  var redis;
  try {
    redis = require('redis');
  } catch (e) {
    throw new Error('Unable to require redis. It must be defined as a dependency in your package.json.');
  }

  var redisOpts = _.defaults(options.redis || {}, {
    'retry_max_delay': 10,
    'connect_timeout': 2
  });

  var client = redis.createClient(config.redis.hosts[0].port, config.redis.hosts[0].addr, redisOpts);

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
