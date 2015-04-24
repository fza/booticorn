'use strict';

var _ = require('lodash'),
  path = require('path'),
  findup = require('findup-sync'),
  parseArgv = require('minimist'),
  util = require('./util');

/**
 * Config reader
 * @todo Handle npm config environment variables
 * @see https://docs.npmjs.com/misc/config
 * @constructor
 */
function ConfigReader() {}

_.extend(ConfigReader.prototype, {

  /**
   * Read all config
   * @param {function} cb `callback(error, config)`
   */
  readConfig: function (cb) {
    var options = this.options;

    var pkg = require(findup('package.json'));

    var env = process.env,
      argv = parseArgv(process.argv);

    var isDebug = !!argv.debug,
      isProduction = env.NODE_ENV === 'production';

    if (isDebug && options.enableV8DebugBreak && global.v8debug) {
      global.v8debug.Debug.setBreakOnException();
    }

    var config = this.config = {
      projectName: options.projectName || pkg.shortProjectName || 'app',

      // Save the boot options
      options: options,
      argv: argv,

      // Runtime environment
      envProd: isProduction,
      envDev: !isProduction,

      // Debug?
      debug: isDebug,

      // package.json contents
      pkg: pkg,

      // Paths
      basePath: path.resolve(options.basePath),
      logsPath: path.resolve(options.logsPath),
      viewsPath: path.resolve(options.viewsPath),

      // Asset paths, do not resolve
      assetsMountPath: path.resolve(options.assetsMountPath),
      assetsJsPath: options.assetsJsPath,
      assetsCssPath: options.assetsCssPath,
      assetsImagesPath: options.assetsImagesPath,

      // Mandatory app config
      port: util.intval(options.port),
      address: options.address,
      domain: options.domain
    };

    this.logger.info('Successfully read configuration');

    this.app.set('config', config);

    cb();
  },

  /**
   * Lookup containerized service connection information in the environment
   * @param {string} projectName
   * @param {string} serviceName
   * @param {number} servicePort
   * @param {string[]} [mandatoryKeys=[]]
   * @param {string[]} [optionalKeys=[]]
   * @returns {?object}
   */
  lookupContainerService: function lookupContainerService(projectName, serviceName, servicePort, mandatoryKeys, optionalKeys) {
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

});

module.exports = ConfigReader;
