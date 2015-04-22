'use strict';

var _ = require('lodash'),
  findup = require('findup-sync'),
  util = require('./../util');

/**
 * Lookup service connection information in the environment
 * @param {string} projectName
 * @param {string} serviceName
 * @param {number} servicePort
 * @param {string[]} [mandatoryKeys=[]]
 * @param {string[]} [optionalKeys=[]]
 * @returns {?object}
 */
function lookupServiceInfo(projectName, serviceName, servicePort, mandatoryKeys, optionalKeys) {
  optionalKeys = optionalKeys || [];
  mandatoryKeys = mandatoryKeys || [];
  var extraKeys = [].concat(mandatoryKeys, optionalKeys);

  serviceName = serviceName.toUpperCase();
  var projectNameUpper = projectName.toUpperCase();

  var prefix = projectNameUpper + '_' + serviceName;

  var validHostIds = [],
    hosts = {},
    result = {
      db: null
    };

  var regExp = new RegExp('^' + projectNameUpper + '_(.*?)_((\\d+)_PORT_(\\d+)_TCP_(.*?)|([^_]*?))$', 'i');

  _.each(process.env, function (val, key) {
    if (key.indexOf(prefix) === 0) {
      var match = key.match(regExp);

      if (match === null || match[1] !== serviceName) {
        return;
      }

      if (util.isNumeric(match[3]) && util.isNumeric(match[4]) && util.intval(match[4]) === servicePort) {
        // Host definition -> searching for IP/port
        var hostId = util.intval(match[3]);

        if (!hosts[hostId]) {
          hosts[hostId] = {};
        }

        switch (match[5].toLowerCase()) {
          case 'addr':
            hosts[hostId].addr = val;
            break;

          case 'port':
            hosts[hostId].port = util.intval(val);
            break;
        }

        if (hosts[hostId].addr && hosts[hostId].port && validHostIds.indexOf(hostId) === -1) {
          validHostIds.push(hostId);
        }
      } else if (match[6] && !util.isNumeric(match[6])) {
        var checkKey = match[6].toLowerCase();

        // Check for extra key
        extraKeys.some(function (extraKey) {
          if (checkKey === extraKey) {
            result[extraKey] = val;
            return true;
          }
        });
      }
    }
  });

  if (validHostIds.length > 0) {
    result.hosts = validHostIds.map(function (id) {
      return hosts[id];
    });

    var ok = _.all(mandatoryKeys, function (key) {
      return !!result[key];
    });

    if (ok) {
      return result;
    }
  }

  return null;
}

/**
 * Config reader
 * @param {object} options
 * @param {function} cb `callback(error, config)`
 */
module.exports = function readConfig(options, cb) {
  var pkg = require(findup('package.json'));

  var env = process.env,
    argv = process.argv;

  var isDebug = argv[argv.length - 1] === '--debug',
    isProduction = env.NODE_ENV === 'production',
    projectName = options.projectName || pkg.shortProjectName || 'app';

  if (isDebug && options.enableV8DebugBreak && global.v8debug) {
    global.v8debug.Debug.setBreakOnException();
  }

  var config = {
    // Save the boot options
    bootOptions: options,

    // Runtime environment
    envProd: isProduction,
    envDev: !isProduction,

    // Debug?
    debug: isDebug,

    // package.json contents
    pkg: pkg,

    // Mandatory app config
    domain: options.domain || 'localhost',
    port: util.intval(options.port, 3000)
  };

  if (options.useRedis) {
    if (options.redisConfig) {
      config.redis = options.redisConfig;
    } else {
      config.redis = lookupServiceInfo(projectName, 'redis', 6379, ['db']);

      if (!config.redis) {
        cb(new Error('Unable to gather Redis configuration.'));
        return;
      }
    }
  }

  if (options.useMongoDb) {
    if (options.mongoDbConfig) {
      config.mongo = options.mongoDbConfig;
    } else {
      config.mongo = lookupServiceInfo(projectName, 'mongodb', 27017, ['db'], ['user', 'password']);

      if (!config.mongo) {
        cb(new Error('Unable to gather MongoDb configuration.'));
        return;
      }
    }
  }

  cb(null, config);
};