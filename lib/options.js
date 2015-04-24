'use strict';

var _ = require('lodash'),
  path = require('path'),
  fs = require('fs');

module.exports = function readOptions(cb) {
  var options = this.options = _.defaults(this.options || {}, {
    // The (short) name of the project. If connecting to containerized services, the uppercased
    // version of this name is used as the prefix of the environment variables that are tried to
    // read in order to lookup service info.
    projectName: 'app',

    // How long the booting may take in total
    bootTimeout: 5000,

    // App and server stuff
    app: null,
    server: null,
    address: '0.0.0.0',
    port: 3000,
    domain: 'localhost',

    // Paths
    basePath: path.join(process.cwd(), 'app'),
    logsPath: path.join(process.cwd(), 'logs'),
    viewsPath: path.join(process.cwd(), 'app', 'views'),
    modelsPath: path.join(process.cwd(), 'app', 'models'),
    modulesPath: path.join(process.cwd(), 'app', 'modules'),
    routesConfigPath: path.join(process.cwd(), 'app', 'routing'),
    controllersPath: path.join(process.cwd(), 'app', 'controllers'),
    assetsMountPath: path.join(process.cwd(), 'public'),
    assetsJsPath: path.join('assets', 'js'),
    assetsCssPath: path.join('assets', 'css'),
    assetsImagesPath: path.join('assets', 'images'),

    // Templating
    templateEngine: 'swig',
    alwaysGenerateProtocolRelativeUrls: true,

    // Services
    services: [],

    // Service options
    mongoDb: null,
    mongoose: null,
    redis: null,

    // Custom tasks
    tasks: [],

    // HTTP firewall
    useHttpFirewall: false,

    // Routing options
    routing: {
      defaultMethod: 'get'
    },

    // App debug options
    enableV8DebugBreak: false
  });

  // Resolve and check paths
  var ok = _.all(['base', 'logs', 'views'], function (key) {
    var val = options[path + 'Path'] = path.resolve(options[key + 'Path']);

    // Exclude logsPath as we mkdirSync() it later anyway
    if (key !== 'logs' && !fs.existsSync(val)) {
      cb(new Error('options.' + key + 'Path = "' + val + '" does not exist.'));
      return false;
    }

    return true;
  });

  if (ok) {
    cb();
  }
};
